import { loadConfig, setScopedMode, SUPPORTED_MODES } from "./config.js";
import { augmentSystemPrompt, buildPolicy } from "./policy.js";
import { KsdRuntime } from "./dist/runtime.js";

const MODE_ENTRY = "engineering-proxy-mode";
const isDisabledByEnv = () => process.env.ENGINEERING_PROXY_DISABLED === "1";

export function parseEngineeringCommand(input) {
  const words = String(input ?? "").trim().toLowerCase().split(/\s+/);
  if (words.length === 1) {
    if (words[0] === "" || words[0] === "status") return { type: "status" };
    if (SUPPORTED_MODES.includes(words[0])) return { type: "set-mode", mode: words[0] };
    if (words[0] === "reset") return { type: "reset-session" };
  }
  if (words.length === 2 && ["global", "repo"].includes(words[0])) {
    if (SUPPORTED_MODES.includes(words[1])) return { type: "set-scoped-mode", scope: words[0], mode: words[1] };
    if (words[1] === "reset") return { type: "reset-scoped-mode", scope: words[0] };
  }

  return { type: "invalid" };
}

function sessionOverride(entries) {
  if (!Array.isArray(entries)) return null;

  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry?.type !== "custom" || entry?.customType !== MODE_ENTRY) continue;
    if (entry.data?.reset === true) return null;
    if (SUPPORTED_MODES.includes(entry.data?.mode)) return entry.data.mode;
  }

  return null;
}

export function resolveSessionMode(entries, fallback = "balanced") {
  const defaultMode = SUPPORTED_MODES.includes(fallback) ? fallback : "balanced";

  return sessionOverride(entries) ?? defaultMode;
}

const REVIEW_INSTRUCTIONS = `Review the current requested change as Engineering Proxy. First inspect the actual diff and relevant callers/contracts. Use Ponytail's ponytail-review skill exactly once IF it is available and a review is appropriate; do not re-run equivalent simplification review. Check the applicable SDLC stages: Requirements/acceptance criteria, Design/contracts, Implementation quality, Verification evidence and Delivery risks. Scale scrutiny to the change, with stronger security and integration gates for authentication, payments, migrations and concurrency. Independently verify requested personal style (guard clauses, flat-by-default control flow, blank before return, blank between functions), repo conventions, type safety, critical invariants, and changed-scope tests. Reuse existing formatter/linter/test commands when possible; do not add dependencies or edit unrelated files. Mark each applicable gate VERIFIED/PARTIAL/BLOCKED/NOT RUN with the exact command and observed result. A test skipped without required environment is NOT RUN, not PASS. A CI YAML file is not proof its job exercised the change; request a successful relevant CI run. Never label a release SHIP/GO with unresolved required or security gates. Never push, merge, deploy, or change production. Do not report a pass you did not observe.`;

