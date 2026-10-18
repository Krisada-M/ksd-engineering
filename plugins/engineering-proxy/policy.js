// Keep this policy orthogonal to Ponytail's simplicity and over-engineering guidance.
export const SECTION_KEY = "engineering-proxy";
export const POLICY_MARKER = "[Engineering Proxy Policy v0.1]";

export function buildPolicy({ enforcement = "balanced" } = {}) {
  return `${POLICY_MARKER}
Repo-adaptive engineering preferences; do not override explicit user requirements or existing repo conventions.
Prefer explicit, readable code with guard clauses over avoidable nested ifs; don't change semantics to flatten control flow.
Place one blank line before a return when another statement precedes it in the same block; no leading blank after an opening brace for a first-statement return.
Separate adjacent function implementations by one blank line. Do not insert blank lines into TypeScript overload groups or unrelated code.
Preserve existing architecture, contracts, validation, security, accessibility and error handling. No unrelated renames/refactors.
Enforcement=${enforcement}: only authoritative project gates may block; ambiguous style judgments are warnings. Report verified, unverified, and blockers distinctly.
Ponytail integration: Ponytail owns YAGNI/simplification and /ponytail-review. Do not duplicate its instructions, mutate Ponytail mode, or auto-invoke its review. Minimum diff must still meet correctness and test requirements.
Use repo formatter/linter/types/tests as evidence; do not claim PASS without executing relevant checks. Distinguish CI workflow presence from an actual successful relevant run, and never interpret a skipped DB-backed test as a pass. Never push, merge, deploy or modify production as part of style enforcement.`;
}

export function augmentSystemPrompt(event, policy) {
  const sections = event?.systemPromptOptions?.sections;

  if (sections && typeof sections === "object") {
    sections[SECTION_KEY] = policy;

    return;
  }

  const base = event?.systemPrompt;

  if (Array.isArray(base)) {
    if (base.some(part => typeof part === "string" && part.includes(POLICY_MARKER))) return;

    return { systemPrompt: [...base, policy] };
  }

  if (typeof base === "string") {
    if (base.includes(POLICY_MARKER)) return;

    return { systemPrompt: `${base}\n\n${policy}` };
  }

  return { systemPrompt: policy };
}
