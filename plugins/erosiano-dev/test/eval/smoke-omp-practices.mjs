// Real OMP opt-in read-only practice resolver through deterministic loopback model calls.
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { spawnSync } from "node:child_process";
import { collectBaselineEvidence } from "../../baseline.js";
import { createRpc, isolatedEnvironment, verifyCommandCatalog } from "./smoke-omp.mjs";
import { startFixture } from "./smoke-omp-prompt.mjs";

const TOOL = "erosiano_resolve_practices";

function toolPresent(body, expected) {
  assert.equal((body.tools ?? []).some(tool => tool.function?.name === TOOL), expected, "Wrong opt-in tool registration");
}

function resultText(body) {
  const result = body.messages.filter(message => message.role === "tool").at(-1);
  assert.ok(result, "Missing actual tool result in subsequent model request");
  if (typeof result.content === "string") return result.content;
  assert.ok(Array.isArray(result.content));

  return result.content.filter(part => part.type === "text").map(part => part.text).join("\n");
}

function prepare(root, home) {
  const env = isolatedEnvironment(home);
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "package.json"), '{"name":"practice-fixture","version":"1.0.0","type":"module"}');
  writeFileSync(join(root, "tsconfig.json"), '{"compilerOptions":{"strict":true},"include":["src/**/*.ts"]}');
  writeFileSync(join(root, "src", "main.ts"), "export const value = 1;\n");
  writeFileSync(join(root, ".erosiano-dev.json"), '{"enabled":true,"enforcement":"balanced"}');
  writeFileSync(join(env.PI_CODING_AGENT_DIR, "config.yml"), JSON.stringify({
    bash: { enabled: false }, tools: { approvalMode: "always-ask", approval: { [TOOL]: "allow" } },
  }));
  for (const args of [["init", "-q", "-b", "main"], ["add", "."], ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", "commit", "-qm", "fixture"]]) {
    const run = spawnSync("git", args, { cwd: root, env, encoding: "utf8", timeout: 15000, shell: false });
    assert.equal(run.status, 0, run.stderr);
  }
  const baseline = collectBaselineEvidence({ root, scope: "src" });
  assert.equal(baseline.cacheable, true, JSON.stringify(baseline.unknowns));

  return { baseline: { scope: baseline.scope, additionalPaths: baseline.additionalPaths, fingerprint: baseline.fingerprint },
    facets: { typescript: true },
    observations: { typescript: { paths: ["tsconfig.json", "src/main.ts"], classification: "CURRENT", confidence: "HIGH" } } };
}

async function withHost(binary, project, home, fixture, optedIn, fn) {
  const rpc = createRpc(binary, project, home, optedIn ? { EROSIANO_DEV_PRACTICE_TOOL: "1" } : {}, fixture.endpoint);
  try {
    await rpc.wait(frame => frame.type === "ready");
    const state = await rpc.request("get_state");
    assert.equal(state.model?.provider, "erosiano-smoke");
    assert.equal(state.model?.id, "fixture");
    verifyCommandCatalog(await rpc.request("get_available_commands"));
    await fn(rpc);
  } finally {
    try {
      await rpc.close();
    } catch (error) {
      throw new Error(error.message + "\nOMP stderr (bounded): " + rpc.diagnostics().trim(), { cause: error });
    }
  }
}

async function main(args) {
  if (args.length !== 2 || args[0] !== "--omp" || !isAbsolute(args[1])) throw new Error("Usage: node smoke-omp-practices.mjs --omp /trusted/omp");
  const binary = realpathSync(args[1]);
  const root = realpathSync(mkdtempSync(join(tmpdir(), "erosiano-practice-host-")));
  const project = join(root, "project");
  const home = join(root, "home");
  try {
    mkdirSync(home, { recursive: true });
    const context = prepare(project, home);
    const fixture = await startFixture();
    try {
      await withHost(binary, project, home, fixture, false, async rpc => {
        await fixture.turn(rpc, "balanced", { steps: [{ inspect: body => toolPresent(body, false) }] });
      });
      await withHost(binary, project, home, fixture, true, async rpc => {
        const call = { name: TOOL, args: { context: JSON.stringify(context), group: "typescript", format: "policy" } };
        await fixture.turn(rpc, "balanced", { message: "Resolve the scoped TypeScript fixture, without modifying files.", steps: [
          { inspect: body => toolPresent(body, true), call },
          { inspect: body => {
            const output = resultText(body);
            assert.match(output, /Scoped erosiano-dev practice pack/);
            assert.match(output, /T02 v1/);
            assert.match(output, /Fresh sampled bytes only/);
            assert.ok(output.length <= 6000);
          } },
        ] });
        writeFileSync(join(project, "src", "main.ts"), "export const value = 2;\n");
        await fixture.turn(rpc, "balanced", { message: "Try the stale fixture context again.", steps: [
          { call },
          { inspect: body => assert.match(resultText(body), /stale or incomplete sampled baseline/) },
        ] });
      });
    } finally {
      await fixture.close();
    }
    console.log(JSON.stringify({ status: "PASS", platform: process.platform,
      scope: "Real OMP opt-in resolver registration, fresh policy selection and stale-context refusal",
      provider: "deterministic loopback fixture; no model-quality claim" }, null, 2));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

main(process.argv.slice(2)).catch(error => {
  console.error("Live OMP practice resolver FAILED/BLOCKED: " + error.message);
  process.exitCode = 1;
});
