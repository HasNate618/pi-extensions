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

test("composer draws input, metadata at bottom, and indented bar", () => {
	const lines = composeComposerLines({
		width: 20,
		contentLines: ["input"],
		modelLabel: "M",
		providerLabel: "P",
		thinkingLabel: "high",
		style: identity,
		config,
	});
	assert.equal(lines.length, 3);
	// input row first
	assert.equal(lines[0], " ┃ input            ");
	// model · provider · thinking at the bottom, above the bar
	assert.equal(lines[1], " ┃  M · P · high    ");
	// bottom bar: 1-char indent; fill is spaces (identity style)
	assert.equal(lines[2], " ╹" + " ".repeat(18));
});

test("composer spaces the last message with blank rail rows", () => {
	const lines = composeComposerLines({
		width: 20,
		contentLines: ["input"],
		lastMessage: "hello world",
		modelLabel: "M",
		providerLabel: "P",
		style: identity,
		config,
	});
	// blank rail above the message, message, blank rail below
	assert.equal(lines[0], " ┃                  ");
	assert.equal(lines[1], " ┃  hello world     ");
	assert.equal(lines[2], " ┃                  ");
	// input, then metadata at the bottom
	assert.equal(lines[3], " ┃ input            ");
	assert.equal(lines[4], " ┃  M · P           ");
	assert.equal(lines[5], " ╹" + " ".repeat(18));
});

test("composer last message truncates over-wide unbreakable lines", () => {
	// A pasted line wider than the terminal (e.g. a box border) must never
	// overflow the row: pi hard-crashes on rendered width > terminal width.
	const lines = composeComposerLines({
		width: 20,
		contentLines: ["input"],
		lastMessage: "╹" + "▀".repeat(100),
		modelLabel: "M",
		providerLabel: "P",
		style: identity,
		config,
	});
	for (const line of lines) {
		assert.ok(
			visibleWidth(line) <= 20,
			`last-message row exceeds width: ${JSON.stringify(line)}`,
		);
	}
	assert.ok((lines[0] ?? "").startsWith(" ┃  "));
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
	assert.equal(lines[0], " ┃ x                ");
	assert.equal(lines[1], " ┃  M · P           ");
	assert.equal(lines[2], " ╹" + " ".repeat(18));
});

test("composer preserves input rows verbatim after the rail", () => {
	const lines = composeComposerLines({
		width: 12,
		contentLines: ["ab", "cd"],
		modelLabel: "M",
		providerLabel: "P",
		style: identity,
		config,
	});
	assert.equal(lines[0], " ┃ ab       ");
	assert.equal(lines[1], " ┃ cd       ");
	assert.equal(lines[2], " ┃  M · P   ");
	assert.equal(lines[3], " ╹" + " ".repeat(10));
});

test("composer with margins disabled has no left space", () => {
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
	assert.equal(lines[0], "┃ x       ");
	assert.equal(lines[1], "┃  M · P  ");
	assert.equal(lines[2], "╹" + " ".repeat(9));
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
	assert.ok(line.startsWith(" proj:main"));
	assert.ok(line.endsWith("▰▰▰▰▱▱▱▱▱▱▱▱▱ 229k/1M · $0.005 "));
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
	assert.ok((lines[0] ?? "").endsWith("▰▱ 1k/2k "));
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
		width: 12,
		lines: ["Hello"],
		style: identity,
		config,
	});
	assert.deepEqual(lines, [" ┃          ", " ┃  Hello   ", " ┃          "]);
});

test("user message block wraps long content", () => {
	const lines = composeUserMessageBlock({
		width: 12,
		lines: ["one two three four"],
		style: identity,
		config,
	});
	// contentMax = 12-1-1-1-2 = 7 → ["one two", "three", "four"] + 2 rail rows
	assert.equal(lines.length, 5);
	assert.ok((lines[1] ?? "").includes("one two"));
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
	assert.ok((lines[1] ?? "").startsWith(" ┃  "));
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
