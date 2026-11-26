// Actual OMP -> real pinned KSD Intelligence stdio MCP. Model decisions are scripted locally.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { createRpc, isolatedEnvironment, verifyCommandCatalog } from "./smoke-omp.mjs";
import { startFixture } from "./smoke-omp-prompt.mjs";

const NAMES = Object.fromEntries(["status", "search", "impact", "changes"].map(suffix => [suffix, "mcp__ksd_intelligence_ei_" + suffix]));

function run(executable, args, cwd, env, timeout = 60000) {
  const result = spawnSync(executable, args, { cwd, env, encoding: "utf8", timeout, maxBuffer: 2 * 1024 * 1024, shell: false });
  assert.equal(result.error, undefined, String(result.error));
  assert.equal(result.status, 0, args.join(" ") + ": " + (result.stderr + result.stdout).slice(-3000));

  return result.stdout;
}

function text(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  return content.filter(part => part?.type === "text").map(part => part.text).join("\n");
}

function checkTools(body, expected) {
  const tools = new Set((body.tools ?? []).map(tool => tool.function?.name));
  for (const name of Object.values(NAMES)) assert.equal(tools.has(name), expected, "Unexpected active MCP tool: " + name);
}

function checkResult(body, patterns) {
  const result = body.messages.filter(message => message.role === "tool").at(-1);
  assert.ok(result, "Missing actual MCP tool result in next model request");
  const output = text(result.content);
  for (const pattern of patterns) assert.match(output, pattern);
  assert.doesNotMatch(output, /TOOL_UNAVAILABLE|INVALID_INPUT|MCP failure|typescript runtime missing|tool.*not found/i);
}

function checkGuidance(body, present) {
  const input = body.messages.filter(message => message.role === "user").map(message => text(message.content)).join("\n");
  assert.match(input, present ? /Optional KSD Intelligence MCP \(names advertised, not authenticated\)/ : /Optional KSD Intelligence: UNAVAILABLE/);
  assert.match(input, /never waives native gates or earlier test obligations/);
  if (present) for (const name of Object.values(NAMES)) assert.ok(input.includes(name), "Missing delegated tool guidance " + name);
}

