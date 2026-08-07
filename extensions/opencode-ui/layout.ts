import type { OpenCodeUiConfig } from "./config.ts";
import { composerMargins } from "./config.ts";
import { padTo, truncateToWidth, visibleWidth, wrapText } from "./format.ts";

export type Styler = (
	text: string,
	role: "rail" | "fill" | "bar" | "model" | "muted" | "thinking" | "text",
) => string;

export type ComposerLayoutOptions = {
	width: number;
	contentLines: string[];
	modelLabel: string;
	providerLabel: string;
	thinkingLabel?: string;
	style: Styler;
	config: OpenCodeUiConfig;
};

export function composeComposerLines(options: ComposerLayoutOptions): string[] {
	const { width, contentLines, style, config } = options;
	const mLeft = composerMargins(config).left;
	const mRight = composerMargins(config).right;
	const rail = style(config.railChar, "rail");
	// Text budget: the box spans (rail + 1)..width-mRight; the 2-space
	// indent sits inside it (matches the editor's own wrap width).
	const contentMax = Math.max(1, width - mLeft - mRight - 1 - 2);
	const rows: string[] = [];

	// The composer renders the message being typed as a user message: one
	// blank rail row above and below, message text at rail + 2. Body rows are
	// wrapped in the "fill" role so the composer reads as a solid dark box;
	// the rail column itself stays outside the fill (no background behind
	// the sidebar), and the left/right gutters stay transparent.
	const bodyRow = (inner: string): string =>
		" ".repeat(mLeft) +
		rail +
		style(padTo(inner, width - mLeft - mRight - 1), "fill") +
		" ".repeat(mRight);

	// 1-line vertical padding above the message.
	rows.push(bodyRow(""));

	// The message being typed. contentLines carry SGR syntax colors and pi's
	// cursor marker (\x1b_pi:c\x07) plus the reverse-video cursor block;
	// truncateToWidth copies escape sequences wholesale so both survive, and
	// never lets a row exceed `width` (pi hard-crashes on over-wide lines).
	// Every row carries the full box fill so the composer stays solid.
	for (const line of contentLines) {
		rows.push(bodyRow("  " + truncateToWidth(line, contentMax)));
	}

	// 1-line vertical padding below the message.
	rows.push(bodyRow(""));

	// model · provider · thinking — at the bottom of the box, above the bar.
	let metadata = style(options.modelLabel, "model");
	metadata += " · " + style(options.providerLabel, "muted");
	if (options.thinkingLabel) {
		metadata += " · " + style(options.thinkingLabel, "thinking");
	}
	rows.push(bodyRow("  " + truncateToWidth(metadata, contentMax)));

	// Bottom edge: the corner is drawn in the rail color (same as the
	// vertical line) and stays outside the fill like the rail; the
	// half-height glyphs use the same dark color as the fill — the box's
	// edge stops at mid-row (the glyphs' bottom halves stay empty). Both
	// gutters stay transparent.
	rows.push(
		" ".repeat(mLeft) +
			style("╹", "rail") +
			style("▀".repeat(Math.max(0, width - mLeft - mRight - 1)), "bar") +
			" ".repeat(mRight),
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
	const mLeft = config.footerMargins.left;
	const mRight = config.footerMargins.right;
	const contentWidth = Math.max(1, width - mLeft - mRight);
	// The gauge carries its own per-cell colors (green/yellow/red), so it
	// is NOT wrapped in the muted style — only the label is.
	const rightParts = [contextLabel, costLabel ? ` · ${costLabel}` : ""]
		.filter(Boolean)
		.join("");
	const rightText = truncateToWidth(
		(gauge ? `${gauge} ` : "") + style(rightParts, "muted"),
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
	if (composerMargins(config).bottom) rows.push("");
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
	const mLeft = composerMargins(config).left;
	const mRight = composerMargins(config).right;
	const rail = style(config.railChar, "rail");
	const contentMax = Math.max(1, width - mLeft - mRight - 1 - 2);
	// Mirrors the composer: a solid dark box with a rail (outside the
	// fill), one blank row above and below, message text at rail + 2.
	const bodyRow = (inner: string): string =>
		" ".repeat(mLeft) +
		rail +
		style(padTo(inner, width - mLeft - mRight - 1), "fill") +
		" ".repeat(mRight);
	const rows: string[] = [bodyRow("")];
	for (const line of lines.flatMap((text) => wrapText(text, contentMax))) {
		rows.push(bodyRow("  " + truncateToWidth(line, contentMax)));
	}
	rows.push(bodyRow(""));
	return rows;
}
