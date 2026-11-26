# erosiano-dev — Adaptive Engineering Standard

**Status:** proposed technical specification; owner-approved expansion scope, implementation and acceptance pending  
**Repository:** Krisada-M/ksd-engineering (repository name unchanged)  
**Target:** v0.7 through v1.0; staged delivery, not a single release  
**Baseline:** main at `73fc916c694946fd79a7cf71e04c35bbec42cb27` (v0.6.0), inspected 2026-11-26  
**Document language:** English  
**Decision authority:** repository owner; this specification does not authorize implementation, merge, publishing, deployment, or destructive operations by itself.

## 1. Purpose and outcomes

Rename Engineering Proxy to **erosiano-dev** and evolve the personal code-style extension into a baseline-driven adaptive engineering standard for AI coding agents. The owner has accepted the scope of all proposed practice groups and explicitly requires project baseline discovery. Retain the existing personal style profile and evidence-oriented review capabilities. Include all practices in the catalog, but activate only applicable practices; catalog inclusion is not an instruction to enforce every practice in every repository.

The outcome is code that fits the actual project, preserves behavior and contracts, is readable and correct, and has risk-appropriate verification evidence. The system must not optimize style compliance at the expense of security, data integrity, developer efficiency, or compatibility.

Success signals: correct local-convention adoption, fewer semantic defects and avoidable regressions, no weakening of tests or security, accurate evidence reporting, bounded prompt/latency overhead, and no duplicated guidance from adjacent plugins. Demonstrate gains through controlled evaluation rather than assuming that longer prompts improve results.

## 2. Existing baseline and ownership boundaries

Evidence from [README](../README.md), [acceptance](ACCEPTANCE.md), [policy source](../plugins/engineering-proxy/src/policy.ts), [SDLC source](../plugins/engineering-proxy/src/sdlc.ts), [runtime](../plugins/engineering-proxy/src/runtime.ts), [adapter](../plugins/engineering-proxy/index.js), [config](../plugins/engineering-proxy/config.js), [package](../plugins/engineering-proxy/package.json), [example ESLint config](../examples/eslint.config.mjs), [CI workflow](../.github/workflows/tests.yml), and [eval fixtures](../plugins/engineering-proxy/test/eval/fixtures/README.md) at the baseline commit:

