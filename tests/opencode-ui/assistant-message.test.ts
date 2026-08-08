import { test } from "node:test";
import assert from "node:assert/strict";
import {
	insetRenderWidth,
	insetRenderedLines,
	insetToolLines,
	dropLeadingBlankRows,
	isThinkingOnlyMessage,
} from "../../extensions/opencode-ui/assistant-layout.ts";
import {
	ansiStrip,
	visibleWidth,
} from "../../extensions/opencode-ui/format.ts";

const ZONE_START = "\x1b]133;A\x07";
const ZONE_END = "\x1b]133;B\x07";
const ZONE_FINAL = "\x1b]133;C\x07";

// Builds a pi-style base line at render width W: 1-char outputPad margins
// around the content, padded to exactly W.
const baseLine = (W: number, content: string): string =>
	" " + content + " " + " ".repeat(Math.max(0, W - visibleWidth(content) - 2));

test("insetRenderWidth folds the base 1-char margins into the inset", () => {
	assert.equal(insetRenderWidth(20, 2, 2), 16);
	assert.equal(insetRenderWidth(20, 1, 1), 18);
	assert.equal(insetRenderWidth(10, 4, 4), 2);
	assert.equal(insetRenderWidth(3, 4, 4), 1);
});

test("insetRenderedLines insets text lines 2 cells each side", () => {
	// inner = 20 - 4 = 16, base rendered at insetRenderWidth(20, 2, 2) = 16
	const base = [baseLine(16, "hello world"), baseLine(16, "second line")];
	const out = insetRenderedLines(base, 20, 2, 2);
	assert.equal(out.length, 2);
	assert.equal(out[0], "  hello world" + " ".repeat(7));
	assert.equal(out[1], "  second line" + " ".repeat(7));
	for (const line of out) assert.equal(visibleWidth(line), 20);
});

test("insetRenderedLines preserves OSC 133 zones on first/last lines", () => {
	const base = [
		ZONE_START + baseLine(16, "hello world"),
		// pi prepends END + FINAL to the last line
		ZONE_END + ZONE_FINAL + baseLine(16, "second line"),
	];
	const out = insetRenderedLines(base, 20, 2, 2);
	assert.ok(out[0]?.startsWith(ZONE_START + "  hello world"));
	assert.ok((out[1] ?? "").startsWith(ZONE_END + ZONE_FINAL + "  second line"));
	for (const line of out) assert.equal(visibleWidth(line), 20);
});

test("insetRenderedLines shifts tool-card lines into the gutters", () => {
	const base = [
		"─".repeat(16), // dynamic border spanning the whole base width
		baseLine(16, "card body"),
	];
	const out = insetRenderedLines(base, 20, 2, 2);
	assert.equal(out[0], "  " + "─".repeat(16) + "  ");
	assert.equal(out[1], "  card body" + " ".repeat(9));
	for (const line of out) assert.equal(visibleWidth(line), 20);
});

test("insetRenderedLines passes kitty image lines through untouched", () => {
	const image = "\x1b_Gf=1,a=T,t=f,i=1,m=1;AAAA\x1b\\";
	const out = insetRenderedLines([image, baseLine(16, "after")], 20, 2, 2);
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
		"─".repeat(16),
		baseLine(16, "a".repeat(40)),
		baseLine(16, "short"),
	];
	for (const line of insetRenderedLines(base, 20, 2, 2)) {
		assert.ok(visibleWidth(line) <= 20);
	}
});

test("insetRenderedLines with inset=1 keeps a 1-cell gutter", () => {
	const base = [baseLine(18, "hello world")];
	const out = insetRenderedLines(base, 20, 1, 1);
	assert.equal(out[0], " hello world" + " ".repeat(8));
	assert.equal(visibleWidth(out[0] ?? ""), 20);
});

