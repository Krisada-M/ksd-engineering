import test from "node:test";
import assert from "node:assert/strict";
import { rules } from "../eslint-rules/index.js";

function reportRule(name, enter, lines, statements) {
  const reports = [];
  const ctx = { sourceCode: { lines }, report: (entry) => reports.push(entry.messageId) };
  const visitor = rules[name].create(ctx);
  visitor[enter]({ body: statements });
  return reports;
}

function node(type, start, end, props = {}) {
  return { type, loc: { start: { line: start }, end: { line: end } }, ...props };
}

test("blank-between-functions spots missing separator and accepts exactly one", () => {
  const statements = [node("FunctionDeclaration", 1, 1, { body: {} }), node("FunctionDeclaration", 2, 2, { body: {} })];
  assert.deepEqual(reportRule("blank-between-functions", "Program", ["function a() {}", "function b() {}"], statements), ["missing"]);
  const spaced = [statements[0], node("FunctionDeclaration", 3, 3, { body: {} })];
  assert.deepEqual(reportRule("blank-between-functions", "Program", ["function a() {}", "", "function b() {}"], spaced), []);
});

test("blank-between-functions accepts arrow-function definitions", () => {
  const arrow = (line) => node("VariableDeclaration", line, line, { declarations: [{ init: { type: "ArrowFunctionExpression" } }] });
  assert.deepEqual(reportRule("blank-between-functions", "Program", ["const a = () => 1;", "const b = () => 2;"], [arrow(1), arrow(2)]), ["missing"]);
});

test("prefer-guard-clauses warns but cannot mutate", () => {
  const warnings = [];
  const visitor = rules["prefer-guard-clauses"].create({ report: (msg) => warnings.push(msg.messageId) });
  visitor.IfStatement({ alternate: null, consequent: { type: "BlockStatement", body: [{ type: "IfStatement" }] } });
  assert.deepEqual(warnings, ["nested"]);
  assert.equal(rules["prefer-guard-clauses"].meta.fixable, undefined);
});

test("blank-before-return skips first-statement guard clauses", () => {
  const reports = [];
  const context = { sourceCode: { lines: ["if (x) {", "  return x;", "}"] }, report: (entry) => reports.push(entry) };
  const ret = node("ReturnStatement", 2, 2);
  ret.parent = { body: [ret] };
  rules["blank-before-return"].create(context).ReturnStatement(ret);
  assert.deepEqual(reports, []);
});

test("blank-before-return flags return directly after prior statement", () => {
  const reports = [];
  const context = { sourceCode: { lines: ["const a = 1;", "return a;"] }, report: (entry) => reports.push(entry.messageId) };
  const previous = node("VariableDeclaration", 1, 1);
  const ret = node("ReturnStatement", 2, 2);
  ret.parent = { body: [previous, ret] };
  rules["blank-before-return"].create(context).ReturnStatement(ret);
  assert.deepEqual(reports, ["missing"]);
});


test("blank-between-functions detects exported function declarations", () => {
  const wrap = (line) => node("ExportNamedDeclaration", line, line, { declaration: node("FunctionDeclaration", line, line, { body: {} }) });
  assert.deepEqual(reportRule("blank-between-functions", "Program", ["export function a() {}", "export function b() {}"], [wrap(1), wrap(2)]), ["missing"]);
});

test("blank-before-return enforces exactly one blank line", () => {
  const lines = ["const a = 1;", "", "", "return a;"];
  const previous = node("VariableDeclaration", 1, 1);
  const ret = node("ReturnStatement", 4, 4);
  ret.parent = { body: [previous, ret] };
  const reports = [];
  rules["blank-before-return"].create({ sourceCode: { lines }, report: (e) => reports.push(e.messageId) }).ReturnStatement(ret);
  assert.deepEqual(reports, ["extra"]);
});
