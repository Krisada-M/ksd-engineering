// Matched offline benchmark for the pinned legacy extension and current candidate.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { isAbsolute, join } from "node:path";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

const benchmark = fileURLToPath(new URL("../benchmark.mjs", import.meta.url));
const candidateRoot = fileURLToPath(new URL("../../", import.meta.url));

function measure(root, omp) {
  const run = spawnSync(process.execPath, [benchmark, "--plugin-root", root, "--omp", omp, "--require-tokenizer", "--json"],
    { encoding: "utf8", timeout: 120000, maxBuffer: 1024 * 1024, shell: false });
  assert.equal(run.error, undefined);
  assert.equal(run.status, 0, run.stderr);

  return JSON.parse(run.stdout);
}

function compare(baseline, candidate) {
  for (const key of ["schemaVersion", "platform", "arch", "node", "eventsPerBatch", "warmupBatches", "sampleBatches"]) assert.equal(candidate[key], baseline[key], key);
  assert.equal(baseline.package, "omp-engineering-proxy");
  assert.equal(baseline.version, "0.6.0");
  assert.equal(candidate.package, "omp-erosiano-dev");
  const modes = ["balanced", "adaptive"];
  const policies = Object.fromEntries(modes.map(mode => {
    const before = baseline.policy[mode];
    const after = candidate.policy[mode];
    assert.ok(Number.isSafeInteger(before.tokens) && before.tokens > 0 && Number.isSafeInteger(after.tokens) && after.tokens > 0);

    return [mode, { baseline: before, candidate: after, tokenDelta: after.tokens - before.tokens, tokenRatio: after.tokens / before.tokens }];
  }));
  assert.deepEqual(Object.keys(candidate.workloads), Object.keys(baseline.workloads));
  const workloads = Object.fromEntries(Object.keys(baseline.workloads).map(name => {
    const before = baseline.workloads[name];
    const after = candidate.workloads[name];
    assert.ok(before.p50Us > 0 && after.p50Us > 0);

    return [name, { baseline: before, candidate: after, p50Ratio: after.p50Us / before.p50Us }];
  }));

  return { policies, workloads };
}

function main(args) {
  if (args.length !== 4 || args[0] !== "--omp" || args[2] !== "--legacy" || ![args[1], args[3]].every(isAbsolute)) {
    throw new Error("Usage: node compare-overhead.mjs --omp /trusted/omp --legacy /trusted/v0.6-marketplace");
  }
  const omp = realpathSync(args[1]);
  const legacy = realpathSync(join(args[3], "plugins", "engineering-proxy"));
  const version = spawnSync(omp, ["--version"], { encoding: "utf8", timeout: 10000, shell: false });
  assert.equal(version.status, 0, version.stderr);
  const baseline = measure(legacy, omp);
  const candidate = measure(candidateRoot, omp);
  const measured = compare(baseline, candidate);
  console.log(JSON.stringify({ status: "MEASURED", tokenizer: "o200k_base", ompVersion: version.stdout.trim(),
    platform: process.platform, arch: process.arch, node: process.version,
    eventsPerBatch: candidate.eventsPerBatch, warmupBatches: candidate.warmupBatches, sampleBatches: candidate.sampleBatches,
    ...measured, limitations: ["In-process hook timings, not model or host latency", "Single ordered matched run per runner; timing is noisy", "No owner-approved overhead threshold or release approval"] }, null, 2));
}

main(process.argv.slice(2));
