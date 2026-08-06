import { test } from "node:test";
import assert from "node:assert/strict";
import {
	computeUsageTotals,
	computeUsageFingerprint,
	type SessionEntry,
} from "../../extensions/opencode-ui/usage.ts";

const entries: SessionEntry[] = [
	{ type: "message", message: { role: "assistant", usage: { input: 100, output: 50, cost: { total: 0.005 } } } },
	{ type: "message", message: { role: "user", usage: { input: 10 } } },
	{ type: "message", message: { role: "toolResult", usage: { input: 20 } } },
	{ type: "compaction", usage: { input: 5, output: 2 } },
];

test("computeUsageTotals aggregates assistant/tool/compaction usage", () => {
	const totals = computeUsageTotals(entries);
	assert.equal(totals.input, 125);
	assert.equal(totals.output, 52);
	assert.equal(totals.cost, 0.005);
});

test("computeUsageFingerprint changes when entries change", () => {
	assert.notEqual(computeUsageFingerprint(entries), computeUsageFingerprint([]));
});
