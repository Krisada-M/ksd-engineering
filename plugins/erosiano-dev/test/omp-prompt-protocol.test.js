import test from "node:test";
import assert from "node:assert/strict";
import { verifyPromptPayload } from "./eval/smoke-omp-prompt.mjs";
import { buildPolicy } from "../policy.js";

test("transport assertion requires one correct policy and no stale legacy marker", () => {
  const body = mode => ({ model: "fixture", messages: [{ role: "system", content: buildPolicy({ enforcement: mode }) }] });
  assert.doesNotThrow(() => verifyPromptPayload(body("balanced"), "balanced"));
  assert.doesNotThrow(() => verifyPromptPayload(body("adaptive"), "adaptive"));
  assert.throws(() => verifyPromptPayload(body("balanced"), "adaptive"), /Incorrect effective/);
  const duplicate = body("balanced");
  duplicate.messages.push(duplicate.messages[0]);
  assert.throws(() => verifyPromptPayload(duplicate, "balanced"), /number of policy markers/);
  assert.throws(() => verifyPromptPayload(body("balanced"), "disabled"), /number of policy markers/);
  assert.doesNotThrow(() => verifyPromptPayload({ model: "fixture", messages: [{ role: "developer", content: [{ type: "text", text: "Other instructions" }] }] }, "disabled"));
});
