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
