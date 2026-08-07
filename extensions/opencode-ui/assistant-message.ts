// Assistant-message rendering: pi's native assistant messages span the full
// terminal width with only the configurable 1-char outputPad inset. To give
// the chat body the same gutters as the composer/footer, the render is
// patched to draw the message inside a `chatInset`-cell transparent margin on
// both sides.
import { AssistantMessageComponent } from "@earendil-works/pi-coding-agent";
import type { OpenCodeUiConfig } from "./config.ts";
import { insetRenderWidth, insetRenderedLines } from "./assistant-layout.ts";
import { installPrototypePatch } from "./patch.ts";

const PATCH_KEY = "opencode-ui-assistant-message-render";

export function installAssistantMessagePatch(
	configProvider: () => OpenCodeUiConfig,
): () => void {
	const prototype = AssistantMessageComponent.prototype as unknown as object;
	return installPrototypePatch(
		prototype,
		"render",
		PATCH_KEY,
		(receiver, args) => {
			const width = args[0];
			const saved = (prototype as Record<string, unknown>)[
				`__oc_${PATCH_KEY}`
			];
			if (typeof width !== "number") {
				return typeof saved === "function"
					? (saved as (...args: unknown[]) => string[]).call(receiver, ...args)
					: [];
			}
			const inset = configProvider().chatInset;
			if (inset <= 0) {
				return typeof saved === "function"
					? (saved as (w: number) => string[]).call(receiver, width)
					: [];
			}
			const base =
				typeof saved === "function"
					? (saved as (w: number) => string[]).call(
							receiver,
							insetRenderWidth(width, inset),
						)
					: [];
			return insetRenderedLines(
				Array.isArray(base) ? base : [],
				width,
				inset,
			);
		},
	);
}
