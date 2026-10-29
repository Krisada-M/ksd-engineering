/** In-process hot-path engine. No native processes, filesystem access or LLM calls. */
export interface KsdConfig {
  readonly enabled: boolean;
  readonly enforcement: "balanced" | "adaptive";
  readonly configError?: string;
  readonly root?: string;
  readonly configPresent?: boolean;
}

export interface KsdTheme {
  fg?(style: string, text: string): string;
}

export interface KsdUi {
  setStatus?(key: string, value: string | undefined): void;
  readonly theme?: KsdTheme;
}

export interface KsdContext {
  readonly cwd?: string;
  readonly ui?: KsdUi;
}

type LoadConfig = (cwd: string) => KsdConfig;
type BuildPolicy = (config: KsdConfig) => string;
type IsDisabled = () => boolean;

type StatusCache = { value: string | undefined; theme: KsdTheme | undefined };

export class KsdRuntime {
  private readonly configs = new Map<string, KsdConfig>();
  private readonly policies = new Map<string, string>();
  private readonly statuses = new WeakMap<KsdUi, StatusCache>();

  constructor(
    private readonly loadConfig: LoadConfig,
    private readonly buildPolicy: BuildPolicy,
    private readonly isDisabled: IsDisabled,
  ) {}

  getConfig(cwd: string, refresh = false): KsdConfig {
    const known = this.configs.get(cwd);
    if (!refresh && known) return known;

    const next = this.loadConfig(cwd);
    this.configs.set(cwd, next);

    return next;
  }

  getPolicy(config: KsdConfig): string {
    const key = config.enforcement;
    const existing = this.policies.get(key);
    if (existing !== undefined) return existing;

    const policy = this.buildPolicy(config);
    this.policies.set(key, policy);

    return policy;
  }

  /** Redraw after session/UI resets even if status text is unchanged. */
  invalidateStatus(ui?: KsdUi): void {
    if (ui) this.statuses.delete(ui);
  }

  syncStatus(ctx: KsdContext | undefined, isActive: boolean, mode: KsdConfig["enforcement"]): void {
    const ui = ctx?.ui;
    if (typeof ui?.setStatus !== "function" || !ctx?.cwd) return;

    try {
      const config = this.getConfig(ctx.cwd);
      const enabled = config.enabled && !this.isDisabled();
      let theme: KsdTheme | undefined;
      try {
        theme = ui.theme;
      } catch {
        // Missing theme must never break headless/early-start UIs.
      }

      let status: string | undefined;
      if (enabled) {
        const dot = isActive ? "●" : "○";
        let colored = dot;
        try {
          if (typeof theme?.fg === "function") {
            colored = theme.fg(isActive ? "accent" : "dim", dot);
          }
        } catch {
          // Theme rendering is optional.
        }
        status = `${colored} 🛡 KSD: ${mode.toUpperCase()}`;
      }

      const before = this.statuses.get(ui);
      if (before && before.value === status && before.theme === theme) return;

      ui.setStatus("engineering-proxy", status);
      this.statuses.set(ui, { value: status, theme });
    } catch {
      // Decorative UI must never cause a coding session to fail.
    }
  }
}
