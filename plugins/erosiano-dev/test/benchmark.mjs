// In-process measurements of the actual extension hooks, not live OMP or model latency.
// Use the same harness for the current extension and a trusted pinned legacy checkout.
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
const args = process.argv.slice(2);
const options = new Map();
for (let i = 0; i < args.length; i++) {
  const flag = args[i];
  if (options.has(flag) || !["--plugin-root", "--omp", "--json", "--require-tokenizer"].includes(flag)) throw new Error("Invalid benchmark argument");
  if (flag === "--json" || flag === "--require-tokenizer") {
    options.set(flag, true);
    continue;
  }
  const path = args[++i];
  if (!path || !isAbsolute(path)) throw new Error("Benchmark paths must be absolute");
  options.set(flag, realpathSync(path));
}
const root = options.get("--plugin-root") ?? fileURLToPath(new URL("../", import.meta.url));
const metadata = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const identity = metadata.name === "omp-engineering-proxy" ? "engineering-proxy" : "erosiano-dev";
assert.ok(["omp-engineering-proxy", "omp-erosiano-dev"].includes(metadata.name), "Unexpected trusted plugin package");
const { createExtension } = await import(pathToFileURL(join(root, "index.js")).href);
const { KsdRuntime } = await import(pathToFileURL(join(root, "dist/runtime.js")).href);
const report = { schemaVersion: 1, package: metadata.name, version: metadata.version, node: process.version, platform: process.platform, arch: process.arch, workloads: {}, policy: {} };

function log(message) {
  if (!options.has("--json")) process.stdout.write(message);
}

const EVENTS_PER_BATCH = 200;
const WARMUP_BATCHES = 3;
const SAMPLE_BATCHES = 12;
const dir = mkdtempSync(join(tmpdir(), "ksd-ts-bench-"));
const cwd = join(dir, "project");
const globalConfigPath = join(dir, "global", identity + ".json");
const projectConfigPath = join(cwd, "." + identity + ".json");
const flags = ["EROSIANO_DEV_DISABLED", "ENGINEERING_PROXY_DISABLED", "EROSIANO_DEV_PRACTICE_TOOL"];
const previousFlags = new Map(flags.map(flag => [flag, process.env[flag]]));
const originalGetConfig = KsdRuntime.prototype.getConfig;
const instrumented = new WeakSet();
let activeCounts;

// Wrap the actual runtime's loader and builder, including those created inside the extension.
// These wrappers add the same instrumentation overhead to each checkout's measurement.
KsdRuntime.prototype.getConfig = function (...args) {
  if (!instrumented.has(this)) {
    assert.equal(typeof this.loadConfig, "function");
    assert.equal(typeof this.buildPolicy, "function");
    const loader = this.loadConfig;
    const builder = this.buildPolicy;
    this.loadConfig = (...values) => {
      if (activeCounts) activeCounts.loaders++;
      const loaded = loader(...values);

      return loaded;
    };
    this.buildPolicy = (...values) => {
      if (activeCounts) activeCounts.builds++;
      const built = builder(...values);

      return built;
    };


    instrumented.add(this);
  }

  return originalGetConfig.apply(this, args);
};

