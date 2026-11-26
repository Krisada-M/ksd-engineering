// Scores independently supplied trial records; does not execute agent code or authenticate evidence.
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
const ARMS = ["none", "v0.6.0", "erosiano-dev"];
const REQUIRED = ["model", "modelVersion", "fixtureHash", "toolPolicy", "contextBudget", "ponytail", "environment"];
const COUNTS = ["tp", "fp", "fn", "tn"];
const METRICS = ["inputTokens", "outputTokens", "latencyMs", "costUsd"];

const nonempty = value => typeof value === "string" && value.trim().length > 0;
const count = value => Number.isSafeInteger(value) && value >= 0;
const number = value => typeof value === "number" && Number.isFinite(value) && value >= 0;
const rate = (n, d) => d > 0 ? n / d : null;
const manifest = JSON.parse(readFileSync(new URL("./fixtures/cases.json", import.meta.url), "utf8"));
const caseIds = manifest.map(c => c.id);

export function scoreEvaluation(study) {
  const problems = [];
  if (!study || !Array.isArray(study.trials) || !Number.isSafeInteger(study.repetitions) || study.repetitions < 1 || study.repetitions > 100) {
    return { status: "NOT_ASSESSED", problems: ["Expected trials and 1–100 planned repetitions"] };
  }

  const groups = new Map();
  const rows = new Map(ARMS.map(arm => [arm, []]));
  for (const trial of study.trials) {
    if (!trial || !ARMS.includes(trial.arm) || !caseIds.includes(trial.caseId) ||
      !Number.isSafeInteger(trial.repeat) || trial.repeat < 1 || trial.repeat > study.repetitions ||
      !REQUIRED.every(key => nonempty(trial.setup?.[key])) ||
      !nonempty(trial.evidence) || !nonempty(trial.reviewer) ||
      typeof trial.passed !== "boolean" || typeof trial.criticalFailure !== "boolean" ||
      typeof trial.criticalFalsePass !== "boolean" ||
      !COUNTS.every(key => count(trial.review?.[key])) ||
      !METRICS.every(key => trial.usage?.[key] === null || number(trial.usage?.[key]))) {
      problems.push("Invalid or incomplete trial record");
      continue;
    }
    const key = JSON.stringify([trial.caseId, trial.repeat]);
    const group = groups.get(key) ?? new Map();
    if (group.has(trial.arm)) {
      problems.push("Duplicate trial: " + key + " " + trial.arm);
      continue;
    }
    group.set(trial.arm, trial);
    groups.set(key, group);
    rows.get(trial.arm).push(trial);
  }

  for (const id of caseIds) {
    for (let repeat = 1; repeat <= study.repetitions; repeat++) {
      const key = JSON.stringify([id, repeat]);
      const group = groups.get(key);
      if (!group || group.size !== ARMS.length) {
        problems.push("Missing matched arm: " + key);
        continue;
      }
      const baseline = group.get("none").setup;
      if (ARMS.some(arm => REQUIRED.some(field => group.get(arm).setup[field] !== baseline[field]))) {
        problems.push("Unmatched study setup: " + key);
      }
    }
  }

  if (problems.length) return { status: "NOT_ASSESSED", problems };

  const arms = {};
  for (const [arm, trials] of rows) {
    const totals = Object.fromEntries(COUNTS.map(key => [key, trials.reduce((sum, t) => sum + t.review[key], 0)]));
    const usage = Object.fromEntries(METRICS.map(key => {
      const observed = trials.map(t => t.usage[key]).filter(number);

      return [key, { observed: observed.length, missing: trials.length - observed.length, mean: observed.length ? observed.reduce((a, b) => a + b, 0) / observed.length : null }];
    }));
    const passed = trials.filter(t => t.passed).length;
    arms[arm] = {
      trials: trials.length, passed, successRate: rate(passed, trials.length),
      criticalFailures: trials.filter(t => t.criticalFailure).length,
      criticalFalsePasses: trials.filter(t => t.criticalFalsePass).length,
      review: { ...totals, precision: rate(totals.tp, totals.tp + totals.fp),
        recall: rate(totals.tp, totals.tp + totals.fn),
        falsePositiveRate: rate(totals.fp, totals.fp + totals.tn),
        falseNegativeRate: rate(totals.fn, totals.fn + totals.tp) },
      usage,
    };
  }

  const candidate = arms["erosiano-dev"];
  const status = candidate.criticalFailures || candidate.criticalFalsePasses ? "NO_GO" : "MEASURED_SUPPLIED";

  return { status, evidence: "SUPPLIED_NOT_AUTHENTICATED", releaseAccepted: false, arms,
    note: "Compare against pre-approved study thresholds and inspect independent evidence. A score is not release authorization." };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = scoreEvaluation(JSON.parse(readFileSync(process.argv[2], "utf8")));
    console.log(JSON.stringify(result, null, 2));
    if (result.status === "NOT_ASSESSED" || result.status === "NO_GO") process.exitCode = 2;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}
