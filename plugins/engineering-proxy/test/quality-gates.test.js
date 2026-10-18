import test from "node:test";
import assert from "node:assert/strict";
import { parseChangedLines, inspectChangedScope } from "../change-scope.js";
import { assessReview } from "../review-verdict.js";

const patch = [
  "diff --git a/src/user.ts b/src/user.ts",
  "--- a/src/user.ts",
  "+++ b/src/user.ts",
  "@@ -3,0 +4,2 @@",
  "+function example() {",
  "+  return 1;",
  "diff --git a/src/old.ts b/src/old.ts",
  "--- a/src/old.ts",
  "+++ b/src/old.ts",
  "@@ -9,3 +9,0 @@",
].join("\n");

test("tracks only added lines, excluding deletion-only hunks", () => {
  const lines = parseChangedLines(patch);
  assert.deepEqual([...lines.get("src/user.ts")], [4, 5]);
  assert.equal(lines.get("src/old.ts").size, 0);
});

test("only changed-line diagnostics trigger a blocking finding", () => {
  const report = [{ filePath: "/work/src/user.ts", messages: [
    { line: 4, severity: 2, ruleId: "ksd/blank-between-functions", message: "Spacing" },
    { line: 60, severity: 2, ruleId: "other", message: "Legacy" },
  ] }];
  const actual = inspectChangedScope(patch, report, { cwd: "/work" });
  assert.equal(actual.status, "FIX_REQUIRED");
  assert.equal(actual.diagnostics.length, 1);
  assert.equal(actual.diagnostics[0].line, 4);
});

test("boundary diagnostics are included when the preceding changed line caused them", () => {
  const report = [{ filePath: "/work/src/user.ts", messages: [
    { line: 6, severity: 1, ruleId: "ksd/blank-before-return", message: "Missing blank line" },
  ] }];
  const actual = inspectChangedScope(patch, report, { cwd: "/work" });
  assert.equal(actual.status, "WARN");
});

test("missing ESLint coverage never returns PASS", () => {
  const result = inspectChangedScope(patch, [], { cwd: "/work" });
  assert.equal(result.status, "NOT_RUN");
  assert.deepEqual(result.missingFiles, ["src/user.ts"]);
});

test("clean changed-code report passes only within supplied scope", () => {
  const report = [{ filePath: "/work/src/user.ts", messages: [] }];
  const result = inspectChangedScope(patch, report, { cwd: "/work" });
  assert.equal(result.status, "PASS");
  assert.match(result.limitation, /not independently verified/);
});

test("non-source diffs are not applicable", () => {
  const p = ["diff --git a/README.md b/README.md", "+++ b/README.md", "@@ -2,0 +3 @@", "+hi"].join("\n");
  assert.equal(inspectChangedScope(p, [], { cwd: "/work" }).status, "NOT_APPLICABLE");
});

test("rejects maliciously large hunks and malformed reports", () => {
  assert.throws(() => parseChangedLines("+++ b/a.js\n@@ -1 +1,100001 @@"), /excessively large/);
  assert.throws(() => inspectChangedScope(patch, {}, { cwd: "/work" }), /ESLint JSON array/);
});

const good = (id, evidence = { type: "command", command: "node --test", result: "2 passed" }) => ({
  id, required: true, critical: false, status: "VERIFIED", evidence,
});

test("verdict cannot be ready without gates or evidence", () => {
  assert.equal(assessReview({ gates: [] }).verdict, "NOT_ASSESSED");
  const result = assessReview({ gates: [{ id: "test", status: "VERIFIED" }] });
  assert.equal(result.verdict, "CONDITIONAL_GO");
  assert.equal(result.gates[0].status, "UNVERIFIED");
});

test("critical unknown security gate is NO_GO", () => {
  const result = assessReview({ gates: [
    good("tests"),
    { id: "auth-contract", status: "NOT_RUN", critical: true },
  ] });
  assert.equal(result.verdict, "NO_GO");
});

test("required failed checks produce NO_GO", () => {
  assert.equal(assessReview({ gates: [good("typecheck"), { id: "style", status: "FIX_REQUIRED" }] }).verdict, "NO_GO");
});

test("CI gate rejects source inspection in place of an executed CI run", () => {
  const result = assessReview({ gates: [
    good("tests"),
    good("ci-parity", { type: "source", path: ".github/workflows/test.yml", observation: "Workflow exists" }),
  ] });
  assert.equal(result.verdict, "CONDITIONAL_GO");
  assert.equal(result.gates[1].status, "UNVERIFIED");
});

test("valid CI-run claim can produce review-ready, never deployment approval", () => {
  const result = assessReview({ gates: [
    good("tests"),
    good("ci-parity", { type: "ci-run", url: "https://github.com/example/repo/actions/runs/1", conclusion: "success" }),
  ] });
  assert.equal(result.verdict, "READY_FOR_REVIEW");
  assert.match(result.disclaimer, /No merge or deployment approval/);
});

test("release with incomplete noncritical gate remains NO_GO", () => {
  const result = assessReview({ scope: "release", gates: [
    good("tests"),
    { id: "ci-parity", status: "NOT_RUN" },
  ] });
  assert.equal(result.verdict, "NO_GO");
});
