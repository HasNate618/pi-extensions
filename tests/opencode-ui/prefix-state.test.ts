import { test } from "node:test";
import assert from "node:assert/strict";
import {
	isPrefixArmed,
	onPrefixArmedChange,
	setPrefixArmed,
} from "../../extensions/opencode-ui/prefix-state.ts";

test("prefix-state defaults to unarmed", () => {
	assert.equal(isPrefixArmed(), false);
});

test("setPrefixArmed notifies listeners and reads back", () => {
	const seen: boolean[] = [];
	const off = onPrefixArmedChange((armed) => seen.push(armed));
	setPrefixArmed(true);
	setPrefixArmed(false);
	setPrefixArmed(false); // no change, no duplicate notification
	assert.deepEqual(seen, [true, false]);
	assert.equal(isPrefixArmed(), false);
	off();
	setPrefixArmed(true);
	assert.deepEqual(seen, [true, false]); // listener removed
	off();
	setPrefixArmed(false);
});

test("onPrefixArmedChange returns an unsubscribe", () => {
	let count = 0;
	const off = onPrefixArmedChange(() => {
		count += 1;
	});
	setPrefixArmed(true);
	off();
	setPrefixArmed(false);
	setPrefixArmed(true);
	assert.equal(count, 1);
	setPrefixArmed(false);
});
