import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";

const crate = resolve(fileURLToPath(new URL("..", import.meta.url)));
const binary = process.env.KSD_RUST_CORE_BIN ?? resolve(crate, "target/debug/ksd-rust-quality");
const jsRunner = resolve(crate, "tests/js-runner.mjs");
const iterations = Number(process.env.KSD_BENCH_ITERATIONS || 20);

if (!Number.isInteger(iterations) || iterations < 5 || iterations > 1000) {
  throw new Error("KSD_BENCH_ITERATIONS must be an integer from 5 to 1000");
}

const cwd = "/tmp/ksd-bench";
let patch = "";
const eslintReport = [];
for (let file = 0; file < 100; file++) {
  const name = "src/sample" + file + ".ts";
  patch += "diff --git a/" + name + " b/" + name + "\n+++ b/" + name + "\n@@ -0,0 +1,10 @@\n";
  patch += "+x\n".repeat(10);
  eslintReport.push({ filePath: cwd + "/" + name, messages: [] });
}

const input = JSON.stringify({ patch, eslintReport, cwd });
const cases = [
  { name: "Node JS fresh process", command: process.execPath, args: [jsRunner] },
  { name: "Rust fresh process", command: binary, args: [] },
];

function percentile(numbers, percentileIndex) {
  const sorted = [...numbers].sort((a, b) => a - b);
  return sorted[Math.ceil((percentileIndex / 100) * sorted.length) - 1];
}

for (const variant of cases) {
  const samples = [];
  for (let n = 0; n < iterations + 3; n++) {
    const start = performance.now();
    const result = spawnSync(variant.command, variant.args, {
      input,
      encoding: "utf8",
      timeout: 20_000,
      maxBuffer: 1024 * 1024,
    });
    const duration = performance.now() - start;
    if (result.error) throw result.error;
    if (result.status !== 0) {
      throw new Error(variant.name + " failed: " + result.stderr);
    }
    if (JSON.parse(result.stdout).status !== "PASS") {
      throw new Error(variant.name + " produced an invalid result");
    }
    if (n >= 3) samples.push(duration);
  }

  process.stdout.write(variant.name + " | p50=" + percentile(samples, 50).toFixed(2)
    + "ms p95=" + percentile(samples, 95).toFixed(2) + "ms | "
    + iterations + " samples, including fresh process startup\n");
}

process.stdout.write("Benchmark is illustrative, NOT a speedup guarantee. Measure on actual macOS ARM64 and WSL x64 before rollout.\n");