export function createExtension(pi, { globalConfigPath } = {}) {
  pi.setLabel?.("Engineering Proxy");
  // One runtime per extension instance: caches must not leak between hosts or tests.
  const runtime = new KsdRuntime(cwd => loadConfig(cwd, { globalConfigPath }), buildPolicy, isDisabledByEnv);

  let isActive = false;
  let selectedSessionMode = null;
  const effectiveMode = config => selectedSessionMode ?? config.enforcement;

  const refreshConfig = ctx => runtime.getConfig(ctx?.cwd ?? process.cwd(), true);

  const updateStatus = (ctx, config) => runtime.syncStatus(ctx, isActive, effectiveMode(config));

  function restoreSession(ctx) {
    isActive = false;
    const config = refreshConfig(ctx);
    runtime.invalidateStatus(ctx?.ui);
    let entries = [];
    try {
      entries = ctx?.sessionManager?.getBranch?.() ?? ctx?.sessionManager?.getEntries?.() ?? [];
    } catch {
      // Session stores may be absent or not ready in headless hosts.
    }

    selectedSessionMode = sessionOverride(entries);
    updateStatus(ctx, config);
  }

  for (const eventName of ["session_start", "session_tree", "session_switch", "session_branch"]) {
    pi.on(eventName, (_event, ctx) => restoreSession(ctx));
  }

  pi.on("agent_start", (_event, ctx) => {
    isActive = true;
    updateStatus(ctx, runtime.getConfig(ctx?.cwd ?? process.cwd()));
  });

  pi.on("agent_end", (_event, ctx) => {
    isActive = false;
    updateStatus(ctx, runtime.getConfig(ctx?.cwd ?? process.cwd()));
  });

  pi.on("before_agent_start", (event, ctx) => {
    const config = refreshConfig(ctx);
    updateStatus(ctx, config);
    if (!config.enabled || process.env.ENGINEERING_PROXY_DISABLED === "1") {
      const sections = event?.systemPromptOptions?.sections;
      if (sections && typeof sections === "object") delete sections["engineering-proxy"];

      return;
    }

    return augmentSystemPrompt(event, runtime.getPolicy({ ...config, enforcement: effectiveMode(config) }));
  });

  pi.registerCommand("engineering-proxy", {
    description: "Engineering policy: status, session mode/reset, global mode/reset, repo mode/reset",
    handler: async (args, ctx) => {
      const parsed = parseEngineeringCommand(args);
      const config = refreshConfig(ctx);
      const enabled = config.enabled && process.env.ENGINEERING_PROXY_DISABLED !== "1";

      if (parsed.type === "invalid") {
        ctx.ui?.notify?.("Usage: /engineering-proxy [status|balanced|adaptive|reset|global <balanced|adaptive|reset>|repo <balanced|adaptive|reset>]", "warning");

        return;
      }

      if (parsed.type === "set-mode" || parsed.type === "reset-session") {
        if (!enabled && parsed.type === "set-mode") {
          ctx.ui?.notify?.("Engineering Proxy is disabled; mode unchanged.", "warning");

          return;
        }

        selectedSessionMode = parsed.type === "reset-session" ? null : parsed.mode;
        let persisted = false;
        try {
          if (typeof pi.appendEntry === "function") {
            pi.appendEntry(MODE_ENTRY, parsed.type === "reset-session" ? { reset: true } : { mode: selectedSessionMode });
            persisted = true;
          }
        } catch {
          // Runtime policy still updates, but session mode cannot be replayed.
        }

        updateStatus(ctx, config);
        const effective = effectiveMode(config);
        ctx.ui?.notify?.(`KSD mode: ${effective.toUpperCase()} (${persisted ? "saved in session" : "runtime only; session persistence unavailable"})`, persisted ? "info" : "warning");

        return;
      }

      if (parsed.type === "set-scoped-mode" || parsed.type === "reset-scoped-mode") {
        const mode = parsed.type === "reset-scoped-mode" ? null : parsed.mode;
        try {
          const path = setScopedMode(ctx.cwd, parsed.scope, mode, { globalConfigPath });
          const next = refreshConfig(ctx);
          updateStatus(ctx, next);
          ctx.ui?.notify?.(`KSD ${parsed.scope} ${mode ?? "reset"} saved to ${path}; effective: ${effectiveMode(next).toUpperCase()} (${selectedSessionMode ? "session" : next.enforcementSource})`, "info");
        } catch (error) {
          ctx.ui?.notify?.(`KSD ${parsed.scope} update failed: ${error.message}`, "warning");
        }

        return;
      }

      updateStatus(ctx, config);
      const names = pi.getCommands?.() ?? [];
      const ponytailFound = Array.isArray(names) && names.some(command => command?.name === "ponytail");
      const msg = `Engineering Proxy: ${enabled ? "ON" : "OFF"}; mode: ${effectiveMode(config).toUpperCase()} (${selectedSessionMode ? "session" : config.enforcementSource}); project default: ${(config.projectEnforcement ?? "unset").toUpperCase()}; global default: ${(config.globalEnforcement ?? "unset").toUpperCase()}; session: ${(selectedSessionMode ?? "inherit").toUpperCase()}; Ponytail command: ${ponytailFound ? "detected" : "not detected/unknown"}; Ponytail mode: not inspected`;
      ctx.ui?.notify?.(config.configError ? `${msg}; WARNING: ${config.configError}` : msg, config.configError ? "warning" : "info");
    },
  });

  pi.registerCommand("engineering-review", {
    description: "Request a scoped, evidence-based engineering review (Ponytail optional)",
    handler: async (args, ctx) => {
      const config = refreshConfig(ctx);
      updateStatus(ctx, config);
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
