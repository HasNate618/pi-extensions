import { test } from "node:test";
import assert from "node:assert/strict";
import {
	DEFAULT_CONFIG,
	parseConfig,
} from "../../extensions/opencode-ui/config.ts";

test("parseConfig returns defaults for empty input", () => {
	assert.deepEqual(parseConfig(undefined), DEFAULT_CONFIG);
	assert.deepEqual(parseConfig({}), DEFAULT_CONFIG);
});

test("parseConfig merges partial overrides", () => {
	const config = parseConfig({
		gaugeWidth: 20,
		showThinking: false,
		footerMargins: { left: 3 },
	});
	assert.equal(config.gaugeWidth, 20);
	assert.equal(config.showThinking, false);
	assert.equal(config.margins.left, 1);
	assert.equal(config.footerMargins.left, 3);
	assert.equal(config.footerMargins.right, 2);
});

test("parseConfig rejects invalid types", () => {
	assert.throws(() => parseConfig({ gaugeWidth: "wide" }));
	assert.throws(() =>
		parseConfig({ margins: { left: "1", right: 1, bottom: true } }),
	);
	assert.throws(() => parseConfig({ footerMargins: { left: "x" } }));
});

test("parseConfig clamps margins to 0..4", () => {
	const config = parseConfig({
		margins: { left: 9, right: -1, bottom: true },
		footerMargins: { left: 99, right: -3 },
	});
	assert.equal(config.margins.left, 4);
	assert.equal(config.margins.right, 0);
	assert.equal(config.footerMargins.left, 4);
	assert.equal(config.footerMargins.right, 0);
});
