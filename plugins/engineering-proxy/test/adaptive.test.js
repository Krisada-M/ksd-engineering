import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import createExtension, { parseEngineeringCommand, resolveSessionMode } from "../index.js";
import { loadConfig } from "../config.js";
import { augmentSystemPrompt, buildPolicy, POLICY_MARKER } from "../policy.js";
import { SDLC_PHASES, buildSdlcPolicy } from "../sdlc.js";

function rig() {
  const events = new Map();
  const commands = new Map();
  const entries = [];
  const notices = [];
  const statuses = [];
  const pi = {
    setLabel() {},
    on(name, callback) { events.set(name, callback); },
    registerCommand(name, entry) { commands.set(name, entry); },
    appendEntry(type, data) { entries.push({ type: "custom", customType: type, data }); },
    getCommands() { return [{ name: "ponytail" }]; },
    sendUserMessage() {},
  };
  createExtension(pi);
  const ctx = dir => ({
    cwd: dir,
    sessionManager: { getBranch: () => entries },
    ui: {
      notify: (...args) => notices.push(args),
      setStatus: (...args) => statuses.push(args),
    },
  });

  return { pi, events, commands, entries, notices, statuses, ctx };
}

async function temp(fn) {
  const dir = mkdtempSync(join(tmpdir(), "ksd-adaptive-"));
  try {
    mkdirSync(join(dir, ".git"));

    return await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("mode parser accepts status, balanced and adaptive, rejects extras", () => {
  assert.deepEqual(parseEngineeringCommand(""), { type: "status" });
  assert.deepEqual(parseEngineeringCommand(" status "), { type: "status" });
  assert.deepEqual(parseEngineeringCommand(" ADAPTIVE "), { type: "set-mode", mode: "adaptive" });
  assert.deepEqual(parseEngineeringCommand("balanced"), { type: "set-mode", mode: "balanced" });
  assert.deepEqual(parseEngineeringCommand("adaptive please"), { type: "invalid" });
});

test("repo config accepts adaptive, rejects unsupported and malformed values", () => temp(dir => {
  writeFileSync(join(dir, ".engineering-proxy.json"), JSON.stringify({ enforcement: "adaptive" }));
  assert.equal(loadConfig(dir).enforcement, "adaptive");

  writeFileSync(join(dir, ".engineering-proxy.json"), JSON.stringify({ enforcement: "ultra" }));
  assert.equal(loadConfig(dir).enabled, false);
  assert.match(loadConfig(dir).configError, /Invalid/);
}));

test("adaptive command updates status and policy immediately, with no Ponytail mutation", async () => temp(async dir => {
  const h = rig();
  const ctx = h.ctx(dir);
  h.events.get("session_start")({}, ctx);
  await h.commands.get("engineering-proxy").handler("adaptive", ctx);

  assert.equal(h.entries.at(-1).customType, "engineering-proxy-mode");
  assert.equal(h.entries.at(-1).data.mode, "adaptive");
  assert.deepEqual(h.statuses.at(-1), ["engineering-proxy", "○ 🛡 KSD: ADAPTIVE"]);

  const event = { systemPromptOptions: { sections: { ponytail: "Ponytail preserved" } } };
  h.events.get("before_agent_start")(event, ctx);
  assert.match(event.systemPromptOptions.sections["engineering-proxy"], /flat by default/i);
  assert.match(event.systemPromptOptions.sections["engineering-proxy"], /SDLC workflow/);
  assert.equal(event.systemPromptOptions.sections.ponytail, "Ponytail preserved");

  await h.commands.get("engineering-proxy").handler("balanced", ctx);
  h.events.get("before_agent_start")(event, ctx);
  assert.match(event.systemPromptOptions.sections["engineering-proxy"], /Balanced Clean Code/);
  assert.doesNotMatch(event.systemPromptOptions.sections["engineering-proxy"], /Adaptive Clean Code/);
  assert.deepEqual(h.statuses.at(-1), ["engineering-proxy", "○ 🛡 KSD: BALANCED"]);
}));

test("mode restores on session resume and falls back to repo default", async () => temp(async dir => {
  writeFileSync(join(dir, ".engineering-proxy.json"), JSON.stringify({ enforcement: "adaptive" }));
  const h = rig();
  const ctx = h.ctx(dir);
  h.events.get("session_start")({}, ctx);
  assert.deepEqual(h.statuses.at(-1), ["engineering-proxy", "○ 🛡 KSD: ADAPTIVE"]);

  await h.commands.get("engineering-proxy").handler("balanced", ctx);
  h.events.get("session_switch")({}, ctx);
  assert.deepEqual(h.statuses.at(-1), ["engineering-proxy", "○ 🛡 KSD: BALANCED"]);
  assert.deepEqual(resolveSessionMode(h.entries, "adaptive"), "balanced");

  h.entries.length = 0;
  h.events.get("session_tree")({}, ctx);
  assert.deepEqual(h.statuses.at(-1), ["engineering-proxy", "○ 🛡 KSD: ADAPTIVE"]);
}));

test("malformed persisted session entries cannot activate a third mode", () => {
  const entries = [
    { type: "custom", customType: "engineering-proxy-mode", data: { mode: "ultra" } },
    { type: "custom", customType: "ponytail-mode", data: { mode: "off" } },
  ];
  assert.equal(resolveSessionMode(entries, "adaptive"), "adaptive");
  assert.equal(resolveSessionMode(null, "bad"), "balanced");
});

test("invalid args and disabled plugin cannot mutate current mode", async () => temp(async dir => {
  const h = rig();
  const ctx = h.ctx(dir);
  h.events.get("session_start")({}, ctx);
  await h.commands.get("engineering-proxy").handler("full", ctx);
  assert.equal(h.entries.length, 0);
  assert.match(h.notices.at(-1)[0], /Usage:/);

  writeFileSync(join(dir, ".engineering-proxy.json"), JSON.stringify({ enabled: false }));
  await h.commands.get("engineering-proxy").handler("adaptive", ctx);
  assert.equal(h.entries.length, 0);
  assert.match(h.notices.at(-1)[0], /disabled/);
  assert.equal(h.statuses.at(-1)[1], "○ 🛡 KSD: BALANCED");
  h.events.get("agent_start")({}, ctx);
  assert.equal(h.statuses.at(-1)[1], undefined);
}));

test("mode remains usable when OMP session persistence API is absent", async () => temp(async dir => {
  const h = rig();
  delete h.pi.appendEntry;
  const ctx = h.ctx(dir);
  await h.commands.get("engineering-proxy").handler("adaptive", ctx);
  assert.deepEqual(h.statuses.at(-1), ["engineering-proxy", "○ 🛡 KSD: ADAPTIVE"]);
  assert.match(h.notices.at(-1)[0], /runtime only/);
}));

test("string and array prompt fallbacks replace KSD policy without duplicates", () => {
  const balanced = buildPolicy();
  const adaptive = buildPolicy({ enforcement: "adaptive" });

  const str = augmentSystemPrompt({ systemPrompt: "Base prompt" }, balanced).systemPrompt;
  const replaced = augmentSystemPrompt({ systemPrompt: str }, adaptive).systemPrompt;
  assert.equal(replaced.split(POLICY_MARKER).length - 1, 1);
  assert.match(replaced, /Adaptive Clean Code/);
  assert.doesNotMatch(replaced, /Balanced Clean Code/);
  assert.match(replaced, /^Base prompt/);

  const arr = augmentSystemPrompt({ systemPrompt: ["Base", balanced, "Other extension"] }, adaptive).systemPrompt;
  assert.deepEqual(arr, ["Base", adaptive, "Other extension"]);
  assert.equal(augmentSystemPrompt({ systemPrompt: arr }, adaptive), undefined);
});

test("SDLC policy covers all stages and scales gates by risk", () => {
  assert.deepEqual(SDLC_PHASES, ["Requirements", "Design", "Implementation", "Verification", "Delivery"]);
  for (const phase of SDLC_PHASES) {
    assert.match(buildSdlcPolicy({ mode: "adaptive" }), new RegExp(phase));
  }
  assert.match(buildSdlcPolicy({ mode: "adaptive" }), /auth, payments, migrations/);
  assert.match(buildSdlcPolicy({ mode: "adaptive" }), /lightest sufficient/);
  assert.throws(() => buildSdlcPolicy({ mode: "ultra" }), /Invalid/);
});

test("previous-version policy in array is replaced, never duplicated", () => {
  const oldPolicy = "[Engineering Proxy Policy v0.1] legacy rules";
  const newPolicy = buildPolicy({ enforcement: "adaptive" });
  const result = augmentSystemPrompt({ systemPrompt: ["Base", oldPolicy, "ponytail"] }, newPolicy);
  assert.deepEqual(result.systemPrompt, ["Base", newPolicy, "ponytail"]);
});

test("previous-version string policy without end marker is not destructively replaced", () => {
  const legacy = "Base prompt\n\n[Engineering Proxy Policy v0.1] old rules with unknown tail";
  assert.equal(augmentSystemPrompt({ systemPrompt: legacy }, buildPolicy({ enforcement: "adaptive" })), undefined);
  assert.doesNotMatch(legacy, /Adaptive Clean Code/);
});
