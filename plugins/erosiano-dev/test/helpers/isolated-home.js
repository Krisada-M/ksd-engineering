// Loaded by `node --import` in the test scripts, so every test file (including future ones) gets an empty HOME
// and the developer's real global legacy/current config cannot leak in.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const isolatedHome = mkdtempSync(join(tmpdir(), "ksd-home-"));
process.env.HOME = isolatedHome;
process.env.KSD_TEST_HOME = isolatedHome;
process.env.USERPROFILE = isolatedHome;
delete process.env.ENGINEERING_PROXY_DISABLED;
delete process.env.EROSIANO_DEV_DISABLED;
process.on("exit", () => rmSync(isolatedHome, { recursive: true, force: true }));
