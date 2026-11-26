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

const GIT_OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const SHA256 = /^[a-f0-9]{64}$/;
const RATE_LIMITS = ["minSuccessRate", "maxFalsePositiveRate", "maxFalseNegativeRate", "maxSuccessDrop"];
const RATIO_LIMITS = ["maxInputTokenRatio", "maxOutputTokenRatio", "maxLatencyRatio"];
const SETUP_FIELDS = REQUIRED.filter(key => key !== "fixtureHash");

function timestamp(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value)) return NaN;

  return Date.parse(value);
}

/** Evaluate a preregistered study, never authenticate operator-supplied evidence or authorize a release. */
export function assessEvaluation(study, plan, candidateCommit) {
  const invalid = problems => ({ status: "NOT_ASSESSED", problems, releaseAccepted: false, evidence: "SUPPLIED_NOT_AUTHENTICATED" });
  if (typeof candidateCommit !== "string" || !GIT_OID.test(candidateCommit) ||
      plan?.schemaVersion !== 1 || plan.candidateCommit !== candidateCommit ||
      typeof plan.baselineCommit !== "string" || !GIT_OID.test(plan.baselineCommit) ||
      plan.baselineCommit === candidateCommit || !nonempty(plan.approvalReference) ||
      !Number.isFinite(timestamp(plan.approvedAt)) ||
      !Number.isSafeInteger(plan.repetitions) || plan.repetitions < 1 || plan.repetitions > 100 ||
      !SETUP_FIELDS.every(key => nonempty(plan.setup?.[key])) ||
      !plan.fixtures || Object.keys(plan.fixtures).length !== caseIds.length ||
      !caseIds.every(id => Object.hasOwn(plan.fixtures, id) && typeof plan.fixtures[id] === "string" && SHA256.test(plan.fixtures[id])) ||
      !RATE_LIMITS.every(key => number(plan.thresholds?.[key]) && plan.thresholds[key] <= 1) ||
      !RATIO_LIMITS.every(key => number(plan.thresholds?.[key]) && plan.thresholds[key] > 0)) {
    return invalid(["Missing, malformed or wrong-head preregistered study plan"]);
  }
  if (study?.repetitions !== plan.repetitions) return invalid(["Study repetitions do not match plan"]);
  const scored = scoreEvaluation(study);
  if (scored.status === "NOT_ASSESSED") return invalid(scored.problems);
  const problems = [];
  const approved = timestamp(plan.approvedAt);
  for (const trial of study.trials) {
    const expected = trial.arm === "none" ? "none" : trial.arm === "v0.6.0" ? plan.baselineCommit : candidateCommit;
    if (trial.revision !== expected || trial.setup.fixtureHash !== plan.fixtures[trial.caseId] ||
        SETUP_FIELDS.some(key => trial.setup[key] !== plan.setup[key]) ||
        !Number.isFinite(timestamp(trial.startedAt)) || timestamp(trial.startedAt) < approved) {
      problems.push("Trial does not match approved revision, setup or timing: " + trial.caseId + "/" + trial.arm + "/" + trial.repeat);
    }
  }
  if (problems.length) return invalid(problems);
  if (scored.status === "NO_GO") return { ...scored, reasons: ["Candidate critical failure or critical false pass"] };

  const candidate = scored.arms["erosiano-dev"];
  const baseline = scored.arms["v0.6.0"];
  const noPlugin = scored.arms.none;
  const checks = [];
  function gate(id, measured, limit, comparison) {
    const known = Number.isFinite(measured);
    const pass = known && (comparison === "min" ? measured >= limit : measured <= limit);
    let status = "NOT_ASSESSED";
    if (known) status = pass ? "PASS" : "FAIL";
    checks.push({ id, measured: known ? measured : null, limit, comparison, status });
  }

  function usageRatio(key) {
    const previous = baseline.usage[key];
    const current = candidate.usage[key];
    if (previous.missing || current.missing || !Number.isFinite(previous.mean) || !Number.isFinite(current.mean) || previous.mean <= 0) return null;

    return current.mean / previous.mean;
  }

  gate("success", candidate.successRate, plan.thresholds.minSuccessRate, "min");
  gate("success-drop-v0.6", baseline.successRate - candidate.successRate, plan.thresholds.maxSuccessDrop, "max");
  gate("success-drop-none", noPlugin.successRate - candidate.successRate, plan.thresholds.maxSuccessDrop, "max");
  gate("false-positive-rate", candidate.review.falsePositiveRate, plan.thresholds.maxFalsePositiveRate, "max");
  gate("false-negative-rate", candidate.review.falseNegativeRate, plan.thresholds.maxFalseNegativeRate, "max");
  gate("input-token-ratio", usageRatio("inputTokens"), plan.thresholds.maxInputTokenRatio, "max");
  gate("output-token-ratio", usageRatio("outputTokens"), plan.thresholds.maxOutputTokenRatio, "max");
  gate("latency-ratio", usageRatio("latencyMs"), plan.thresholds.maxLatencyRatio, "max");
  if (plan.thresholds.maxCostRatio !== undefined) {
    if (!number(plan.thresholds.maxCostRatio) || plan.thresholds.maxCostRatio <= 0) return invalid(["Invalid cost ratio limit"]);
    gate("cost-ratio", usageRatio("costUsd"), plan.thresholds.maxCostRatio, "max");
  }

  let status = "MEETS_SUPPLIED_THRESHOLDS";
  if (checks.some(check => check.status === "FAIL")) status = "NO_GO";
  else if (checks.some(check => check.status !== "PASS")) status = "NOT_ASSESSED";

  return { ...scored, status, candidateCommit, approvalReference: plan.approvalReference, checks, releaseAccepted: false,
    note: "Plan, independent review, timing and evidence references are supplied and unauthenticated; verify them externally. Passing these thresholds is not v1.0 release approval." };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 1 && (args.length !== 5 || args[1] !== "--plan" || args[3] !== "--candidate")) {
      throw new Error("Usage: node score.mjs results.json [--plan approved-plan.json --candidate exact-commit]");
    }
    const study = JSON.parse(readFileSync(args[0], "utf8"));
    const result = args.length === 5 ? assessEvaluation(study, JSON.parse(readFileSync(args[2], "utf8")), args[4]) : scoreEvaluation(study);
    console.log(JSON.stringify(result, null, 2));
    if (result.status === "NOT_ASSESSED" || result.status === "NO_GO") process.exitCode = 2;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}
