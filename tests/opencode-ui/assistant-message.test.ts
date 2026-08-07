import { test } from "node:test";
import assert from "node:assert/strict";
import {
	insetRenderWidth,
	insetRenderedLines,
} from "../../extensions/opencode-ui/assistant-layout.ts";
import { visibleWidth } from "../../extensions/opencode-ui/format.ts";

const ZONE_START = "\x1b]133;A\x07";
const ZONE_END = "\x1b]133;B\x07";
const ZONE_FINAL = "\x1b]133;C\x07";

// Builds a pi-style base line at render width W: 1-char outputPad margins
// around the content, padded to exactly W.
const baseLine = (W: number, content: string): string =>
	" " + content + " " + " ".repeat(Math.max(0, W - visibleWidth(content) - 2));

test("insetRenderWidth folds the base 1-char margins into the inset", () => {
	assert.equal(insetRenderWidth(20, 2, 2), 18);
	assert.equal(insetRenderWidth(20, 1, 1), 20);
	assert.equal(insetRenderWidth(10, 4, 4), 4);
	assert.equal(insetRenderWidth(3, 4, 4), 1);
});

test("insetRenderedLines insets text lines 2 cells each side", () => {
	// inner = 20 - 4 = 16, base rendered at insetRenderWidth(20, 2, 2) = 18
	const base = [baseLine(18, "hello world"), baseLine(18, "second line")];
	const out = insetRenderedLines(base, 20, 2, 2);
	assert.equal(out.length, 2);
	assert.equal(out[0], "  hello world" + " ".repeat(7));
	assert.equal(out[1], "  second line" + " ".repeat(7));
	for (const line of out) assert.equal(visibleWidth(line), 20);
});

test("insetRenderedLines preserves OSC 133 zones on first/last lines", () => {
	const base = [
		ZONE_START + baseLine(18, "hello world"),
		// pi prepends END + FINAL to the last line
		ZONE_END + ZONE_FINAL + baseLine(18, "second line"),
	];
	const out = insetRenderedLines(base, 20, 2, 2);
	assert.ok(out[0]?.startsWith(ZONE_START + "  hello world"));
	assert.ok((out[1] ?? "").startsWith(ZONE_END + ZONE_FINAL + "  second line"));
	for (const line of out) assert.equal(visibleWidth(line), 20);
});

test("insetRenderedLines keeps tool-card lines intact, padded right", () => {
	const base = [
		"─".repeat(18), // dynamic border across the full render width
		baseLine(18, "card body"),
	];
	const out = insetRenderedLines(base, 20, 2, 2);
	assert.equal(out[0], "─".repeat(18) + "  ");
	assert.equal(out[1], "  card body" + " ".repeat(9));
	for (const line of out) assert.equal(visibleWidth(line), 20);
});

test("insetRenderedLines passes kitty image lines through untouched", () => {
	const image = "\x1b_Gf=1,a=T,t=f,i=1,m=1;AAAA\x1b\\";
	const out = insetRenderedLines([image, baseLine(18, "after")], 20, 2, 2);
	assert.equal(out[0], image);
	assert.equal(visibleWidth(out[1] ?? ""), 20);
});

test("insetRenderedLines handles empty input and inset=0", () => {
	assert.deepEqual(insetRenderedLines([], 20, 2, 2), []);
	const plain = [" hello world" + " ".repeat(8)];
	assert.equal(
		insetRenderedLines(plain, 20, 0, 0)[0],
		"hello world" + " ".repeat(9),
	);
});

test("insetRenderedLines never overflows the row", () => {
	const base = [
		"─".repeat(18),
		baseLine(18, "a".repeat(40)),
		baseLine(18, "short"),
	];
	for (const line of insetRenderedLines(base, 20, 2, 2)) {
		assert.ok(visibleWidth(line) <= 20);
	}
});

test("insetRenderedLines with inset=1 keeps a 1-cell gutter", () => {
	const base = [baseLine(20, "hello world")];
	const out = insetRenderedLines(base, 20, 1, 1);
	assert.equal(out[0], " hello world" + " ".repeat(8));
	assert.equal(visibleWidth(out[0] ?? ""), 20);
});

test("insetRenderedLines supports asymmetric left/right gutters", () => {
	// inner = 20 - 1 - 3 = 16, base rendered at insetRenderWidth(20, 1, 3) = 18
	const base = [baseLine(18, "hello world")];
	const out = insetRenderedLines(base, 20, 1, 3);
	assert.equal(out[0], " hello world" + " ".repeat(5) + "   ");
	assert.equal(visibleWidth(out[0]), 20);
});
