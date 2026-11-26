import test from "node:test";
import assert from "node:assert/strict";
import { assessV1Readiness } from "./eval/assess-v1.mjs";

test("v1 readiness refuses incomplete gates and wrong heads rather than accepting green CI alone", () => {
  const head = "a".repeat(40);
  const report = { schemaVersion: 1, candidateCommit: head, criteria: [], ci: { headSha: head, status: "completed", conclusion: "success" } };
  const result = assessV1Readiness(report, {}, {}, head);
  assert.equal(result.status, "NO_GO");
  assert.equal(result.releaseAccepted, false);
  assert.equal(result.checks.length, 19);
  assert.ok(result.checks.every(check => check.status !== "PASS"));
  assert.equal(assessV1Readiness(report, {}, {}, "b".repeat(40)).status, "NOT_ASSESSED");
  report.criteria = [{ id: "E14", kind: "evaluation", status: "VERIFIED", headSha: head, reference: "supplied claim" }];
  assert.equal(assessV1Readiness(report, {}, {}, head).checks.find(check => check.id === "E14").status, "NOT_ASSESSED");
  report.criteria.push(report.criteria[0]);
  assert.equal(assessV1Readiness(report, {}, {}, head).status, "NOT_ASSESSED");
});

test("v1 readiness rejects a command evidence report from a different commit", () => {
  const head = "a".repeat(40);
  const ids = ["typecheck", "lint", "tests", "runtime", "security"];
  const reviewGates = ids.map(id => ({
    id, status: "VERIFIED", evidence: { type: "command", command: "synthetic-test", cwd: "/fixture",
      result: "synthetic only", exitCode: 0, headSha: head, ...(id === "tests" ? { testCounts: { passed: 1, failed: 0, skipped: 0 } } : {}) },
  }));
  reviewGates.push({ id: "ci-parity", status: "VERIFIED", evidence: { type: "ci-run", url: "https://example.invalid/run", conclusion: "success", headSha: head } });
  const report = { schemaVersion: 1, candidateCommit: head, criteria: [], reviewGates };
  assert.equal(assessV1Readiness(report, {}, {}, head).reviewVerdict, "RELEASE_CANDIDATE");
  reviewGates[0].evidence.headSha = "b".repeat(40);
  assert.equal(assessV1Readiness(report, {}, {}, head).reviewVerdict, "NO_GO");
  delete reviewGates[0].evidence.headSha;
  assert.equal(assessV1Readiness(report, {}, {}, head).reviewVerdict, "NO_GO");
});
