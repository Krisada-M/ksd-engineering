import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { assessEvaluation, scoreEvaluation } from "./eval/score.mjs";

const root = new URL("./eval/fixtures/", import.meta.url);
const cases = JSON.parse(readFileSync(new URL("cases.json", root), "utf8"));
const checks = [
  "readable-flow/checks/checks.mjs",
  "auth-tenant/checks/can-read-checks.mjs",
  "payment-replay/checks/checks.mjs",
  "async-rejection/checks/checks.mjs",
  "atomic-stock/checks/checks.mjs",
];

test("trusted checked-in broken fixtures trigger independent assertion failures", () => {
  for (const check of checks) {
    const run = spawnSync(process.execPath, [fileURLToPath(new URL(check, root))], { encoding: "utf8", timeout: 10000 });
    assert.equal(run.error, undefined, check);
    assert.equal(run.status, 1, check + ": " + run.stderr);
    assert.match(run.stdout, /FAIL /, check);
  }
});

function syntheticStudy() {
  const setup = { model: "synthetic", modelVersion: "test", fixtureHash: "fixture", toolPolicy: "same",
    contextBudget: "same", ponytail: "off", environment: "isolated" };

  return {
    repetitions: 1,
    trials: cases.flatMap(c => ["none", "v0.6.0", "erosiano-dev"].map(arm => ({
      caseId: c.id, arm, repeat: 1, setup: { ...setup }, evidence: "synthetic-test-only", reviewer: "test",
      passed: true, criticalFailure: false, criticalFalsePass: false,
      review: { tp: 1, fp: 0, fn: 0, tn: 1 },
      usage: { inputTokens: 10, outputTokens: 10, latencyMs: 1, costUsd: null },
    }))),
  };
}

test("score requires complete matched records and labels supplied evidence", () => {
  const study = syntheticStudy();
  const result = scoreEvaluation(study);
  assert.equal(result.status, "MEASURED_SUPPLIED");
  assert.equal(result.releaseAccepted, false);
  assert.equal(result.arms["erosiano-dev"].trials, cases.length);
  assert.equal(result.arms["erosiano-dev"].usage.costUsd.mean, null);
  study.trials.pop();
  assert.equal(scoreEvaluation(study).status, "NOT_ASSESSED");
});

test("score rejects unmatched setups, duplicates and absent evidence; critical failures cannot pass", () => {
  const study = syntheticStudy();
  study.trials[0].setup.modelVersion = "other";
  assert.equal(scoreEvaluation(study).status, "NOT_ASSESSED");
  const duplicate = syntheticStudy();
  duplicate.trials.push(duplicate.trials[0]);
  assert.equal(scoreEvaluation(duplicate).status, "NOT_ASSESSED");
  const noEvidence = syntheticStudy();
  noEvidence.trials[0].evidence = "";
  assert.equal(scoreEvaluation(noEvidence).status, "NOT_ASSESSED");
  const unsafe = syntheticStudy();
  unsafe.trials.find(t => t.arm === "erosiano-dev").criticalFalsePass = true;
  assert.equal(scoreEvaluation(unsafe).status, "NO_GO");
});

function plannedStudy() {
  const study = syntheticStudy();
  const candidate = "a".repeat(40);
  const baseline = "b".repeat(40);
  const plan = {
    schemaVersion: 1, candidateCommit: candidate, baselineCommit: baseline,
    approvalReference: "SYNTHETIC_TEST_ONLY", approvedAt: "2026-01-01T00:00:00Z", repetitions: 1,
    setup: { model: "synthetic", modelVersion: "test", toolPolicy: "same", contextBudget: "same", ponytail: "off", environment: "isolated" },
    fixtures: Object.fromEntries(cases.map(c => [c.id, "c".repeat(64)])),
    thresholds: { minSuccessRate: 0.9, maxFalsePositiveRate: 0.1, maxFalseNegativeRate: 0.1, maxSuccessDrop: 0,
      maxInputTokenRatio: 1.2, maxOutputTokenRatio: 1.2, maxLatencyRatio: 1.2 },
  };
  for (const trial of study.trials) {
    trial.revision = trial.arm === "none" ? "none" : trial.arm === "v0.6.0" ? baseline : candidate;
    trial.startedAt = "2026-01-02T00:00:00Z";
    trial.setup.fixtureHash = plan.fixtures[trial.caseId];
  }

  return { study, plan, candidate };
}

test("preregistered threshold assessor binds trial revisions, setup and limits without approving a release", () => {
  const { study, plan, candidate } = plannedStudy();
  const result = assessEvaluation(study, plan, candidate);
  assert.equal(result.status, "MEETS_SUPPLIED_THRESHOLDS");
  assert.equal(result.releaseAccepted, false);
  assert.equal(result.checks.length, 8);
  assert.ok(result.checks.every(check => check.status === "PASS"));
  assert.equal(assessEvaluation(study, plan, "d".repeat(40)).status, "NOT_ASSESSED");
  study.trials[0].startedAt = "2025-12-31T23:59:59Z";
  assert.equal(assessEvaluation(study, plan, candidate).status, "NOT_ASSESSED");
});

test("missing usage or undefined review denominator cannot meet thresholds; critical false pass is NO_GO", () => {
  const { study, plan, candidate } = plannedStudy();
  const missing = structuredClone(study);
  missing.trials.find(t => t.arm === "erosiano-dev").usage.latencyMs = null;
  assert.equal(assessEvaluation(missing, plan, candidate).status, "NOT_ASSESSED");
  const noNegatives = structuredClone(study);
  for (const trial of noNegatives.trials.filter(t => t.arm === "erosiano-dev")) trial.review.tn = 0;
  assert.equal(assessEvaluation(noNegatives, plan, candidate).status, "NOT_ASSESSED");
  const slow = structuredClone(study);
  for (const trial of slow.trials.filter(t => t.arm === "erosiano-dev")) trial.usage.latencyMs = 20;
  assert.equal(assessEvaluation(slow, plan, candidate).status, "NO_GO");
  const critical = structuredClone(study);
  critical.trials.find(t => t.arm === "erosiano-dev").criticalFalsePass = true;
  assert.equal(assessEvaluation(critical, plan, candidate).status, "NO_GO");
});

test("plan requires the approved model, fixture digest, arm revision and complete paired trials", () => {
  const { study, plan, candidate } = plannedStudy();
  const wrongRevision = structuredClone(study);
  wrongRevision.trials.find(t => t.arm === "erosiano-dev").revision = "e".repeat(40);
  assert.equal(assessEvaluation(wrongRevision, plan, candidate).status, "NOT_ASSESSED");
  const changedFixture = structuredClone(study);
  changedFixture.trials[0].setup.fixtureHash = "f".repeat(64);
  assert.equal(assessEvaluation(changedFixture, plan, candidate).status, "NOT_ASSESSED");
  const changedSetup = structuredClone(study);
  for (const trial of changedSetup.trials) trial.setup.modelVersion = "other";
  assert.equal(assessEvaluation(changedSetup, plan, candidate).status, "NOT_ASSESSED");
});
