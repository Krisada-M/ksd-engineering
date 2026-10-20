import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { performance } from "node:perf_hooks";

const crate = resolve(fileURLToPath(new URL("..", import.meta.url)));
const cli = resolve(crate, "../../plugins/engineering-proxy/check-changed.js");
const rustBinary = resolve(crate, "target/debug/ksd-rust-quality");
const count = Number(process.env.KSD_BENCH_ITERATIONS || 20);
if (!Number.isInteger(count) || count < 5 || count > 1000) {
  throw new Error("Expected 5 to 1000 benchmark iterations");
}

const dir = mkdtempSync(join(tmpdir(), "ksd-rust-bridge-benchmark-"));
try {
  mkdirSync(join(dir, "src"));
  let diff = "";
  const eslintReport = [];
  for (let i = 0; i < 100; i++) {
    const name = "src/sample-" + i + ".ts";
    diff += "diff --git a/" + name + " b/" + name + "\n+++ b/" + name
      + "\n@@ -0,0 +1,10 @@\n" + "+x\n".repeat(10);
    eslintReport.push({ filePath: join(dir, name), messages: [] });
  }
  writeFileSync(join(dir, "changes.patch"), diff);
  writeFileSync(join(dir, "eslint.json"), JSON.stringify(eslintReport));

  function percentile(values, p) {
    const sorted = [...values].sort((a, b) => a - b);
    return sorted[Math.ceil(sorted.length * p / 100) - 1];
  }

  for (const engine of ["js", "rust"]) {
    const times = [];
    for (let n = 0; n < count + 3; n++) {
      const args = [cli, "--diff", "changes.patch", "--eslint-report", "eslint.json"];
      if (engine === "rust") args.push("--engine", "rust");

      const start = performance.now();
      const result = spawnSync(process.execPath, args, {
        cwd: dir,
        env: { ...process.env, KSD_RUST_CORE_BIN: rustBinary },
        encoding: "utf8",
        timeout: 20_000,
        maxBuffer: 1024 * 1024,
      });
      const duration = performance.now() - start;
      if (result.error) throw result.error;
      if (result.status !== 0 || JSON.parse(result.stdout).status !== "PASS") {
        throw new Error("CLI " + engine + " failed: " + result.stderr);
      }
      if (n >= 3) times.push(duration);
    }

    process.stdout.write("KSD CLI " + engine + " | p50=" + percentile(times, 50).toFixed(2)
      + "ms p95=" + percentile(times, 95).toFixed(2) + "ms ("
      + count + " runs, 100 synthetic changed files)\n");
  }

  process.stdout.write("Results include Node CLI startup and Rust child-process spawning. No end-user performance claim.\n");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
