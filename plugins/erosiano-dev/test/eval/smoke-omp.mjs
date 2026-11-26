// Explicit operator-run real OMP command/registration smoke. No agent prompts or provider credentials.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createInterface } from "node:readline";
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";

const extension = fileURLToPath(new URL("../../index.js", import.meta.url));
const COMMANDS = ["erosiano-dev", "engineering-proxy", "engineering-review"];
const TIMEOUT = 30000;
const MODEL = "erosiano-smoke/fixture";

export function verifyCommandCatalog(data) {
  assert.ok(Array.isArray(data?.commands), "OMP command catalog unavailable");
  const names = data.commands.map(command => String(command.name).replace(/^\//, ""));
  for (const name of COMMANDS) {
    assert.equal(names.filter(value => value === name).length, 1, "Expected exactly one command: " + name);
  }
}

export function verifyLocalCompletion(frame) {
  assert.equal(frame.type, "prompt_result");
  assert.equal(frame.status, "completed");
  assert.equal(frame.agentInvoked, false, "Command unexpectedly invoked the agent");
}

// Only pass a minimal environment, never reuse auth/config from the operator's HOME.
export function isolatedEnvironment(home, flags = {}) {
  const env = {
    PATH: process.env.PATH ?? "/usr/bin:/bin",
    HOME: home,
    XDG_CONFIG_HOME: join(home, "config"),
    XDG_DATA_HOME: join(home, "data"),
    XDG_CACHE_HOME: join(home, "cache"),
    TMPDIR: join(home, "tmp"),
    PI_CODING_AGENT_DIR: join(home, ".omp", "agent"),
    ...flags,
  };
  mkdirSync(env.TMPDIR, { recursive: true });
  mkdirSync(env.PI_CODING_AGENT_DIR, { recursive: true });

  return env;
}

// Only the explicit synthetic-prompt test may enable model turns; its endpoint must be loopback.
export function createRpc(binary, project, home, flags, fixtureEndpoint, { installed = false, sessionDir, resume, extraExtensions = [] } = {}) {
  if (fixtureEndpoint !== undefined && !/^http:\/\/127\.0\.0\.1:[0-9]{1,5}\/v1$/.test(fixtureEndpoint)) throw new Error("Fixture model must use loopback");
  const env = isolatedEnvironment(home, flags);
  // Noninteractive OMP requires an available model even for local commands. Use a
  // dedicated loopback-only fixture with a dummy key; no real provider credential.
  writeFileSync(join(env.PI_CODING_AGENT_DIR, "models.yml"), JSON.stringify({
    providers: { "erosiano-smoke": {
      baseUrl: fixtureEndpoint ?? "http://127.0.0.1:1/v1", apiKey: "fixture-not-a-secret", api: "openai-completions",
      models: [{ id: "fixture", name: "Command smoke fixture", reasoning: false, input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 128000, maxTokens: 4096 }],
    } },
  }));
  const args = ["--mode", "rpc", "--no-ui", "--no-skills", "--no-rules", "--no-context-files", "--model", MODEL];
  if (sessionDir) args.push("--session-dir", sessionDir);
  else args.push("--no-session");
  if (resume) {
    if (!sessionDir) throw new Error("Resume requires isolated persistent session directory");
    args.push("--resume", resume);
  }
  if (!installed) args.push("--no-extensions", "--extension", extension);
  for (const path of extraExtensions) args.push("--extension", path);
  const child = spawn(binary, args, { cwd: project, env, stdio: ["pipe", "pipe", "pipe"], shell: false });
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
  const buffered = [];
  const pending = new Set();
  let ended = false;
  let failure;
  let stderr = "";
  let counter = 0;
  function rejectAll(error) {
    failure = error;
    for (const item of pending) item.reject(error);
    pending.clear();
  }

  lines.on("line", line => {
    try {
      if (line.length > 2 * 1024 * 1024) throw new Error("RPC frame exceeds smoke limit");
      const frame = JSON.parse(line);
      if (!fixtureEndpoint && frame.type === "agent_start") throw new Error("Unexpected model/agent turn");
      if (!fixtureEndpoint && frame.type === "prompt_result" && frame.agentInvoked === true) throw new Error("Unexpected model/agent invocation");
      const waiter = [...pending].find(item => item.match(frame));
      if (waiter) {
        pending.delete(waiter);
        waiter.resolve(frame);

        return;
      }
      if (frame.type === "ready" || frame.type === "response" || frame.type === "prompt_result") {
        if (buffered.length >= 32) throw new Error("Unexpected RPC response accumulation");
        buffered.push(frame);
      }
    } catch (error) {
      rejectAll(error);
      child.kill("SIGKILL");
    }
  });
  child.stderr.on("data", data => { stderr = (stderr + String(data)).slice(-4000); });
  child.stdin.on("error", rejectAll);
  child.on("error", rejectAll);
  const closed = new Promise(resolve => child.once("close", (code, signal) => {
    ended = true;
    if (pending.size) rejectAll(new Error("OMP closed before requested response (" + code + "/" + signal + ")"));
    resolve({ code, signal });
  }));

  function wait(match) {
    if (failure) return Promise.reject(failure);
    if (ended) return Promise.reject(new Error("OMP already exited"));
    const index = buffered.findIndex(match);
    if (index >= 0) return Promise.resolve(buffered.splice(index, 1)[0]);

    return new Promise((resolve, reject) => {
      let item;
      const timer = setTimeout(() => {
        pending.delete(item);
        reject(new Error("Timed out waiting for OMP RPC frame"));
        child.kill("SIGKILL");
      }, TIMEOUT);
      item = { match, resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } };
      pending.add(item);
    });
  }

  async function request(type, data = {}, { invokeAgent = false } = {}) {
    if (invokeAgent && (!fixtureEndpoint || type !== "prompt")) throw new Error("Agent invocation only allowed for a loopback fixture prompt");
    const id = "smoke-" + ++counter;
    const response = wait(frame => frame.id === id && frame.type === "response");
    child.stdin.write(JSON.stringify({ id, type, ...data }) + "\n");
    const frame = await response;
    assert.equal(frame.success, true, "OMP rejected RPC command " + type);
    if (invokeAgent) {
      assert.notEqual(frame.data?.agentInvoked, false, "Synthetic prompt completed without a model turn");
      const completed = await wait(item => item.id === id && item.type === "prompt_result");
      assert.equal(completed.status, "completed", "Synthetic model turn did not complete");
      assert.equal(completed.agentInvoked, true);
      assert.equal(completed.sessionSettled, true, "Synthetic turn did not settle");
    } else if (type === "prompt" && frame.data?.agentInvoked !== false) {
      verifyLocalCompletion(await wait(item => item.id === id && item.type === "prompt_result"));
    }

    return frame.data;
  }

  async function close() {
    if (!ended) child.stdin.end();
    const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
    try {
      const result = await closed;
      if (failure) throw failure;
      if (result.code !== 0 || result.signal) throw new Error("OMP did not shut down normally");
    } finally {
      clearTimeout(timer);
      lines.close();
    }
  }

  return { wait, request, close, diagnostics: () => stderr };
}

async function exercise(binary, home, project, disable) {
  const flags = disable ? { [disable]: "1" } : {};
  const rpc = createRpc(binary, project, home, flags);
  try {
    await rpc.wait(frame => frame.type === "ready");
    const state = await rpc.request("get_state");
    assert.equal(state.model?.provider, "erosiano-smoke", "OMP did not select the fixture provider");
    assert.equal(state.model?.id, "fixture", "OMP did not select the fixture model");
    verifyCommandCatalog(await rpc.request("get_available_commands"));
    await rpc.request("prompt", { message: "/erosiano-dev status" });
    await rpc.request("prompt", { message: "/erosiano-dev adaptive" });
    const entries = (await rpc.request("get_entries")).entries;
    assert.ok(Array.isArray(entries), "OMP entry history unavailable");
    const modes = entries.filter(entry => entry.type === "custom" && entry.customType === "erosiano-dev-mode");
    if (disable) {
      assert.equal(modes.length, 0, "Disabled extension wrote a mode entry");

      return;
    }
    assert.equal(modes.length, 1, "Expected one canonical session mode entry");
    assert.equal(modes[0].data.mode, "adaptive");
    await rpc.request("prompt", { message: "/engineering-proxy reset" });
    const next = (await rpc.request("get_entries")).entries.filter(entry => entry.type === "custom" && entry.customType === "erosiano-dev-mode");
    assert.equal(next.length, 2, "Legacy alias must delegate exactly once");
    assert.equal(next.at(-1).data.reset, true);
    await rpc.request("prompt", { message: "/erosiano-dev repo adaptive" });
    const migrated = JSON.parse(readFileSync(join(project, ".erosiano-dev.json"), "utf8"));
    assert.equal(migrated.enforcement, "adaptive");
    assert.equal(migrated.preserved, "legacy-value");
    assert.equal(JSON.parse(readFileSync(join(project, ".engineering-proxy.json"), "utf8")).enforcement, "balanced");
  } finally {
    try {
      await rpc.close();
    } catch (error) {
      // This process has an isolated HOME and dummy model credential, not user secrets.
      const diagnostic = rpc.diagnostics().trim();
      throw new Error(error.message + (diagnostic ? "\nOMP stderr (bounded): " + diagnostic : ""), { cause: error });
    }
  }
}

async function main(args) {
  if (args.length !== 2 || args[0] !== "--omp" || !isAbsolute(args[1])) throw new Error("Usage: node smoke-omp.mjs --omp /absolute/path/to/trusted/omp");
  const binary = realpathSync(args[1]);
  const root = realpathSync(mkdtempSync(join(tmpdir(), "erosiano-omp-smoke-")));
  try {
    // Probe version in an isolated HOME too; never inherit provider tokens or user configuration.
    const version = spawnSync(binary, ["--version"], { cwd: root, env: { HOME: root, PATH: process.env.PATH ?? "/usr/bin:/bin" }, encoding: "utf8", timeout: 10000, maxBuffer: 16384, shell: false });
    assert.equal(version.status, 0, "OMP version unavailable");
    assert.match(version.stdout, /\d+\.\d+\.\d+/);
    for (const disable of [null, "EROSIANO_DEV_DISABLED", "ENGINEERING_PROXY_DISABLED"]) {
      const name = disable ?? "enabled";
      const home = join(root, name, "home");
      const project = join(root, name, "project");
      mkdirSync(home, { recursive: true });
      mkdirSync(join(project, ".git"), { recursive: true });
      writeFileSync(join(project, ".engineering-proxy.json"), '{"enabled":true,"enforcement":"balanced","preserved":"legacy-value"}');
      await exercise(binary, home, project, disable);
    }
    console.log(JSON.stringify({ status: "PASS", ompVersion: version.stdout.trim(), platform: process.platform,
      scope: "real OMP RPC extension loading, local mode/legacy alias, config migration and both disable flags",
      limitations: ["No provider prompt, live injection, marketplace installation, Ponytail or intelligence trial", "Run in an offline isolated environment for no-network assurance"] }, null, 2));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => {
    console.error("Live OMP command smoke FAILED/BLOCKED: " + error.message);
    process.exitCode = 1;
  });
}
