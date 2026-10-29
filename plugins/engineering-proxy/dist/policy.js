import { buildSdlcPolicy, KSD_MODES } from "./sdlc.js";
// Keep this policy orthogonal to Ponytail's simplicity and over-engineering guidance.
export const SECTION_KEY = "engineering-proxy";
export const POLICY_MARKER = "[Engineering Proxy Policy]";
export const POLICY_END = "[End Engineering Proxy Policy]";
/** A complete line consisting only of a policy marker: the stable marker or a numbered legacy version. */
const COMPLETE_MARKER_LINE = /^\[Engineering Proxy Policy(?: v\d+(?:\.\d+)*)?\]\r?$/;
/** An array element is owned when it BEGINS with the stable or a numbered legacy marker (existing array contract). */
const LEADING_MARKER = /^\[Engineering Proxy Policy(?: v\d+(?:\.\d+)*)?\]/;
const changed = (next, base) => next !== base;
/**
 * Locate complete owned blocks in a string prompt: each runs from a dedicated marker line to the next
 * end-marker line. A marker line that is never closed, or one that is met again before its end, leaves the
 * block unterminated and the whole correction denied (never guess its end or drop unrelated content).
 */
function findStringBlocks(base) {
    const lines = [];
    let position = 0;
    while (position < base.length) {
        const newlineAt = base.indexOf("\n", position);
        const end = newlineAt === -1 ? base.length : newlineAt + 1;
        lines.push({ text: base.slice(position, newlineAt === -1 ? base.length : newlineAt), start: position, end });
        if (newlineAt === -1)
            break;
        position = end;
    }
    const blocks = [];
    let unterminated = false;
    let index = 0;
    while (index < lines.length) {
        const line = lines[index];
        if (!COMPLETE_MARKER_LINE.test(line.text)) {
            index += 1;
            continue;
        }
        let blockEnd = -1;
        for (let probe = index + 1; probe < lines.length; probe++) {
            const candidate = lines[probe];
            if (candidate.text.replace(/\r$/, "") === POLICY_END) {
                blockEnd = candidate.start + POLICY_END.length;
                index = probe + 1;
                break;
            }
            if (COMPLETE_MARKER_LINE.test(candidate.text)) {
                unterminated = true;
                break;
            }
        }
        if (blockEnd < 0) {
            unterminated = true;
            break;
        }
        blocks.push({ start: line.start, end: blockEnd });
    }
    return { blocks, unterminated };
}
/** Remove every complete owned block, preserving unrelated bytes, and insert at most one policy where the first block stood. */
function reconcileString(base, policy, warn) {
    const { blocks, unterminated } = findStringBlocks(base);
    if (unterminated) {
        warn?.("KSD could not replace/remove an unterminated legacy policy; restart the session.");
        return undefined;
    }
    if (blocks.length === 0) {
        if (policy === undefined)
            return undefined; // Nothing owned to remove; keep the prompt as-is.
        if (base === "")
            return policy;
        const next = `${base}\n\n${policy}`;
        return changed(next, base) ? next : undefined;
    }
    const strippedParts = [];
    let cursor = 0;
    for (const block of blocks) {
        strippedParts.push(base.slice(cursor, block.start));
        cursor = block.end;
    }
    strippedParts.push(base.slice(cursor));
    const stripped = strippedParts.join("");
    const next = policy === undefined ? stripped : base.slice(0, blocks[0].start) + policy + stripped.slice(blocks[0].start);
    return changed(next, base) ? next : undefined;
}
export function buildPolicy({ enforcement = "balanced" } = {}) {
    if (!KSD_MODES.includes(enforcement))
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
/** Reconcile a string or array fallback prompt: remove owned guidance, or replace it with exactly one policy. */
function reconcileFallback(base, policy, warn) {
    if (typeof base === "string") {
        const next = reconcileString(base, policy, warn);
        return next === undefined ? undefined : { systemPrompt: next };
    }
    const owned = base
        .map((part, index) => (typeof part === "string" && LEADING_MARKER.test(part) ? index : -1))
        .filter(index => index >= 0);
    if (owned.length === 0) {
        return policy === undefined ? undefined : { systemPrompt: [...base, policy] };
    }
    if (owned.length === 1 && base[owned[0]] === policy)
        return undefined;
    if (policy === undefined) {
        return { systemPrompt: base.filter((_part, index) => !owned.includes(index)) };
    }
    // Exactly one owned element survives: unrelated order preserved, extra owned elements dropped.
    return { systemPrompt: base.flatMap((part, index) => {
            if (owned.includes(index))
                return index === owned[0] ? [policy] : [];
            return [part];
        }) };
}
export function augmentSystemPrompt(event, policy, warn) {
    const sections = event?.systemPromptOptions?.sections;
    // Do not add a structured policy if an unterminated fallback cannot be removed.
    if (sections && typeof sections === "object") {
        let failed = false;
        const fallback = event?.systemPrompt === undefined ? undefined : reconcileFallback(event.systemPrompt, undefined, message => {
            failed = true;
            warn?.(message);
        });
        if (policy === undefined || failed)
            delete sections[SECTION_KEY];
        else
            sections[SECTION_KEY] = policy;
        return fallback;
    }
    return event?.systemPrompt === undefined
        ? (policy === undefined ? undefined : { systemPrompt: policy })
        : reconcileFallback(event.systemPrompt, policy, warn);
}
