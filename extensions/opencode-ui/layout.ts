import type { OpenCodeUiConfig } from "./config.ts";
import { padTo, truncateToWidth, visibleWidth, wrapText } from "./format.ts";

export type Styler = (
	text: string,
	role: "rail" | "bar" | "model" | "muted" | "thinking" | "text",
) => string;

export type ComposerLayoutOptions = {
	width: number;
	contentLines: string[];
	lastMessage?: string;
	modelLabel: string;
	providerLabel: string;
	thinkingLabel?: string;
	showNewSessionBadge?: boolean;
	style: Styler;
	config: OpenCodeUiConfig;
};

export function composeComposerLines(options: ComposerLayoutOptions): string[] {
	const { width, contentLines, style, config } = options;
	const mLeft = config.margins.left;
	const mRight = config.margins.right;
	const rail = style(config.railChar, "rail");
	const contentMax = Math.max(1, width - mLeft - mRight - 1 - 2);
	const rows: string[] = [];

	const railRow = (text: string): string =>
		" ".repeat(mLeft) + rail + "  " + text;

	if (options.lastMessage) {
		for (const line of wrapText(options.lastMessage, contentMax)) {
			rows.push(padTo(railRow(line), width));
		}
	}

	let metadata = style(options.modelLabel, "model");
	metadata += " · " + style(options.providerLabel, "muted");
	if (options.showNewSessionBadge) metadata += style(" (New)", "muted");
	if (options.thinkingLabel) {
		metadata += " · " + style(options.thinkingLabel, "thinking");
	}
	rows.push(
		padTo(railRow(truncateToWidth(metadata, contentMax)), width),
	);

	for (const line of contentLines) {
		const inner = Math.max(0, width - mLeft - mRight - 1 - 1);
		rows.push(
			padTo(
				" ".repeat(mLeft) + rail + " " + truncateToWidth(line, inner),
				width,
			),
		);
	}

	rows.push(style("╹", "bar") + style(config.barChar.repeat(Math.max(0, width - 1)), "bar"));
	return rows;
}

export type FooterLayoutOptions = {
	width: number;
	left: string;
	contextLabel: string;
	gauge: string;
	costLabel: string;
	style: Styler;
	config: OpenCodeUiConfig;
};

export function composeFooterLines(options: FooterLayoutOptions): string[] {
	const { width, left, contextLabel, gauge, costLabel, style, config } = options;
	const mLeft = config.margins.left;
	const mRight = config.margins.right;
	const contentWidth = Math.max(1, width - mLeft - mRight);
	const rightParts = [gauge, contextLabel].filter(Boolean).join(" ");
	const costPart = costLabel ? ` · ${costLabel}` : "";
	const rightText = style(rightParts + costPart, "muted");
	const rightWidth = visibleWidth(rightText);
	const leftText = truncateToWidth(
		style(left, "text"),
		Math.max(0, contentWidth - rightWidth - 1),
	);
	const gap = " ".repeat(
		Math.max(1, contentWidth - visibleWidth(leftText) - rightWidth),
	);
	const rows: string[] = [
		" ".repeat(mLeft) + leftText + gap + rightText + " ".repeat(Math.max(0, mRight)),
	];
	if (config.margins.bottom) rows.push("");
	return rows;
}
