import { test } from "node:test";
import assert from "node:assert/strict";
import {
	formatCount,
	formatProviderLabel,
	thinkingTokenForLevel,
	buildGauge,
	ansiStrip,
	visibleWidth,
	padTo,
	truncateToWidth,
	wrapText,
	formatContextLabel,
	formatCostLabel,
} from "../../extensions/opencode-ui/format.ts";

test("formatCount compact form", () => {
	assert.equal(formatCount(995), "995");
	assert.equal(formatCount(229_000), "229k");
	assert.equal(formatCount(1_050_000), "1.1M");
	assert.equal(formatCount(1_000_000), "1M");
});

test("formatProviderLabel title-cases", () => {
	assert.equal(formatProviderLabel("opencode-go"), "Opencode Go");
	assert.equal(formatProviderLabel("OpenCode Go"), "OpenCode Go");
	assert.equal(formatProviderLabel(undefined), "Unknown");
});

test("thinkingTokenForLevel maps levels", () => {
	assert.equal(thinkingTokenForLevel("high"), "thinkingHigh");
	assert.equal(thinkingTokenForLevel("max"), "thinkingMax");
	assert.equal(thinkingTokenForLevel(undefined), "thinkingOff");
	assert.equal(thinkingTokenForLevel("bogus"), "thinkingOff");
});

test("buildGauge fills blocks", () => {
	assert.equal(buildGauge(0, 13), "▱".repeat(13));
	assert.equal(buildGauge(100, 13), "▰".repeat(13));
	assert.equal(buildGauge(50, 13), "▰".repeat(7) + "▱".repeat(6));
	assert.equal(buildGauge(150, 13), "▰".repeat(13));
});

test("ansiStrip removes escape codes", () => {
	assert.equal(ansiStrip("\x1b[32mgreen\x1b[0m"), "green");
});

test("visibleWidth counts wide chars as 2", () => {
	assert.equal(visibleWidth("abc"), 3);
	assert.equal(visibleWidth("▰▱"), 2);
	assert.equal(visibleWidth("中"), 2);
});

test("padTo pads to target width", () => {
	assert.equal(padTo("ab", 4), "ab  ");
});

test("truncateToWidth adds ellipsis", () => {
	assert.equal(truncateToWidth("abcdef", 4), "abc…");
	assert.equal(truncateToWidth("abc", 4), "abc");
});

test("wrapText wraps long lines", () => {
	const wrapped = wrapText("one two three", 7);
	assert.deepEqual(wrapped, ["one two", "three"]);
});

test("formatContextLabel uses compact counts", () => {
	assert.equal(formatContextLabel(229_000, 1_000_000), "229k/1M");
	assert.equal(formatContextLabel(undefined, undefined), "--");
	assert.equal(formatContextLabel(0, 100_000), "0/100k");
});

test("formatCostLabel", () => {
	assert.equal(formatCostLabel(0.005), "$0.005");
	assert.equal(formatCostLabel(0.123), "$0.12");
	assert.equal(formatCostLabel(1.5), "$1.50");
	assert.equal(formatCostLabel(0), "");
});

test("ansiStrip removes DCS and APC sequences", () => {
	assert.equal(ansiStrip("\x1bP1;2cat\x1b\\"), "");
	assert.equal(ansiStrip("\x1b_pi:c\x07"), "");
});

test("visibleWidth treats escape sequences as zero width", () => {
	assert.equal(visibleWidth("\x1b_pi:c\x07ab"), 2);
	assert.equal(visibleWidth("a\x1b[31mb\x1b[0mc"), 3);
	assert.equal(visibleWidth("\x1bP1;2cat\x1b\\x"), 1);
});

test("truncateToWidth never splits the cursor marker", () => {
	const marker = "\x1b_pi:c\x07";
	const result = truncateToWidth(marker + "abcdefgh", 4);
	assert.ok(
		result.includes(marker),
		`marker must survive: ${JSON.stringify(result)}`,
	);
	assert.equal(visibleWidth(result), 4);
	assert.ok(result.endsWith("…"));
});
