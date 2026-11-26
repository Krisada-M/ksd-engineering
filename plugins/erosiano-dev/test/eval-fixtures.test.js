import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { scoreEvaluation } from "./eval/score.mjs";

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
