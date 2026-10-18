import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const DEFAULT = Object.freeze({ enabled: true, enforcement: "balanced" });

export function findProjectRoot(cwd) {
  let current = resolve(cwd);
  while (true) {
    if (existsSync(join(current, ".git")) || existsSync(join(current, ".omp"))) return current;
    const parent = dirname(current);
    if (parent === current) return resolve(cwd);
    current = parent;
  }
}

export function loadConfig(cwd) {
  const root = findProjectRoot(cwd);
  const target = join(root, ".engineering-proxy.json");
  if (!existsSync(target)) return { ...DEFAULT, root, configPresent: false };

  let parsed;
  try {
    parsed = JSON.parse(readFileSync(target, "utf8"));
  } catch (error) {
    return { ...DEFAULT, enabled: false, root, configPresent: true, configError: `Cannot parse .engineering-proxy.json: ${error.message}` };
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed) ||
      (parsed.enabled !== undefined && typeof parsed.enabled !== "boolean") ||
      (parsed.enforcement !== undefined && parsed.enforcement !== "balanced")) {
    return { ...DEFAULT, enabled: false, root, configPresent: true, configError: "Invalid .engineering-proxy.json (expected enabled:boolean and enforcement:'balanced')" };
  }

  return { ...DEFAULT, root, configPresent: true, enabled: parsed.enabled ?? true, enforcement: "balanced" };
}
