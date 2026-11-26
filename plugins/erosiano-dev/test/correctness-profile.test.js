import test from "node:test";
import assert from "node:assert/strict";
import { ESLint } from "eslint";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import profile from "../../../examples/eslint.correctness.config.mjs";

async function fixture(fn) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "erosiano-correctness-")));
  try {
    writeFileSync(join(root, "tsconfig.json"), JSON.stringify({ compilerOptions: { target: "ES2022", module: "ESNext", strict: true }, include: ["*.ts"] }));
    await fn(root);
  } finally { rmSync(root, { recursive: true, force: true }); }
}

test("optional profile detects real typed promise, unsafe assignment and exhaustiveness issues", async () => fixture(async root => {
  const bad = [
    "async function work(): Promise<void> {}",
    "export function unsafe(input: any, state: 'ready' | 'failed'): string {",
    "  work();",
    "  void work();",
    "  const value: string = input;",
    "  switch (state) { case 'ready': return value; }",
    "  return value;",
    "}",
  ].join("\n");
  const good = [
    "async function work(): Promise<void> {}",
    "export async function safe(input: unknown, state: 'ready' | 'failed'): Promise<string> {",
    "  await work();",
    "  const value = typeof input === 'string' ? input : '';",
    "  switch (state) { case 'ready': return value; case 'failed': return ''; }",
    "}",
  ].join("\n");
  writeFileSync(join(root, "bad.ts"), bad);
  writeFileSync(join(root, "good.ts"), good);
  const config = profile.map(entry => entry.languageOptions?.parserOptions?.projectService ? {
    ...entry, languageOptions: { ...entry.languageOptions, parserOptions: { ...entry.languageOptions.parserOptions, tsconfigRootDir: root } },
  } : entry);
  const eslint = new ESLint({ cwd: root, overrideConfigFile: true, overrideConfig: config });
  const [badResult, goodResult] = await eslint.lintFiles(["bad.ts", "good.ts"]);
  assert.equal(badResult.fatalErrorCount, 0, JSON.stringify(badResult.messages));
  const ids = badResult.messages.map(message => message.ruleId);
  assert.equal(ids.filter(id => id === "@typescript-eslint/no-floating-promises").length, 2);
  assert.ok(ids.includes("@typescript-eslint/no-unsafe-assignment"));
  assert.ok(ids.includes("@typescript-eslint/switch-exhaustiveness-check"));
  assert.equal(goodResult.errorCount, 0, JSON.stringify(goodResult.messages));
}));

test("optional common correctness rule catches unsafe finally in actual JS lint", async () => fixture(async root => {
  writeFileSync(join(root, "bad.js"), "export function unsafe() { try { return 1; } finally { return 2; } }");
  const eslint = new ESLint({ cwd: root, overrideConfigFile: true, overrideConfig: profile });
  const [result] = await eslint.lintFiles(["bad.js"]);
  assert.equal(result.fatalErrorCount, 0);
  assert.ok(result.messages.some(message => message.ruleId === "no-unsafe-finally" && message.severity === 2));
}));

test("compiler profile rejects unsafe indexing and absent-vs-undefined mismatch", async () => fixture(root => {
  const template = fileURLToPath(new URL("../../../examples/tsconfig.correctness.json", import.meta.url));
  writeFileSync(join(root, "tsconfig.json"), JSON.stringify({ extends: template, compilerOptions: { target: "ES2022", module: "ESNext" }, include: ["*.ts"] }));
  const tsc = fileURLToPath(new URL(import.meta.resolve("typescript/lib/tsc.js")));
  const run = () => spawnSync(process.execPath, [tsc, "--noEmit", "-p", join(root, "tsconfig.json")], { cwd: root, encoding: "utf8", timeout: 30000 });
  writeFileSync(join(root, "example.ts"), "export const x: number = [1][2]; export const y: { value?: number } = { value: undefined };");
  const bad = run();
  assert.notEqual(bad.status, 0);
  assert.match(bad.stdout, /TS2322/);
  assert.match(bad.stdout, /TS2375/);
  writeFileSync(join(root, "example.ts"), "export const x: number = [1][2] ?? 0; export const y: { value?: number } = {};");
  const good = run();
  assert.equal(good.status, 0, good.stdout + good.stderr);
}));
