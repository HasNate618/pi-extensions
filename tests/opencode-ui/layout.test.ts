import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CONFIG, type OpenCodeUiConfig } from "../../extensions/opencode-ui/config.ts";
import { composeComposerLines } from "../../extensions/opencode-ui/layout.ts";

const identity = (text: string): string => text;

const config: OpenCodeUiConfig = DEFAULT_CONFIG;

test("composer draws rail, metadata, input and bar with margins", () => {
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
	assert.equal(lines[0], " ┃  M · P · high    ");
	assert.equal(lines[1], " ┃ input            ");
	assert.equal(lines[2], "╹" + "▀".repeat(19));
});

test("composer includes wrapped last message when provided", () => {
	const lines = composeComposerLines({
		width: 20,
		contentLines: ["input"],
		lastMessage: "hello world",
		modelLabel: "M",
		providerLabel: "P",
		style: identity,
		config,
	});
	assert.equal(lines[0], " ┃  hello world     ");
	assert.equal(lines[1], " ┃  M · P           ");
	assert.equal(lines[2], " ┃ input            ");
	assert.equal(lines[3], "╹" + "▀".repeat(19));
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
	assert.equal(lines[0], " ┃  M · P           ");
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
	assert.equal(lines[1], " ┃ ab       ");
	assert.equal(lines[2], " ┃ cd       ");
});

test("composer with margins disabled has no left space", () => {
	const noMargin = { ...DEFAULT_CONFIG, margins: { left: 0, right: 0, bottom: true } };
	const lines = composeComposerLines({
		width: 10,
		contentLines: ["x"],
		modelLabel: "M",
		providerLabel: "P",
		style: identity,
		config: noMargin,
	});
	assert.equal(lines[0], "┃  M · P  ");
});
