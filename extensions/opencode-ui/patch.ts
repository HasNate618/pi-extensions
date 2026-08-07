// Shared prototype-patching helper for the opencode-ui rendering patches.

export type PatchableComponent = {
	render(width: number): string[];
	invalidate(): void;
};

// Wraps a method on a pi component prototype so the extension can restyle the
// render output. The original method is kept under `__oc_<patchKey>` so it can
// be called and restored. Any error in the patch falls back to the original
// method — a render failure must never take down pi.
export function installPrototypePatch(
	prototype: object,
	key: "render" | "invalidate",
	patchKey: string,
	patch: (receiver: PatchableComponent, args: unknown[]) => unknown,
): () => void {
	const own = Object.getOwnPropertyDescriptor(prototype, key);
	if (!own || !("value" in own) || typeof own.value !== "function")
		return () => {};
	const previous = own.value;
	Object.defineProperty(prototype, key, {
		...own,
		value(this: PatchableComponent, ...args: unknown[]) {
			try {
				return patch(this, args);
			} catch {
				return Reflect.apply(previous, this, args);
			}
		},
	});
	(prototype as Record<string, unknown>)[`__oc_${patchKey}`] = previous;
	return () => {
		const saved = (prototype as Record<string, unknown>)[`__oc_${patchKey}`];
		if (typeof saved === "function") {
			Object.defineProperty(prototype, key, { ...own, value: saved });
			delete (prototype as Record<string, unknown>)[`__oc_${patchKey}`];
		}
	};
}
