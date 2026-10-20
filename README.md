# KSD Engineering Proxy for OMP (v0.3.0)

**Status:** v0.3.0 Adaptive + SDLC change in review. GitHub CI verifies included unit tests and release metadata; live macOS/WSL OMP + Ponytail compatibility is NOT VERIFIED.

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

- `/engineering-proxy` or `/engineering-proxy status` — reports enabled status, effective mode and repo default, and whether the Ponytail command is registered. It does **not** infer Ponytail's actual mode.
- `/engineering-proxy adaptive` — selects flat-by-default Clean Code review and risk-scaled SDLC policy in the current session.
- `/engineering-proxy balanced` — returns to the conservative, repo-aware policy. OMP `appendEntry` saves mode in session history when supported; otherwise it only applies for the current runtime.
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

The bottom status displays `○ 🛡 KSD: BALANCED` (or `ADAPTIVE`) when the agent is idle and `● 🛡 KSD: BALANCED` (or `ADAPTIVE`) while the agent is running. With a theme-capable OMP TUI the idle dot is dim and the active dot uses the accent color. Status refreshes on `agent_start`, `agent_end`, new sessions, switches, branches and explicit Engineering Proxy commands. **The dot is agent activity, NOT a quality-gate pass indicator or proof that Ponytail itself is active.** KSD does not read or mutate Ponytail mode.

Per-repository `{ "enabled": false }` or `ENGINEERING_PROXY_DISABLED=1` clears the KSD status on the next supported lifecycle event, even if a review is running. `engineering-review` does not launch Ponytail review automatically, and never duplicates OMP's `REVIEW` indicator. For non-TUI hosts the status is best-effort and does not interfere with agent work.

## SDLC workflow (both modes)

KSD's prompt policy now follows Requirements → Design → Implementation → Verification → Delivery. The checks are **risk-scaled**, not a rigid documentation ceremony: trivial style changes can use a short scope and focused checks, while security-sensitive authentication, payments, data migrations and concurrency require stronger contract and test evidence.

Adaptive mode emphasizes flat control flow, early returns and guarded exits without unsafe mechanical rewrites. Avoidable nesting in newly changed code is treated as FIX REQUIRED in **review guidance**, but the static ESLint rule remains an optional warning until the consuming repository explicitly enables a deterministic blocking gate. Neither mode automatically runs tests, marks an SDLC stage complete, rewrites code, or authorizes release.

Session mode is stored in an OMP custom entry named `engineering-proxy-mode` when `pi.appendEntry` is supported. On session resume/switch the latest valid entry is replayed; otherwise KSD uses the project's configured default. KSD never overwrites Ponytail state.

## Future Rust quality core

A Rust implementation is feasible for computationally expensive AST/diff analysis, but the OMP API adapter remains JavaScript. Replacing JavaScript without end-to-end performance evidence is not justified. See [Rust migration proposal](docs/rust-core-migration.md) for representative benchmarks, cross-platform Mac ARM/WSL x64 builds, safe process boundaries and fallback requirements.

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

`before_agent_start` injects a short orthogonal policy into `systemPromptOptions.sections["engineering-proxy"]` where available. Fallback support preserves Ponytail and other existing prompt parts. Local `.engineering-proxy.json` is optional (see `examples/`), supports `enabled:boolean` and `enforcement: "balanced"|"adaptive"`. The repository default is balanced when absent; explicit mode commands override it for the current session. Existing unrelated settings are untouched.

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
