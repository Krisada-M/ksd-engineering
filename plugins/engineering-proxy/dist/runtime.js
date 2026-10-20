export class KsdRuntime {
    loadConfig;
    buildPolicy;
    isDisabled;
    configs = new Map();
    policies = new Map();
    statuses = new WeakMap();
    constructor(loadConfig, buildPolicy, isDisabled) {
        this.loadConfig = loadConfig;
        this.buildPolicy = buildPolicy;
        this.isDisabled = isDisabled;
    }
    getConfig(cwd, refresh = false) {
        const known = this.configs.get(cwd);
        if (!refresh && known)
            return known;
        const next = this.loadConfig(cwd);
        this.configs.set(cwd, next);
        return next;
    }
    getPolicy(config) {
        const key = config.enforcement;
        const existing = this.policies.get(key);
        if (existing !== undefined)
            return existing;
        const policy = this.buildPolicy(config);
        this.policies.set(key, policy);
        return policy;
    }
    /** Redraw after session/UI resets even if status text is unchanged. */
    invalidateStatus(ui) {
        if (ui)
            this.statuses.delete(ui);
    }
    syncStatus(ctx, isActive, mode) {
        const ui = ctx?.ui;
        if (typeof ui?.setStatus !== "function" || !ctx?.cwd)
            return;
        try {
            const config = this.getConfig(ctx.cwd);
            const enabled = config.enabled && !this.isDisabled();
            let theme;
            try {
                theme = ui.theme;
            }
            catch {
                // Missing theme must never break headless/early-start UIs.
            }
            let status;
            if (enabled) {
                const dot = isActive ? "●" : "○";
                let colored = dot;
                try {
                    if (typeof theme?.fg === "function") {
                        colored = theme.fg(isActive ? "accent" : "dim", dot);
                    }
                }
                catch {
                    // Theme rendering is optional.
                }
                status = `${colored} 🛡 KSD: ${mode.toUpperCase()}`;
            }
            const before = this.statuses.get(ui);
            if (before && before.value === status && before.theme === theme)
                return;
            ui.setStatus("engineering-proxy", status);
            this.statuses.set(ui, { value: status, theme });
        }
        catch {
            // Decorative UI must never cause a coding session to fail.
        }
    }
}
