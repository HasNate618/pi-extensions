import {
	type ExtensionAPI,
	type Theme,
	UserMessageComponent,
} from "@earendil-works/pi-coding-agent";
import type { OpenCodeUiConfig } from "./config.ts";
import { composeUserMessageBlock, type Styler } from "./layout.ts";

const RENDER_KEY = "opencode-ui-user-message-render";

type Patchable = { render(width: number): string[]; invalidate(): void };

function installPrototypePatch(
	prototype: object,
	key: "render" | "invalidate",
	patchKey: string,
	patch: (receiver: Patchable, args: unknown[]) => unknown,
): () => void {
	const own = Object.getOwnPropertyDescriptor(prototype, key);
	if (!own || !("value" in own) || typeof own.value !== "function") return () => {};
	const previous = own.value;
	Object.defineProperty(prototype, key, {
		...own,
		value(this: Patchable, ...args: unknown[]) {
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

let currentCleanup: (() => void) | null = null;

export function installUserMessagePatch(
	configProvider: () => OpenCodeUiConfig,
	uiThemeProvider: () => Theme | undefined,
): () => void {
	removeUserMessagePatch();
	const prototype = UserMessageComponent.prototype as unknown as object;
	const cleanupRender = installPrototypePatch(
		prototype,
		"render",
		RENDER_KEY,
		(receiver, args) => {
			const width = args[0];
			if (typeof width !== "number") {
				return (receiver.render as () => string[]).call(receiver, ...args);
			}
			const previous = (prototype as Record<string, unknown>)[`__oc_${RENDER_KEY}`];
			const base =
				typeof previous === "function"
					? (previous as (width: number) => string[]).call(receiver, width)
					: [];
			const lines = Array.isArray(base) ? base : [];
			const uiTheme = uiThemeProvider();
			const style: Styler = (text, role) => {
				if (!uiTheme) return text;
				if (role === "rail") return uiTheme.fg("border", text);
				return text;
			};
			return composeUserMessageBlock({
				width,
				lines,
				style,
				config: configProvider(),
			});
		},
	);
	currentCleanup = () => {
		cleanupRender();
		currentCleanup = null;
	};
	return currentCleanup;
}

export function removeUserMessagePatch(): void {
	currentCleanup?.();
	currentCleanup = null;
}
