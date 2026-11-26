import test from "node:test";
import assert from "node:assert/strict";
import { intelligenceCapabilities, intelligenceGuidance } from "../intelligence.js";
import { registerPracticeTool, resolvePracticeTool } from "../practice-tool.js";

const names = ["status", "search", "impact", "changes"].map(name => "mcp__ksd_intelligence_ei_" + name);

test("intelligence is opt-in and only recognizes the approved exact MCP names", () => {
  const pi = { getActiveTools: () => names };
  assert.equal(intelligenceCapabilities(pi).status, "OFF");
  assert.equal(intelligenceGuidance(pi, "off"), "");
  assert.equal(intelligenceCapabilities(pi, "mcp").status, "ADVERTISED");
  assert.match(intelligenceGuidance(pi, "mcp"), /names advertised, not authenticated/);
  assert.match(intelligenceGuidance(pi, "mcp"), /mcp__ksd_intelligence_ei_impact/);
  assert.match(intelligenceGuidance(pi, "mcp"), /never waives native gates/);
  assert.equal(intelligenceCapabilities({ getActiveTools: () => ["ei_status", "mcp__other_ei_impact"] }, "mcp").status, "UNAVAILABLE");
});

test("partial, unsupported and throwing host capabilities degrade to native inspection", () => {
  assert.equal(intelligenceCapabilities({ getActiveTools: () => [{ name: names[0] }] }, "mcp").status, "PARTIAL");
  assert.equal(intelligenceCapabilities({}, "mcp").status, "UNKNOWN");
  const pi = { getActiveTools() { throw new Error("unavailable"); } };
  assert.match(intelligenceGuidance(pi, "mcp"), /inspect source, callers, contracts and tests directly/);
  assert.equal(intelligenceCapabilities(pi, "cli").status, "CLI_UNVERIFIED");
  assert.match(intelligenceGuidance(pi, "cli"), /verify the installed ei version/);
  assert.equal(intelligenceCapabilities(pi, "wrong").status, "INVALID_CONFIG");
});

test("practice tool defaults off, fails safe without APIs, and uses read approval when explicitly enabled", async () => {
  const registered = [];
  const z = { string: () => ({ optional: () => ({}) }), object: shape => shape };
  const pi = { zod: z, registerTool: definition => registered.push(definition) };
  assert.equal(registerPracticeTool(pi, { optedIn: false, isEnabled: () => true }), "OFF");
  assert.equal(registered.length, 0);
  assert.equal(registerPracticeTool({}, { optedIn: true, isEnabled: () => true }), "UNSUPPORTED");
  assert.equal(registerPracticeTool(pi, { optedIn: true, isEnabled: ctx => ctx?.enabled }), "REGISTERED_NOT_LIVE_VERIFIED");
  assert.equal(registered.length, 1);
  assert.equal(registered[0].approval, "read");
  const input = { context: JSON.stringify({ facets: { typescript: true } }), group: "typescript" };
  const disabled = await registered[0].execute("call", input, undefined, undefined, { enabled: false });
  assert.equal(disabled.isError, true);
  const valid = await registered[0].execute("call", input, undefined, undefined, { enabled: true });
  assert.equal(valid.isError, undefined);
  assert.equal(JSON.parse(valid.content[0].text).counts.APPLICABLE, 13);
});

test("practice tool bounds input and output without implying missing rules passed", () => {
  assert.equal(resolvePracticeTool({ context: "x".repeat(70000) }).isError, true);
  assert.equal(resolvePracticeTool({ context: "{" }).isError, true);
  assert.equal(resolvePracticeTool({ context: '{"facets":{}}', group: "unknown" }).isError, true);
  const limited = resolvePracticeTool({ context: '{"facets":{"code":true,"review":true,"baseline":true,"typescript":true,"frontend":true,"react":true,"database":true,"backend":true,"auth":true,"security":true,"payments":true,"runtime":true,"state":true,"api":true,"concurrency":true,"testing":true,"migration":true,"destructive":true,"io":true,"async":true,"error":true,"module":true,"architecture":true,"logging":true,"money":true,"time":true,"performance":true,"resource":true,"contract":true,"critical":true,"regression":true,"secrets":true}}' });
  assert.equal(JSON.parse(limited.content[0].text).limited, true);
  assert.match(limited.content[0].text, /No omitted rule is waived/);
});

test("policy pack tool refuses unauthenticated supplied-only context", () => {
  const response = resolvePracticeTool({ context: '{"facets":{"code":true}}', format: "policy" });
  assert.equal(response.isError, true);
  assert.match(response.content[0].text, /requires fresh sampled evidence/);
  assert.equal(resolvePracticeTool({ context: '{"facets":{}}', format: "unknown" }).isError, true);
});

test("native tools are discovered without confusing direct MCP names or enabling tools", () => {
  const native = ["ei_status", "ei_search", "ei_impact", "ei_changes"];
  const pi = { getActiveTools: () => native };
  assert.equal(intelligenceCapabilities(pi, "native").status, "ADVERTISED");
  assert.equal(intelligenceCapabilities(pi, "mcp").status, "UNAVAILABLE");
  assert.equal(intelligenceCapabilities({ getActiveTools: () => names }, "native").status, "UNAVAILABLE");
  assert.equal(intelligenceCapabilities({ getActiveTools: () => [native[0]] }, "native").status, "PARTIAL");
  assert.match(intelligenceGuidance(pi, "native"), /native tools \(names advertised, not authenticated\)/);
  assert.match(intelligenceGuidance(pi, "native"), /ei_impact/);
  assert.match(intelligenceGuidance(pi, "native"), /never waives native gates/);
  assert.equal(intelligenceGuidance(pi, "off"), "");
});