try {
  mkdirSync(join(cwd, ".git"), { recursive: true });
  mkdirSync(join(dir, "global"), { recursive: true });
  writeFileSync(globalConfigPath, '{"enabled":true,"enforcement":"balanced"}');
  writeFileSync(projectConfigPath, '{"enabled":true,"enforcement":"balanced"}');
  for (const flag of flags) process.env[flag] = "0";

  function harness() {
    const events = new Map();
    const pi = {
      on(name, handler) { events.set(name, handler); },
      registerCommand() {},
    };
    createExtension(pi, { globalConfigPath });
    let mode = "balanced";
    const ctx = {
      cwd,
      ui: {
        theme: { fg: (_tone, text) => text },
        setStatus() { if (activeCounts) activeCounts.statusWrites++; },
      },
      sessionManager: {
        getBranch: () => [{ type: "custom", customType: identity + "-mode", data: { mode } }],
      },
    };
    const prompt = { systemPromptOptions: { sections: {} } };

    return {
      events,
      ctx,
      prompt,
      switchMode() {
        mode = mode === "balanced" ? "adaptive" : "balanced";
        events.get("session_tree")({}, ctx);
      },
      turn() { return events.get("before_agent_start")(prompt, ctx); },
    };
  }

  // Read exactly what the real hook places into the host's structured prompt.
  const policyHarness = harness();
  policyHarness.turn();
  const emitted = { balanced: policyHarness.prompt.systemPromptOptions.sections[identity] };
  policyHarness.switchMode();
  policyHarness.turn();
  emitted.adaptive = policyHarness.prompt.systemPromptOptions.sections[identity];
  assert.equal(typeof emitted.balanced, "string");
  assert.equal(typeof emitted.adaptive, "string");
  assert.notEqual(emitted.balanced, emitted.adaptive);

  const activity = harness();
  activity.turn();
  let activityActive = false;
  const turn = harness();
  turn.turn();
  const switching = harness();
  switching.turn();
  switching.switchMode();
  switching.turn();

  const workloads = [
    { name: "cold-load", invoke() { harness().turn(); } },
    { name: "cached-activity", invoke() {
      activityActive = !activityActive;
      activity.events.get(activityActive ? "agent_start" : "agent_end")({}, activity.ctx);
    } },
    { name: "before-agent-start/refresh", invoke() { turn.turn(); } },
    { name: "mode-switch/session-tree+turn", invoke() { switching.switchMode(); switching.turn(); } },
  ];
  for (const workload of workloads) {
    workload.samples = [];
    workload.counts = { loaders: 0, builds: 0, statusWrites: 0 };
  }

  function batch(workload) {
    const start = performance.now();
    for (let i = 0; i < EVENTS_PER_BATCH; i++) workload.invoke();
    const elapsed = performance.now() - start;

    return elapsed;
  }

  // Reverse and rotate the order to reduce systematic warmup and scheduling bias.
  function ordered(round) {
    const list = round % 2 ? [...workloads].reverse() : [...workloads];
    const shift = round % list.length;
    const ordered = [...list.slice(shift), ...list.slice(0, shift)];

    return ordered;
  }

  for (let round = 0; round < WARMUP_BATCHES; round++) {
    for (const workload of ordered(round)) batch(workload);
  }
  for (let round = 0; round < SAMPLE_BATCHES; round++) {
    for (const workload of ordered(round)) {
      activeCounts = workload.counts;
      workload.samples.push(batch(workload));
      activeCounts = undefined;
    }
  }

  function percentile(samples, fraction) {
    const sorted = [...samples].sort((a, b) => a - b);
    const value = sorted[Math.ceil(sorted.length * fraction) - 1];

    return value;
  }

  report.eventsPerBatch = EVENTS_PER_BATCH;
  report.warmupBatches = WARMUP_BATCHES;
  report.sampleBatches = SAMPLE_BATCHES;
  log(`Batch size=${EVENTS_PER_BATCH}; warmup batches/workload=${WARMUP_BATCHES}; sample batches/workload=${SAMPLE_BATCHES}; order rotated and reversed.\n`);
  for (const workload of workloads) {
    const p50 = percentile(workload.samples, 0.5);
    const p95 = percentile(workload.samples, 0.95);
    const { loaders, builds, statusWrites } = workload.counts;
    report.workloads[workload.name] = { p50Us: p50 * 1000 / EVENTS_PER_BATCH, p95Us: p95 * 1000 / EVENTS_PER_BATCH, loaders, builds, statusWrites };
    log(`${workload.name}: batch p50=${p50.toFixed(3)} ms p95=${p95.toFixed(3)} ms; p50=${(p50 * 1000 / EVENTS_PER_BATCH).toFixed(3)} µs/event p95=${(p95 * 1000 / EVENTS_PER_BATCH).toFixed(3)} µs/event; measured loader calls=${loaders}, policy builds=${builds}, status writes=${statusWrites}\n`);
  }

  for (const [mode, policy] of Object.entries(emitted)) {
    const file = join(dir, `policy-${mode}.txt`);
    writeFileSync(file, policy);
    const bytes = Buffer.byteLength(policy, "utf8");
    assert.ok(!policy.includes("Project baseline discovery (read-only") && !policy.includes("SDLC workflow"), "Detailed policy leaked into the per-turn core");
    report.policy[mode] = { bytes, tokens: null };
    log(`Emitted ${mode} policy: ${bytes} UTF-8 bytes\n`);
    const run = spawnSync(options.get("--omp") ?? "omp", ["toks", file, "--json"], { encoding: "utf8", timeout: 15000 });
    try {
      if (run.error || run.status !== 0) throw new Error(run.error?.message ?? `exit ${run.status}`);
      const json = JSON.parse(run.stdout);
      const encoding = json.encodings.find(row => row.name === "o200k_base");
      if (!encoding || !Number.isSafeInteger(encoding.tokens) || encoding.tokens <= 0 || json.bytes !== bytes || json.source?.kind !== "file") throw new Error("o200k_base count unavailable or wrong input");
      report.policy[mode].tokens = encoding.tokens;
      log(`Offline tokenizer ${mode}: ${encoding.tokens} o200k_base tokens\n`);
    } catch (error) {
      if (options.has("--require-tokenizer")) throw error;
      log(`Offline tokenizer ${mode}: unavailable (${error.message})\n`);
    }
  }
  report.scope = "instrumented in-process extension hooks and offline o200k_base tokens; excludes OMP host/model latency";
  log("In-process hook timings include instrumentation; they exclude the OMP host, agents and model latency. No live speedup claim.\n");
  if (options.has("--json")) console.log(JSON.stringify(report));
} finally {
  KsdRuntime.prototype.getConfig = originalGetConfig;
  for (const [flag, previous] of previousFlags) {
    if (previous === undefined) delete process.env[flag];
    else process.env[flag] = previous;
  }
  rmSync(dir, { force: true, recursive: true });
}
