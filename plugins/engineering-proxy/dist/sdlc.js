export const SDLC_PHASES = Object.freeze([
    "Requirements",
    "Design",
    "Implementation",
    "Verification",
    "Delivery",
]);
export function buildSdlcPolicy({ mode = "balanced" } = {}) {
    if (!["balanced", "adaptive"].includes(mode))
        throw new Error("Invalid SDLC policy mode");
    return [
        "SDLC workflow (proportional to the actual change; never fabricate evidence or create unnecessary documents):",
        "1. Requirements: identify intent, acceptance criteria, affected users/contracts and unknowns before changing behavior. For a tiny style-only edit, state the scope briefly.",
        "2. Design: inspect existing callers, architecture, data flow and invariants. Compare only relevant alternatives; avoid speculative abstraction or redesign.",
        "3. Implementation: smallest behavior-preserving change, guard clauses where clearer, no unrelated churn. Apply repo conventions and Ponytail simplification without duplicating it.",
        "4. Verification: select tests by impact; verify negative/error cases, contracts, types and security when relevant. Distinguish skipped, missing, and actually executed gates.",
        "5. Delivery: summarize changed files, test commands/results, remaining risks, rollback impact and explicit approval blockers. Never automatically push, merge or deploy.",
        "Risk scaling: documentation/style-only changes get lightweight checks; auth, payments, migrations, secrets, access control and concurrency require stronger design, security and integration evidence.",
        "When a requirement is unclear, ask or mark it UNKNOWN instead of inventing policy, TTL, database state or provider behavior.",
        mode === "adaptive"
            ? "Adaptive emphasis: use the lightest sufficient SDLC evidence for each change, but escalate on risky contracts or behavior. Keep control flow flat where semantics allow."
            : "Balanced emphasis: preserve the repository's established checkpoints, with explicit evidence for all applicable gates.",
    ].join("\n");
}
