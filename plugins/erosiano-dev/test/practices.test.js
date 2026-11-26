import test from "node:test";
import assert from "node:assert/strict";
import { readPracticeCatalog, resolvePractices, renderPracticeSelection } from "../practices.js";

const byId = (result, id) => result.decisions.find(rule => rule.id === id);

test("registry preserves 138 stable unique practice identifiers and known applicability", () => {
  const catalog = readPracticeCatalog();
  assert.equal(catalog.practices.length, 138);
  assert.equal(new Set(catalog.practices.map(rule => rule.id)).size, 138);
  assert.equal(new Set(catalog.practices.map(rule => rule.group)).size, 12);
  assert.deepEqual(catalog.practices.filter(rule => rule.version !== 1).map(rule => [rule.id, rule.version]), [["S01", 2], ["S05", 2], ["S10", 2]]);
});

test("explicit facts select TS and React rules, not unrelated database or auth", () => {
  const result = resolvePractices({ facets: { code: true, review: false, typescript: true, frontend: true, react: true, database: false, backend: false, auth: false } });
  assert.equal(byId(result, "T02").status, "APPLICABLE");
  assert.equal(byId(result, "F01").status, "APPLICABLE");
  assert.equal(byId(result, "B02").status, "NOT_APPLICABLE");
  assert.equal(byId(result, "SEC01").status, "NOT_APPLICABLE");
  assert.equal(byId(result, "SEC03").status, "UNKNOWN");
  assert.match(renderPracticeSelection(result), /Unknown applicability/);
});

test("project conventions suppress preferences but never hide required conflicts", () => {
  const result = resolvePractices({ facets: { code: true, architecture: true, auth: true }, projectOverrides: {
    A05: { disposition: "prefer-project", reason: "layer-first", evidence: "AGENTS.md:7" },
    SEC01: { disposition: "exception", reason: "old handler", evidence: "src/auth.js:12" },
  } });
  assert.equal(byId(result, "A05").status, "SUPPRESSED");
  assert.equal(byId(result, "SEC01").status, "CONFLICT");
  assert.equal(byId(result, "SEC01").level, "REQUIRED");
});

test("opted-in native gate is required, not executed verification", () => {
  const result = resolvePractices({ facets: { typescript: true }, enabledGates: ["T06"] });
  assert.equal(byId(result, "T06").level, "REQUIRED");
  assert.equal(result.evidence, "SUPPLIED_NOT_AUTHENTICATED");
  assert.equal(byId(resolvePractices({ facets: { typescript: false }, enabledGates: ["T06"] }), "T06").status, "CONFLICT");
});

test("unknown or malformed facts and overrides do not silently pass", () => {
  assert.throws(() => resolvePractices({ facets: { imaginary: true } }), /Unknown facet/);
  assert.throws(() => resolvePractices({ facets: { code: "true" } }), /non-boolean/);
  assert.throws(() => resolvePractices({ facets: {}, projectOverrides: { A05: { disposition: "exception" } } }), /Invalid/);
  const result = resolvePractices({ facets: {} });
  assert.equal(byId(result, "SEC03").status, "UNKNOWN");
  assert.equal(byId(result, "SEC03").level, "ADVISORY");
});

test("mode-sensitive style review remains advisory or conditional; error conventions may override preferences", () => {
  const context = { facets: { code: true, error: true, review: true }, projectOverrides: {
    S05: { disposition: "prefer-project", reason: "Established exception contract", evidence: "AGENTS.md:2" },
  } };
  const balanced = resolvePractices(context);
  const adaptive = resolvePractices({ ...context, mode: "adaptive" });
  assert.equal(byId(balanced, "S01").level, "ADVISORY");
  assert.equal(byId(adaptive, "S01").reviewDisposition, "FIX_REQUIRED_IF_BEHAVIOR_PRESERVING");
  assert.equal(byId(adaptive, "S01").level, "PREFERRED");
  assert.equal(byId(adaptive, "S05").status, "SUPPRESSED");
  assert.equal(byId(resolvePractices({ ...context, enabledGates: ["S01"] }), "S01").level, "REQUIRED");
});
