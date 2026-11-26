import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectBaselineEvidence } from "../baseline.js";
import { resolveFreshPractices } from "../practices.js";
import { resolvePracticeTool, registerPracticeTool } from "../practice-tool.js";

async function fixture(fn) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "erosiano-fresh-")));
  try {
    mkdirSync(join(root, ".git", "refs", "heads"), { recursive: true });
    writeFileSync(join(root, ".git", "HEAD"), "ref: refs/heads/main\n");
    writeFileSync(join(root, ".git", "refs", "heads", "main"), "a".repeat(40) + "\n");
    mkdirSync(join(root, "src"));
    mkdirSync(join(root, "tests"));
    writeFileSync(join(root, "AGENTS.md"), "Layer-first conventions");
    writeFileSync(join(root, "tsconfig.json"), '{"compilerOptions":{"strict":true}}');
    writeFileSync(join(root, "src", "main.ts"), "export const value = 1;");
    writeFileSync(join(root, "tests", "main.test.ts"), "export const expected = 1;");
    const baseline = collectBaselineEvidence({ root, scope: "src", additionalPaths: ["tests/main.test.ts"] });
    const provenance = paths => ({ paths, classification: "CURRENT", confidence: "HIGH" });
    const context = {
      baseline: { scope: baseline.scope, additionalPaths: baseline.additionalPaths, fingerprint: baseline.fingerprint },
      facets: { typescript: true, code: true, architecture: true, auth: false },
      observations: {
        typescript: provenance(["tsconfig.json", "src/main.ts"]),
        code: provenance(["src/main.ts"]),
        architecture: provenance(["AGENTS.md"]),
        auth: { ...provenance(["src/main.ts"]), confidence: "LOW" },
      },
      projectOverrides: {
        A05: { disposition: "prefer-project", reason: "layer-first", evidence: "AGENTS.md:1", provenance: provenance(["AGENTS.md"]) },
      },
      enabledGates: ["T06"],
      gateEvidence: { T06: provenance(["tsconfig.json"]) },
    };

    return await fn({ root, context });
  } finally { rmSync(root, { recursive: true, force: true }); }
}

const byId = (result, id) => result.decisions.find(rule => rule.id === id);

test("fresh sampled bytes bind decisions; uncertain supplied facts remain unknown", () => fixture(({ root, context }) => {
  const result = resolveFreshPractices(context, { root });
  assert.equal(result.evidence, "FRESH_SAMPLED_BYTES_SUPPLIED_SEMANTICS");
  assert.equal(result.baseline.coverage, "SAMPLED_EVIDENCE_ONLY");
  assert.deepEqual(result.unresolvedFacets, ["auth"]);
  assert.equal(byId(result, "T02").status, "APPLICABLE");
  assert.equal(byId(result, "T06").level, "REQUIRED");
  assert.equal(byId(result, "A05").status, "SUPPRESSED");
  assert.equal(byId(result, "SEC01").status, "UNKNOWN");
  assert.match(result.limitation, /not independently authenticated or executed/);
}));

test("dirty caller/test evidence and changed instructions cannot reuse a stale fingerprint", () => fixture(({ root, context }) => {
  writeFileSync(join(root, "tests", "main.test.ts"), "export const expected = 2;");
  assert.throws(() => resolveFreshPractices(context, { root }), /STALE_OR_INCOMPLETE_BASELINE/);
  const fresh = collectBaselineEvidence({ root, scope: "src", additionalPaths: ["tests/main.test.ts"] });
  context.baseline.fingerprint = fresh.fingerprint;
  assert.equal(resolveFreshPractices(context, { root }).evidence, "FRESH_SAMPLED_BYTES_SUPPLIED_SEMANTICS");
  writeFileSync(join(root, "AGENTS.md"), "Different conventions");
  assert.throws(() => resolveFreshPractices(context, { root }), /STALE_OR_INCOMPLETE_BASELINE/);
}));

test("missing, unsampled and uncertain project authority cannot suppress a rule", () => fixture(({ root, context }) => {
  const noObservation = structuredClone(context);
  delete noObservation.observations.typescript;
  assert.throws(() => resolveFreshPractices(noObservation, { root }), /Missing facet provenance/);
  const badPath = structuredClone(context);
  badPath.observations.typescript.paths = ["missing.ts"];
  assert.throws(() => resolveFreshPractices(badPath, { root }), /unsampled/);
  const uncertain = structuredClone(context);
  uncertain.projectOverrides.A05.provenance.classification = "LEGACY";
  assert.throws(() => resolveFreshPractices(uncertain, { root }), /Uncertain project override/);
  const noGate = structuredClone(context);
  delete noGate.gateEvidence;
  assert.throws(() => resolveFreshPractices(noGate, { root }), /require provenance/);
  const untrustedRoot = structuredClone(context);
  untrustedRoot.baseline.root = "/outside";
  assert.throws(() => resolveFreshPractices(untrustedRoot, { root }), /select the root/);
}));

test("read-only host resolver refuses missing root and stale evidence without supplied-context fallback", async () => {
  let registered;
  const z = { string: () => ({ optional: () => ({}) }), object: shape => shape };
  const pi = { zod: z, registerTool: definition => { registered = definition; } };
  registerPracticeTool(pi, { optedIn: true, isEnabled: () => true, getRoot: ctx => ctx.cwd });
  await fixture(async ({ root, context }) => {
    const input = { context: JSON.stringify(context), group: "typescript" };
    assert.equal(resolvePracticeTool(input).isError, true);
    const result = await registered.execute("call", input, undefined, undefined, { cwd: root });
    assert.equal(result.isError, undefined);
    assert.equal(JSON.parse(result.content[0].text).evidence, "FRESH_SAMPLED_BYTES_SUPPLIED_SEMANTICS");
    writeFileSync(join(root, "src", "main.ts"), "export const value = 2;");
    const stale = await registered.execute("call", input, undefined, undefined, { cwd: root });
    assert.equal(stale.isError, true);
    assert.match(stale.content[0].text, /stale or incomplete/);
  });
});
