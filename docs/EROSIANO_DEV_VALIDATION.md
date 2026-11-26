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
| Baseline | Explicit scoped evidence, fingerprint changes, unknown/inaccessible paths, nested package conventions, mixed legacy/current and actual dirty/untracked evidence; no claim that a sampled hash proves repository-wide freshness |
| Practices | Catalog integrity (138 IDs), explicit facet resolution, unknown/conflict handling, actual agent uses only applicable practices after baseline |
| Native enforcement | Existing CI lint/typecheck/build/dist parity, actual package consumer, opt-in typed profile and representative real host adoption |
| Intelligence | Separately configured approved CLI or MCP, root/version/coverage validation, stale/unavailable fallback, no simultaneous duplicate OMP policy extensions |
| Performance | Same tokenizer and workload for baseline and candidate; measured token and latency budget agreed before comparative evaluation, including opt-in tool schemas |
| Independent evaluation | Matched external study with complete independent evidence, no critical false passes, owner-approved thresholds met |
| Release | Exact final head CI, live OMP on macOS and Linux/WSL, Ponytail on/off, session switching, rollback, owner approval |

Do not interpret green unit CI, a mock host API, fixture canaries, sampled evidence or supplied scores as live compatibility or complete release acceptance.
