import type { OpenCodeUiConfig } from "./config.ts";
import { padTo, truncateToWidth, visibleWidth, wrapText } from "./format.ts";

export type Styler = (
	text: string,
	role: "rail" | "bar" | "barFill" | "model" | "muted" | "thinking" | "text",
) => string;

export type ComposerLayoutOptions = {
	width: number;
	contentLines: string[];
	lastMessage?: string;
	modelLabel: string;
	providerLabel: string;
	thinkingLabel?: string;
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
		// 1-line spacing above the user message.
		rows.push(padTo(" ".repeat(mLeft) + rail, width));
		for (const line of wrapText(options.lastMessage, contentMax)) {
			// wrapText keeps a single unbreakable word whole even when it is
			// wider than contentMax; truncate so the rail-prefixed row never
			// exceeds `width` (pi hard-crashes on over-wide lines).
			rows.push(padTo(railRow(truncateToWidth(line, contentMax)), width));
		}
		// 1-line spacing below the user message.
		rows.push(padTo(" ".repeat(mLeft) + rail, width));
	}

	// Input rows. contentLines come from the base editor with SGR syntax
	// colors and pi's cursor marker (\x1b_pi:c\x07) intact; truncateToWidth
	// copies escape sequences wholesale so both survive.
	for (const line of contentLines) {
		const inner = Math.max(0, width - mLeft - mRight - 1 - 1);
		rows.push(
			padTo(
				" ".repeat(mLeft) + rail + " " + truncateToWidth(line, inner),
				width,
			),
		);
	}

	// model · provider · thinking — at the bottom of the composer, just
	// above the bottom bar.
	let metadata = style(options.modelLabel, "model");
	metadata += " · " + style(options.providerLabel, "muted");
	if (options.thinkingLabel) {
		metadata += " · " + style(options.thinkingLabel, "thinking");
	}
	rows.push(padTo(railRow(truncateToWidth(metadata, contentMax)), width));

	// Bottom bar: 1-character indent; the fill renders as a solid dark row
	// via the "barFill" role (falls back to invisible when the theme has no
	// usable background token).
	rows.push(
		" ".repeat(mLeft) +
			style("╹", "bar") +
			style(" ".repeat(Math.max(0, width - mLeft - 1)), "barFill"),
	);
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
	const { width, left, contextLabel, gauge, costLabel, style, config } =
		options;
	const mLeft = config.margins.left;
	const mRight = config.margins.right;
	const contentWidth = Math.max(1, width - mLeft - mRight);
	const rightParts = [gauge, contextLabel].filter(Boolean).join(" ");
	const costPart = costLabel ? ` · ${costLabel}` : "";
	// Cap the right segment so it can never crowd out the left and overflow
	// the row: reserve contentWidth - 4 for the left plus the separating gap.
	const rightText = truncateToWidth(
		style(rightParts + costPart, "muted"),
		Math.max(0, contentWidth - 4),
	);
	const rightWidth = visibleWidth(rightText);
	const leftText = truncateToWidth(
		style(left, "text"),
		Math.max(0, contentWidth - rightWidth - 1),
	);
	const gap = " ".repeat(
		Math.max(1, contentWidth - visibleWidth(leftText) - rightWidth),
	);
	const rows: string[] =
		contentWidth >= 4
			? [
					" ".repeat(mLeft) +
						leftText +
						gap +
						rightText +
						" ".repeat(Math.max(0, mRight)),
				]
			: [" ".repeat(width)];
	if (config.margins.bottom) rows.push("");
	return rows;
}

export type UserMessageLayoutOptions = {
	width: number;
	lines: string[];
	style: Styler;
	config: OpenCodeUiConfig;
};

export function composeUserMessageBlock(
	options: UserMessageLayoutOptions,
): string[] {
	const { width, lines, style, config } = options;
	const mLeft = config.margins.left;
	const mRight = config.margins.right;
	const rail = style(config.railChar, "rail");
	const contentMax = Math.max(1, width - mLeft - mRight - 1 - 2);
	const rows: string[] = [" ".repeat(mLeft) + rail];
	for (const line of lines.flatMap((text) => wrapText(text, contentMax))) {
		rows.push(
			" ".repeat(mLeft) +
				rail +
				"  " +
				truncateToWidth(line, contentMax),
		);
	}
	rows.push(" ".repeat(mLeft) + rail);
	return rows.map((row) => padTo(row, width));
}
