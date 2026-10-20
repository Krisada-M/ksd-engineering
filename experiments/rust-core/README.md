# Experimental Rust Quality Core (opt-in, NOT default)

This crate is an isolated proof of concept for deterministic changed-line ESLint diagnostic filtering. It **does not replace** the JavaScript OMP extension and does not run on agent lifecycle events. The current KSD plugin has no mandatory Rust runtime dependency. The existing read-only style checker supports an **explicit** `--engine rust` selection; JavaScript remains the default.

## What it does

- Reads JSON from stdin: `{"patch":"<unified diff>","eslintReport":[...],"cwd":"/absolute/repo/root"}`.
- Reports matching changed-line diagnostics as JSON on stdout, with statuses `PASS`, `WARN`, `FIX_REQUIRED`, `NOT_RUN` or `NOT_APPLICABLE`.
- Uses only input data: no Git commands, network, file writes, repository modification, or Ponytail interaction.
- Rejects invalid diff paths, oversized hunks, malformed input and stdin above 8 MiB. Output errors use exit code 2.
- Dependencies: MIT/Apache-friendly crates `serde` and `serde_json`; no paid libraries.

## Build and verify (requires Rust toolchain)

```sh
cargo test --locked --manifest-path experiments/rust-core/Cargo.toml
cargo build --locked --manifest-path experiments/rust-core/Cargo.toml
node experiments/rust-core/tests/parity.mjs
node experiments/rust-core/tests/cli-bridge.mjs
node experiments/rust-core/tests/benchmark.mjs
node experiments/rust-core/tests/bridge-benchmark.mjs
```

To use the native checker explicitly after building the crate:

```sh
node plugins/engineering-proxy/check-changed.js --diff changes.patch --eslint-report eslint.json --engine rust
```

For a nondefault build location set `KSD_RUST_CORE_BIN` to the native executable's absolute path. The wrapper invokes the executable directly with `shell:false`, a timeout, a bounded output buffer and response/exit-code validation. **If the binary is missing or produces malformed output, the explicit Rust command fails with NOT_RUN (exit 2) rather than silently passing.** To use the unchanged JavaScript checker, omit `--engine rust`. Do not use this mode as a required repository gate until the platform parity and performance checks are approved.

Exit code: 0 = clean, warning or not applicable; 1 = changed-line error; 2 = not run/invalid input. The existing JS checker remains authoritative until parity on a representative repository corpus has been achieved and approved.

## Verified CI benchmark (2026-10-20)

GitHub Actions run `39391656112` (Ubuntu, 20 samples, 100 synthetic changed files):

| Execution path | p50 | p95 |
| --- | ---: | ---: |
| Rust binary directly | 20.27 ms | 21.69 ms |
| Fresh Node JS process directly | 31.63 ms | 33.80 ms |
| Actual KSD JS CLI default | 33.36 ms | 35.04 ms |
| Actual KSD JS CLI → Rust sidecar | 54.53 ms | 57.06 ms |

**Decision:** Keep JavaScript as the default. The native Rust implementation is faster when invoked directly, but its current **Node → Rust child-process bridge is slower** at the tested workload. This is not evidence of an OMP end-user speedup. The JS and Rust diagnostic outputs matched across nine parity fixtures; real-world corpus parity and Mac/WSL hardware benchmarks are still pending.

The benchmark measures **fresh-process end-to-end latency** on identical JSON input for both Rust and Node (with 100 synthetic changed source files). It does **not** isolate parser runtime, memory, tool-call time, actual repo editing latency or workload cache effects. Compare both p50 and p95 on the deployment machines and capture memory separately.

## Acceptance criteria before runtime opt-in

1. GitHub CI: Rust unit tests, JS/Rust fixture parity and process benchmark complete.
2. Validate against real TypeScript/TSX monorepo changes, renamed files, binary diffs, malformed JSON and high-volume input.
3. Record cold-start overhead, p50/p95 and peak RSS on actual Apple Silicon macOS and WSL2 x86_64.
4. Confirm no change to diagnostics, security gates, error handling or Ponytail/OMP integration.
5. Keep Rust explicit-only until owner approves production rollout. A missing binary must fail the explicit Rust request; the JavaScript default must remain available and unchanged.
6. Require owner sign-off before promoting the Rust engine to the default.

This is a research-quality isolated sidecar. A green benchmark alone does not establish that switching production code to Rust improves OMP performance.
