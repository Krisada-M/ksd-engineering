# KSD Engineering Proxy for OMP (v0.5.1)

**Status:** v0.5.1 hardening on top of v0.5.0 global/project/session mode inheritance and v0.4.0 TypeScript performance changes. CI (Ubuntu and macOS) verifies release metadata, the repository's own style rules via ESLint, strict TypeScript compilation, checked-in JavaScript artifacts, and runtime tests; interactive Mac/WSL OMP + Ponytail smoke is still NOT VERIFIED.

**v0.5.1 changes:** hermetic tests (isolated `HOME`); `check-changed` no longer reports a false `NOT_RUN` when paths differ only by symlinks (macOS `/var` vs `/private/var`); the global `~/.omp` directory is no longer treated as a project root; the repository now passes its own ESLint rules in CI. **Breaking (undocumented API):** the named export `syncStatus` was removed from `index.js`; use `KsdRuntime#syncStatus` from `dist/runtime.js`. OMP loads only the default export, so installed plugins are unaffected.

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

## Commands and scope precedence (v0.5.0)

All modes remain `balanced` or `adaptive`. The resolution order is **session override > project config > global config > built-in balanced**. The `enabled` setting merges independently (project overrides global; invalid JSON at either scope fails closed).

| Command | Behavior |
|---|---|
| `/engineering-proxy` or `/engineering-proxy status` | Report effective mode, source, session override, global/project defaults and Ponytail command presence |
| `/engineering-proxy adaptive` | Override the mode for the current session |
| `/engineering-proxy balanced` | Override the mode for the current session |
| `/engineering-proxy reset` | Reset the **session override** and inherit repo/global/built-in mode; saves a reset entry when OMP supports session persistence |
| `/engineering-proxy global adaptive` | Set global default to adaptive for all repositories without a higher-priority override |
| `/engineering-proxy global balanced` | Set global default to balanced |
| `/engineering-proxy global reset` | Remove only global `enforcement` (preserves `enabled` and unrelated keys) |
| `/engineering-proxy repo adaptive` | Set the current repository's default to adaptive |
| `/engineering-proxy repo balanced` | Set the current repository's default to balanced |
| `/engineering-proxy repo reset` | Remove only the repository's `enforcement` field |
| `/engineering-review [scope]` | Explicit evidence-based engineering review; Ponytail remains optional |

Global file (automatically created on first global write): `~/.omp/agent/engineering-proxy.json`.

Project file: `<repo>/.engineering-proxy.json`, resolved from the nearest ancestor with `.git` or `.omp` (the global `~/.omp` agent directory is not a project marker, so non-repo folders under HOME never write `~/.engineering-proxy.json`). Config files support `enabled:boolean` and `enforcement:"balanced"|"adaptive"`. Existing unknown keys are preserved on writes. Config updates use an atomic temporary file and rename. **Do not place secrets in these files.**

Example global default:

```json
{ "enabled": true, "enforcement": "adaptive" }
```

Repo override:

```json
{ "enforcement": "balanced" }
```

With these files, new sessions in this repo start balanced, all other repos inherit adaptive, and a session-specific `/engineering-proxy adaptive` temporarily takes priority. `/engineering-proxy reset` restores the balanced repo mode. Global/repo commands write their respective files, but do **not** silently remove an existing higher-priority session override.

Ponytail commands (`/ponytail lite|full|ultra|off` and `/ponytail-review`) are still exclusively owned by Ponytail. Engineering Proxy does not mutate Ponytail state. Failed writes or invalid config files produce warnings instead of overwriting invalid contents.

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

Session mode is stored in an OMP custom entry named `engineering-proxy-mode` when `pi.appendEntry` is supported. On session resume/switch the latest valid entry is replayed; a reset tombstone stops older session overrides, and otherwise KSD resolves project → global → built-in defaults. KSD never overwrites Ponytail state.

## TypeScript performance runtime (v0.4.0)

KSD's hot path uses a **strict TypeScript** core at `plugins/engineering-proxy/src/runtime.ts` and checks in compiler-generated ESM under `dist/`. The OMP extension entry point remains `index.js`; it imports the compiled runtime in-process. **No native sidecar, Rust, new production dependency, or per-event subprocess** is used. Rebuilds use a pinned TypeScript compiler (5.8.3) and CI rejects generated artifact drift.

- Configuration is cached per working directory for agent lifecycle events; it is explicitly refreshed on session lifecycle transitions, at the start of each new agent turn, and on status/command checks. Changes to repository configuration become visible at the next refresh point rather than during an already-running turn.
- System prompt policy text is constructed once per effective mode and reused; the repository policy remains isolated from Ponytail.
- Status writes are deduplicated per TUI instance using a WeakMap and reset on session transitions; changes to mode, activity, theme, or enable/disable state still redraw.
- Typed checks run during development/CI, not at OMP runtime, and generated JavaScript ships with the plugin. No runtime npm install is required for the performance core.
- `node plugins/engineering-proxy/test/benchmark.mjs` produces an **illustrative** single-process comparison using synthetic repeated status+policy calls; it is not a live OMP speed measurement. Numerical performance targets are aspirational until validated in real sessions.

