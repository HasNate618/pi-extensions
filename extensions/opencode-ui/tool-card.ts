// Tool-call card rendering: pi renders live tool calls as
// ToolExecutionComponent rows (and bashExecution history rows as
// BashExecutionComponent) that span the full chat width, ignoring
// chatMargins. Both render methods are patched to draw the card inside the
// chatMargins gutters — with or without a rounding plugin, since the
// plugin's frame is a child of the tool component and inherits the reduced
// render width.
import {
	BashExecutionComponent,
	ToolExecutionComponent,
} from "@earendil-works/pi-coding-agent";
import type { OpenCodeUiConfig } from "./config.ts";
import { insetToolLines } from "./assistant-layout.ts";
import { installPrototypePatch } from "./patch.ts";

const PATCH_KEY = "opencode-ui-tool-card-render";

export function installToolCardPatch(
	configProvider: () => OpenCodeUiConfig,
): () => void {
	const disposes: Array<() => void> = [];
	for (const prototype of [ToolExecutionComponent, BashExecutionComponent]) {
		disposes.push(
			installPrototypePatch(
				prototype.prototype as unknown as object,
				"render",
				PATCH_KEY,
				(receiver, args) => {
					const width = args[0];
					const saved = (prototype.prototype as Record<string, unknown>)[
						`__oc_${PATCH_KEY}`
					];
					if (typeof width !== "number") {
						return typeof saved === "function"
							? (saved as (...a: unknown[]) => string[]).call(receiver, ...args)
							: [];
					}
					const { left, right } = configProvider().chatMargins;
					if (left <= 0 && right <= 0) {
						return typeof saved === "function"
							? (saved as (w: number) => string[]).call(receiver, width)
							: [];
					}
					const base =
						typeof saved === "function"
							? (saved as (w: number) => string[]).call(
									receiver,
									Math.max(1, width - left - right),
								)
							: [];
					return insetToolLines(
						Array.isArray(base) ? base : [],
						width,
						left,
						right,
					);
				},
			),
		);
	}
	return () => {
		for (const off of disposes) off();
	};
}
