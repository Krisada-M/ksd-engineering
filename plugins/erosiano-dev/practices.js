#!/usr/bin/env node
import { closeSync, constants, fstatSync, openSync, readSync, realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const CATALOG_URL = new URL("./practices.json", import.meta.url);
const MAX_CONTEXT_BYTES = 256 * 1024;

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readJson(path, limit) {
  const fd = openSync(path, constants.O_RDONLY | (constants.O_NONBLOCK ?? 0));
  try {
    const info = fstatSync(fd);
    if (!info.isFile() || info.size > limit) throw new Error("Expected a bounded JSON file");
    const data = Buffer.alloc(limit + 1);
    let length = 0;
    while (length < data.length) {
      const size = readSync(fd, data, length, data.length - length, null);
      if (!size) break;
      length += size;
    }
    if (length > limit) throw new Error("JSON input exceeds size limit");

    return JSON.parse(data.subarray(0, length).toString("utf8"));
  } finally {
    closeSync(fd);
  }
}

export function readPracticeCatalog() {
  const catalog = readJson(CATALOG_URL, MAX_CONTEXT_BYTES);
  if (catalog.schemaVersion !== 1 || !Array.isArray(catalog.practices) || !Array.isArray(catalog.facets)) throw new Error("Unsupported practice catalog");
  const ids = new Set();
  const facets = new Set(catalog.facets);
  for (const rule of catalog.practices) {
    if (!isRecord(rule) || !/^(?:BL|S|C|T|A|D|R|SEC|F|B|Q|AI)\d{2}$/.test(rule.id) || ids.has(rule.id) ||
        !Number.isInteger(rule.version) || rule.version < 1 || typeof rule.title !== "string" || typeof rule.intent !== "string" ||
        !Array.isArray(rule.allOf) || !Array.isArray(rule.anyOf) || ![...rule.allOf, ...rule.anyOf].every(facet => facets.has(facet)) ||
        !Array.isArray(rule.mechanisms) || !["REQUIRED", "PREFERRED", "ADVISORY"].includes(rule.defaultLevel)) {
      throw new Error("Invalid or duplicate practice catalog entry");
    }
    ids.add(rule.id);
  }

  return catalog;
}

function applicability(rule, facts) {
  const get = name => Object.hasOwn(facts, name) ? facts[name] : undefined;
  if (rule.allOf.some(name => get(name) === false)) return "NOT_APPLICABLE";
  if (rule.anyOf.length && rule.anyOf.every(name => get(name) === false)) return "NOT_APPLICABLE";
  if (rule.allOf.some(name => get(name) === undefined)) return "UNKNOWN";
  if (rule.anyOf.length && !rule.anyOf.some(name => get(name) === true)) return "UNKNOWN";

  return "APPLICABLE";
}

function validateContext(input, catalog) {
  if (!isRecord(input) || !isRecord(input.facets)) throw new Error("Context requires a facets object with true/false observations");
  const validFacets = new Set(catalog.facets);
  const ids = new Set(catalog.practices.map(rule => rule.id));
  for (const [key, value] of Object.entries(input.facets)) {
    if (!validFacets.has(key) || typeof value !== "boolean") throw new Error("Unknown facet or non-boolean observation: " + key);
  }

  const overrides = input.projectOverrides ?? {};
  if (!isRecord(overrides)) throw new Error("projectOverrides must be an object");
  for (const [id, decision] of Object.entries(overrides)) {
    if (!ids.has(id) || !isRecord(decision) || !["required", "prefer-project", "exception"].includes(decision.disposition) ||
        typeof decision.reason !== "string" || !decision.reason.trim() ||
        typeof decision.evidence !== "string" || !decision.evidence.trim()) {
      throw new Error("Invalid or unsupported project override: " + id);
    }
  }

  const gates = input.enabledGates ?? [];
  const optionalGates = new Set(catalog.practices.filter(rule => rule.mechanisms.includes("optional-native-gate")).map(rule => rule.id));
  if (!Array.isArray(gates) || gates.some(id => !optionalGates.has(id))) throw new Error("enabledGates must contain known optional-native-gate practice IDs");
  if (input.mode !== undefined && !["balanced", "adaptive"].includes(input.mode)) throw new Error("Unsupported enforcement mode");

  return { overrides, gates: new Set(gates) };
}

/** Decisions describe supplied evidence, not an authenticated repository scan or executed gate. */
export function resolvePractices(input, catalog = readPracticeCatalog()) {
  const { overrides, gates } = validateContext(input, catalog);
  const decisions = catalog.practices.map(rule => {
    const status = applicability(rule, input.facets);
    const override = Object.hasOwn(overrides, rule.id) ? overrides[rule.id] : undefined;
    const nativeGate = gates.has(rule.id) && rule.mechanisms.includes("optional-native-gate");
    const decision = { id: rule.id, title: rule.title, group: rule.group, intent: rule.intent, status, level: rule.defaultLevel,
      mechanisms: rule.mechanisms, reason: "Applicable to supplied task facets" };
    if (status !== "APPLICABLE") {
      if (override?.disposition === "required" || nativeGate) {
        return { ...decision, status: "CONFLICT", level: "REQUIRED", reason: "Explicit project gate conflicts with missing or negative applicability; resolve with evidence", project: override };
      }
      return { ...decision, level: status === "NOT_APPLICABLE" ? "NOT_APPLICABLE" : "ADVISORY",
        reason: status === "UNKNOWN" ? "Missing task/baseline evidence; do not claim pass" : "Supplied facets exclude practice" };
    }

    if (override && override.disposition !== "required") {
      if (rule.safetyInvariant || rule.defaultLevel === "REQUIRED" || nativeGate) {
        return { ...decision, status: "CONFLICT", level: "REQUIRED", reason: "Project exception conflicts with required invariant or native gate; resolve explicitly", project: override };
      }
      return { ...decision, status: "SUPPRESSED", level: "ADVISORY", reason: "Scoped project convention or exception takes precedence", project: override };
    }
    if (override?.disposition === "required" || nativeGate) {
      return { ...decision, level: "REQUIRED", reason: "Explicitly supplied project rule or opted-in native gate", project: override };
    }

    return decision;
  });

  return { schemaVersion: 1, mode: input.mode ?? "balanced", evidence: "SUPPLIED_NOT_AUTHENTICATED", decisions };
}

export function renderPracticeSelection(result) {
  const selected = result.decisions.filter(rule => rule.status === "APPLICABLE" || rule.status === "CONFLICT");
  const lines = selected.map(rule => `${rule.id} [${rule.status}/${rule.level}] ${rule.title}: ${rule.intent}${rule.status === "CONFLICT" ? " — " + rule.reason : ""}`);
  const unknown = result.decisions.filter(rule => rule.status === "UNKNOWN").map(rule => rule.id);

  return [`Practices: ${selected.length} selected/conflicting; ${unknown.length} unresolved. Evidence: supplied, not authenticated.`, ...lines, ...(unknown.length ? ["Unknown applicability: " + unknown.join(", ")] : [])].join("\n");
}

function main(args) {
  if (args.length === 2 && args[0] === "--group") {
    const catalog = readPracticeCatalog();
    const rules = catalog.practices.filter(rule => rule.group === args[1]);
    if (!rules.length) throw new Error("Unknown practice group");
    console.log(JSON.stringify(rules, null, 2));

    return;
  }
  if (args.length !== 2 || args[0] !== "--context") throw new Error("Usage: erosiano-practices --context context.json | --group group");
  const result = resolvePractices(readJson(resolve(args[1]), MAX_CONTEXT_BYTES));
  console.log(JSON.stringify(result, null, 2));
}

function isMainModule() {
  try {
    if (!process.argv[1]) return false;

    return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMainModule()) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error("Practice selection NOT_ASSESSED: " + error.message);
    process.exitCode = 2;
  }
}
