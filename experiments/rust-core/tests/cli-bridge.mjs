import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const crate = resolve(fileURLToPath(new URL("..", import.meta.url)));
const cli = resolve(crate, "../../plugins/engineering-proxy/check-changed.js");
const native = resolve(crate, "target/debug/ksd-rust-quality");
const dir = mkdtempSync(join(tmpdir(), "ksd-native-cli-"));

function run(engine, eslintReport) {
  writeFileSync(join(dir, "eslint.json"), JSON.stringify(eslintReport));
  const argv = [cli, "--diff", "changes.patch", "--eslint-report", "eslint.json"];
  if (engine === "rust") argv.push("--engine", "rust");

  const result = spawnSync(process.execPath, argv, {
    cwd: dir,
    env: { ...process.env, KSD_RUST_CORE_BIN: native },
    encoding: "utf8",
    timeout: 15_000,
  });
  if (result.error) throw result.error;
  return { exit: result.status, stdout: result.stdout, stderr: result.stderr };
}

try {
  writeFileSync(join(dir, "changes.patch"), "+++ b/src/example.ts\n@@ -0,0 +1 @@\n+x\n");

  for (const messages of [
    [],
    [{ line: 1, severity: 1, ruleId: "ksd/guard", message: "warning" }],
    [{ line: 1, severity: 2, ruleId: "ksd/blank", message: "error" }],
  ]) {
    const report = [{ filePath: join(dir, "src/example.ts"), messages }];
    const js = run("js", report);
    const rust = run("rust", report);
    assert.equal(rust.exit, js.exit);
    assert.deepEqual(JSON.parse(rust.stdout), JSON.parse(js.stdout));
  }

  const js = run("js", []);
  const rust = run("rust", []);
  assert.equal(js.exit, 2);
  assert.equal(rust.exit, 2);
  assert.deepEqual(JSON.parse(rust.stdout), JSON.parse(js.stdout));

  process.stdout.write("PASS: CLI bridge parity in PASS/WARN/FIX_REQUIRED/NOT_RUN\n");
} finally {
  rmSync(dir, { recursive: true, force: true });
}
