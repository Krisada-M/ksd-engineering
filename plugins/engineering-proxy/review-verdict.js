const STATES = new Set(["VERIFIED", "PARTIAL", "NOT_RUN", "BLOCKED", "FAILED", "FIX_REQUIRED"]);

export function hasEvidence(gate) {
  const e = gate?.evidence;
  if (!e || typeof e !== "object") return false;
  if (e.type === "command") return Boolean(e.command?.trim() && e.result?.trim());
  if (e.type === "source") return Boolean(e.path?.trim() && e.observation?.trim());
  if (e.type === "ci-run") return Boolean(e.url?.trim() && e.conclusion === "success");
  return false;
}

/**
 * A deterministic evidence summary, not a substitute for human release approval.
 * In particular, CI coverage is only VERIFIED with a successful cited CI run.
 */
export function assessReview({ scope = "code-review", gates } = {}) {
  if (!["code-review", "release"].includes(scope)) throw new Error("Invalid scope");
  if (!Array.isArray(gates) || gates.length === 0) {
    return { verdict: "NOT_ASSESSED", gates: [], reasons: ["No gates were supplied"] };
  }

  const normalized = gates.map(gate => {
    if (!gate || typeof gate.id !== "string" || !gate.id.trim() || !STATES.has(gate.status)) {
      throw new Error("Each gate needs an id and a supported status");
    }

    const evidenceValid = hasEvidence(gate) &&
      (gate.id !== "ci-parity" || gate.evidence.type === "ci-run");

    return {
      id: gate.id,
      required: gate.required !== false,
      critical: gate.critical === true,
      status: gate.status === "VERIFIED" && !evidenceValid ? "UNVERIFIED" : gate.status,
      evidenceValid,
    };
  });

  const required = normalized.filter(g => g.required);
  if (!required.length) {
    return { verdict: "NOT_ASSESSED", gates: normalized, reasons: ["No required gates were supplied"] };
  }

  const failing = required.filter(g => ["FAILED", "FIX_REQUIRED"].includes(g.status));
  const missing = required.filter(g => g.status !== "VERIFIED");
  const criticalUnknown = missing.filter(g => g.critical);

  let verdict;
  if (failing.length || criticalUnknown.length) verdict = "NO_GO";
  else if (missing.length) verdict = scope === "release" ? "NO_GO" : "CONDITIONAL_GO";
  else verdict = scope === "release" ? "RELEASE_CANDIDATE" : "READY_FOR_REVIEW";

  return {
    verdict,
    gates: normalized,
    reasons: missing.map(g => g.id + ": " + g.status),
    disclaimer: "No merge or deployment approval is granted by this verdict.",
  };
}
