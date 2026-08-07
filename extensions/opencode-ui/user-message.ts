import {
	type Theme,
	UserMessageComponent,
} from "@earendil-works/pi-coding-agent";
import { composerMargins } from "./config.ts";
import type { OpenCodeUiConfig } from "./config.ts";
import { reapplyBackground, stripBaseMessageBox } from "./format.ts";
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
	if (!own || !("value" in own) || typeof own.value !== "function")
		return () => {};
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
			const saved = (prototype as Record<string, unknown>)[
				`__oc_${RENDER_KEY}`
			];
			if (typeof width !== "number") {
				return typeof saved === "function"
					? (saved as (...args: unknown[]) => string[]).call(receiver, ...args)
					: [];
			}
			const config = configProvider();
			const contentMax = Math.max(
				1,
				width -
					composerMargins(config).left -
					composerMargins(config).right -
					1 -
					2,
			);
			// Render 2 wider so the base box's own 1-char side padding leaves
			// the markdown wrapped at exactly contentMax.
			const base =
				typeof saved === "function"
					? (saved as (w: number) => string[]).call(receiver, contentMax + 2)
					: [];
			// The base render wraps the content in pi's native userMessageBg
			// box (padding rows + full-width background + 1-char left pad);
			// strip it so the opencode layout owns the box.
			const lines = Array.isArray(base) ? stripBaseMessageBox(base) : [];
			const uiTheme = uiThemeProvider();
			const style: Styler = (text, role) => {
				if (!uiTheme) return text;
				if (role === "rail") {
					// Sent messages keep their border-colored sidebar: only the
					// composer blends into the background while the prefix key is
					// armed.
					return uiTheme.fg("border", text);
				}
				if (role === "fill") {
					try {
						const bgEscape = uiTheme
							.bg("userMessageBg", "")
							.replace(/\x1b\[49m$/, "");
						return `${bgEscape}${reapplyBackground(bgEscape, text)}\x1b[49m`;
					} catch {
						return text;
					}
				}
				return text;
			};
			return composeUserMessageBlock({ width, lines, style, config });
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
