import { test } from "node:test";
import assert from "node:assert/strict";
import {
	formatCount,
	formatProviderLabel,
	bgToFgEscape,
	reapplyBackground,
	stripBaseMessageBox,
	thinkingTokenForLevel,
	buildGauge,
	gaugeLevel,
	ansiStrip,
	visibleWidth,
	padTo,
	truncateToWidth,
	wrapText,
	userMessageBgFgEscape,
	formatCacheHitRate,
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

test("bgToFgEscape rewrites a bg escape to fg", () => {
	assert.equal(bgToFgEscape("\x1b[48;2;18;20;20m"), "\x1b[38;2;18;20;20m");
	assert.equal(bgToFgEscape("\x1b[48;5;234m"), "\x1b[38;5;234m");
	assert.equal(bgToFgEscape("\x1b[49m"), undefined);
	assert.equal(bgToFgEscape(""), undefined);
	assert.equal(bgToFgEscape("plain"), undefined);
});

test("userMessageBgFgEscape derives the box color fg from the theme", () => {
	const theme = {
		bg: (color: string): string =>
			color === "userMessageBg" ? "\x1b[48;2;29;16;11m" : "\x1b[48;2;0;0;0m",
	};
	assert.equal(userMessageBgFgEscape(theme), "\x1b[38;2;29;16;11m");
	// a theme that throws (unknown color) falls back to no color
	const broken = {
		bg: (): string => {
			throw new Error("Unknown theme color");
		},
	};
	assert.equal(userMessageBgFgEscape(broken), "");
});

test("reapplyBackground keeps a row solid across SGR resets", () => {
	const bg = "\x1b[48;2;18;20;20m";
	const text = "a\x1b[0mb\x1b[0mc";
	assert.equal(
		reapplyBackground(bg, text),
		"a\x1b[0m" + bg + "b\x1b[0m" + bg + "c",
	);
	assert.equal(reapplyBackground(bg, "plain"), "plain");
});

test("stripBaseMessageBox removes the native box around content", () => {
	const bg = "\x1b[48;2;18;20;20m";
	const lines = [
		"\x1b]133;A\x07" + bg + "                   \x1b[49m",
		bg + " Hello \x1b[38;2;1;2;3mworld\x1b[39m      \x1b[49m",
		"\x1b]133;B\x07\x1b]133;C\x07" + bg + "                   \x1b[49m",
	];
	assert.deepEqual(stripBaseMessageBox(lines), [
		"Hello \x1b[38;2;1;2;3mworld\x1b[39m",
	]);
});

test("stripBaseMessageBox keeps interior blank lines (paragraphs)", () => {
	const bg = "\x1b[48;2;18;20;20m";
	const lines = [
		bg + "       \x1b[49m",
		bg + " a\x1b[49m",
		bg + "       \x1b[49m",
		bg + " b\x1b[49m",
		bg + "       \x1b[49m",
	];
	assert.deepEqual(stripBaseMessageBox(lines), ["a", "", "b"]);
});

test("thinkingTokenForLevel maps levels", () => {
	assert.equal(thinkingTokenForLevel("high"), "thinkingHigh");
	assert.equal(thinkingTokenForLevel("max"), "thinkingMax");
	assert.equal(thinkingTokenForLevel(undefined), "thinkingOff");
	assert.equal(thinkingTokenForLevel("bogus"), "thinkingOff");
});

test("buildGauge fills blocks with level-colored filled cells", () => {
	const noColor = (): string => "";
	assert.equal(ansiStrip(buildGauge(0, 13, noColor)), "▱".repeat(13));
	assert.equal(ansiStrip(buildGauge(100, 13, noColor)), "▰".repeat(13));
	assert.equal(
		ansiStrip(buildGauge(50, 13, noColor)),
		"▰".repeat(7) + "▱".repeat(6),
	);
	assert.equal(visibleWidth(buildGauge(77, 15, noColor)), 15);
	// the filled cells carry the provider color, the empty cells reset
	const mark = (percent: number): string =>
		percent < 50 ? "G" : percent < 80 ? "Y" : "R";
	assert.ok(buildGauge(100, 13, mark).startsWith("R▰"));
	assert.ok(buildGauge(0, 13, mark).includes("\x1b[39m▱"));
});

test("gaugeLevel thresholds", () => {
	assert.equal(gaugeLevel(0), "success");
	assert.equal(gaugeLevel(49), "success");
	assert.equal(gaugeLevel(50), "warning");
	assert.equal(gaugeLevel(79), "warning");
	assert.equal(gaugeLevel(80), "error");
	assert.equal(gaugeLevel(100), "error");
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

test("formatCacheHitRate reports cached share of read input", () => {
	assert.equal(formatCacheHitRate(60, 40), "cache 60%");
	assert.equal(formatCacheHitRate(0, 100), "cache 0%");
	assert.equal(formatCacheHitRate(100, 0), "cache 100%");
	assert.equal(formatCacheHitRate(0, 0), "");
	assert.equal(formatCacheHitRate(25, 25), "cache 50%");
	assert.equal(formatCacheHitRate(-5, 10), "cache 0%");
});
