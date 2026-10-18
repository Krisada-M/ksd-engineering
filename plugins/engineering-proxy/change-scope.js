import { isAbsolute, relative, normalize } from "node:path";

/** Parse zero-context Git patches. Added lines only; deletion-only hunks are not enforceable. */
export function parseChangedLines(patch) {
  if (typeof patch !== "string") throw new TypeError("Git diff must be text");

  const files = new Map();
  let path = null;

  for (const line of patch.split(/\r?\n/)) {
    if (line.startsWith("diff --git ")) {
      path = null;
      continue;
    }

    if (line.startsWith("+++ b/")) {
      path = line.slice(6).replaceAll("\\", "/");
      if (!files.has(path)) files.set(path, new Set());
      continue;
    }

    if (line === "+++ /dev/null") {
      path = null;
      continue;
    }

    if (!path || !line.startsWith("@@ ")) continue;
    const match = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (!match) continue;

    const start = Number(match[1]);
    const count = match[2] === undefined ? 1 : Number(match[2]);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(count) || count > 100_000) {
      throw new Error("Invalid or excessively large Git diff hunk");
    }

    for (let n = start; n < start + count; n++) files.get(path).add(n);
  }

  return files;
}

function reportPath(filename, cwd) {
  if (typeof filename !== "string" || filename.length === 0) return null;
  const local = isAbsolute(filename) ? relative(cwd, filename) : filename;
  const value = normalize(local).replaceAll("\\", "/").replace(/^\.\//, "");
  return value === ".." || value.startsWith("../") ? null : value;
}

/**
 * Restrict diagnostics from a real ESLint JSON report to changed source lines.
 * The neighboring line is included for boundary spacing (new helper before old helper).
 * A clean report does NOT prove that the required plugin rules were configured.
 */
export function inspectChangedScope(patch, eslintReport, { cwd = process.cwd() } = {}) {
  const changes = parseChangedLines(patch);
  const sourceFiles = [...changes.keys()].filter(name => /\.[cm]?[jt]sx?$/.test(name));
  if (sourceFiles.length === 0) {
    return { status: "NOT_APPLICABLE", checkedFiles: [], missingFiles: [], diagnostics: [] };
  }

  if (!Array.isArray(eslintReport)) throw new TypeError("Expected ESLint JSON array");
  const reports = new Map();
  for (const entry of eslintReport) {
    const key = reportPath(entry?.filePath, cwd);
    if (!key || !Array.isArray(entry?.messages)) continue;
    reports.set(key, entry.messages);
  }

  const missingFiles = sourceFiles.filter(file => !reports.has(file));
  const diagnostics = [];

  for (const file of sourceFiles) {
    const changed = changes.get(file);
    for (const issue of reports.get(file) ?? []) {
      const lineno = issue?.line;
      const inScope = Number.isSafeInteger(lineno)
        ? changed.has(lineno) || changed.has(lineno - 1)
        : issue?.fatal === true;
      if (!inScope) continue;

      diagnostics.push({
        file,
        line: lineno ?? null,
        ruleId: issue.ruleId ?? null,
        severity: issue.severity === 2 || issue.fatal ? "error" : "warning",
        message: String(issue.message ?? "Unspecified diagnostic"),
      });
    }
  }

  const status = missingFiles.length > 0
    ? "NOT_RUN"
    : diagnostics.some(d => d.severity === "error")
      ? "FIX_REQUIRED"
      : diagnostics.length > 0
        ? "WARN"
        : "PASS";

  return {
    status,
    checkedFiles: sourceFiles.filter(file => reports.has(file)),
    missingFiles,
    diagnostics,
    limitation: "PASS only means no changed-line diagnostics in the supplied ESLint JSON; ESLint rule configuration and CI execution are not independently verified.",
  };
}
