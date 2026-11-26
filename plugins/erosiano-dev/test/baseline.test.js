import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectBaselineEvidence, ScopedBaselineCache, summarizeBaselineEvidence } from "../baseline.js";

function fixture(fn) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "erosiano-baseline-")));
  try {
    mkdirSync(join(root, ".git", "refs", "heads"), { recursive: true });
    writeFileSync(join(root, ".git", "HEAD"), "ref: refs/heads/main\n");
    writeFileSync(join(root, ".git", "refs", "heads", "main"), "a".repeat(40) + "\n");
    mkdirSync(join(root, "apps", "web"), { recursive: true });
    writeFileSync(join(root, "AGENTS.md"), "Use the actual baseline");
    writeFileSync(join(root, "apps", "web", "package.json"), '{"name":"web"}');
    writeFileSync(join(root, "apps", "web", "main.ts"), "export const value = 1;");
    writeFileSync(join(root, "apps", "web", ".env"), "PRIVATE_SECRET=never-output");
    fn(root);
  } finally { rmSync(root, { recursive: true, force: true }); }
}

test("baseline evidence is scoped, hashes bytes, and does not expose secret or source contents", () => fixture(root => {
  const result = collectBaselineEvidence({ root, scope: "apps/web" });
  assert.equal(result.coverage, "SAMPLED_EVIDENCE_ONLY");
  assert.equal(result.revision.branch, "refs/heads/main");
  assert.equal(result.cacheable, true);
  assert.ok(result.evidence.some(item => item.path === "AGENTS.md" && item.role === "instruction"));
  assert.ok(result.evidence.some(item => item.path.endsWith("package.json") && item.role === "tooling"));
  assert.ok(result.evidence.some(item => item.path.endsWith("main.ts") && item.sha256.length === 64));
  assert.doesNotMatch(JSON.stringify(result), /never-output|export const value|\.env/);
}));

test("cache invalidates on same-size source edits, new sibling, branch changes and instruction edits", () => fixture(root => {
  const cache = new ScopedBaselineCache();
  const input = { root, scope: "apps/web" };
  assert.equal(cache.capture(input).freshness, "NEW_OR_INCOMPLETE_EVIDENCE");
  assert.equal(cache.capture(input).freshness, "MATCHED_SCOPED_EVIDENCE");
  writeFileSync(join(root, "apps", "web", "main.ts"), "export const value = 2;");
  assert.equal(cache.capture(input).freshness, "NEW_OR_INCOMPLETE_EVIDENCE");
  writeFileSync(join(root, "apps", "web", "new.ts"), "export const next = 3;");
  assert.equal(cache.capture(input).freshness, "NEW_OR_INCOMPLETE_EVIDENCE");
  writeFileSync(join(root, "AGENTS.md"), "New instructions");
  assert.equal(cache.capture(input).freshness, "NEW_OR_INCOMPLETE_EVIDENCE");
  writeFileSync(join(root, ".git", "refs", "heads", "main"), "b".repeat(40));
  assert.equal(cache.capture(input).freshness, "NEW_OR_INCOMPLETE_EVIDENCE");
  cache.clear();
  assert.equal(cache.capture(input).freshness, "NEW_OR_INCOMPLETE_EVIDENCE");
}));

test("outside, secret and symlink scopes are rejected; symlink evidence never followed", () => fixture(root => {
  symlinkSync(join(root, "apps", "web", "main.ts"), join(root, "alias.ts"));
  assert.throws(() => collectBaselineEvidence({ root, scope: "../" }), /outside/);
  assert.throws(() => collectBaselineEvidence({ root, scope: "alias.ts" }), /symlinked/);
  assert.throws(() => collectBaselineEvidence({ root, scope: "apps/web/.env" }), /Excluded/);
  const result = collectBaselineEvidence({ root });
  assert.ok(!result.evidence.some(item => item.path === "alias.ts"));
}));

test("oversize and unknown Git metadata cannot produce a freshness match", () => fixture(root => {
  writeFileSync(join(root, "apps", "web", "huge.ts"), Buffer.alloc(150 * 1024));
  const cache = new ScopedBaselineCache();
  const input = { root, scope: "apps/web" };
  assert.equal(cache.capture(input).cacheable, false);
  assert.equal(cache.capture(input).freshness, "NEW_OR_INCOMPLETE_EVIDENCE");
  rmSync(join(root, ".git"), { recursive: true, force: true });
  writeFileSync(join(root, ".git"), "gitdir: /untrusted/outside");
  const record = cache.capture(input);
  assert.equal(record.revision.status, "unknown");
  assert.match(summarizeBaselineEvidence(record), /not all dirty\/untracked files/);
}));
