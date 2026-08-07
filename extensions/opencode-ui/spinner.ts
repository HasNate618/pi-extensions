import { Loader } from "@earendil-works/pi-tui";

type Startable = { intervalMs?: number };

// pi's built-in "⠏ Working..." spinner animates every 80 ms and forces a
// full TUI render on every tick, which keeps the terminal emulator busy
// while something streams. Throttle the tick rate to reduce CPU. Returns a
// cleanup that restores the original method.
export function installSpinnerThrottle(minIntervalMs: number): () => void {
	const prototype = Loader.prototype as unknown as { start?: unknown };
	const own = Object.getOwnPropertyDescriptor(prototype, "start");
	if (!own || !("value" in own) || typeof own.value !== "function")
		return () => {};
	const previous = own.value;
	Object.defineProperty(prototype, "start", {
		...own,
		value(this: Startable, ...args: unknown[]) {
			if (
				typeof this.intervalMs === "number" &&
				this.intervalMs < minIntervalMs
			) {
				this.intervalMs = minIntervalMs;
			}
			return Reflect.apply(previous, this, args);
		},
	});
	return () => {
		Object.defineProperty(prototype, "start", { ...own, value: previous });
	};
}
