#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { inspectChangedScope } from "./change-scope.js";

const KNOWN_STATUSES = new Set(["PASS", "WARN", "FIX_REQUIRED", "NOT_RUN", "NOT_APPLICABLE"]);

function inspectWithRust(patch, eslintReport) {
  const defaultBinary = fileURLToPath(new URL("../../experiments/rust-core/target/debug/ksd-rust-quality", import.meta.url));
  const binary = process.env.KSD_RUST_CORE_BIN || defaultBinary;

  if (!existsSync(binary)) {
    throw new Error("Rust core binary unavailable; run the JS default checker instead");
  }

  const execution = spawnSync(binary, [], {
    input: JSON.stringify({ patch, eslintReport, cwd: process.cwd() }),
    encoding: "utf8",
    shell: false,
    timeout: 15_000,
    maxBuffer: 12 * 1024 * 1024,
  });
  if (execution.error || execution.signal) {
    throw new Error("Rust core failed: " + (execution.error?.message || execution.signal));
  }

  if (![0, 1, 2].includes(execution.status) || !execution.stdout?.trim()) {
    throw new Error("Rust core returned no valid result: " + (execution.stderr || execution.status));
  }

  const result = JSON.parse(execution.stdout);
  if (!result || !KNOWN_STATUSES.has(result.status)
    || !Array.isArray(result.checkedFiles) || !Array.isArray(result.missingFiles)
    || !Array.isArray(result.diagnostics)) {
    throw new Error("Rust core response does not match the quality-check contract");
  }

  const expectedCode = result.status === "FIX_REQUIRED" ? 1 : result.status === "NOT_RUN" ? 2 : 0;
  if (execution.status !== expectedCode) {
    throw new Error("Rust core status and exit code disagree");
  }

  return result;
}

function main(args) {
  const withEngine = args.length === 6 && args[4] === "--engine";
  const valid = (args.length === 4 || withEngine) && args[0] === "--diff" && args[2] === "--eslint-report";
  if (!valid) {
    throw new Error("Usage: node check-changed.js --diff git.patch --eslint-report eslint.json [--engine js|rust]");
  }

  const engine = withEngine ? args[5] : "js";
  if (!["js", "rust"].includes(engine)) {
    throw new Error("Engine must be js or rust");
  }

  const patch = readFileSync(resolve(args[1]), "utf8");
  const report = JSON.parse(readFileSync(resolve(args[3]), "utf8"));
  const result = engine === "rust" ? inspectWithRust(patch, report) : inspectChangedScope(patch, report);
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");

  if (result.status === "FIX_REQUIRED") process.exitCode = 1;
  if (result.status === "NOT_RUN") process.exitCode = 2;
}

try {
  main(process.argv.slice(2));
} catch (error) {
  process.stderr.write("KSD style check NOT RUN: " + error.message + "\n");
  process.exitCode = 2;
}
