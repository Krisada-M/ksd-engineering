import assert from "node:assert/strict";
import { createInventory } from "../inventory.mjs";
try {
    const inventory = createInventory(1);
    const results = await Promise.all([inventory.reserve(1), inventory.reserve(1)]);
    assert.equal(results.filter(Boolean).length, 1);
    assert.equal(inventory.remaining(), 0);
    for (const invalid of [0, -1, NaN, Infinity, 0.5]) {
        assert.equal(await inventory.reserve(invalid), false);
    }
    assert.equal(inventory.remaining(), 0);
    console.log("PASS inventory invariants");
} catch (error) {
    console.log("FAIL inventory invariants:", error.message);
    process.exitCode = 1;
}
