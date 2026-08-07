import { test } from "node:test";
import assert from "node:assert/strict";
import {
	DEFAULT_CONFIG,
	type OpenCodeUiConfig,
} from "../../extensions/opencode-ui/config.ts";
import {
	composeComposerLines,
	composeFooterLines,
	composeUserMessageBlock,
} from "../../extensions/opencode-ui/layout.ts";
import { visibleWidth } from "../../extensions/opencode-ui/format.ts";

const identity = (text: string): string => text;

const config: OpenCodeUiConfig = DEFAULT_CONFIG;

test("composer draws the typed message as a padded box with metadata and bar", () => {
	const lines = composeComposerLines({
		width: 20,
		contentLines: ["input"],
		modelLabel: "M",
		providerLabel: "P",
		thinkingLabel: "high",
		style: identity,
		config,
	});
	assert.equal(lines.length, 5);
	// blank rail row above the typed message (left/right gutters transparent)
	assert.equal(lines[0], "   ┃" + " ".repeat(16));
	// the typed message at rail + 2
	assert.equal(lines[1], "   ┃  input" + " ".repeat(9));
	// blank rail row below the typed message
	assert.equal(lines[2], "   ┃" + " ".repeat(16));
	// model · provider · thinking at the bottom, above the bar
	assert.equal(lines[3], "   ┃  M · P · hi…" + " ".repeat(3));
	// bottom edge: half-height glyphs, 3-char indent, 3-char right gutter
	assert.equal(lines[4], "   ╹" + "▀".repeat(13) + "   ");
});

test("composer wraps multi-line input with blank rail padding rows", () => {
	const lines = composeComposerLines({
		width: 16,
		contentLines: ["ab", "cd"],
		modelLabel: "M",
		providerLabel: "P",
		style: identity,
		config,
	});
	assert.equal(lines.length, 6);
	assert.equal(lines[0], "   ┃" + " ".repeat(12));
	assert.equal(lines[1], "   ┃  ab" + " ".repeat(8));
	assert.equal(lines[2], "   ┃  cd" + " ".repeat(8));
	assert.equal(lines[3], "   ┃" + " ".repeat(12));
	assert.equal(lines[4], "   ┃  M · P" + " ".repeat(5));
	assert.equal(lines[5], "   ╹" + "▀".repeat(9) + "   ");
});

test("composer truncates over-wide unbreakable content lines", () => {
	// A pasted line wider than the terminal (e.g. a box border) must never
	// overflow the row: pi hard-crashes on rendered width > terminal width.
	const lines = composeComposerLines({
		width: 20,
		contentLines: ["╹" + "▀".repeat(100)],
		modelLabel: "M",
		providerLabel: "P",
		style: identity,
		config,
	});
	for (const line of lines) {
		assert.ok(
			visibleWidth(line) <= 20,
			`composer row exceeds width: ${JSON.stringify(line)}`,
		);
	}
	assert.ok((lines[1] ?? "").includes("…"));
});

test("composer omits thinking when undefined", () => {
	const lines = composeComposerLines({
		width: 20,
		contentLines: ["x"],
		modelLabel: "M",
		providerLabel: "P",
		style: identity,
		config,
	});
	assert.equal(lines[0], "   ┃" + " ".repeat(16));
	assert.equal(lines[1], "   ┃  x" + " ".repeat(13));
	assert.equal(lines[2], "   ┃" + " ".repeat(16));
	assert.equal(lines[3], "   ┃  M · P" + " ".repeat(9));
	assert.equal(lines[4], "   ╹" + "▀".repeat(13) + "   ");
});

test("composer wraps body rows in fill and the edge in bar", () => {
	const calls: Array<[string, string]> = [];
	const spy = (
		text: string,
		role: Parameters<typeof identity>[0] extends string ? string : never,
	): string => {
		calls.push([text, role]);
		return text;
	};
	composeComposerLines({
		width: 20,
		contentLines: ["x"],
		modelLabel: "M",
		providerLabel: "P",
		style: spy,
		config,
	});
	const roles = calls.map(([, role]) => role);
	// every body row (padding, message, metadata) is wrapped in "fill" plus
	// the bar's corner sits on the fill; the edge glyphs use "bar"
	assert.ok(
		roles.includes("fill"),
		`expected fill role, got ${roles.join(",")}`,
	);
	assert.ok(roles.includes("bar"), `expected bar role, got ${roles.join(",")}`);
	assert.ok(
		roles.includes("rail"),
		`expected rail role, got ${roles.join(",")}`,
	);
	assert.ok(
		calls.some(([, r]) => r === "model"),
		"metadata model role",
	);
	assert.ok(
		calls.some(([, r]) => r === "muted"),
		"metadata muted role",
	);
	// 4 body rows (padding, message, padding, metadata); the rail and the
	// corner sit outside the fill
	assert.equal(calls.filter(([, r]) => r === "fill").length, 4);
});