function prepareProject(project, home, cli) {
  const env = isolatedEnvironment(home);
  mkdirSync(join(project, "src"), { recursive: true });
  mkdirSync(join(project, ".omp"), { recursive: true });
  writeFileSync(join(project, "package.json"), '{"name":"erosiano-ei-fixture","version":"1.0.0","type":"module"}');
  writeFileSync(join(project, "tsconfig.json"), '{"compilerOptions":{"strict":true,"target":"ES2022","module":"NodeNext","moduleResolution":"NodeNext","types":[]},"include":["src/**/*.ts"]}');
  writeFileSync(join(project, "ei.config.json"), '{"impact":{"include":["src/**"],"freshness":"hash"},"riskZones":[]}');
  writeFileSync(join(project, "src", "calc.ts"), "export function calculateFee(amount: number): number { return amount + 1; }\n");
  writeFileSync(join(project, "src", "caller.ts"), 'import { calculateFee } from "./calc.js";\nexport function charge(amount: number): number { return calculateFee(amount); }\n');
  writeFileSync(join(project, "src", "calc.test.ts"), 'import { calculateFee } from "./calc.js";\nexport const example = calculateFee(1);\n');
  writeFileSync(join(project, ".erosiano-dev.json"), '{"enabled":true,"enforcement":"balanced","intelligenceMode":"mcp"}');
  writeFileSync(join(env.PI_CODING_AGENT_DIR, "config.yml"), JSON.stringify({
    bash: { enabled: false }, mcp: { shared: false, startupTimeoutMs: 0 },
    tools: { approvalMode: "always-ask", approval: Object.fromEntries(Object.values(NAMES).map(name => [name, "allow"])) },
  }));
  writeFileSync(join(project, ".omp", "mcp.json"), JSON.stringify({ mcpServers: {
    "ksd-intelligence": { type: "stdio", command: process.execPath, args: [cli, "mcp", "--root", project], cwd: project,
      env: { HOME: home, XDG_CACHE_HOME: env.XDG_CACHE_HOME }, instructions: false, timeout: 20000 },
  } }));
  run("git", ["init", "-q", "-b", "main"], project, env);
  run("git", ["add", "package.json", "tsconfig.json", "ei.config.json", "src", ".erosiano-dev.json", ".omp"], project, env);
  run("git", ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", "commit", "-qm", "fixture"], project, env);
  // Operator-directed setup in a disposable HOME, using the upstream pinned TypeScript runtime.
  run(process.execPath, [cli, "setup"], project, env, 120000);
  run(process.execPath, [cli, "setup", "--check"], project, env);
  run(process.execPath, [cli, "index", "--root", project], project, env, 120000);
  const status = run(process.execPath, [cli, "status", "--root", project], project, env);
  assert.match(status, /STATUS ready/);
  writeFileSync(join(project, "src", "calc.ts"), "export function calculateFee(amount: number): number { return amount + 2; }\n");
}

async function withHost(binary, project, home, fixture, fn) {
  const rpc = createRpc(binary, project, home, { OMP_MCP_STARTUP_TIMEOUT_MS: "0" }, fixture.endpoint);
  try {
    await rpc.wait(frame => frame.type === "ready");
    const state = await rpc.request("get_state");
    assert.equal(state.model?.provider, "erosiano-smoke");
    assert.equal(state.model?.id, "fixture");
    verifyCommandCatalog(await rpc.request("get_available_commands"));
    await fn(rpc);
  } finally {
    try {
      await rpc.close();
    } catch (error) {
      throw new Error(error.message + "\nOMP stderr (bounded): " + rpc.diagnostics().trim(), { cause: error });
    }
  }
}

async function exercise(binary, project, home, fixture) {
  await withHost(binary, project, home, fixture, async rpc => {
    await fixture.turn(rpc, "balanced", { message: "/erosiano-dev review src", steps: [
      { inspect: body => { checkTools(body, true); checkGuidance(body, true); }, call: { name: NAMES.search, args: { query: "calculateFee" } } },
      { inspect: body => checkResult(body, [/SEARCH/, /calculateFee/, /src\/calc\.ts/]), call: { name: NAMES.impact, args: { targets: ["calculateFee"] } } },
      { inspect: body => checkResult(body, [/IMPACT calculateFee/, /src\/caller\.ts/, /src\/calc\.test\.ts/]), call: { name: NAMES.changes, args: { base: "HEAD" } } },
      { inspect: body => checkResult(body, [/CHANGES vs HEAD/, /src\/calc\.ts/]), call: { name: NAMES.status, args: {} } },
      { inspect: body => checkResult(body, [/STATUS ready/, /Coverage/]) },
    ] });
  });
  // Deliberately remove the configured server, then start another real host.
  writeFileSync(join(project, ".omp", "mcp.json"), '{"mcpServers":{}}');
  await withHost(binary, project, home, fixture, async rpc => {
    await fixture.turn(rpc, "balanced", { message: "/erosiano-dev review src", steps: [
      { inspect: body => { checkTools(body, false); checkGuidance(body, false); } },
    ] });
  });
}

async function main(args) {
  if (args.length !== 4 || args[0] !== "--omp" || args[2] !== "--ei" || ![args[1], args[3]].every(isAbsolute)) {
    throw new Error("Usage: node smoke-omp-intelligence.mjs --omp /trusted/omp --ei /trusted/ksd-intelligence/dist/adapters/cli/main.js");
  }
  const binary = realpathSync(args[1]);
  const cli = realpathSync(args[3]);
  const root = realpathSync(mkdtempSync(join(tmpdir(), "erosiano-omp-intelligence-")));
  const home = join(root, "home");
  const project = join(root, "project");
  try {
    mkdirSync(home, { recursive: true });
    prepareProject(project, home, cli);
    const fixture = await startFixture();
    try {
      await exercise(binary, project, home, fixture);
    } finally {
      await fixture.close();
    }
    assert.match(readFileSync(join(project, "src", "calc.ts"), "utf8"), /return amount \+ 2/);
    console.log(JSON.stringify({ status: "PASS", platform: process.platform,
      scope: "Real OMP delegated review guidance, real KSD Intelligence MCP search/impact/changes/status over stdio and unavailable-provider fallback",
      provider: "deterministic loopback model fixture; actual TypeScript index and Git diff",
      limitations: ["No independent model effectiveness or production-repository claim"] }, null, 2));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

main(process.argv.slice(2)).catch(error => {
  console.error("Live KSD Intelligence smoke FAILED/BLOCKED: " + error.message);
  process.exitCode = 1;
});
