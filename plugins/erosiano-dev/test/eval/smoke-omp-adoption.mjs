// Explicit, isolated real-host adoption test: local marketplaces, pinned legacy and Ponytail sources.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { createRpc, isolatedEnvironment, verifyCommandCatalog } from "./smoke-omp.mjs";
import { startFixture } from "./smoke-omp-prompt.mjs";

const CANDIDATE = fileURLToPath(new URL("../../../../", import.meta.url));
const LEGACY_ID = "engineering-proxy@engineering-proxy";
const CURRENT_ID = "erosiano-dev@erosiano-dev";

function marketplace(binary, project, home, ...args) {
  const result = spawnSync(binary, ["plugin", ...args], {
    cwd: project, env: isolatedEnvironment(home), encoding: "utf8", shell: false, timeout: 30000, maxBuffer: 256 * 1024,
  });
  assert.equal(result.error, undefined, "Marketplace subprocess failed");
  assert.equal(result.status, 0, "Marketplace " + args.join(" ") + ": " + String(result.stderr).slice(-2000));
}

function inside(root, path) {
  const rel = relative(root, path);

  return rel !== "" && !isAbsolute(rel) && rel !== ".." && !rel.startsWith(".." + sep);
}

async function withHost(binary, project, home, fixture, options, fn) {
  const rpc = createRpc(binary, project, home, {}, fixture.endpoint, { installed: true, ...options });
  try {
    await rpc.wait(frame => frame.type === "ready");
    const state = await rpc.request("get_state");
    assert.equal(state.model?.provider, "erosiano-smoke");
    assert.equal(state.model?.id, "fixture");

    return await fn(rpc);
  } finally {
    try {
      await rpc.close();
    } catch (error) {
      throw new Error(error.message + "\nOMP stderr (bounded): " + rpc.diagnostics().trim(), { cause: error });
    }
  }
}

async function command(rpc, message) {
  await rpc.request("prompt", { message });
}

async function runAdoption(binary, legacy, ponytail, root, fixture) {
  const home = join(root, "home");
  const project = join(root, "project");
  const sessions = join(root, "sessions");
  mkdirSync(home, { recursive: true });
  mkdirSync(sessions, { recursive: true });
  mkdirSync(join(project, ".git"), { recursive: true });
  const legacyPath = join(project, ".engineering-proxy.json");
  const canonicalPath = join(project, ".erosiano-dev.json");
  const original = '{"enabled":true,"enforcement":"balanced","preserved":"legacy-value"}';
  writeFileSync(legacyPath, original);
  const hostOptions = { sessionDir: sessions, extraExtensions: [ponytail] };

  marketplace(binary, project, home, "marketplace", "add", legacy);
  marketplace(binary, project, home, "install", LEGACY_ID);
  const session = await withHost(binary, project, home, fixture, hostOptions, async rpc => {
    const catalog = await rpc.request("get_available_commands");
    assert.ok(catalog.commands.some(item => item.name === "engineering-proxy"));
    assert.ok(!catalog.commands.some(item => item.name === "erosiano-dev"));
    await command(rpc, "/ponytail full");
    await command(rpc, "/engineering-proxy adaptive");
    await fixture.turn(rpc, "adaptive", { legacy: true, ponytail: "full" });
    const state = await rpc.request("get_state");
    assert.ok(typeof state.sessionFile === "string" && inside(sessions, realpathSync(state.sessionFile)), "Session escaped fixture");

    return state.sessionFile;
  });
  marketplace(binary, project, home, "uninstall", LEGACY_ID);
  marketplace(binary, project, home, "marketplace", "add", CANDIDATE);
  marketplace(binary, project, home, "install", CURRENT_ID);
  await withHost(binary, project, home, fixture, { ...hostOptions, resume: session }, async rpc => {
    verifyCommandCatalog(await rpc.request("get_available_commands"));
    await fixture.turn(rpc, "adaptive", { ponytail: "full" });
    await command(rpc, "/ponytail off");
    await fixture.turn(rpc, "adaptive", { ponytail: "off" });
    await command(rpc, "/ponytail lite");
    await fixture.turn(rpc, "adaptive", { ponytail: "lite" });
    await command(rpc, "/erosiano-dev reset");
    await fixture.turn(rpc, "balanced", { ponytail: "lite" });
    await command(rpc, "/erosiano-dev adaptive");
    await command(rpc, "/ponytail off");
    await fixture.turn(rpc, "adaptive", { ponytail: "off" });
    const switched = await rpc.request("new_session");
    assert.equal(switched.cancelled, false);
    await command(rpc, "/ponytail off");
    await fixture.turn(rpc, "balanced", { ponytail: "off" });
    const restored = await rpc.request("switch_session", { sessionPath: session });
    assert.equal(restored.cancelled, false);
    await fixture.turn(rpc, "adaptive", { ponytail: "off" });
    await command(rpc, "/erosiano-dev repo adaptive");
    const migrated = JSON.parse(readFileSync(canonicalPath, "utf8"));
    assert.equal(migrated.enforcement, "adaptive");
    assert.equal(migrated.preserved, "legacy-value");
    assert.equal(readFileSync(legacyPath, "utf8"), original);
  });
  marketplace(binary, project, home, "uninstall", CURRENT_ID);
  marketplace(binary, project, home, "install", LEGACY_ID);
  await withHost(binary, project, home, fixture, { ...hostOptions, sessionDir: join(root, "rollback-sessions") }, async rpc => {
    const catalog = await rpc.request("get_available_commands");
    assert.ok(!catalog.commands.some(item => item.name === "erosiano-dev"), "New plugin still active after uninstall");
    await command(rpc, "/ponytail full");
    await fixture.turn(rpc, "balanced", { legacy: true, ponytail: "full" });
  });
  assert.equal(readFileSync(legacyPath, "utf8"), original);
  assert.equal(JSON.parse(readFileSync(canonicalPath, "utf8")).preserved, "legacy-value");
}

async function main(args) {
  if (args.length !== 6 || args[0] !== "--omp" || args[2] !== "--legacy" || args[4] !== "--ponytail" ||
      ![args[1], args[3], args[5]].every(isAbsolute)) throw new Error("Usage: node smoke-omp-adoption.mjs --omp /trusted/omp --legacy /legacy-marketplace --ponytail /ponytail/pi-extension/index.js");
  const [binary, legacy, ponytail] = [args[1], args[3], args[5]].map(path => realpathSync(resolve(path)));
  const root = realpathSync(mkdtempSync(join(tmpdir(), "erosiano-omp-adoption-")));
  try {
    const fixture = await startFixture();
    try {
      await runAdoption(binary, legacy, ponytail, root, fixture);
    } finally {
      await fixture.close();
    }
    console.log(JSON.stringify({ status: "PASS", platform: process.platform,
      scope: "Real OMP local marketplace install, v0.6 session migration, Ponytail on/off and level switches, new/switch session replay, config-preserving rollback",
      provider: "deterministic loopback fixture; not a comparative model evaluation",
      limitations: ["No remote marketplace or provider call, no KSD Intelligence integration"] }, null, 2));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

main(process.argv.slice(2)).catch(error => {
  console.error("Live OMP adoption smoke FAILED/BLOCKED: " + error.message);
  process.exitCode = 1;
});
