// Offline v1 readiness assessment; all evidence remains caller-supplied, not authenticated.
import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { assessEvaluation } from "./score.mjs";
import { assessReview } from "../../review-verdict.js";

const OID = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
const CRITERIA = Object.freeze({
  E01: "regression", E02: "migration", E03: "live-host", E04: "baseline",
  E05: "baseline", E06: "resolver", E07: "catalog", E08: "native-gates",
  E09: "integration", E10: "review", E11: "measurement", E12: "integration",
  E13: "live-host", E14: "evaluation", E15: "approval",
});
const JOBS = ["unit (ubuntu-latest, 22.13.0)", "unit (ubuntu-latest, 24)", "unit (macos-latest, 22.13.0)", "unit (macos-latest, 24)", "runtime-floor"];
const UNIT_STEPS = ["Run npm run lint", "Run npm run typecheck", "Run npm run build", "Run npm test", "Run node plugins/erosiano-dev/test/benchmark.mjs"];
const nonempty = value => typeof value === "string" && value.trim().length > 0;

function exactCI(ci, head) {
  if (ci?.headSha !== head || ci.status !== "completed" || ci.conclusion !== "success" || !Array.isArray(ci.jobs) || !nonempty(ci.url)) return false;
  for (const name of JOBS) {
    const jobs = ci.jobs.filter(job => job.name === name);
    if (jobs.length !== 1 || jobs[0].status !== "completed" || jobs[0].conclusion !== "success") return false;
    const steps = jobs[0].steps;
    if (!Array.isArray(steps) || !steps.length) return false;
    if (name === "runtime-floor") {
      if (!steps.some(step => step.name === "Import dependency-free extension and companions" && step.conclusion === "success")) return false;
    } else if (!UNIT_STEPS.every(stepName => steps.some(step => step.name === stepName && step.conclusion === "success"))) {
      return false;
    }
  }

  return true;
}

export function assessV1Readiness(report, study, plan, head) {
  if (typeof head !== "string" || !OID.test(head) || report?.candidateCommit !== head ||
      report.schemaVersion !== 1 || !Array.isArray(report.criteria)) {
    return { status: "NOT_ASSESSED", releaseAccepted: false, reason: "Missing or wrong-head release report" };
  }
  const byId = new Map();
  for (const item of report.criteria) {
    if (!item || !Object.hasOwn(CRITERIA, item.id) || byId.has(item.id)) {
      return { status: "NOT_ASSESSED", releaseAccepted: false, reason: "Unknown or duplicate acceptance criterion" };
    }
    byId.set(item.id, item);
  }

  const evaluation = assessEvaluation(study, plan, head);
  const checks = Object.entries(CRITERIA).map(([id, kind]) => {
    const item = byId.get(id);
    const evidenceValid = item?.headSha === head && item.kind === kind && nonempty(item.reference);
    let status = evidenceValid && item.status === "VERIFIED" ? "PASS" : "NOT_ASSESSED";
    if (item?.status === "FAILED" || item?.status === "FIX_REQUIRED") status = "FAIL";
    if (id === "E14" && evaluation.status !== "MEETS_SUPPLIED_THRESHOLDS") {
      status = evaluation.status === "NO_GO" ? "FAIL" : "NOT_ASSESSED";
    }

    return { id, kind, status };
  });
  const ciValid = exactCI(report.ci, head);
  const review = assessReview({
    scope: "release",
    reviewedCommit: head,
    requiredGates: ["typecheck", "lint", "tests", "runtime", "security", "ci-parity"].map(id => ({ id, critical: true })),
    gates: report.reviewGates ?? [],
  });
  checks.push({ id: "exact-head-ci", status: ciValid ? "PASS" : "NOT_ASSESSED" });
  checks.push({ id: "review-evidence", status: review.verdict === "RELEASE_CANDIDATE" ? "PASS" : "NOT_ASSESSED" });
  const independent = report.independentReview;
  const independentlyReviewed = independent?.headSha === head && independent.status === "VERIFIED" &&
    nonempty(independent.reviewer) && nonempty(independent.reference) && independent.unresolvedCritical === 0;
  checks.push({ id: "independent-review", status: independentlyReviewed ? "PASS" : "NOT_ASSESSED" });
  const host = report.liveHost;
  const validHosts = Array.isArray(host) && ["darwin", "linux"].every(platform => host.some(item =>
    item?.platform === platform && item.headSha === head && item.status === "VERIFIED" &&
    nonempty(item.ompVersion) && nonempty(item.reference) &&
    ["marketplaceInstall", "promptInjection", "sessionReplay", "rollback", "ponytailOnOff", "intelligenceFallback"].every(key => item[key] === true)));
  checks.push({ id: "live-host-matrix", status: validHosts ? "PASS" : "NOT_ASSESSED" });

  return { status: checks.every(check => check.status === "PASS") ? "EVIDENCE_COMPLETE_FOR_OWNER_REVIEW" : "NO_GO",
    candidateCommit: head, checks, evaluationStatus: evaluation.status, reviewVerdict: review.verdict,
    evidence: "SUPPLIED_NOT_AUTHENTICATED", releaseAccepted: false,
    note: "Inspect actual logs, CI, provider trials and human approval. No merge, publish or release is authorized by this report." };
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length !== 4) throw new Error("Usage: node assess-v1.mjs release-report.json study.json approved-plan.json exact-commit");
    const [report, study, plan] = args.slice(0, 3).map(path => JSON.parse(readFileSync(path, "utf8")));
    const result = assessV1Readiness(report, study, plan, args[3]);
    console.log(JSON.stringify(result, null, 2));
    if (result.status !== "EVIDENCE_COMPLETE_FOR_OWNER_REVIEW") process.exitCode = 2;
  } catch (error) {
    console.error("Release readiness NOT_ASSESSED: " + error.message);
    process.exitCode = 2;
  }
}
