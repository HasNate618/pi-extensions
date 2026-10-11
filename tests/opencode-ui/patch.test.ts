import { test } from "node:test";
import assert from "node:assert/strict";
import { installPrototypePatch } from "../../extensions/opencode-ui/patch.ts";

class Base {
	render(width: number): string[] {
		return [`base:${width}`];
	}
}

// pi moved BashExecutionComponent.render onto a base class in 1.1.0, so the
// patch helper must resolve inherited methods instead of only own ones.
class Derived extends Base {}

test("patches a method declared on the prototype itself", () => {
	const proto = Base.prototype as unknown as Record<string, unknown>;
	const off = installPrototypePatch(proto, "render", "t-own", (_receiver, args) => [
		`patched:${args[0]}`,
	]);
	try {
		assert.deepEqual(new Base().render(10), ["patched:10"]);
	} finally {
		off();
	}
	assert.deepEqual(new Base().render(10), ["base:10"]);
});

test("patches a method inherited from a base prototype", () => {
	const proto = Derived.prototype as unknown as Record<string, unknown>;
	assert.equal(
		Object.hasOwn(Derived.prototype, "render"),
		false,
		"precondition: render is inherited, not own",
	);

	const off = installPrototypePatch(proto, "render", "t-inherited", (_receiver, args) => [
		`patched:${args[0]}`,
	]);
	try {
		assert.deepEqual(new Derived().render(7), ["patched:7"]);
	} finally {
		off();
	}

	assert.equal(
		Object.hasOwn(Derived.prototype, "render"),
		false,
		"cleanup drops the own override so the inherited method is visible again",
	);
	assert.deepEqual(new Derived().render(7), ["base:7"]);
});

test("exposes the original method under the __oc slot for wrapping", () => {
	const proto = Derived.prototype as unknown as Record<string, unknown>;
	const off = installPrototypePatch(proto, "render", "t-slot", (receiver, args) => {
		const saved = proto["__oc_t-slot"] as (w: number) => string[];
		return [...saved.call(receiver, args[0]), "wrapped"];
	});
	try {
		assert.deepEqual(new Derived().render(2), ["base:2", "wrapped"]);
	} finally {
		off();
	}
});

test("a throwing patch falls back to the original method", () => {
	const proto = Base.prototype as unknown as Record<string, unknown>;
	const off = installPrototypePatch(proto, "render", "t-throw", () => {
		throw new Error("boom");
	});
	try {
		assert.deepEqual(new Base().render(3), ["base:3"]);
	} finally {
		off();
	}
});

test("a missing method yields an inert disposer", () => {
	const proto = {} as Record<string, unknown>;
	const off = installPrototypePatch(proto, "render", "t-missing", () => ["x"]);
	assert.equal(typeof off, "function");
	assert.doesNotThrow(() => off());
});
