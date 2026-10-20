# Rust Quality Core — Migration Proposal (not implemented)

KSD v0.3 continues to run as a JavaScript OMP extension. OMP lifecycle hooks, commands, prompt sections, and TUI status belong in that lightweight adapter. **Rewriting those parts in Rust is not expected to speed up LLM inference or tool execution.**

## Candidate Rust responsibilities

- Parse TypeScript/JavaScript AST and evaluate deterministic changed-line style diagnostics.
- Read already-collected Git diff and lint reports without executing arbitrary commands.
- Compute structured review evidence summaries; never classify an unverified claim as proof.

The API boundary should be an optional versioned, read-only JSON request/response over stdin/stdout. Use a Rust CLI sidecar invoked **only for explicit checks**, not on every editor event or status refresh. The JavaScript checker remains the fallback until parity is proven.

## Required checks before rollout

1. Record a representative corpus of real local code changes (small UI, medium API, large monorepo, malformed code, nested if/else, TSX, deletion-only diffs).
2. Run the same diagnostic truth set through current JavaScript and candidate Rust. Diff all findings; investigate every rule mismatch and false positive before speed claims.
3. Measure warm processing time, cold-start/process-spawn overhead, p50/p95 wall time, peak RSS, and end-to-end OMP user-perceived latency on actual hardware.
4. Compare build/package size and maintenance overhead against actual saved time. Rust adoption is conditional on meaningful end-to-end benefit, not only microbenchmarks.
5. Produce/test signed or checksummed builds for macOS arm64 (Apple Silicon) and Linux x86_64 (WSL); also validate failure fallback when the binary is missing or incompatible.
6. Preserve process isolation: no network, no shell interpolation, no DB mutation, only authorized read-only input paths, bounded input size, explicit timeout and exit codes.
7. Deploy behind an opt-in feature switch; keep compatibility tests for KSD, Ponytail and OMP. Require owner approval before making Rust the default.

Open-source parser candidates may be evaluated (e.g. Oxc or tree-sitter), but none is selected or added as a dependency yet.

## Non-goals

- Rewriting OMP or Ponytail internals.
- Rust as a replacement for engineering judgment, SDLC review or agent reasoning.
- Claiming faster execution before representative benchmarks.
- Shipping mandatory native binaries to every user without platform coverage and a rollback path.
