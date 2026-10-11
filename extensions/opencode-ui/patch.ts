// Shared prototype-patching helper for the opencode-ui rendering patches.

export type PatchableComponent = {
	render(width: number): string[];
	invalidate(): void;
};

// Finds a method through the prototype chain. pi moves methods between a
// component and its base class across versions — BashExecutionComponent.render
// is inherited rather than own as of 1.1.0 — and looking only at the own
// descriptor would silently drop the patch instead of failing loudly.
function resolveMethod(
	prototype: Record<string, unknown>,
	key: "render" | "invalidate",
): { descriptor: PropertyDescriptor; hadOwn: boolean } | null {
	let owner: object | null = prototype;
	while (owner) {
		const descriptor = Object.getOwnPropertyDescriptor(owner, key);
		if (descriptor) {
			if (!("value" in descriptor) || typeof descriptor.value !== "function")
				return null;
			return { descriptor, hadOwn: Object.hasOwn(prototype, key) };
		}
		owner = Object.getPrototypeOf(owner);
	}
	return null;
}

// Wraps a method on a pi component prototype so the extension can restyle the
// render output. The original method is kept under `__oc_<patchKey>` so it can
// be called and restored. Any error in the patch falls back to the original
// method — a render failure must never take down pi.
export function installPrototypePatch(
	prototype: Record<string, unknown>,
	key: "render" | "invalidate",
	patchKey: string,
	patch: (receiver: PatchableComponent, args: unknown[]) => unknown,
): () => void {
	const resolved = resolveMethod(prototype, key);
	if (!resolved) return () => {};
	const { descriptor, hadOwn } = resolved;
	const previous = descriptor.value as (...args: unknown[]) => unknown;
	const slot = `__oc_${patchKey}`;

	Object.defineProperty(prototype, key, {
		value(this: PatchableComponent, ...args: unknown[]) {
			try {
				return patch(this, args);
			} catch {
				return previous.apply(this, args);
			}
		},
		writable: true,
		enumerable: descriptor.enumerable ?? false,
		configurable: true,
	});
	(prototype as Record<string, unknown>)[slot] = previous;

	return () => {
		const saved = (prototype as Record<string, unknown>)[slot];
		if (typeof saved !== "function") return;
		if (hadOwn) {
			Object.defineProperty(prototype, key, { ...descriptor, value: saved });
		} else {
			// The method lives on a base class: drop our own override so the
			// inherited implementation is visible again.
			Reflect.deleteProperty(prototype, key);
		}
		delete (prototype as Record<string, unknown>)[slot];
	};
}
