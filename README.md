# KSD Engineering Proxy for OMP (v0.2.0)

**Status:** v0.2.0 implementation in review. Node unit tests and GitHub CI cover the code and manifest. A live OMP v0.2.0 test with Ponytail on Mac and WSL is still NOT VERIFIED.

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

## Install Engineering Proxy

Repository: `Krisada-M/ksd-engineering` (renamed from the former trailing-hyphen name). Install with:

```bash
omp plugin marketplace add Krisada-M/ksd-engineering
omp plugin install engineering-proxy@engineering-proxy
omp plugin list
```

This marketplace package resides in `plugins/engineering-proxy/` and publishes the correct `package.json#omp.extensions` entry. Restart OMP to load new extension modules.

After a version is merged into main, refresh the marketplace and upgrade with `omp plugin marketplace update engineering-proxy` followed by `omp plugin upgrade engineering-proxy@engineering-proxy`. Restart OMP. Do not claim the new version is live until `omp plugin list` confirms it and a smoke test succeeds.

The marketplace name is `engineering-proxy`, so the plugin ID is `engineering-proxy@engineering-proxy`. This differs from the GitHub repository name.

## Commands

- `/engineering-proxy` — reports enabled status and whether a Ponytail command appears registered. It intentionally does not infer the Ponytail runtime mode.
- `/engineering-review [optional scope]` — sends an explicit scoped review request; if Ponytail is available the agent should use Ponytail review *once* and add only independent Engineering Proxy gates.
- `/ponytail lite|full|ultra|off` — owned by Ponytail, unaffected by this plugin.
- `/ponytail-review` — owned by Ponytail; never auto-launched by Engineering Proxy.

## Put REVIEW and KSD below the editor

OMP owns the built-in `REVIEW` composer indicator. Engineering Proxy owns only the `engineering-proxy` extension status key; it never overwrites `review` or `ponytail`. After installing a released version of the plugin, choose the native bottom-status composer:

```bash
omp config set composer.shape pi
omp config get composer.shape
```

The `pi` composer renders the full status line beneath the editor, including OMP review context and extension status segments. You can also pick the Pi composer from `/settings` → Appearance → Composer Shape. To restore the original top-border layout: `omp config set composer.shape box`. This is a **global appearance setting** and is never changed automatically by this plugin. Project-local settings or other overrides can take precedence.

The bottom status displays `🛡 KSD: BALANCED` while enabled, next to other extension status elements such as Ponytail. Per-repository `{ "enabled": false }` or `ENGINEERING_PROXY_DISABLED=1` clears it on the next supported lifecycle event. `engineering-review` does not launch Ponytail review automatically, and never duplicates OMP's `REVIEW` indicator. For non-TUI hosts the status is best-effort and does not interfere with agent work.

## Deterministic changed-line diagnostics (opt-in)

The plugin includes `eslint-rules/index.js`, `change-scope.js` and `check-changed.js`.

- Configure your repository's **existing ESLint setup and TypeScript parser** to load the KSD ESLint rules. The CLI does not install a parser or overwrite your ESLint config.
- Produce a **zero-context** Git diff against the intended base (`git diff --no-ext-diff --unified=0 HEAD` includes staged and unstaged changes, but **not untracked files**).
- Export ESLint's actual JSON report (`eslint --format json`); it may exit nonzero when it finds violations. Verify that the desired KSD rules are enabled in your repo; this utility does not prove it for you.
- Run: `node plugins/engineering-proxy/check-changed.js --diff changes.patch --eslint-report eslint.json` from the **repository root**.

Exit codes: 0 for PASS/WARN/NOT_APPLICABLE, 1 for FIX_REQUIRED, 2 for NOT_RUN/invalid input. PASS means only that the **provided report** contains no diagnostics on changed source lines (or adjacent boundary line). No parser invocation, CI run or LLM review is performed by the checker.

Use in CI only after the host project explicitly adopts the ESLint rule config. For a change with no added source lines, the style check is NOT_APPLICABLE; this does not prove that deletion-only changes are behaviorally correct.

## Evidence-aware review verdicts (opt-in)

`review-verdict.js` exports `assessReview({scope, gates})` to assess a **provided** gate report. A VERIFIED gate requires a specific command result, source observation, or a successful CI run reference. `ci-parity` cannot be VERIFIED by finding a workflow file; its reported evidence must be of type `ci-run`. Missing critical evidence or failed required gates produce NO_GO; missing noncritical review evidence produces CONDITIONAL_GO, while release scope remains NO_GO.

This is a **report validator**, not a CI provider connector: supplied evidence is not independently authenticated, a good verdict does not authorize merge or deploy, and reviews must examine actual runtime/test results before marking a gate VERIFIED.

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
node validate-release.js
node --test plugins/engineering-proxy/test/*.test.js
node --check plugins/engineering-proxy/index.js
```

Live OMP integration tests still required on both Mac and WSL, covering simultaneous installation, Ponytail mode changes, prompt de-duplication across sessions and subagents, and disabled fallback.

## Planned next improvements (NOT implemented)

- Native OMP change-scoped inspection after tool writes (currently the changed-line checker is manual/CI opt-in).
- A command to run allowlisted deterministic checks with timeouts and read-only guardrails.
- Architecture/contract adapters for repos such as Balance Prime.
- Review feedback ledger with operator approvals and stable versioned rule IDs.
- Eval suite with real pull requests and false-positive/false-negative scoring.

Do not claim this version is a fully autonomous digital twin or an approving reviewer.
