import { test } from "node:test";
import assert from "node:assert/strict";
import {
	parseEditorBorder,
	stripEditorFrame,
} from "../../extensions/opencode-ui/border.ts";

test("parseEditorBorder detects plain and scrolled borders", () => {
	assert.deepEqual(parseEditorBorder("─".repeat(10), "above"), {});
	assert.deepEqual(parseEditorBorder("─── ↑ 3 more ─────", "above"), { count: "3" });
	assert.deepEqual(parseEditorBorder("─── ↓ 2 more ─────", "below"), { count: "2" });
	assert.equal(parseEditorBorder("not a border", "above"), undefined);
});

test("stripEditorFrame strips top/bottom and side glyphs", () => {
	const lines = [
		"─".repeat(12),
		"│ hello ",
		"│ world ",
		"─".repeat(12),
	];
	const result = stripEditorFrame(lines, 12);
	assert.ok(result);
	assert.deepEqual(result.content, ["hello", "world"]);
});

test("stripEditorFrame drops paddingX spaces and preserves SGR + cursor marker", () => {
	const marker = "\x1b_pi:c\x07";
	const reverseCursor = "\x1b[7m \x1b[0m";
	const sgr = "\x1b[38;2;1;2;3m";
	const lines = [
		"─".repeat(12),
		`  ${sgr}abc${reverseCursor}${marker}  `,
		"─".repeat(12),
	];
	const result = stripEditorFrame(lines, 12, 2);
	assert.ok(result);
	// The 2-space side padding is stripped, but SGR colors, the reverse-video
	// cursor block, and pi's cursor marker all survive.
	assert.equal(result.content[0], `${sgr}abc${reverseCursor}${marker}`);
});

test("stripEditorFrame returns undefined for malformed input", () => {
	assert.equal(stripEditorFrame(["a", "b"], 12), undefined);
	assert.equal(stripEditorFrame(["─".repeat(12), "│ x ", "not-a-border"], 12), undefined);
});
