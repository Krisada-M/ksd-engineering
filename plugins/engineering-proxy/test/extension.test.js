import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import createExtension from "../index.js";
import { augmentSystemPrompt, buildPolicy, POLICY_MARKER } from "../policy.js";
import { loadConfig, findProjectRoot } from "../config.js";

function harness(commandNames = ["ponytail"]) {
  const events = new Map();
  const commands = new Map();
  const sent = [];
  const notices = [];
  const pi = {
    setLabel(label) { this.label = label; },
    on(event, fn) { events.set(event, fn); },
    registerCommand(name, entry) { commands.set(name, entry); },
    getCommands() { return commandNames.map(name => ({ name })); },
    sendUserMessage(message, options) { sent.push({ message, options }); },
  };
  createExtension(pi);
  const ctx = (cwd, idle = true) => ({ cwd, isIdle: () => idle, ui: { notify: (...args) => notices.push(args) } });
  return { events, commands, sent, notices, pi, ctx };
}

test("namespace does not collide with Ponytail commands or modes", () => {
  const h = harness();
  assert.deepEqual([...h.commands.keys()], ["engineering-proxy", "engineering-review"]);
  assert.deepEqual([...h.events.keys()], ["before_agent_start"]);
});

test("structured sections preserve Ponytail and are stable on repeated hooks", () => {
  const h = harness();
  const dir = mkdtempSync(join(tmpdir(), "engineering-proxy-"));
  try {
    const e = { systemPromptOptions: { sections: { ponytail: "Ponytail full rules" } } };
    h.events.get("before_agent_start")(e, h.ctx(dir));
    const original = e.systemPromptOptions.sections["engineering-proxy"];
    h.events.get("before_agent_start")(e, h.ctx(dir));
    assert.equal(e.systemPromptOptions.sections.ponytail, "Ponytail full rules");
    assert.equal(e.systemPromptOptions.sections["engineering-proxy"], original);
    assert.match(original, /Ponytail owns YAGNI/i);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("array fallback preserves all existing policy parts and avoids duplicates", () => {
  const policy = buildPolicy();
  const start = { systemPrompt: ["base", "Ponytail instructions"] };
  const out = augmentSystemPrompt(start, policy);
  assert.deepEqual(out.systemPrompt, ["base", "Ponytail instructions", policy]);
  assert.equal(augmentSystemPrompt({ systemPrompt: out.systemPrompt }, policy), undefined);
});

test("string fallback preserves existing policy and avoids duplicates", () => {
  const policy = buildPolicy();
  const result = augmentSystemPrompt({ systemPrompt: "base Ponytail" }, policy);
  assert.equal(result.systemPrompt.split(POLICY_MARKER).length - 1, 1);
  assert.equal(augmentSystemPrompt({ systemPrompt: result.systemPrompt }, policy), undefined);
});

test("works when Ponytail is absent", async () => {
  const h = harness([]);
  const dir = mkdtempSync(join(tmpdir(), "engineering-proxy-"));
  try {
    await h.commands.get("engineering-proxy").handler("", h.ctx(dir));
    assert.match(h.notices[0][0], /not detected\/unknown/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("off mode in per-repo config prevents injection", () => {
  const dir = mkdtempSync(join(tmpdir(), "engineering-proxy-"));
  try {
    mkdirSync(join(dir, ".git"));
    writeFileSync(join(dir, ".engineering-proxy.json"), JSON.stringify({ enabled: false }));
    const h = harness();
    const event = { systemPromptOptions: { sections: { ponytail: "still on" } } };
    assert.equal(h.events.get("before_agent_start")(event, h.ctx(dir)), undefined);
    assert.equal(event.systemPromptOptions.sections["engineering-proxy"], undefined);
    assert.equal(event.systemPromptOptions.sections.ponytail, "still on");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("findProjectRoot respects nested cwd and local policy", () => {
  const dir = mkdtempSync(join(tmpdir(), "engineering-proxy-"));
  try {
    mkdirSync(join(dir, ".git"));
    mkdirSync(join(dir, "src"));
    writeFileSync(join(dir, ".engineering-proxy.json"), JSON.stringify({ enabled: false, enforcement: "balanced" }));
    assert.equal(findProjectRoot(join(dir, "src")), dir);
    assert.equal(loadConfig(join(dir, "src")).enabled, false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("malformed JSON disables policy with explicit warning rather than crashing", () => {
  const dir = mkdtempSync(join(tmpdir(), "engineering-proxy-"));
  try {
    mkdirSync(join(dir, ".git"));
    writeFileSync(join(dir, ".engineering-proxy.json"), "{ broken");
    const config = loadConfig(dir);
    assert.equal(config.enabled, false);
    assert.ok(config.configError);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("review only starts on explicit command, one request per trigger, and queues while busy", async () => {
  const h = harness(["ponytail"]);
  const dir = mkdtempSync(join(tmpdir(), "engineering-proxy-"));
  try {
    h.events.get("before_agent_start")({ systemPromptOptions: { sections: {} } }, h.ctx(dir));
    assert.equal(h.sent.length, 0);
    await h.commands.get("engineering-review").handler("apps/web/features/auth", h.ctx(dir, false));
    assert.equal(h.sent.length, 1);
    assert.match(h.sent[0].message, /apps\/web\/features\/auth/);
    assert.deepEqual(h.sent[0].options, { deliverAs: "followUp" });
  } finally { rmSync(dir, { recursive: true, force: true }); }
});


test("disabling the extension clears a previously attached structured policy, not Ponytail", () => {
  const dir = mkdtempSync(join(tmpdir(), "engineering-proxy-"));
  try {
    mkdirSync(join(dir, ".git"));
    const h = harness();
    const event = { systemPromptOptions: { sections: { ponytail: "full", "engineering-proxy": "stale" } } };
    writeFileSync(join(dir, ".engineering-proxy.json"), JSON.stringify({ enabled: false }));
    h.events.get("before_agent_start")(event, h.ctx(dir));
    assert.equal(event.systemPromptOptions.sections["engineering-proxy"], undefined);
    assert.equal(event.systemPromptOptions.sections.ponytail, "full");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("invalid per-repo config never silently enables guidance", () => {
  const dir = mkdtempSync(join(tmpdir(), "engineering-proxy-"));
  try {
    mkdirSync(join(dir, ".git"));
    writeFileSync(join(dir, ".engineering-proxy.json"), JSON.stringify({ enabled: "false" }));
    const h = harness();
    const event = { systemPromptOptions: { sections: {} } };
    h.events.get("before_agent_start")(event, h.ctx(dir));
    assert.equal(event.systemPromptOptions.sections["engineering-proxy"], undefined);
    assert.ok(loadConfig(dir).configError);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
