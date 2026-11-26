# erosiano-dev validation and release gates

This is the acceptance protocol, **not a completed comparative evaluation or v1.0 release**. The candidate retains version 0.7.0 while implementation slices are reviewed.

## Independent evaluation

The eight-case fixture manifest includes UI, readability, tenant authorization, payment replay, missing RLS environment, stale CI/failure, asynchronous rejection, and competing inventory reservations. The unit suite checks that five trusted checked-in broken fixtures produce independent assertion failures; that is a fixture integrity check, not proof that an agent repairs them. UI requires a real browser and review-only cases require their documented evidence checks. Never show hidden checks or reference outcomes to the model. Run generated code only in a disposable sandbox without secrets, network, production access or shared writable state.

Before running a study, agree on model versions, repeat count, fixture revision/hash per case, task text, tool permissions, context budget, Ponytail setting, environment, success rubric, critical failures, independent reviewer, and acceptable success/FP/FN/token/latency thresholds. Randomize trial order and isolate each trial. Compare matched arms: no plugin, original v0.6.0, erosiano-dev. Preserve raw logs, diffs, independent checks, exact revisions and actual provider usage. A reviewer independent of the agent must grade each trial; do not use its self-reported success as ground truth.

Supply JSON to `node plugins/erosiano-dev/test/eval/score.mjs results.json`:
- Top-level `repetitions` (1–100) and `trials`.
- Each trial: `arm`, `caseId` (manifest ID), `repeat`, `setup` containing strings `model`, `modelVersion`, `fixtureHash`, `toolPolicy`, `contextBudget`, `ponytail`, `environment`; independent `evidence` reference and `reviewer`; boolean `passed`, `criticalFailure`, `criticalFalsePass`; `review` nonnegative integer counts `tp, fp, fn, tn`; `usage` nonnegative numeric values or explicit null for `inputTokens, outputTokens, latencyMs, costUsd`.

The scorer rejects incomplete/unmatched arms and duplicate trials, reports denominators and missing usage, and returns NO_GO on candidate critical failure or false pass. It validates structure, not authenticity; owner must inspect the referenced results and agreed thresholds. No trial data is bundled as measured results. Synthetic test inputs are not evaluation evidence.

## Acceptance and unresolved verification

| Gate | Required evidence |
|---|---|
| Migration | Old config/session replay and rollback; single active policy extension; actual OMP marketplace install, restart, status and disable flags |
| Baseline | Explicit scoped evidence including chosen callers/tests/CI, fingerprint changes, unknown/inaccessible paths, nested package conventions, mixed legacy/current and actual dirty/untracked evidence; explicit native Git linked-worktree support; no claim that a sampled hash proves repository-wide freshness |
| Practices | Catalog integrity (138 IDs), explicit facet resolution, sampled-byte-bound selection with provenance and stale-context rejection, unknown/conflict handling, actual agent uses only applicable practices after baseline |
| Native enforcement | Existing CI lint/typecheck/build/dist parity, actual package consumer, opt-in typed profile and representative real host adoption |
| Intelligence | Separately configured approved CLI or MCP, root/version/coverage validation, stale/unavailable fallback, no simultaneous duplicate OMP policy extensions |
| Performance | Same tokenizer and workload for baseline and candidate; measured token and latency budget agreed before comparative evaluation, including opt-in tool schemas |
| Independent evaluation | Matched external study with complete independent evidence, no critical false passes, owner-approved thresholds met |
| Release | Exact final head CI, live OMP on macOS and Linux/WSL, Ponytail on/off, session switching, rollback, owner approval |

Do not interpret green unit CI, a mock host API, fixture canaries, sampled evidence or supplied scores as live compatibility or complete release acceptance.

## Preregistered evaluation threshold gate

The original supplied-record scoring mode remains available. For release assessment use:

```bash
node plugins/erosiano-dev/test/eval/score.mjs results.json --plan approved-plan.json --candidate "$(git rev-parse HEAD)"
```

The plan must be agreed before the study: `schemaVersion: 1`, full `candidateCommit` and `baselineCommit`, `approvalReference`, UTC `approvedAt`, `repetitions`, the common `setup` fields (model, modelVersion, toolPolicy, contextBudget, ponytail, environment), `fixtures` mapping each manifest case ID to its SHA-256 digest, and `thresholds`. Required rate limits (0–1): minSuccessRate, maxFalsePositiveRate, maxFalseNegativeRate, maxSuccessDrop. Required positive ratios against v0.6: maxInputTokenRatio, maxOutputTokenRatio, maxLatencyRatio; optional maxCostRatio. Each trial additionally records `revision` (none for no-plugin; exact full commit for plugin arms) and UTC `startedAt`. No numeric thresholds are preselected by the plugin or represented as owner-approved. Missing measurements/undefined denominators, unmatched setups, stale revisions, and incomplete arms cannot pass. Candidate critical failures override aggregate scores. `MEETS_SUPPLIED_THRESHOLDS` is structural assessment only.

