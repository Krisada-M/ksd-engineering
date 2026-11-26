// Real OMP host, deterministic loopback-only synthetic model. No external LLM or user data.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRpc, verifyCommandCatalog } from "./smoke-omp.mjs";
import { POLICY_MARKER, POLICY_END } from "../../policy.js";

function textContent(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";

  return content.filter(block => block?.type === "text").map(block => block.text).join("\n");
}

export function verifyPromptPayload(body, mode) {
  assert.equal(body.model, "fixture", "Unexpected synthetic model");
  assert.ok(Array.isArray(body.messages), "Model request has no messages");
  const prompt = body.messages.filter(message => ["system", "developer"].includes(message.role)).map(message => textContent(message.content)).join("\n");
  const count = mode === "disabled" ? 0 : 1;
  assert.equal(prompt.split(POLICY_MARKER).length - 1, count, "Wrong number of policy markers");
  assert.equal(prompt.split(POLICY_END).length - 1, count, "Wrong number of policy ends");
  if (mode !== "disabled") {
    assert.ok(prompt.includes("Enforcement=" + mode + ":"), "Incorrect effective enforcement mode");
  }
  assert.ok(!prompt.includes("[Engineering Proxy Policy]"), "Legacy policy duplicated");
}

async function startFixture() {
  let expectation = null;
  let observed = 0;
  let failure;
  const server = createServer(async (req, res) => {
    try {
      assert.equal(req.method, "POST");
      assert.equal(req.url, "/v1/chat/completions");
      assert.ok(expectation, "Unexpected background provider request");
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        assert.ok(size <= 2 * 1024 * 1024, "Synthetic request too large");
        chunks.push(chunk);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      verifyPromptPayload(body, expectation);
      observed++;
      assert.equal(observed, 1, "Unexpected duplicate provider call");
      const base = { id: "chatcmpl-erosiano-fixture", object: "chat.completion.chunk", created: 1, model: "fixture" };
      res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "close" });
      for (const delta of [{ role: "assistant", content: "" }, { content: "fixture OK" }]) {
        res.write("data: " + JSON.stringify({ ...base, choices: [{ index: 0, delta, finish_reason: null }] }) + "\n\n");
      }
      res.write("data: " + JSON.stringify({ ...base, choices: [{ index: 0, delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }) + "\n\n");
      res.end("data: [DONE]\n\n");
    } catch (error) {
      failure ??= error;
      if (!res.headersSent) res.writeHead(400, { "content-type": "application/json", connection: "close" });
      res.end(JSON.stringify({ error: { message: "Synthetic fixture assertion failed" } }));
    }
  });
  server.requestTimeout = 10000;
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  return {
    endpoint: "http://127.0.0.1:" + server.address().port + "/v1",
    async turn(rpc, mode) {
      assert.equal(expectation, null);
      expectation = mode;
      observed = 0;
      try {
        await rpc.request("prompt", { message: "Reply with fixture OK; no tools are needed." }, { invokeAgent: true });
        if (failure) throw failure;
        assert.equal(observed, 1, "No synthetic provider request observed");
      } catch (error) {
        throw failure ?? error;
      } finally {
        expectation = null;
      }
    },
    async close() {
      server.closeAllConnections();
      await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
      if (failure) throw failure;
    },
  };
}

async function exercise(binary, root, fixture, disabled) {
  const dir = join(root, disabled ? "disabled" : "enabled");
  const home = join(dir, "home");
  const project = join(dir, "project");
  mkdirSync(home, { recursive: true });
  mkdirSync(join(project, ".git"), { recursive: true });
  writeFileSync(join(project, ".erosiano-dev.json"), '{"enabled":true,"enforcement":"balanced"}');
  const rpc = createRpc(binary, project, home, disabled ? { EROSIANO_DEV_DISABLED: "1" } : {}, fixture.endpoint);
  try {
    await rpc.wait(frame => frame.type === "ready");
    const state = await rpc.request("get_state");
    assert.equal(state.model?.provider, "erosiano-smoke");
    assert.equal(state.model?.id, "fixture");
    verifyCommandCatalog(await rpc.request("get_available_commands"));
    if (disabled) {
      await fixture.turn(rpc, "disabled");

      return;
    }
    await fixture.turn(rpc, "balanced");
    await rpc.request("prompt", { message: "/erosiano-dev adaptive" });
    await fixture.turn(rpc, "adaptive");
    await rpc.request("prompt", { message: "/erosiano-dev reset" });
    await fixture.turn(rpc, "balanced");
  } finally {
    try {
      await rpc.close();
    } catch (error) {
      throw new Error(error.message + "\nOMP stderr (bounded): " + rpc.diagnostics().trim(), { cause: error });
    }
  }
}

async function main(args) {
  if (args.length !== 2 || args[0] !== "--omp" || !isAbsolute(args[1])) throw new Error("Usage: node smoke-omp-prompt.mjs --omp /absolute/path/to/trusted/omp");
  const binary = realpathSync(args[1]);
  const root = realpathSync(mkdtempSync(join(tmpdir(), "erosiano-omp-prompt-")));
  try {
    const fixture = await startFixture();
    try {
      await exercise(binary, root, fixture, false);
      await exercise(binary, root, fixture, true);
    } finally {
      await fixture.close();
    }
    console.log(JSON.stringify({ status: "PASS", platform: process.platform,
      scope: "Real OMP model-request policy injection: balanced, adaptive, reset and disabled; exactly one owned policy per enabled request",
      provider: "deterministic local HTTP fixture, not a real LLM", limitations: ["No comparative model outcomes, marketplace, Ponytail or KSD Intelligence verification"] }, null, 2));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch(error => {
    console.error("Live OMP prompt smoke FAILED/BLOCKED: " + error.message);
    process.exitCode = 1;
  });
}
