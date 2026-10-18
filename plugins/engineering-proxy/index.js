import { loadConfig } from "./config.js";
import { augmentSystemPrompt, buildPolicy } from "./policy.js";

const STATUS_KEY = "engineering-proxy";
const STATUS_LABEL = "🛡 KSD: BALANCED";

/** Activity indicator reflects agent lifecycle, not policy enforcement or test results. */
export function syncStatus(ctx, isActive = false) {
  if (typeof ctx?.ui?.setStatus !== "function") return;

  try {
    const config = loadConfig(ctx.cwd);
    const enabled = config.enabled && process.env.ENGINEERING_PROXY_DISABLED !== "1";
    if (!enabled) {
      ctx.ui.setStatus(STATUS_KEY, undefined);
      return;
    }

    const indicator = isActive ? "●" : "○";
    let decoratedIndicator = indicator;
    try {
      const theme = ctx.ui.theme;
      if (typeof theme?.fg === "function") {
        decoratedIndicator = theme.fg(isActive ? "accent" : "dim", indicator);
      }
    } catch {
      // Some headless/early-start UIs do not have an initialized theme.
    }

    ctx.ui.setStatus(STATUS_KEY, decoratedIndicator + " " + STATUS_LABEL);
  } catch {
    // Status is best-effort; failed UI/config reads must not disrupt agent work.
  }
}

const REVIEW_INSTRUCTIONS = `Review the current requested change as Engineering Proxy. First inspect the actual diff and relevant callers/contracts. Use Ponytail's ponytail-review skill exactly once IF it is available and a review is appropriate; do not re-run equivalent simplification review. Independently verify requested personal style (guard clauses, blank before return, blank between functions), repo conventions, type safety, critical invariants, and changed-scope tests. Reuse existing formatter/linter/test commands when possible; do not add dependencies or edit unrelated files. Mark each applicable gate VERIFIED/PARTIAL/BLOCKED/NOT RUN with the exact command and observed result. A test skipped without required environment is NOT RUN, not PASS. A CI YAML file is not proof its job exercised the change; request a successful relevant CI run. Never label a release SHIP/GO with unresolved required or security gates. Never push, merge, deploy, or change production. Do not report a pass you did not observe.`;

export function createExtension(pi) {
  pi.setLabel?.("Engineering Proxy");

  let isActive = false;
  for (const eventName of ["session_start", "session_switch", "session_branch"]) {
    pi.on(eventName, (_event, ctx) => {
      isActive = false;
      syncStatus(ctx, isActive);
    });
  }

  pi.on("agent_start", (_event, ctx) => {
    isActive = true;
    syncStatus(ctx, isActive);
  });

  pi.on("agent_end", (_event, ctx) => {
    isActive = false;
    syncStatus(ctx, isActive);
  });

  pi.on("before_agent_start", (event, ctx) => {
    syncStatus(ctx, isActive);
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
      syncStatus(ctx, isActive);

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
      syncStatus(ctx, isActive);

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