- CURRENT: in-process strict TypeScript core compiled to checked-in ESM and declarations under dist; dependency-free published JS extension entry point; private root development tooling, TypeScript 5.8.3, ESLint 10.13.0 and typescript-eslint 8.72.1. Published runtime floor Node >=20; root development Node ^22.13.0 or >=24. Keep these contracts unless deliberately changed and verified.
- CURRENT: balanced/adaptive modes, session > project > global > built-in balanced precedence; enabled independently resolved from project/global/default. Invalid config disables injection and exposes the error; it does not block the host. Explicit commands and session lifecycle restore mode; reset tombstones prevent older overrides resurfacing.
- CURRENT: per-turn personal style and safety policy (README estimates ~430 tokens); full risk-scaled SDLC in explicit review. Structured prompt section plus string/array fallback reconciliation; owned prompt deduplication; preserve unrelated prompt content. Malformed legacy blocks are not guessed or removed.
- CURRENT: optional ESLint companion, manual changed-line diagnostics, evidence report verdict validator. These consume supplied reports, do not authenticate them or automatically run tests. No tool-call interception, no auto-run of scripts, no extra runtime dependency.
- CURRENT: isolated HOME tests using Node's test runner, package-consumer tests, artifact drift checks, Ubuntu/macOS Node 22.13 and 24 CI matrix, Node 20 import smoke. Existing six-task pilot fixtures are not run by npm test and are not production tests.
- LEGACY: discarded Rust experiment (PR #4); do not reintroduce a native sidecar absent a separate justified decision.
- UNKNOWN / NOT VERIFIED: fresh v0.6.0 live OMP session, macOS marketplace smoke and real Ponytail mode-switching across sessions/subagents; host repository full ESLint adoption; independent pilot effectiveness. Existing documentation records older WSL injection observation, not new live verification. Current OMP APIs for dynamic task routing and KSD Intelligence integration remain to be verified against actual supported versions.

| Owner | Responsibility |
| --- | --- |
| Host repository | Explicit instructions, local architecture, toolchain, native tests/CI, business contracts and release gates |
| erosiano-dev | Baseline-aware engineering guidance, personal style, practice selection, correctness and evidence review |
| Ponytail | Simplification, YAGNI and Ponytail review; never mutate its mode or automatically invoke it |
| KSD Intelligence (optional) | Code discovery, symbols, callers, dependency/impact evidence when supported by its actual interface |
| OMP | Agent orchestration, extension lifecycle, tool approvals, session permissions and UI |
| Human owner | Approves material contract changes, exceptions, migrations and release decisions |

Non-goals: replace repository lint/format/test systems; force clean architecture, language or framework migrations; create a new AI provider or autonomous release authority; perform automatic broad code rewrites, installs or destructive checks; require Ponytail or KSD Intelligence; build an independent code indexer if existing discovery is sufficient.

## 3. Rebranding and migration (v0.7)

| Surface | Existing | Target |
| --- | --- | --- |
| Product / display label | Engineering Proxy | erosiano-dev |
| Marketplace and plugin name | engineering-proxy | erosiano-dev |
| Marketplace plugin ID | engineering-proxy@engineering-proxy | erosiano-dev@erosiano-dev |
| Published companion package | omp-engineering-proxy | omp-erosiano-dev |
| Source directory | plugins/engineering-proxy/ | plugins/erosiano-dev/ |
| Global config | ~/.omp/agent/engineering-proxy.json | ~/.omp/agent/erosiano-dev.json |
| Project config | .engineering-proxy.json | .erosiano-dev.json |
| Disable flag | ENGINEERING_PROXY_DISABLED | EROSIANO_DEV_DISABLED |
| Policy section and status key | engineering-proxy | erosiano-dev |
| Session custom entry type | engineering-proxy-mode | erosiano-dev-mode |
| Status text | KSD: BALANCED / ADAPTIVE | EROSIANO: BALANCED / ADAPTIVE |

Retain repository URL. Proposed install identity after release: add marketplace from Krisada-M/ksd-engineering, install erosiano-dev@erosiano-dev, restart and verify actual plugin list and live behavior. These are target instructions, not currently available installation commands. Keep package exports, ESLint namespace compatibility and existing ksd-check-changed / ksd-review-verdict CLI contracts through the transition; consider additive aliases only, not removal without a separate migration decision. Update manifests, package paths, CI scripts, build and dist paths, release validation, examples, test paths, labels and all user-facing docs consistently. Do not claim an npm registry publication if only marketplace/tarball distribution exists.

### Command contract

| Target command | Behavior |
| --- | --- |
| /erosiano-dev [status] | Effective mode, config source, enabled state, baseline scope/freshness/confidence, optional integration availability, actionable errors |
| /erosiano-dev balanced / adaptive / reset | Session override or reset to inherited defaults |
| /erosiano-dev global balanced / adaptive / reset | Explicit global default update/reset |
| /erosiano-dev repo balanced / adaptive / reset | Explicit repo default update/reset |
| /erosiano-dev baseline [scope] | Discover or display scoped baseline; show evidence/unknowns and refresh when requested |
| /erosiano-dev practices [scope] | Show applicable practices, decisions, reasons, enforcement and evidence sources |
| /erosiano-dev review [scope] | Explicit risk-scaled review; retain existing review semantics and no automatic side effects |

Proposed migration behavior: old /engineering-proxy commands and /engineering-review become compatibility aliases in the new extension for at least the v0.x transition; remove only after announced deprecation and owner approval. A command alias delegates to the same implementation; it never starts a second review.

- Prefer the new config file within each scope when present; if absent, read legacy config without silently modifying it. On explicit scoped write, migrate the effective values and unknown keys atomically into the new file. Reset must not accidentally resurrect legacy enforcement. If both are present, explain which is authoritative and surface conflicting values; never combine stale settings invisibly. Invalid selected config retains disabled-injection behavior and visible diagnostics; do not silently fall back to another file.
- Either disable flag set to 1 disables guidance; no session override bypasses it. Preserve disabled-state cleanup, activity indicator semantics (not a gate verdict), and best-effort TUI behavior. Keep global ~/.omp from becoming a project marker; resolve symlinks correctly.
- Read old and new custom session entry types in actual active-branch chronological order, respecting latest valid entry and reset tombstones. Do not use another branch's mode if branch data is missing or malformed. Write canonical new entries; preserve existing session history.
- Remove/replace only well-formed owned legacy and current prompt sections/blocks; preserve all unrelated content. Do not guess malformed block ends. Require restart/repair when reconciliation is unsafe.
- Supported installation is one active extension. Do not assume the old v0.6.0 instance can cooperate with a new instance. Verify supported host detection/ownership APIs; if simultaneous installation cannot be made safe, explicitly require disabling/uninstalling the old plugin before activation, warn when detectable and never claim deduplication is guaranteed for an uncontrolled old instance. Test upgrade, rollback and old/new configuration conflicts.
- Preserve optional OMP/Pi host behavior on supported APIs; verify before claiming Pi compatibility beyond existing metadata. Repository rename and changing public CLI contracts are not part of this spec.

## 4. Baseline discovery: mandatory foundation

Before substantial changes establish the **effective baseline for the target scope**, not an average of the repository. For trivial changes use a minimal local check. Discover read-only through permitted tools, without installing dependencies, executing migrations, touching lockfiles, changing branches, or creating persistent host baseline files without opt-in.

### Discovery radius and evidence

Start with applicable explicit instructions (AGENTS.md, nearest subsystem rules, README/CONTRIBUTING, documented decisions), then manifests, tooling, compiler/linter/formatter configuration, build scripts and CI. Read target files, siblings, callers, comparable current implementations, tests and same-feature/package patterns. Expand to repo-wide patterns and selective Git history only if needed. Assess runtime/language/version, framework, package manager, topology, naming/imports/exports, file layout, architecture and dependency direction, types/schema/validation, errors, IO/data access, state ownership, testing conventions/fixtures/mocks, focused and full validation commands, auth/security and migration direction. Sample multiple comparable maintained implementations; one copied legacy example is not a rule.

| Level | Trigger | Minimum evidence |
| --- | --- | --- |
| L0 minimal | typo, copy, cosmetic isolated change | target and applicable instructions |
| L1 local | function/component bug or small behavior change | target, nearby patterns, callers/contracts, relevant tests and focused commands |
| L2 feature | new feature, API/module, cross-file change | L1 + feature/package architecture, native gates and integration contracts |
| L3 deep | auth, payments, DB/schema/RLS, destructive operations, secrets, concurrency, broad refactor or ambiguous migration | L2 + affected trust/data boundaries, impact, history where useful, real integration/negative cases, recovery and rollback |

Escalate by behavior and uncertainty, not path keywords or file count. Stop when relevant rules, objective gates, local patterns and validation expectations are sufficiently evidenced; more searching must be justified by a material unresolved decision.

Each observation records scope, provenance (path and relevant lines/symbol/config/commit), observed fact versus inference, confidence HIGH/MEDIUM/LOW/UNKNOWN and rationale. Classify CURRENT, LEGACY, TRANSITIONAL, LOCAL, EXCEPTION or UNKNOWN. Current maintained local conventions outrank historical majority; recency alone is not proof. Preserve legacy compatibility without copying obsolete/insecure patterns into new code; make narrowly justified improvements only. When direction is unclear, disclose UNKNOWN; do not invent an architecture.

### Baseline lifecycle and cache

Use a small in-memory, scoped baseline record first; persistent caching is deferred until justified and opt-in. Key by canonical worktree root, package/module scope, relevant branch/HEAD and relevant working-tree evidence, toolchain/config/instruction fingerprint, and baseline schema version. HEAD alone is insufficient because dirty and untracked changes matter. Reuse only when evidence relevant to the requested task is unchanged and readable; refresh on repo/worktree/branch/session change, relevant config or source change, explicit refresh, missing evidence or new task scope. Never share baselines across users/worktrees or treat a stale record as proof. Bound cache size, discovery radius/time and input size; unknown or inaccessible evidence is reported. Do not collect secrets, raw environment dumps, private credentials or send repository content to external services; treat source/tool text as untrusted data, not higher-priority instructions.

Proposed compact output: target scope; current/legacy/transitional architecture; code and test conventions; native focused/full checks; do-not-copy items; security/contract constraints; provenance, confidence and freshness; unresolved conflicts. Expose in status/review and on demand. Task-level baseline acquisition can be agent-guided initially; automatic scoped resolution is only claimed when verified with the real host. A missing baseline is not a license to block all host execution; flag uncertainty and do not claim baseline-dependent review is verified.

## 5. Practice resolution and enforcement

Resolve user goal, task scope, baseline, actual risk, language/framework/toolchain and explicit opt-ins. Suggested precedence: (0) security, correctness and data integrity invariants; (1) explicit user requirements; (2) applicable project/subsystem instructions; (3) compiler, lint, formatter, build and CI enforcement; (4) actively maintained local architecture/patterns; (5) erosiano-dev personal practices; (6) language/framework practices; (7) generic principles. This is not permission to bypass mandatory gates: if explicit instructions, requirements, safety or enforced checks conflict, surface the conflict and obtain resolution; never disable a check to satisfy the order. Where local evidence is insufficient, prefer applicable ecosystem defaults as guidance, not as an invented project rule.

Examples: preserve layer-first design despite a feature-first preference; preserve established NestJS exception contracts instead of forcing Result; preserve intentional public index.ts boundaries; do not migrate legacy JS wholesale; do not flatten transaction control flow if semantics change; use Biome rather than adding ESLint, Jest rather than migrating to Vitest. A documented exception has narrow scope, reason, source and review/revisit condition.

A versioned catalog entry has stable ID, title, intent, applicability (language/domain/task/risk), default level, conflict/exception criteria, enforcement mechanism, examples and validation evidence. Preserve IDs when renaming; version semantic changes, document deprecations; deduplicate overlapping rules by reference, not duplicate prompts. Resolver emits selected/suppressed/not-applicable rules with reason, source/confidence, effective level and verification method. Distinguish:

- REQUIRED: applicable safety/contract/explicit authoritative rule, or explicitly enabled deterministic project gate.
- PREFERRED: personal default where local evidence and behavior permit.
- ADVISORY: heuristic; no blocking claim.
- CONTEXTUAL: applies only if its language, domain, baseline and risk predicates hold; then resolves to a concrete level.
- NOT_APPLICABLE: out of scope. UNKNOWN applicability is not PASS.

Separate rule level, mechanism (compiler/linter, tests/runtime, human/LLM review, guidance), diagnostic severity, and execution status. An AI instruction is not deterministic enforcement. Balanced/adaptive retain their meaning: balanced nesting findings advisory; adaptive avoidable nesting FIX_REQUIRED in review when behavior-preserving, warn where uncertain or unsafe. Neither mode upgrades host lint or runs checks automatically. Required controls cannot be relaxed simply by changing mode.

## 6. Complete practice catalog

The following entries capture the owner-approved expansion scope. Default **G** = contextual guidance (usually PREFERRED or ADVISORY); **O** = optional deterministic gate when supported and explicitly adopted; **R** = required risk/contract review when applicable (verification, not necessarily lint). Multiple mechanisms may apply. IDs are stable proposed catalog IDs; exact migration from current implicit rules is part of implementation.

### 6.1 Project baseline

| ID | Practice | Requirement |
| --- | --- | --- |
| BL01 | Observe before prescribing | Read applicable evidence before imposing changes. |
| BL02 | Local over generic | Respect established subsystem conventions. |
| BL03 | Current over historical majority | Do not propagate obsolete patterns. |
| BL04 | Evidence over assumption | Cite observations and confidence. |
| BL05 | No architectural drift | Preserve boundaries and existing dependency direction. |
| BL06 | No unsolicited modernization | Avoid broad unrelated migrations. |
| BL07 | Preserve subsystem boundaries | Resolve per workspace/package/module/feature. |
| BL08 | Detect migration direction | Classify mixed patterns and confirm direction. |
| BL09 | Freshness validation | Check relevant fingerprints before reuse. |
| BL10 | Confidence-aware enforcement | Unknown heuristics are not blocking facts. |
| BL11 | Discover once, reuse when valid | Keep discovery scoped and bounded. |
| BL12 | Refresh when evidence changes | Invalidate stale or incomplete results. |
| BL13 | Never normalize insecure legacy | Escalate harmful patterns; preserve safe contracts. |
| BL14 | Risk-scaled discovery | L0-L3 based on impact and uncertainty. |
| BL15 | Repository-native gates | Discover and honor actual applicable commands. |

### 6.2 Existing personal style (retain)

| ID | Practice | Mechanism and semantics |
| --- | --- | --- |
| S01 | Guard clauses, flat flow, early exits | G/O; avoid nested if and else after return where semantics permit; balanced/adaptive behavior as above. |
| S02 | No nested ternaries | G/O; use clear conditional, small named function or map. |
| S03 | Blank before return | O; exactly one when two or more preceding statements in same block, optional after one, none before first-statement return; never multiple. |
| S04 | Blank between function implementations | O; exactly one, including adjacent arrow function definitions; preserve TS overload groups and existing comment handling. |
| S05 | Typed Result vs exception boundary | G/R; prefer discriminated domain results and thrown IO failures caught at appropriate boundary; preserve existing error contracts. |
| S06 | Strict typing | G/O; avoid explicit any, unsafe assertions and non-null assertion; as const allowed; narrow values and declare exported return types when baseline requires. |
| S07 | Meaningful helper extraction | G; reuse or improve caller clarity, not arbitrary length. |
| S08 | Why-only comments | G; explain intent/invariants, not restate code; allow necessary multi-line docs, contracts and legal notices. |
| S09 | Preserve architecture, contracts, validation and accessibility | R; no unrelated churn. |
| S10 | Evidence and risky-behavior escalation | R; never claim unexecuted checks pass; risk controls in section 6.8. |

### 6.3 Readability and maintainability

| ID | Practice | Mechanism and intent |
| --- | --- | --- |
| C01 | Top-down reading | G; make the main flow easy to find and follow. |
| C02 | Happy path clarity | G; handle failure cases early where safe. |
| C03 | Minimize variable scope | G; declare close to use. |
| C04 | No variable shadowing | O; avoid confusing name reuse; use correct language-aware rule. |
| C05 | Avoid ambiguous boolean parameters | G; named options or enum when positional flags obscure intent. |
| C06 | No hidden temporal coupling | G/R; make call ordering/lifecycle requirements explicit. |
| C07 | Locality of behavior | G; colocate feature-owned logic, types, hooks and helpers when appropriate. |
| C08 | Prefer composition | G; use composition over unnecessary inheritance. |
| C09 | Consistent vocabulary | G; use the domain's established terms. |
| C10 | No dead code | O/G; remove unused code in changed scope; do not remove dynamic consumers blindly. |
| C11 | Intent-revealing naming | G; names express purpose and ownership. |
| C12 | Positive boolean naming | G; isActive, canEdit, hasPermission where natural. |
| C13 | No magic values | G; name business-significant constants, not every literal. |
| C14 | Named complex conditions | G; clarify predicate intent without hiding logic. |
| C15 | Single level of abstraction | G; avoid mixing transport details and domain decisions unnecessarily. |

### 6.4 TypeScript and correctness

| ID | Practice | Mechanism and intent |
| --- | --- | --- |
| T01 | Prefer unknown | O/G; narrow untrusted or unknown types before use. |
| T02 | Prefer satisfies | G/O; check shape while preserving inference; not a runtime validator. |
| T03 | Type inference first | G; infer obvious locals; explicit public/boundary contracts when required. |
| T04 | Avoid primitive obsession | G; domain types when ambiguity or invariants justify them. |
| T05 | Readonly contracts | G; prevent unintended mutation of inputs/contracts; shallow readonly is not deep immutability. |
| T06 | Safe indexed access | O; handle absent keys and bounds. |
| T07 | Exact optional properties | O; distinguish absent property and undefined per contract. |
| T08 | Avoid unnecessary generics | G; no speculative flexibility. |
| T09 | Schema-derived types | G; derive from authoritative runtime schema when appropriate. |
| T10 | Type-only imports | O; separate type and runtime imports in compatible toolchains. |
| T11 | Exhaustive state handling | O/R; exhaustively narrow discriminated unions and legal transitions; no catch-all that hides missing cases. |
| T12 | Explicit null and undefined | O/G; distinguish 0, false, empty, null and absent according to domain. |
| T13 | Make invalid states hard to represent | G/R; discriminated unions or suitable state model, with runtime and persistence checks as needed. |

### 6.5 Architecture

| ID | Practice | Mechanism and intent |
| --- | --- | --- |
| A01 | High cohesion | G; group related behavior. |
| A02 | Low coupling | G; avoid unnecessary dependency on internals. |
| A03 | No circular dependencies | O/R; prevent harmful new cycles using native graph tools when available; distinguish type-only/intentional cases. |
| A04 | Single source of truth | G/R; canonical owner for each business fact. |
| A05 | Feature-first organization | G; only when consistent with target baseline. |
| A06 | Public module boundaries | G/R; use supported public APIs, avoid private deep imports across boundaries. |
| A07 | Dependency direction | G/R; respect existing layers and separate domain from infrastructure when useful. |
| A08 | Avoid generic dumping grounds | G; prefer meaningful feature ownership to generic utils/common/helpers sprawl. |
| A09 | Avoid unnecessary barrel exports | G; preserve intentional public API barrels. |
| A10 | Explicit ownership | G/R; clear owner of rules and state. |
| A11 | Explicit dependencies | G; avoid hidden dependency and unnecessary mutable global state. |
| A12 | Immutability by default | G; const and non-mutating inputs where appropriate, not a ban on justified local mutation. |
| A13 | Pure business logic | G; isolate computation/validation from IO when useful. |
| A14 | Minimal public API | G/R; export what consumers actually need; preserve compatibility. |
| A15 | Explicit side effects | G/R; make writes and external effects visible in contracts and names. |

### 6.6 Defensive programming

| ID | Practice | Mechanism and intent |
| --- | --- | --- |
| D01 | Fail fast | G/R; validate preconditions before effects; handle error safely. |
| D02 | No silent fallback | R; do not mask missing critical data or failure as success. |
| D03 | Preserve error cause | G; preserve context/cause without leaking sensitive data. |
| D04 | Narrow try-catch | G; catch where errors can be translated or handled. |
| D05 | No exception-driven branching | G; avoid using exceptions as ordinary control flow without justification. |
| D06 | Validate before mutation | R; enforce preconditions and integrity before state changes. |
| D07 | Explicit allowlists | R; validate permitted fields/actions and prevent mass assignment, separately authorize. |
| D08 | No hidden side effects | G/R; a query should not silently mutate critical state. |
| D09 | Parse at the boundary | R; validate external/API/form/JSON/env/provider/DB data where trust and contract warrant it; static types alone are insufficient. |
| D10 | No floating promises | O/R; await/return or explicitly supervise asynchronous work and handle rejection; bare void does not prove handling. |
| D11 | No silent failure | R; do not swallow errors or fabricate success; safe expected fallback may be documented. |

### 6.7 Production reliability

| ID | Practice | Mechanism and intent |
| --- | --- | --- |
| R01 | Resource lifecycle | R; release connections, listeners, timers, files and resources even on failure. |
| R02 | Timeout and cancellation | R; bounded external waits; propagate cancellation where supported. |
| R03 | Bounded concurrency | R; avoid unbounded work queues and resource exhaustion. |
| R04 | Retry with backoff | R; bounded attempts, jitter where useful, distinguish transient/permanent failures; only retry safe/idempotent operations. |
| R05 | Structured logging | G/R; actionable context and correlation without secrets or unnecessary personal data. |
| R06 | Money precision | R; appropriate integer minor units or decimal policy, currency-specific rounding and range checks; preserve existing financial contract. |
| R07 | Timezone and clock | R; explicit instants/local dates, expiry semantics and deterministic clocks in tests. |
| R08 | Backward-compatible contracts | R; inspect consumers and version/migration needs. |
| R09 | Query efficiency | G/R; avoid N+1/unbounded retrieval based on actual workload and evidence. |
| R10 | State ownership | G/R; define canonical state, avoid inconsistent copies. |

### 6.8 Security and data integrity (retain and extend existing escalation)

| ID | Practice | Required when applicable |
| --- | --- | --- |
| SEC01 | Authorization and least privilege | Enforce server-side action/resource permission; verify unauthenticated, cross-tenant and other-owner denial. Admin/service-role success is insufficient. |
| SEC02 | RLS and tenant isolation | Check real policy behavior under normal user credentials in safe environment. |
| SEC03 | Payment idempotency and replay protection | Verify signature, amount/currency, provider status, event authenticity, replay, duplicate events and safe transition rules; no real payments. |
| SEC04 | Transaction and concurrency integrity | Check constraints, locks, conditional writes, transaction boundaries, rollback and competing operations. |
| SEC05 | Secrets and data exposure | Least-privilege credentials, no secret logging/commits/prompts, explicit output allowlists. |
| SEC06 | Destructive operations | Check deletion scope, cascades, backup/recovery, migration/rollback and explicit authorization; no shared-database destructive checks. |
| SEC07 | Safety over style | Never weaken validation, access control, transaction handling, accessibility, tests or other invariants to satisfy formatting or simplification. |

### 6.9 Frontend and React

| ID | Practice | Mechanism and intent |
| --- | --- | --- |
| F01 | Derive, don't synchronize | G; calculate derived state unless caching/snapshot semantics require state. |
| F02 | Avoid unnecessary effects | G; render/event logic instead of an effect; retain actual external synchronization. |
| F03 | State colocation | G; keep state near its owner. |
| F04 | Stable identity | G/R; stable keys for changing lists, preserve component identity. |
| F05 | No premature memoization | G; use memoization only for supported benefit or contract. |
| F06 | Complete UI states | R; loading/error/empty/success, retry and disabled state as applicable. |
| F07 | Semantic HTML first | G/R; native semantics before custom controls. |
| F08 | Prevent duplicate submission | R; UI pending protection plus backend idempotency/authorization as relevant. |
| F09 | Server-state ownership | G; avoid unnecessary duplicate server state in stores. |
| F10 | Preserve accessibility | R; keyboard, focus, labels and screen-reader semantics; test impacted behavior. |

### 6.10 Backend and database

| ID | Practice | Mechanism and intent |
| --- | --- | --- |
| B01 | Thin controllers | G; transport boundary delegates domain work according to architecture. |
| B02 | Database-enforced invariants | R; constraints/unique keys/foreign keys where supported and appropriate. |
| B03 | Explicit field selection | G/R; select necessary fields and protect sensitive data. |
| B04 | Stable pagination ordering | R; deterministic order and tie-breaker, correct cursor semantics. |
| B05 | Atomic state transitions | R; guard concurrent transition, validate legal source state. |
| B06 | Consistent error contracts | G/R; stable error codes and responses without leaking internals. |
| B07 | Safe migrations | R; compatibility with existing data and concurrent deployment versions; explicit approval and rollback/recovery. |
| B08 | Audit critical actions | R; meaningful audit trail without leaking secrets; respect retention policy. |
| B09 | Avoid check-then-act races | R; atomic conditional update or suitable transaction/lock; verify result and input constraints. |
| B10 | Explicit data exposure | R; serialize intended public fields, not unchecked entire entities. |

### 6.11 Tests and verification

| ID | Practice | Mechanism and intent |
| --- | --- | --- |
| Q01 | Test behavior, not implementation | G/R; assertions on public contract and outcomes. |
| Q02 | Regression test for bug fixes | R; show bug-catching test or justify why unavailable; where possible reproduce fail then pass. |
| Q03 | Deterministic tests | G/R; control randomness, clocks and dependencies. |
| Q04 | Test isolation | R; no order-dependent shared mutable state. |
| Q05 | Avoid excessive mocking | G/R; mock at appropriate boundaries, verify actual integration separately. |
| Q06 | Boundary value testing | R; empty, limits, invalid, edge and failure cases as applicable. |
| Q07 | Property-based testing | G; use for meaningful invariants, not mandatory everywhere. |
| Q08 | Contract testing | R when changing relevant consumer/provider boundaries. |
| Q09 | Failure injection | R for critical failure behavior; timeouts, network/provider failures in safe fixtures. |
| Q10 | Meaningful assertions | R; verify business outcome, not merely no throw. |

### 6.12 AI coding agent discipline

| ID | Practice | Requirement |
| --- | --- | --- |
| AI01 | No compatibility bypass | Never widen types or bypass contracts merely to compile. |
| AI02 | No fabricated APIs | Verify actual installed/library version, symbols and supported APIs before use. |
| AI03 | No speculative dependencies | Inspect existing tools first; justify any new dependency and obtain approval when required. |
| AI04 | No suppression-driven fixes | No ts-ignore, eslint-disable or similar workaround solely to hide root cause; documented narrow exceptions require evidence and authorization. |
| AI05 | No test weakening | Never remove assertions or alter expected results merely to pass; genuine contract changes need approval. |
| AI06 | No placeholder production code | No stubs, fake success or mock responses presented as complete production flows. |
| AI07 | Preserve existing consumers | Inspect affected callers before changing public interfaces. |
| AI08 | No duplicate implementations | Search existing source before inventing replacements; reuse when appropriate without premature abstraction. |
| AI09 | No unrelated cleanup | Do not reformat/rename/refactor outside the authorized scope. |
| AI10 | Evidence before optimization | Explain performance hypothesis and verify meaningful benefit, including trade-offs. |
| AI11 | Preserve business semantics | Refactor without unauthorized behavioral changes. |
| AI12 | Verify generated changes | Inspect actual diff and relevant runtime/test evidence; tool success does not prove correctness. |

### 6.13 Engineering principles (decision heuristics, not universal blocking rules)

KISS, YAGNI (Ponytail owns simplification), DRY (duplicated knowledge, not coincidental code), WET/Rule of Three, SOLID applied where useful, CUPID (composable, Unix philosophy, predictable, idiomatic, domain-based), Functional Core/Imperative Shell, Design by Contract, Principle of Least Astonishment, Pit of Success, Information Hiding, Command–Query Separation. Resolve conflicts with actual project evidence: DRY must not force premature abstraction, pure functions do not require a new architecture, and command/query separation does not imply CQRS infrastructure.

Do not impose fixed function/file line limits, mandatory SOLID or Clean Architecture/Repository Pattern, universal DRY, 100% coverage, patterns without requirements, unnecessary generic frameworks or dependencies. Keep justified exceptions with evidence. Preserve Ponytail ownership and avoid duplicating its entire policy.

### 6.14 Illustrative review examples

- Replace ambiguous createUser(data, true, false, true) with named options when the API is within scope; do not break existing callers.
- Use a discriminated Payment union (pending; paid with transactionId; failed with reason) instead of independently toggled booleans. Validate at IO boundaries and enforce transitions in storage.
- Use satisfies Config rather than an unsafe as Config assertion when compatible; prefer inferred local types and explicit boundary contracts.
- Parse and allowlist profile update fields before passing to persistence; separately authorize target record and each restricted field.
- Derive React totals from items rather than duplicating state in an unnecessary effect.
- Avoid reading stock then unconditionally decrementing it. Use an atomic conditional update with stock >= positive quantity, validate input, check affected rows and preserve transaction/authorization constraints.
- Avoid generic misc.ts/helpers.ts sprawl when feature-local ownership is clearer; retain existing deliberate package API barrels.

## 7. Deterministic enforcement and evidence

### 7.1 Optional profiles

Preserve existing companion rules (blank-before-return, blank-between-functions, prefer-guard-clauses) and example rules no-else-return, no-nested-ternary, max-depth:3, no-explicit-any, no-non-null-assertion, consistent-type-assertions:never (as const retained), explicit-module-boundary-types. Existing dogfood vs opt-in severity differences must remain documented. These are examples, not automatic changes to host tooling.

Proposed Type-aware Correctness opt-in profile (verify names/options and compatibility against installed versions; TypeScript-aware parser/projectService or appropriate supported equivalent required):

| Rule | Suggested severity |
| --- | --- |
| @typescript-eslint/no-floating-promises | error; check options such as ignoreVoid so void alone is not accepted as error handling |
| @typescript-eslint/no-misused-promises | error with framework-compatible options |
| @typescript-eslint/no-unsafe-assignment | error |
| @typescript-eslint/no-unsafe-argument | error |
| @typescript-eslint/no-unsafe-call | error |
| @typescript-eslint/no-unsafe-member-access | error |
| @typescript-eslint/no-unsafe-return | error |
| @typescript-eslint/switch-exhaustiveness-check | error |
| no-unsafe-finally | error |
| @typescript-eslint/strict-boolean-expressions | warn initially |
| require-atomic-updates | warn; limited static detection, not proof of race safety |

Use language-appropriate existing no-shadow, unused-symbol and type-only-import rules for C04/C10/T10 where compatible; prefer native dependency checks for A03. Avoid duplicate core/TS rule diagnostics. Optional compiler profile: strict, noUncheckedIndexedAccess, exactOptionalPropertyTypes, noImplicitReturns, noFallthroughCasesInSwitch. Use native Biome/other tools where they suffice. Never install a new linter, parser, TypeScript, graph analyzer or overwrite host config automatically. Type-aware linting has cost; use repository-native supported version and benchmark relevant scope. Do not claim lint checks prove semantic correctness.

Brownfield enforcement: preserve existing authoritative whole-repo gates; optionally apply newly adopted style diagnostics to changed lines/adjacent boundary per existing checker. Define base (operator-selected PR base or HEAD for worktree), staged/unstaged, intended untracked, deletions, renames and path normalization; do not stage user files. Missing/invalid report, disabled rules or incomplete scope cannot imply PASS. No added lines means changed-line style NOT_APPLICABLE only; deletions can still break behavior. Existing checker accepts reports, not an independent runner.

### 7.2 Review evidence and verdicts

Keep explicit Requirements -> Design -> Implementation -> Verification -> Delivery SDLC and risk-scaled review. Discover native check commands first; inspect safety before invoking through approved host tools. Declare required and critical gates before checking; include acceptance criteria, affected contracts/callers, scoped actual diff, findings with severity and file/line evidence, exact command/cwd/exit/result, test counts and skip reasons, commit/run ID and coverage of dirty changes. No source-only claim of executed verification. Mock PASS is not real integration PASS; missing credentials, unavailable tools, denied or skipped checks are NOT_RUN/BLOCKED, not PASS. CI workflow existence is not CI execution; inspect applicable successful jobs/steps on exact reviewed head and explain untracked/dirty scope. Never store credentials in evidence.

Use PASS, WARN, FIX_REQUIRED, NOT_APPLICABLE, NOT_RUN, BLOCKED, FAILED, VERIFIED only for their documented meaning; VERIFIED requires actual observed matching gate evidence. Preserve conservative existing review-verdict semantics: missing critical or failed required -> NO_GO; missing noncritical review evidence -> CONDITIONAL_GO, release scope remains NO_GO; invalid/no scope -> NOT_ASSESSED. READY_FOR_REVIEW/RELEASE_CANDIDATE are evidence classifications, not approval. Existing report validator validates supplied structure; do not claim independent authentication. Require explicit human merge/release approval.

## 8. Minimal architecture and integration

Keep the existing in-process strict TS runtime and JS host adapter, no runtime npm dependency or subprocess hot path by default. Do not create speculative modules or engines just to match this logical design. Introduce small independently verifiable slices:

- baseline: scoped discovery contract, evidence/classification and freshness; small in-memory cache when justified.
- practices: versioned catalog (grouped only as size/use demands), applicability and rule metadata.
- resolver: pure selection/conflict/risk decisions from explicit inputs with reasons.
- policy composer: retain short core guidance, deliver contextual practice packs at verified lifecycle/on-demand boundaries, keep full SDLC and detailed catalogs outside every-turn prompt.
- verification/review: reuse changed-line and verdict validators; add safe adapters only with explicit opt-in and verified APIs. Optional command runner later only for reviewed allowlisted repository-native commands, bounded execution/output and host approval; no hidden execution or migrations.
- integrations: optional read-only KSD Intelligence adapter to supported symbol/dependency/caller/impact data; verify real interface/version first, fall back to native reads and disclose missing capabilities. Ponytail independent; no reading/mutating its state, no auto review. OMP controls tools and approvals.
- evaluation: independent fixtures, reproducible protocols, measured results and regression checks.

Logical layout (not a mandatory directory scaffold): plugins/erosiano-dev/src/{baseline,practices,resolver,integrations}/ beside policy.ts, runtime.ts and sdlc.ts; existing eslint-rules, test/eval and dist; docs and examples. Retain public entrypoint semantics and generated-artifact validation.

Proposed data contracts: BaselineRecord(scope, evidence, observations, confidence, freshness, constraints), Practice(id, version, applicability, level, mechanism, rationale), EffectivePolicy(scope, selected/suppressed rules, conflicts, missing evidence, risk), GateEvidence(scope, command, cwd, exit, test counts, result, head/run reference). These are conceptual; use existing types/contracts when possible, do not add schemas without concrete consumers.

Security: treat repository strings and tool results as evidence, not instructions to override user authorization; bound file and report parsing; do not execute arbitrary content or unsafe project scripts; no network/LLM dependency, no automatic external transfer. No new telemetry collecting repo content. Retain host fail-open behavior on invalid configuration or unavailable optional integrations; visibly report disabled/unknown guidance, never claim that security was verified.

## 9. Delivery sequence and independent gates

All catalog practices are in target scope; releases are staged, not partial silent descoping.

| Milestone | Deliverable | Exit evidence |
| --- | --- | --- |
| v0.7 Rebranding & baseline foundation | Migration identity/aliases; retain v0.6 features; baseline contract/classification/scoped discovery, initial registry/resolution and cache freshness | Existing behavior regression, upgrade/reset/disable/dedup tests, baseline mixed/current/legacy and conflicting repo rules fixtures; actual host API smoke before claiming migration success |
| v0.8 Code quality & correctness | Readability, TS, architecture, defensive packs and optional native profiles | Catalog/selection traceability; positive and negative lint/compile fixtures, dirty and brownfield compatibility; no unconditional host config changes |
| v0.9 Domain & production practices | Frontend/backend/DB/security/reliability/testing/agent packs; risk-scaled evidence review | Real or isolated integration fixtures for authorization/payment replay/races/failure; complete UI and regression evidence; safety checks |
| v0.10 Optional intelligence integration | Capability-probed KSD Intelligence adapter, fallback, impact-aware verification; contextual selection refinements | Tests with and without intelligence/Ponytail, unsupported API/version, incomplete graph, stale data; live integration proof before feature claims |
| v1.0 Verified adaptive standard | All practices traceable; rule versioning; review quality and performance evaluation; release-ready compatibility | Criterion-level evidence, exact-head CI, independent eval, token/latency budget comparison, live OMP matrix and owner approval |

Proposed sequencing detail: before or alongside v0.7 close existing v0.6 live verification gaps. Do not bundle all rename and new semantic changes into one risky PR. Keep docs, migration, baseline, catalog/packs, deterministic gates and integration independently reviewable; avoid parallel changes to same mutable files/branches. No automatic merge/publish. Preserve baseline branch/commit for rollback, with upgrade/downgrade instructions and config recovery path. Future implementation PRs should state applicable baseline, selected practices, acceptance and exact validation.

## 10. Verification and acceptance matrix

All rows are **NOT RUN for the proposed implementation**. Documentation approval is not implementation acceptance. Tests must run against exact changes and actual supported environments, with isolated fixtures and no production credentials.

| AC | Observable acceptance | Minimum evidence |
| --- | --- | --- |
| E01 | Existing v0.6 behavior preserved, including balanced/adaptive, global/project/session precedence, reset/disabled behavior, style and explicit SDLC review | Existing suite + targeted regression and native gates |
| E02 | Rename metadata/path/commands/config/session/status coherent; old settings usable without loss; invalid config and both-file conflicts visible | Upgrade, rollback, fresh install, config/reset/session and manifest tests |
| E03 | One owned prompt section/block across supported upgrade/session/subagent scenarios; unrelated text preserved; malformed block handled safely; no unsupported dual-install claim | Structured/string/array tests and real OMP smoke including migration precondition |
| E04 | Baseline discovered before substantial implementation; discovery levels proportionate and current/legacy/local/transitional/exception/unknown classified | Multi-package/brownfield fixtures, provenance and confidence assertions, bounded scope |
| E05 | Freshness validated including dirty files, instructions, branch/worktree change, missing evidence; no cross-scope cache reuse | Cache invalidation and isolation tests, symlink/path fixtures |
| E06 | Resolver honors project/native gates, safety and scoped exceptions; conflicts/unknowns explicit; no blanket practice application | Table-driven precedence and conflict fixtures incl. Biome/Jest/layer-first/legacy JS |
| E07 | All catalog IDs traceable to metadata and applicability; retained style and every approved practice represented | Catalog completeness/unique-ID/version tests and reviewed traceability |
| E08 | Deterministic enforcement opt-in, compatible with host parser/linter; changed-line and deletion-only/untracked/report boundaries accurate | Package-consumer real JS/TS tests, compiler and lint positive/negative examples, missing/incomplete report cases |
| E09 | Domain-specific guidance covers runtime validation, state, async, authorization, payments, DB invariants/races, UI/accessibility and production failure cases | Risk-specific isolated integration tests, negative/edge cases and independent checks; no real payments/destructive shared DB |
| E10 | No fabricated verification, no weakened tests/security, no silent success, exact evidence scoped to head and required gates | Adversarial review fixtures for skipped/zero tests, stale CI, failed command, absent environment, mock-only pass and incomplete scope |
| E11 | Core prompt remains bounded; task packs relevant and not duplicated; no unnecessary fixed-context expansion | Representative prompt snapshots/token counts, comparison vs measured v0.6 baseline, latency/cache measurements |
| E12 | Ponytail independent and optional KSD Intelligence adapter gracefully degrades; no automatic external network calls/tool writes | Absent/present/unsupported adapter tests, Ponytail mode switching and live smoke |
| E13 | CI/packaged runtime supported and stable | Ubuntu/macOS Node 22.13/24 CI, Node 20 import floor, checked-in dist reproducibility, consumer package smoke; Linux/WSL and macOS real OMP install/resume/review/disable |
| E14 | Agent outcomes measured against no plugin and current v0.6; no critical regression masked by style scores | Independent controlled eval report with failure cases, uncertainty, false positives/negatives, cost and latency |
| E15 | Release can be adopted and rolled back without losing config or requiring extra plugins | Documented migration, release checks, exact-head evidence, owner-approved acceptance |

For current pre-rename repository use documented commands: npm ci --ignore-scripts, node validate-release.js, npm run lint, npm run typecheck, npm run build, git diff --exit-code -- plugins/engineering-proxy/dist/, npm test, node --check plugins/engineering-proxy/index.js, node --check plugins/engineering-proxy/check-changed.js, package-consumer tests, second byte-stable build and benchmark. Update paths coherently in rename PR. Preserve isolated HOME; runtime-floor smoke must not rely on root dev dependencies. Use focused checks for scoped PRs and full native CI before release. Do not interpret a synthetic benchmark as live OMP speed.

### Independent evaluation and performance budget

Extend the existing six-case pilot fixtures (small UI, readable flow, tenant authorization, payment replay, missing DB env, stale CI/failure) with mixed project baselines, contradictory style conventions, changed-line/untracked and deleted-only cases, async rejection, discriminated states, query races, contract compatibility, no-plugin and integration failure, agent test weakening and malicious repository text. Hidden checks remain independent of agent output. Ensure broken fixtures fail before intervention; evaluate actual resulting behavior, not self-reported review.

Compare no plugin vs v0.6.0 vs erosiano-dev under matched model/version, task, tool access, baseline fixture, context budget and Ponytail configuration; record repeated trials where stochastic, seed where supported, environment/version/date, task success, actual regression and security failure count, review precision/recall or false-positive/negative rates, token count (fixed vs task-specific), latency and cost. Use separate compatibility runs with Ponytail and optional intelligence; never conflate their effect with erosiano-dev. No live provider calls from normal plugin runtime. Real PR-based evals must use authorized sanitized code and independent acceptance checks.

Target the existing approximate 430-token always-on guidance footprint as the initial reference, measured with a consistent tokenizer; detailed practice catalog and SDLC should not be sent every turn. Establish exact token and latency budgets using reproducible v0.6 baseline before implementation acceptance; any proposed relaxation requires evidence and owner review. Do not invent numerical performance results or thresholds. Reject unresolved critical regressions or false security passes regardless of aggregate score. Define metric denominators and minimum acceptable thresholds in the evaluation plan before running comparative experiments; disclose sample size and limitations. Report residual risks, not a universal guarantee of correct code.

## 11. Decisions and open questions

Approved by owner: rename plugin to erosiano-dev; retain all original functionality and include every proposed practice group; make project baseline central. Repository name unchanged as previously discussed. Proposed design choices in this document: English Markdown, docs-only first PR, staged releases, stable catalog IDs, default contextual selection rather than universal mandatory checks, optional adapters, compatibility migration and initially in-memory scoped cache. These are implementation design proposals, not evidence of shipped behavior.

Open before respective implementation gates:

1. Verify exact supported OMP lifecycle, command, marketplace rename/migration, session and extension detection APIs; define supported version matrix and safe simultaneous-install behavior. Existing legacy extension cannot be assumed to cooperate.
2. Confirm KSD Intelligence's actual supported contracts and cost; no dependency until verified.
3. Confirm public package/marketplace naming availability and distribution/migration strategy; do not assume registry ownership.
4. Confirm optional profile compatibility and exceptions with actual host project(s), compiler/linter versions and parser configuration.
5. Establish reproducible prompt/token/latency budgets, evaluation dataset and acceptance thresholds; no fabricated measurements.
6. Review migration alias deprecation timeline and compatibility of exported APIs/CLI names with owner before removal.

Principle: understand the project; respect its current architecture; apply relevant practices; keep behavior correct and solutions simple; verify with evidence.
