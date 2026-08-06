import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

const REQUIRED_TOKENS = [
	"accent", "border", "borderAccent", "borderMuted", "success", "error",
	"warning", "muted", "dim", "text", "thinkingText", "selectedBg",
	"userMessageBg", "userMessageText", "customMessageBg", "customMessageText",
	"customMessageLabel", "toolPendingBg", "toolSuccessBg", "toolErrorBg",
	"toolTitle", "toolOutput", "mdHeading", "mdLink", "mdLinkUrl", "mdCode",
	"mdCodeBlock", "mdCodeBlockBorder", "mdQuote", "mdQuoteBorder", "mdHr",
	"mdListBullet", "toolDiffAdded", "toolDiffRemoved", "toolDiffContext",
	"syntaxComment", "syntaxKeyword", "syntaxFunction", "syntaxVariable",
	"syntaxString", "syntaxNumber", "syntaxType", "syntaxOperator",
	"syntaxPunctuation", "thinkingOff", "thinkingMinimal", "thinkingLow",
	"thinkingMedium", "thinkingHigh", "thinkingXhigh", "bashMode",
];

test("opencode theme defines all required color tokens", () => {
	const raw = readFileSync(
		join(import.meta.dirname, "../../themes/opencode.json"),
		"utf8",
	);
	const theme = JSON.parse(raw) as { name?: string; colors?: Record<string, unknown> };
	assert.equal(theme.name, "opencode");
	const missing = REQUIRED_TOKENS.filter((token) => !(token in (theme.colors ?? {})));
	assert.deepEqual(missing, []);
});

test("opencode theme color values resolve against vars", () => {
	const raw = readFileSync(
		join(import.meta.dirname, "../../themes/opencode.json"),
		"utf8",
	);
	const theme = JSON.parse(raw) as {
		vars?: Record<string, unknown>;
		colors?: Record<string, unknown>;
	};
	const vars = theme.vars ?? {};
	for (const [token, value] of Object.entries(theme.colors ?? {})) {
		// Numbers (e.g. 256-color indices), empty strings (inherit), and hex
		// values resolve without vars; every other string value must be a var key.
		if (typeof value !== "string") continue;
		if (value === "" || value.startsWith("#")) continue;
		assert.ok(
			value in vars,
			`color token "${token}" references "${value}", which is not a var`,
		);
	}
});