## Real OMP command smoke (operator-run)

Use a clean offline disposable environment with a trusted installed OMP binary that supports the documented OMP RPC dialect:

```bash
node plugins/erosiano-dev/test/eval/smoke-omp.mjs --omp /absolute/path/to/omp
```

This starts the actual extension in OMP RPC with isolated HOME and minimal environment, verifies command discovery, canonical mode and legacy reset entries, atomic config migration and both disable flags; it refuses unexpected agent invocation and bounds wait times. It does not install software, use provider credentials, send normal model prompts or prove marketplace installation, injection, Ponytail coexistence or KSD Intelligence behavior. Run the remaining live checks separately on macOS and Linux/WSL against the final candidate. Current OMP reference: https://github.com/can1357/oh-my-pi/blob/ce36c879d72b5a9ddf7d0b8dd10bb8e1bc62c4a4/docs/rpc.md. An unsupported dialect or missing executable is BLOCKED, never a pass.

## Fixed v1 acceptance gate

```bash
node plugins/erosiano-dev/test/eval/assess-v1.mjs release-report.json results.json approved-plan.json "$(git rev-parse HEAD)"
```

Supply a JSON report with `schemaVersion: 1`, `candidateCommit`, and `criteria` entries E01–E15 from the specification, each with `id`, `kind`, `status`, `headSha`, `reference`. The kinds are E01 regression, E02 migration, E03 live-host, E04/E05 baseline, E06 resolver, E07 catalog, E08 native-gates, E09 integration, E10 review, E11 measurement, E12 integration, E13 live-host, E14 evaluation, E15 approval. All must be VERIFIED with exact-head evidence. Also provide:
- `ci`: actual workflow record (headSha, status, conclusion, url, jobs with name, status, conclusion, steps). Required matrix jobs and applicable steps must have executed successfully.
- `reviewGates`: existing review-verdict format for typecheck, lint, tests, runtime, security and ci-parity; all six required and critical.
- `independentReview`: headSha, status, reviewer, reference, unresolvedCritical (must be 0).
- `liveHost`: separate darwin and linux records with exact headSha, status, ompVersion, reference, and observed true marketplaceInstall, promptInjection, sessionReplay, rollback, ponytailOnOff, intelligenceFallback.

The scorer runs the pinned-plan assessment itself; no supplied E14 assertion can replace it. It rejects missing required evidence; even `EVIDENCE_COMPLETE_FOR_OWNER_REVIEW` does not authenticate evidence or authorize a release. No test result, host record, comparative trial or approval is synthesized. Do not commit secret-bearing logs or provider credentials.

## Pinned real-host CI

The normal test workflow now includes two real OMP host jobs on Ubuntu and macOS. They download the official v19.2.1 binary for the runner architecture, verify its exact SHA-256 against the pinned release asset digest, and run the actual RPC smoke in an isolated temporary HOME with no inherited provider credentials. Checkout credentials are not persisted. No provider prompt or package installer is used. The jobs must pass on the exact release candidate; the fixed readiness assessor requires both download verification and real-host smoke steps. This verifies the bounded command/migration smoke only, not live model prompt injection, marketplace installation, Ponytail, real KSD Intelligence or comparative agent outcomes. GitHub-hosted runners are network-enabled; the command smoke avoids provider calls but does not claim a network sandbox. The executable pin comes from https://github.com/can1357/oh-my-pi/releases/tag/v19.2.1; update the version and all digests together after reviewing upstream contracts.

The same pinned-host matrix additionally runs `smoke-omp-prompt.mjs` with a deterministic synthetic model bound to 127.0.0.1 only. It inspects the actual model request for balanced/adaptive/reset and disabled policy sections, rejects duplicated/legacy markers and never uses a real provider credential. Synthetic transport success is real OMP integration evidence, **not** independent comparative model performance evidence. Run it separately with `node plugins/erosiano-dev/test/eval/smoke-omp-prompt.mjs --omp /absolute/path/to/omp`.
