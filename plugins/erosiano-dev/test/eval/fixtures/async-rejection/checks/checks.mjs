import assert from "node:assert/strict";
import { publish } from "../publish.mjs";
try {
    let completed = false;
    const result = await publish(async () => { await Promise.resolve(); completed = true; }, "draft");
    assert.equal(completed, true);
    assert.deepEqual(result, { published: true });
    await assert.rejects(() => publish(async () => { throw new Error("write failed"); }, "draft"), /write failed/);
    console.log("PASS async write contract");
} catch (error) {
    console.log("FAIL async write contract:", error.message);
    process.exitCode = 1;
}
