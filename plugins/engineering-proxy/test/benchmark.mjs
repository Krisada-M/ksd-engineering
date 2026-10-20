import { performance } from "node:perf_hooks";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { KsdRuntime } from "../dist/runtime.js";
import { loadConfig } from "../config.js";
import { buildPolicy } from "../policy.js";

const iterations = 3000;
const rounds = 20;
const dir = mkdtempSync(join(tmpdir(), "ksd-ts-hotpath-"));

try {
  mkdirSync(join(dir, ".git"));
  writeFileSync(join(dir, ".engineering-proxy.json"), '{"enabled":true,"enforcement":"balanced"}');

  const noopUi = { theme: { fg: (_tone, dot) => dot }, setStatus() {} };
  const context = { cwd: dir, ui: noopUi };
  const runtime = new KsdRuntime(loadConfig, buildPolicy, () => false);
  runtime.getConfig(dir, true);
  runtime.getPolicy({ ...runtime.getConfig(dir), enforcement: "balanced" });

  function naiveReference() {
    const config = loadConfig(dir);
    const label = config.enabled ? "○ 🛡 KSD: BALANCED" : undefined;
    noopUi.setStatus("engineering-proxy", label);
    buildPolicy(config);
  }

  function optimized() {
    runtime.syncStatus(context, false, "balanced");
    runtime.getPolicy(runtime.getConfig(dir));
  }

  const percentile = (samples, p) => {
    const sorted = [...samples].sort((a, b) => a - b);
    return sorted[Math.ceil(sorted.length * p / 100) - 1];
  };

  for (const [name, invoke] of [["Uncached reference", naiveReference], ["In-process TS cache", optimized]]) {
    const samples = [];
    for (let n = 0; n < rounds + 3; n++) {
      const start = performance.now();
      for (let i = 0; i < iterations; i++) invoke();
      const elapsed = performance.now() - start;
      if (n >= 3) samples.push(elapsed);
    }

    process.stdout.write(name + " | p50=" + percentile(samples, 50).toFixed(3)
      + "ms p95=" + percentile(samples, 95).toFixed(3)
      + "ms for " + iterations + " synthetic hot-path events\n");
  }

  process.stdout.write("Illustrative in-process benchmark only: excludes OMP, I/O changes between turns, agents and LLM latency. No speedup is asserted from this benchmark alone.\n");
} finally {
  rmSync(dir, { force: true, recursive: true });
}
