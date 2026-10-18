import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";

const script = resolve(import.meta.dirname, "../check-changed.js");

function run(report) {
  const dir = mkdtempSync(join(tmpdir(), "ksd-cli-"));
  try {
    const patch = [
      "diff --git a/src/one.ts b/src/one.ts",
      "+++ b/src/one.ts",
      "@@ -0,0 +1,1 @@",
      "+export const x = 1;",
    ].join("\n");
    writeFileSync(join(dir, "diff.patch"), patch);
    writeFileSync(join(dir, "eslint.json"), JSON.stringify(report.map(r => ({
      filePath: join(dir, "src/one.ts"),
      messages: r.messages,
    }))));
    return spawnSync(process.execPath, [script, "--diff", "diff.patch", "--eslint-report", "eslint.json"], {
      cwd: dir,
      encoding: "utf8",
      timeout: 3000,
    });
  } finally {
    rmSync(dir, { force: true, recursive: true });
  }
}

test("real CLI exits 1 with changed-line errors", () => {
  const out = run([{ messages: [{ line: 1, severity: 2, ruleId: "ksd/blank-before-return", message: "missing blank line" }] }]);
  assert.equal(out.status, 1, out.stderr);
  assert.equal(JSON.parse(out.stdout).status, "FIX_REQUIRED");
});

test("real CLI reports NOT_RUN when no source file was linted", () => {
  const out = run([]);
  assert.equal(out.status, 2, out.stderr);
  assert.equal(JSON.parse(out.stdout).status, "NOT_RUN");
});

test("real CLI exits 0 but warns for suggestion-only diagnostics", () => {
  const out = run([{ messages: [{ line: 1, severity: 1, ruleId: "ksd/prefer-guard-clauses", message: "consider guard" }] }]);
  assert.equal(out.status, 0, out.stderr);
  assert.equal(JSON.parse(out.stdout).status, "WARN");
});
