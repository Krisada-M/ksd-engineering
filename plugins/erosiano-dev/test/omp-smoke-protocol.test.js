import test from "node:test";
import assert from "node:assert/strict";
import { verifyCommandCatalog, verifyLocalCompletion } from "./eval/smoke-omp.mjs";

test("OMP smoke protocol assertions reject missing or duplicate registration and model invocation", () => {
  const commands = ["erosiano-dev", "engineering-proxy", "engineering-review"].map(name => ({ name, source: "extension" }));
  assert.doesNotThrow(() => verifyCommandCatalog({ commands }));
  assert.throws(() => verifyCommandCatalog({ commands: commands.slice(0, 2) }), /exactly one/);
  assert.throws(() => verifyCommandCatalog({ commands: [...commands, commands[0]] }), /exactly one/);
  assert.doesNotThrow(() => verifyLocalCompletion({ type: "prompt_result", status: "completed", agentInvoked: false }));
  assert.throws(() => verifyLocalCompletion({ type: "prompt_result", status: "completed", agentInvoked: true }), /invoked the agent/);
  assert.throws(() => verifyLocalCompletion({ type: "prompt_result", status: "error", agentInvoked: false }));
});