test("insetRenderedLines supports asymmetric left/right gutters", () => {
	// inner = 20 - 1 - 3 = 16, base rendered at insetRenderWidth(20, 1, 3) = 16
	const base = [baseLine(16, "hello world")];
	const out = insetRenderedLines(base, 20, 1, 3);
	assert.equal(out[0], " hello world" + " ".repeat(5) + "   ");
	assert.equal(visibleWidth(out[0]), 20);
});

test("insetToolLines shifts tool-card rows into the gutters", () => {
	// card spans exactly inner = 66 - 2 - 2 = 62
	const card = [
		"╭" + "─".repeat(60) + "╮",
		"│" + " ".repeat(60) + "│",
		"╰" + "─".repeat(60) + "╯",
	];
	const out = insetToolLines(card, 66, 2, 2);
	assert.equal(out[0], "  ╭" + "─".repeat(60) + "╮  ");
	assert.equal(out[1], "  │" + " ".repeat(60) + "│  ");
	assert.equal(out[2], "  ╰" + "─".repeat(60) + "╯  ");
	for (const line of out) assert.equal(visibleWidth(line), 66);
});

test("insetToolLines truncates over-wide rows defensively", () => {
	const out = insetToolLines(["─".repeat(80)], 66, 2, 2);
	assert.equal(visibleWidth(out[0]), 66);
	assert.equal(out[0], "  " + "─".repeat(62) + "  ");
});

test("insetToolLines passes kitty image lines through untouched", () => {
	const image = "\x1b_Gf=1,a=T,t=f,i=1,m=1;AAAA\x1b\\";
	const out = insetToolLines([image], 66, 2, 2);
	assert.equal(out[0], image);
});

test("isThinkingOnlyMessage detects the streaming thinking indicator", () => {
	assert.equal(
		isThinkingOnlyMessage([{ type: "thinking", thinking: " hmm " }]),
		true,
	);
	assert.equal(
		isThinkingOnlyMessage([
			{ type: "thinking", thinking: "hmm" },
			{ type: "text", text: "answer" },
		]),
		false,
	);
	assert.equal(
		isThinkingOnlyMessage([{ type: "thinking", thinking: "hmm" }]),
		true,
	);
	assert.equal(isThinkingOnlyMessage([]), false);
	assert.equal(isThinkingOnlyMessage([{ type: "text", text: "hi" }]), false);
	assert.equal(
		isThinkingOnlyMessage([
			{ type: "thinking", thinking: "hmm" },
			{ type: "toolCall" },
		]),
		false,
	);
	// empty thinking text renders nothing in pi
	assert.equal(
		isThinkingOnlyMessage([{ type: "thinking", thinking: "   " }]),
		false,
	);
});

test("dropLeadingBlankRows removes the spacer stub before the label", () => {
	// what the inset produces for a thinking-only message (width 20, 3/3):
	// a blank stub row (left+right spaces + OSC zone) then "Thinking..."
	const base = [ZONE_START + "      ", "   Thinking..." + " ".repeat(8)];
	const out = dropLeadingBlankRows(base);
	assert.equal(out.length, 1);
	assert.ok((out[0] ?? "").includes("Thinking..."));
	// non-blank first rows pass through untouched
	const keep = dropLeadingBlankRows(["   text", "   more"]);
	assert.deepEqual(keep, ["   text", "   more"]);
});

test("thinking-only render has no leading blank row", () => {
	// full pipeline: pi's base render for a thinking-only message, through the
	// inset, then the thinking-only blank-drop.
	const base = [
		ZONE_START + "",
		ZONE_END + ZONE_FINAL + baseLine(16, "Thinking..."),
	];
	const inset = insetRenderedLines(base, 20, 3, 3);
	assert.equal(inset.length, 2);
	assert.equal(ansiStrip(inset[0] ?? "").trim(), "");
	const dropped = dropLeadingBlankRows(inset);
	assert.equal(dropped.length, 1);
	assert.ok((dropped[0] ?? "").includes("Thinking..."));
});
