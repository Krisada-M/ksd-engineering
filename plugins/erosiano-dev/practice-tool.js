import { readPracticeCatalog, resolvePractices } from "./practices.js";

const MAX_INPUT_BYTES = 64 * 1024;
const MAX_OUTPUT_CHARS = 12000;

function result(text, details = {}, isError = false) {
  return { content: [{ type: "text", text }], details, ...(isError ? { isError: true } : {}) };
}

export function resolvePracticeTool(input) {
  if (typeof input?.context !== "string" || Buffer.byteLength(input.context) > MAX_INPUT_BYTES) return result("NOT_ASSESSED: expected bounded JSON context", {}, true);
  try {
    const catalog = readPracticeCatalog();
    if (input.group !== undefined && !catalog.practices.some(rule => rule.group === input.group)) return result("NOT_ASSESSED: unknown practice group", {}, true);
    const selection = resolvePractices(JSON.parse(input.context), catalog);
    const decisions = input.group === undefined ? selection.decisions : selection.decisions.filter(rule => rule.group === input.group);
    const counts = Object.fromEntries(["APPLICABLE", "CONFLICT", "SUPPRESSED", "UNKNOWN", "NOT_APPLICABLE"].map(status => [status, decisions.filter(rule => rule.status === status).length]));
    const summary = { evidence: selection.evidence, group: input.group ?? "all", counts, totalCatalogEntries: selection.decisions.length };
    const output = JSON.stringify({ ...summary,
      decisions: decisions.filter(rule => ["APPLICABLE", "CONFLICT", "SUPPRESSED"].includes(rule.status)).map(rule => ({ id: rule.id, title: rule.title, intent: rule.intent, status: rule.status, level: rule.level, reason: rule.reason })),
      unknown: decisions.filter(rule => rule.status === "UNKNOWN").map(rule => rule.id),
    });
    if (output.length > MAX_OUTPUT_CHARS) return result(JSON.stringify({ ...summary, limited: true, note: "Output exceeds limit; request a single group. No omitted rule is waived." }), summary);

    return result(output, summary);
  } catch {
    return result("NOT_ASSESSED: malformed context, catalog or unsupported evidence. Use explicit known boolean facets and scoped overrides with provenance.", {}, true);
  }
}

/** Register only with explicit operator opt-in and a compatible documented host. */
export function registerPracticeTool(pi, { optedIn, isEnabled }) {
  if (!optedIn) return "OFF";
  if (typeof pi.registerTool !== "function" || !pi.zod) return "UNSUPPORTED";
  try {
    const z = pi.zod;
    pi.registerTool({
      name: "erosiano_resolve_practices",
      label: "erosiano-dev Practice Resolver",
      description: "After scoped baseline discovery, resolve applicable practices from explicit observed true/false facets; omitted facets are unknown. Pass JSON context with facets, optional projectOverrides, enabledGates, mode; optional group narrows output. Advisory supplied evidence only, not verification.",
      parameters: z.object({ context: z.string(), group: z.string().optional() }),
      approval: "read",
      async execute(_id, input, signal, _onUpdate, ctx) {
        if (signal?.aborted) return result("NOT_ASSESSED: cancelled", {}, true);
        try {
          if (!isEnabled(ctx)) return result("NOT_ASSESSED: erosiano-dev is disabled", {}, true);

          return resolvePracticeTool(input);
        } catch {
          return result("NOT_ASSESSED: extension context unavailable", {}, true);
        }
      },
    });

    return "REGISTERED_NOT_LIVE_VERIFIED";
  } catch {
    return "UNSUPPORTED";
  }
}
