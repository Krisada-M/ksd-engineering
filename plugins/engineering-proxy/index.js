import { loadConfig, SUPPORTED_MODES } from "./config.js";
import { augmentSystemPrompt, buildPolicy } from "./policy.js";
import { KsdRuntime } from "./dist/runtime.js";

const MODE_ENTRY = "engineering-proxy-mode";
const runtime = new KsdRuntime(loadConfig, buildPolicy, () => process.env.ENGINEERING_PROXY_DISABLED === "1");

export function parseEngineeringCommand(input) {
  const value = String(input ?? "").trim().toLowerCase();
  if (!value || value === "status") return { type: "status" };
  if (SUPPORTED_MODES.includes(value)) return { type: "set-mode", mode: value };

  return { type: "invalid" };
}

export function resolveSessionMode(entries, fallback = "balanced") {
  const defaultMode = SUPPORTED_MODES.includes(fallback) ? fallback : "balanced";
  if (!Array.isArray(entries)) return defaultMode;

  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry?.type !== "custom" || entry?.customType !== MODE_ENTRY) continue;
    if (SUPPORTED_MODES.includes(entry?.data?.mode)) return entry.data.mode;
  }

  return defaultMode;
}

/** Typed in-process implementation with cached configuration and deduplicated status writes. */
export function syncStatus(ctx, isActive = false, mode = "balanced") {
  const validMode = SUPPORTED_MODES.includes(mode) ? mode : "balanced";
  runtime.syncStatus(ctx, isActive, validMode);
}

const REVIEW_INSTRUCTIONS = `Review the current requested change as Engineering Proxy. First inspect the actual diff and relevant callers/contracts. Use Ponytail's ponytail-review skill exactly once IF it is available and a review is appropriate; do not re-run equivalent simplification review. Check the applicable SDLC stages: Requirements/acceptance criteria, Design/contracts, Implementation quality, Verification evidence and Delivery risks. Scale scrutiny to the change, with stronger security and integration gates for authentication, payments, migrations and concurrency. Independently verify requested personal style (guard clauses, flat-by-default control flow, blank before return, blank between functions), repo conventions, type safety, critical invariants, and changed-scope tests. Reuse existing formatter/linter/test commands when possible; do not add dependencies or edit unrelated files. Mark each applicable gate VERIFIED/PARTIAL/BLOCKED/NOT RUN with the exact command and observed result. A test skipped without required environment is NOT RUN, not PASS. A CI YAML file is not proof its job exercised the change; request a successful relevant CI run. Never label a release SHIP/GO with unresolved required or security gates. Never push, merge, deploy, or change production. Do not report a pass you did not observe.`;

export function createExtension(pi) {
  pi.setLabel?.("Engineering Proxy");

  let isActive = false;
  let currentMode = "balanced";

  function restoreSession(ctx) {
    isActive = false;
    const config = runtime.getConfig(ctx?.cwd ?? process.cwd(), true);
    runtime.invalidateStatus(ctx?.ui);
    let entries = [];
    try {
      entries = ctx?.sessionManager?.getBranch?.() ?? ctx?.sessionManager?.getEntries?.() ?? [];
    } catch {
      // Session stores may be absent or not ready in headless hosts.
    }

    currentMode = resolveSessionMode(entries, config.enforcement);
    syncStatus(ctx, isActive, currentMode);
  }

  for (const eventName of ["session_start", "session_tree", "session_switch", "session_branch"]) {
    pi.on(eventName, (_event, ctx) => restoreSession(ctx));
  }

  pi.on("agent_start", (_event, ctx) => {
    isActive = true;
    syncStatus(ctx, isActive, currentMode);
  });

  pi.on("agent_end", (_event, ctx) => {
    isActive = false;
    syncStatus(ctx, isActive, currentMode);
  });

  pi.on("before_agent_start", (event, ctx) => {
    const config = runtime.getConfig(ctx.cwd, true);
    syncStatus(ctx, isActive, currentMode);
    if (!config.enabled || process.env.ENGINEERING_PROXY_DISABLED === "1") {
      const sections = event?.systemPromptOptions?.sections;
      if (sections && typeof sections === "object") delete sections["engineering-proxy"];
      return;
    }

    return augmentSystemPrompt(event, runtime.getPolicy({ ...config, enforcement: currentMode }));
  });

  pi.registerCommand("engineering-proxy", {
    description: "Show status or select adaptive|balanced mode (session-scoped)",
    handler: async (args, ctx) => {
      const parsed = parseEngineeringCommand(args);
      const config = runtime.getConfig(ctx.cwd, true);
      const enabled = config.enabled && process.env.ENGINEERING_PROXY_DISABLED !== "1";

      if (parsed.type === "invalid") {
        ctx.ui?.notify?.("Usage: /engineering-proxy [status|balanced|adaptive]", "warning");
        return;
      }

      if (parsed.type === "set-mode") {
        if (!enabled) {
          ctx.ui?.notify?.("Engineering Proxy is disabled; mode unchanged.", "warning");
          return;
        }

        currentMode = parsed.mode;
        let persisted = false;
        try {
          if (typeof pi.appendEntry === "function") {
            pi.appendEntry(MODE_ENTRY, { mode: currentMode });
            persisted = true;
          }
        } catch {
          // Runtime policy still updates, but session mode cannot be replayed.
        }

        syncStatus(ctx, isActive, currentMode);
        ctx.ui?.notify?.(`KSD mode: ${currentMode.toUpperCase()} (${persisted ? "saved in session" : "runtime only; session persistence unavailable"})`, persisted ? "info" : "warning");
        return;
      }

      syncStatus(ctx, isActive, currentMode);
      const names = pi.getCommands?.() ?? [];
      const ponytailFound = Array.isArray(names) && names.some(command => command?.name === "ponytail");
      const msg = `Engineering Proxy: ${enabled ? "ON" : "OFF"}; mode: ${currentMode.toUpperCase()}; project default: ${config.enforcement.toUpperCase()}; Ponytail command: ${ponytailFound ? "detected" : "not detected/unknown"}; Ponytail mode: not inspected`;
      ctx.ui?.notify?.(config.configError ? `${msg}; WARNING: ${config.configError}` : msg, config.configError ? "warning" : "info");
    },
  });

  pi.registerCommand("engineering-review", {
    description: "Request a scoped, evidence-based engineering review (Ponytail optional)",
    handler: async (args, ctx) => {
      const config = runtime.getConfig(ctx.cwd, true);
      syncStatus(ctx, isActive, currentMode);
      if (!config.enabled || process.env.ENGINEERING_PROXY_DISABLED === "1") {
        ctx.ui?.notify?.("Engineering Proxy is disabled for this project", "warning");
        return;
      }
      const scope = typeof args === "string" && args.trim() ? `\nReview scope: ${args.trim()}` : "";
      const message = REVIEW_INSTRUCTIONS + scope;
      // Explicit operator command only: no automatic Ponytail invocation.
      if (ctx.isIdle?.() === false) {
        pi.sendUserMessage(message, { deliverAs: "followUp" });
      } else {
        pi.sendUserMessage(message);
      }
    },
  });
}

export default createExtension;
