# OMP Engineering Proxy — Ponytail-compatible starter (v0.1.0)

**Status: SOURCE IMPLEMENTED / UNIT-TESTED. Live OMP integration NOT VERIFIED. GitHub publication BLOCKED (integration returned 403).**

Keeps your `balanced + adaptive + readable` engineering standards separate from Ponytail's simplification rules.

## Ownership boundaries

- **Ponytail** owns YAGNI, removing needless abstractions, and `ponytail-review`.
- **Engineering Proxy** owns personal whitespace/guard-clause preferences, evidence, review boundaries and quality gates.
- **Existing repository** owns formatter/linter/architecture conventions, typecheck and regression tests.
- **OMP** owns agent orchestration, tool approvals and session permissions.

The two extensions register *different commands* and *different policy sections*. Engineering Proxy never reads/modifies Ponytail state, activates Ponytail, or invokes Ponytail review automatically. It works with Ponytail `off` and without Ponytail installed. It does not intercept or block tool calls.

## Install Ponytail (official OMP instructions)

```bash
omp plugin marketplace add DietrichGebert/ponytail
omp plugin install ponytail@ponytail
```

## Install Engineering Proxy once this repository is pushed to GitHub

Target repository: `Krisada-M/ksd-engineering-` (**trailing hyphen**). After publishing the included source to that existing empty repository, install with:

```bash
omp plugin marketplace add Krisada-M/ksd-engineering-
omp plugin install engineering-proxy@engineering-proxy
omp plugin list
```

This marketplace package resides in `plugins/engineering-proxy/` and publishes the correct `package.json#omp.extensions` entry. Restart OMP to load new extension modules.

Before publishing, validate on the target OMP version and run the tests. No assumption is made about the installed versions on macOS/WSL.

The marketplace name is `engineering-proxy`, so the plugin ID is `engineering-proxy@engineering-proxy`. This differs from the GitHub repository name. Run `bash publish.sh` from the extracted project on your authenticated Mac/WSL to publish without force pushing.

## Commands

- `/engineering-proxy` — reports enabled status and whether a Ponytail command appears registered. It intentionally does not infer the Ponytail runtime mode.
- `/engineering-review [optional scope]` — sends an explicit scoped review request; if Ponytail is available the agent should use Ponytail review *once* and add only independent Engineering Proxy gates.
- `/ponytail lite|full|ultra|off` — owned by Ponytail, unaffected by this plugin.
- `/ponytail-review` — owned by Ponytail; never auto-launched by Engineering Proxy.

## Repo-adaptive style enforcement

`before_agent_start` injects a short orthogonal policy into `systemPromptOptions.sections["engineering-proxy"]` where available. Fallback support preserves Ponytail and other existing prompt parts. Local `.engineering-proxy.json` is optional (see `examples/`), supports `enabled` and `enforcement=balanced` only.

**Important:** OMP policy injection is guidance, not a deterministic test. To enforce your preferences at commit/CI, opt into `plugins/engineering-proxy/eslint-rules/index.js` from your existing ESLint flat config. No ESLint config is overwritten. Rules:

- `blank-before-return`: error. Exactly one blank before return only when it follows a previous statement in the same block; no blank before first-statement guard returns.
- `blank-between-functions`: error. Exactly one blank between adjacent function implementations, including arrow functions assigned to const/let. Does not act on TS overload signatures.
- `prefer-guard-clauses`: warning only, no semantic autofix.

No automatic formatting or rewrites. The ESLint rules are not automatically enabled by installing the OMP plugin. Avoid adding a second linter if the repository has an authoritative existing formatting convention; align with it first.

### Quality gates

At a review checkpoint inspect changed files; run existing repo `format:check`, typecheck, lint, focused tests, and security checks as appropriate. Treat missing command/credentials as NOT RUN/BLOCKED, not PASS. Do not run migrations, database resets, real payments, merges or deployments as part of this plugin.

### Safety and compatibility

- No tool-call blocking, no auto-run of scripts, no network calls, no external LLM, no persistence of Ponytail mode.
- No automatic changes to files or global OMP settings.
- No new required runtime npm dependencies. ESLint rules run only when included in the host ESLint configuration.
- `ENGINEERING_PROXY_DISABLED=1` disables prompt injection and `/engineering-review` while keeping status available.
- Optional per-repo `.engineering-proxy.json` can disable (`{"enabled": false}`) without touching global install.
- For `.tsx/.ts` use the repository's AST parser and ESLint config; these rules consume an ESLint-compatible AST but do not supply a TypeScript parser.

## Testing

```bash
cd plugins/engineering-proxy
node --test test/*.test.js
```

Live OMP integration tests still required on both Mac and WSL, covering simultaneous installation, Ponytail mode changes, prompt de-duplication across sessions and subagents, and disabled fallback.

## Planned next improvements (NOT implemented)

- Change-scoped diagnostics after tool writes (AST-backed, no regex auto-fix).
- A command to run allowlisted deterministic checks with timeouts and read-only guardrails.
- Architecture/contract adapters for repos such as Balance Prime.
- Review feedback ledger with operator approvals and stable versioned rule IDs.
- Eval suite with real pull requests and false-positive/false-negative scoring.

Do not claim this version is a fully autonomous digital twin or an approving reviewer.
