import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { inspectChangedScope } from "../../../plugins/engineering-proxy/change-scope.js";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const binary = process.env.KSD_RUST_CORE_BIN ?? resolve(root, "target/debug/ksd-rust-quality");
const cwd = "/tmp/ksd-parity";

const cases = [
  {
    name: "clean changed file",
    patch: "diff --git a/src/a.ts b/src/a.ts\n+++ b/src/a.ts\n@@ -0,0 +1,2 @@\n+x\n+y\n",
    eslintReport: [{ filePath: cwd + "/src/a.ts", messages: [] }],
  },
  {
    name: "error on changed line, legacy issue ignored",
    patch: "+++ b/src/a.ts\n@@ -2,0 +3,2 @@\n+x\n+y\n",
    eslintReport: [{ filePath: cwd + "/src/a.ts", messages: [
      { line: 3, severity: 2, ruleId: "ksd/rule", message: "New error" },
      { line: 100, severity: 2, ruleId: "legacy", message: "Old error" },
    ] }],
  },
  {
    name: "nearby boundary warning",
    patch: "+++ b/src/a.ts\n@@ -0,0 +5 @@\n+x\n",
    eslintReport: [{ filePath: cwd + "/src/a.ts", messages: [
      { line: 6, severity: 1, ruleId: "ksd/blank-between-functions", message: "Missing gap" },
    ] }],
  },
  {
    name: "missing ESLint coverage",
    patch: "+++ b/src/a.ts\n@@ -0,0 +1 @@\n+x\n",
    eslintReport: [],
  },
  {
    name: "fatal parser failure independent of changed line",
    patch: "+++ b/src/a.ts\n@@ -0,0 +1 @@\n+x\n",
    eslintReport: [{ filePath: cwd + "/src/a.ts", messages: [
      { line: 999, fatal: true, severity: 2, message: "Parsing error", ruleId: null },
    ] }],
  },
  {
    name: "two source files in order",
    patch: "diff --git a/src/a.ts b/src/a.ts\n+++ b/src/a.ts\n@@ -0,0 +1 @@\n+x\n"
      + "diff --git a/src/b.tsx b/src/b.tsx\n+++ b/src/b.tsx\n@@ -0,0 +2 @@\n+y\n",
    eslintReport: [
      { filePath: cwd + "/src/a.ts", messages: [] },
      { filePath: cwd + "/src/b.tsx", messages: [] },
    ],
  },
  {
    name: "deletion-only diff",
    patch: "+++ b/src/a.ts\n@@ -2,2 +2,0 @@\n-x\n",
    eslintReport: [],
  },
  {
    name: "documentation-only diff",
    patch: "+++ b/README.md\n@@ -0,0 +1 @@\n+text\n",
    eslintReport: [],
  },
  {
    name: "multiple hunks of same file",
    patch: "+++ b/src/a.ts\n@@ -1,0 +2,1 @@\n+a\n@@ -9,0 +11,1 @@\n+b\n",
    eslintReport: [{ filePath: cwd + "/src/a.ts", messages: [
      { line: 2, severity: 1, ruleId: "a", message: "First" },
      { line: 11, severity: 2, ruleId: "b", message: "Second" },
    ] }],
  },
];

function comparable(data) {
  const { status, checkedFiles, missingFiles, diagnostics } = data;
  return { status, checkedFiles, missingFiles, diagnostics };
}

for (const sample of cases) {
  const expected = inspectChangedScope(sample.patch, sample.eslintReport, { cwd });
  const proc = spawnSync(binary, {
    input: JSON.stringify({ patch: sample.patch, eslintReport: sample.eslintReport, cwd }),
    encoding: "utf8",
    timeout: 10_000,
    maxBuffer: 5 * 1024 * 1024,
  });
  if (proc.error) throw proc.error;

  assert.equal(
    proc.status,
    expected.status === "FIX_REQUIRED" ? 1 : expected.status === "NOT_RUN" ? 2 : 0,
    sample.name + ": Rust CLI exit " + proc.status + ": " + proc.stderr,
  );
  const actual = JSON.parse(proc.stdout);
  assert.deepEqual(comparable(actual), comparable(expected), sample.name);
  process.stdout.write("PASS JS/Rust parity: " + sample.name + "\n");
}

process.stdout.write("PASS: " + cases.length + " independent JS/Rust parity fixtures\n");
