import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CONFIG, parseConfig } from "../../extensions/opencode-ui/config.ts";

test("parseConfig returns defaults for empty input", () => {
	assert.deepEqual(parseConfig(undefined), DEFAULT_CONFIG);
	assert.deepEqual(parseConfig({}), DEFAULT_CONFIG);
});

test("parseConfig merges partial overrides", () => {
	const config = parseConfig({ gaugeWidth: 20, showLastMessage: false });
	assert.equal(config.gaugeWidth, 20);
	assert.equal(config.showLastMessage, false);
	assert.equal(config.margins.left, 1);
});

test("parseConfig rejects invalid types", () => {
	assert.throws(() => parseConfig({ gaugeWidth: "wide" }));
	assert.throws(() => parseConfig({ margins: { left: "1", right: 1, bottom: true } }));
});

test("parseConfig clamps margins to 0..2", () => {
	const config = parseConfig({ margins: { left: 9, right: -1, bottom: true } });
	assert.equal(config.margins.left, 2);
	assert.equal(config.margins.right, 0);
});