To validate from the repository root (dev tooling is pinned in the private root `package.json`; the published plugin has no runtime dependencies):

```bash
npm ci
npm run lint
npm run build
git diff --exit-code -- plugins/engineering-proxy/dist/
npm test
node plugins/engineering-proxy/test/benchmark.mjs
```

Tests isolate `HOME`, so a developer's real `~/.omp/agent/engineering-proxy.json` cannot change results.

## Deterministic changed-line diagnostics (opt-in)

The plugin includes `eslint-rules/index.js`, `change-scope.js` and `check-changed.js`.

- Configure your repository's **existing ESLint setup and TypeScript parser** to load the KSD ESLint rules. The CLI does not install a parser or overwrite your ESLint config.
- Produce a **zero-context** Git diff against the intended base (`git diff --no-ext-diff --unified=0 HEAD` includes staged and unstaged changes, but **not untracked files**).
- Export ESLint's actual JSON report (`eslint --format json`); it may exit nonzero when it finds violations. Verify that the desired KSD rules are enabled in your repo; this utility does not prove it for you.
- Run: `node plugins/engineering-proxy/check-changed.js --diff changes.patch --eslint-report eslint.json` from the **repository root**.

Exit codes: 0 for PASS/WARN/NOT_APPLICABLE, 1 for FIX_REQUIRED, 2 for NOT_RUN/invalid input. PASS means only that the **provided report** contains no diagnostics on changed source lines (or adjacent boundary line). No parser invocation, CI run or LLM review is performed by the checker.

Use in CI only after the host project explicitly adopts the ESLint rule config. For a change with no added source lines, the style check is NOT_APPLICABLE; this does not prove that deletion-only changes are behaviorally correct.

## Evidence-aware review verdicts (opt-in)

`review-verdict.js` exports `assessReview({scope, gates, requiredGates, reviewedCommit})` to assess a **provided** gate report. Declare applicable required and critical gates explicitly; omitted declared gates become NOT_RUN. Execution gates require command, working directory, result and successful exit code; `tests` additionally requires structured pass/fail/skip counts. Skipped tests cannot yield VERIFIED. `ci-parity` requires a successful HTTPS CI-run reference with a head SHA matching `reviewedCommit`. Missing critical evidence or failed required gates produce NO_GO; missing noncritical review evidence produces CONDITIONAL_GO, while release scope remains NO_GO.

Run `ksd-review-verdict --report report.json` after installing the companion package, or `node plugins/engineering-proxy/review-verdict.js --report report.json` from this checkout. Exit 0 indicates READY_FOR_REVIEW or RELEASE_CANDIDATE, 1 indicates NO_GO or CONDITIONAL_GO, and 2 indicates NOT_ASSESSED or invalid input.

This is a **report validator**, not a CI provider connector: supplied evidence is not independently authenticated, a good verdict does not authorize merge or deploy, and reviews must examine actual runtime/test results before marking a gate VERIFIED.

## Repo-adaptive style enforcement

`before_agent_start` injects a short orthogonal policy into `systemPromptOptions.sections["engineering-proxy"]` where available. Fallback support preserves Ponytail and other existing prompt parts. Local `.engineering-proxy.json` is optional (see `examples/`), supports `enabled:boolean` and `enforcement: "balanced"|"adaptive"`. The repository default inherits the global config when absent (or balanced if both are absent); explicit session mode commands override both. Existing unrelated settings are untouched.

Fallback string and array prompts are reconciled when enabled or disabled. An unterminated legacy string block is preserved rather than guessed; the extension warns that the session must be restarted.

**Important:** OMP policy injection is guidance, not a deterministic test. To enforce your preferences at commit/CI, opt into `plugins/engineering-proxy/eslint-rules/index.js` from your existing ESLint flat config. No ESLint config is overwritten. Rules:

- `blank-before-return`: error. Exactly one blank before return only when it follows a previous statement in the same block; no blank before first-statement guard returns.
- `blank-between-functions`: error. Exactly one blank between adjacent function implementations, including arrow functions assigned to const/let. Does not act on TS overload signatures.
- `prefer-guard-clauses`: warning only, no semantic autofix.

No automatic formatting or rewrites. The ESLint rules are not automatically enabled by installing the OMP plugin. Avoid adding a second linter if the repository has an authoritative existing formatting convention; align with it first.

### Install the optional companion

Create a tarball with `npm pack ./plugins/engineering-proxy --ignore-scripts` and install that tarball in the host repository. The private repository root is not the package. Import `omp-engineering-proxy/eslint` in the host's existing ESLint flat config and supply its own parser for TypeScript or JSX. The package also exposes `ksd-check-changed` and `ksd-review-verdict`; neither runs checks automatically.

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
npm ci
node validate-release.js
npm run lint
npm test
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
