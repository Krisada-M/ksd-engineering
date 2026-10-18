import { loadConfig } from "./config.js";
import { augmentSystemPrompt, buildPolicy } from "./policy.js";

const STATUS_KEY = "engineering-proxy";
const STATUS_LABEL = "🛡 KSD: BALANCED";

/** Status is purely decorative: unsupported TUI hosts must not break coding sessions. */
export function syncStatus(ctx) {
  if (typeof ctx?.ui?.setStatus !== "function") {
    return;
  }

  const config = loadConfig(ctx.cwd);
  const enabled = config.enabled && process.env.ENGINEERING_PROXY_DISABLED !== "1";

  try {
    ctx.ui.setStatus(STATUS_KEY, enabled ? STATUS_LABEL : undefined);
  } catch {
    // ACP/headless/early-start UIs may reject status operations; policy remains usable.
  }
}

const REVIEW_INSTRUCTIONS = `Review the current requested change as Engineering Proxy. First inspect the actual diff and relevant callers/contracts. Use Ponytail's ponytail-review skill exactly once IF it is available and a review is appropriate; do not re-run equivalent simplification review. Independently verify requested personal style (guard clauses, blank before return, blank between functions), repo conventions, type safety, critical invariants, and changed-scope tests. Reuse existing formatter/linter/test commands when possible; do not add dependencies or edit unrelated files. Mark each applicable gate VERIFIED/PARTIAL/BLOCKED/NOT RUN with the exact command and real result. Never push, merge, deploy, or change production. Do not report a pass you did not observe.`;

export function createExtension(pi) {
  pi.setLabel?.("Engineering Proxy");

  for (const eventName of ["session_start", "session_switch", "session_branch"]) {
    pi.on(eventName, (_event, ctx) => syncStatus(ctx));
  }

  pi.on("before_agent_start", (event, ctx) => {
    syncStatus(ctx);
    const config = loadConfig(ctx.cwd);
    if (!config.enabled || process.env.ENGINEERING_PROXY_DISABLED === "1") {
      const sections = event?.systemPromptOptions?.sections;
      if (sections && typeof sections === "object") delete sections["engineering-proxy"];
      return;
    }

    return augmentSystemPrompt(event, buildPolicy(config));
  });

  pi.registerCommand("engineering-proxy", {
    description: "Show Engineering Proxy configuration and optional Ponytail presence",
    handler: async (_args, ctx) => {
      syncStatus(ctx);

      const config = loadConfig(ctx.cwd);
      const names = pi.getCommands?.() ?? [];
      const ponytailFound = Array.isArray(names) && names.some(command => command?.name === "ponytail");
      const enabled = config.enabled && process.env.ENGINEERING_PROXY_DISABLED !== "1";
      const msg = `Engineering Proxy: ${enabled ? "ON" : "OFF"} (balanced, adaptive, readable); Ponytail command: ${ponytailFound ? "detected" : "not detected/unknown"}; Ponytail mode: not inspected`;
      ctx.ui?.notify?.(config.configError ? `${msg}; WARNING: ${config.configError}` : msg, config.configError ? "warning" : "info");
    },
  });

  pi.registerCommand("engineering-review", {
    description: "Request a scoped, evidence-based engineering review (Ponytail optional)",
    handler: async (args, ctx) => {
      syncStatus(ctx);

      const config = loadConfig(ctx.cwd);
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