test("composer with margins disabled has no gutters", () => {
	const noMargin = {
		...DEFAULT_CONFIG,
		margins: { left: 0, right: 0, bottom: true },
	};
	const lines = composeComposerLines({
		width: 10,
		contentLines: ["x"],
		modelLabel: "M",
		providerLabel: "P",
		style: identity,
		config: noMargin,
	});
	assert.equal(lines[0], "┃" + " ".repeat(9));
	assert.equal(lines[1], "┃  x" + " ".repeat(6));
	assert.equal(lines[2], "┃" + " ".repeat(9));
	assert.equal(lines[3], "┃  M · P" + " ".repeat(2));
	assert.equal(lines[4], "╹" + "▀".repeat(9));
});

test("footer aligns left and right segments with margins", () => {
	const lines = composeFooterLines({
		width: 45,
		left: "proj:main",
		contextLabel: "229k/1M",
		gauge: "▰▰▰▰▱▱▱▱▱▱▱▱▱",
		costLabel: "$0.005",
		style: identity,
		config,
	});
	assert.equal(lines.length, 2);
	assert.equal(lines[1], "");
	const line = lines[0] ?? "";
	assert.ok(line.startsWith("   proj:ma…"));
	assert.ok(
		line.endsWith("▰▰▰▰▱▱▱▱▱▱▱▱▱ 229k/1M · $0.005   "),
	);
	assert.equal(line.length, 45);
});

test("footer without cost omits it", () => {
	const lines = composeFooterLines({
		width: 20,
		left: "p:b",
		contextLabel: "1k/2k",
		gauge: "▰▱",
		costLabel: "",
		style: identity,
		config,
	});
	assert.ok((lines[0] ?? "").endsWith("▰▱ 1k/2k   "));
});

test("footer drops bottom blank row when margins.bottom is false", () => {
	const noBottom = {
		...DEFAULT_CONFIG,
		margins: { left: 1, right: 1, bottom: false },
	};
	const lines = composeFooterLines({
		width: 20,
		left: "p:b",
		contextLabel: "1k/2k",
		gauge: "▰▱",
		costLabel: "",
		style: identity,
		config: noBottom,
	});
	assert.equal(lines.length, 1);
});

test("user message block draws rail around content", () => {
	const lines = composeUserMessageBlock({
		width: 20,
		lines: ["Hello"],
		style: identity,
		config,
	});
	assert.deepEqual(lines, [
		"   ┃" + " ".repeat(16),
		"   ┃  Hello" + " ".repeat(9),
		"   ┃" + " ".repeat(16),
	]);
});

test("user message block applies the fill to every row", () => {
	const fillCalls: string[] = [];
	const spy = (
		text: string,
		role: Parameters<typeof identity>[0] extends string ? string : never,
	): string => {
		if (role === "fill") fillCalls.push(text);
		return text;
	};
	composeUserMessageBlock({
		width: 20,
		lines: ["Hello"],
		style: spy,
		config,
	});
	// gap row, content row, gap row — all wrapped in the fill; the rail
	// itself stays outside the fill
	assert.equal(fillCalls.length, 3);
	assert.ok((fillCalls[1] ?? "").includes("  Hello"));
	assert.ok(!(fillCalls[1] ?? "").includes("┃"));
});

test("user message block wraps long content", () => {
	const lines = composeUserMessageBlock({
		width: 12,
		lines: ["one two three four"],
		style: identity,
		config,
	});
	// contentMax = 12-1-2-1-2 = 6 → ["one", "two", "three", "four"] + 2 rail rows
	assert.equal(lines.length, 6);
	assert.ok((lines[1] ?? "").includes("one"));
});

test("user message block is idempotent for pre-wrapped lines", () => {
	const single = composeUserMessageBlock({
		width: 12,
		lines: ["one two three four"],
		style: identity,
		config,
	});
	const preWrapped = composeUserMessageBlock({
		width: 12,
		lines: ["one two", "three", "four"],
		style: identity,
		config,
	});
	assert.deepEqual(single, preWrapped);
});

test("user message block truncates over-wide unbreakable lines", () => {
	const lines = composeUserMessageBlock({
		width: 20,
		lines: ["╹" + "▀".repeat(100)],
		style: identity,
		config,
	});
	for (const line of lines) {
		assert.ok(
			visibleWidth(line) <= 20,
			`user-message row exceeds width: ${JSON.stringify(line)}`,
		);
	}
	assert.ok((lines[1] ?? "").startsWith("   ┃  "));
});

test("footer never overflows narrow width", () => {
	const lines = composeFooterLines({
		width: 20,
		left: "proj:main:some-branch",
		contextLabel: "999.9k/999M",
		gauge: "▰".repeat(13),
		costLabel: "$9999.99",
		style: identity,
		config,
	});
	for (const line of lines) {
		assert.ok(
			visibleWidth(line) <= 20,
			`footer row exceeds width: ${JSON.stringify(line)}`,
		);
	}
});
