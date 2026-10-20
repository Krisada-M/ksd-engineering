import { buildSdlcPolicy } from "./sdlc.js";
// Keep this policy orthogonal to Ponytail's simplicity and over-engineering guidance.
export const SECTION_KEY = "engineering-proxy";
export const POLICY_MARKER = "[Engineering Proxy Policy v0.3]";
const LEGACY_MARKERS = ["[Engineering Proxy Policy v0.1]", "[Engineering Proxy Policy v0.2]"];
export const POLICY_END = "[End Engineering Proxy Policy]";
export function buildPolicy({ enforcement = "balanced" } = {}) {
    if (!["balanced", "adaptive"].includes(enforcement))
        throw new Error("Unsupported KSD enforcement mode");
    const cleanCode = enforcement === "adaptive"
        ? "Adaptive Clean Code: flat by default. Prefer guard clauses, early returns and simple linear flows; avoid unnecessary else-after-return, nested if and nested ternaries. Extract small helpers only if meaningful. Mark clearly avoidable nesting in newly changed code as FIX REQUIRED in reviews, but keep uncertain/behavior-sensitive cases as WARN. Never rewrite blindly or weaken security, transactions or error handling."
        : "Balanced Clean Code: favor guard clauses and straightforward readable control flow where behavior is preserved; ambiguous nesting remains advisory.";
    return `${POLICY_MARKER}
Repo-adaptive engineering preferences; do not override explicit user requirements or existing repo conventions.
${cleanCode}
Place one blank line before a return when another statement precedes it in the same block; no leading blank after an opening brace for a first-statement return.
Separate adjacent function implementations by one blank line. Do not insert blank lines into TypeScript overload groups or unrelated code.
Preserve existing architecture, contracts, validation, security, accessibility and error handling. No unrelated renames/refactors.
Enforcement=${enforcement}: authoritative project gates remain in control; KSD reviewer findings are advisory unless the repository adopts an explicit blocking rule. Report verified, unverified, and blockers distinctly.\n${buildSdlcPolicy({ mode: enforcement })}
Ponytail integration: Ponytail owns YAGNI/simplification and /ponytail-review. Do not duplicate its instructions, mutate Ponytail mode, or auto-invoke its review. Minimum diff must still meet correctness and test requirements.
Use repo formatter/linter/types/tests as evidence; do not claim PASS without executing relevant checks. Distinguish CI workflow presence from an actual successful relevant run, and never interpret a skipped DB-backed test as a pass. Never push, merge, deploy or modify production as part of style enforcement.\n${POLICY_END}`;
}
export function augmentSystemPrompt(event, policy) {
    const sections = event?.systemPromptOptions?.sections;
    if (sections && typeof sections === "object") {
        sections[SECTION_KEY] = policy;
        return;
    }
    const base = event?.systemPrompt;
    if (Array.isArray(base)) {
        const at = base.findIndex(part => typeof part === "string" && [POLICY_MARKER, ...LEGACY_MARKERS].some(marker => part.startsWith(marker)));
        if (at >= 0) {
            if (base[at] === policy)
                return;
            const next = [...base];
            next[at] = policy;
            return { systemPrompt: next };
        }
        return { systemPrompt: [...base, policy] };
    }
    if (typeof base === "string") {
        const start = [POLICY_MARKER, ...LEGACY_MARKERS].map(marker => base.indexOf(marker)).filter(position => position >= 0).sort((a, b) => a - b)[0] ?? -1;
        if (start >= 0) {
            const finish = base.indexOf(POLICY_END, start);
            if (finish < 0)
                return; // Legacy string prompts have no end marker: preserve rather than truncate unrelated content.
            const to = finish + POLICY_END.length;
            const next = base.slice(0, start) + policy + base.slice(to);
            if (next === base)
                return;
            return { systemPrompt: next };
        }
        return { systemPrompt: `${base}\n\n${policy}` };
    }
    return { systemPrompt: policy };
}
