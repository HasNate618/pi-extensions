// Shared prefix-armed state between the prefix-keys extension and the
// opencode-ui styling. Both extensions run in the same process and import
// this module by the same path, so it acts as a single shared emitter:
// prefix-keys sets the flag on arm/disarm; opencode-ui's composer and user
// messages read it at render time to blend the sidebar into the background
// while the prefix key is listening for the next key.

type ArmedListener = (armed: boolean) => void;

let armed = false;
const listeners = new Set<ArmedListener>();

export function setPrefixArmed(value: boolean): void {
	if (armed === value) return;
	armed = value;
	for (const listener of listeners) listener(armed);
}

export function isPrefixArmed(): boolean {
	return armed;
}

export function onPrefixArmedChange(listener: ArmedListener): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}
