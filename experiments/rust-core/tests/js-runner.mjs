import { readFileSync } from "node:fs";
import { inspectChangedScope } from "../../../plugins/engineering-proxy/change-scope.js";

try {
  const request = JSON.parse(readFileSync(0, "utf8"));
  const output = inspectChangedScope(request.patch, request.eslintReport, { cwd: request.cwd });
  process.stdout.write(JSON.stringify(output) + "\n");
  if (output.status === "FIX_REQUIRED") process.exitCode = 1;
  if (output.status === "NOT_RUN") process.exitCode = 2;
} catch (error) {
  process.stderr.write("JS baseline NOT RUN: " + error.message + "\n");
  process.exitCode = 2;
}
