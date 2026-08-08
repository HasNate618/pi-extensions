// Pure layout helpers for the assistant-message inset patch. Kept free of
// pi imports so the tests can run them directly.

import { ansiStrip, truncateToWidth, visibleWidth } from "./format.ts";

// pi's OSC 133 shell-integration zones: added by the native render to the
// first (prompt start) and last (prompt end + final) lines of the message.
const OSC_ZONE = /\x1b\]133;[ABC]\x07/g;

// Width the base render must be called with so markdown/text wraps inside
// `left`/`right`-cell gutters. The base adds its own 1-char outputPad margin
// around text lines (folded into the gutters below) and tool-call cards span
// the whole render width (padded into the gutters by insetRenderedLines).
export function insetRenderWidth(
	width: number,
	left: number,
	right: number,
): number {
	return Math.max(1, width - left - right);
}

// Shifts tool-call card rows (already rendered at `width - left - right`)
// into the chatMargins gutters: the card keeps its borders, trimmed
// defensively if a row ever renders over-wide; kitty image lines pass
// through untouched. Rows are padded to exactly `width`.
export function insetToolLines(
	lines: string[],
	width: number,
	left: number,
	right: number,
): string[] {
	const inner = Math.max(1, width - left - right);
	return lines.map((line) => {
		if (line.includes("\x1b_G")) return line;
		const trimmed = truncateToWidth(line, inner, "");
		return (
			" ".repeat(left) +
			trimmed +
			" ".repeat(Math.max(0, inner - visibleWidth(trimmed))) +
			" ".repeat(right)
		);
	});
}

// pi adds a Spacer row above any assistant message with visible content. For
// the streaming thinking-only message (hidden thinking block → "Thinking...")
// that spacer renders as a stray blank line that reads like an empty message.
// Drop leading rows whose visible content is only spaces so the label sits
// directly under the previous message.
export function dropLeadingBlankRows(lines: string[]): string[] {
	let start = 0;
	while (start < lines.length && ansiStrip(lines[start] ?? "").trim() === "") {
		start++;
	}
	return lines.slice(start);
}

type ThinkingBlock = {
	type?: string;
	text?: string;
	thinking?: string;
};

// True when the message's only visible content is a thinking block (pi hides
// it behind the "Thinking..." label) — the case where the stray spacer line
// must not be drawn.
export function isThinkingOnlyMessage(
	content: readonly ThinkingBlock[],
): boolean {
	const hasThinking = content.some(
		(block) =>
			block.type === "thinking" &&
			typeof block.thinking === "string" &&
			block.thinking.trim() !== "",
	);
	const hasOtherVisibleContent = content.some(
		(block) =>
			(block.type === "text" &&
				typeof block.text === "string" &&
				block.text.trim() !== "") ||
			block.type === "toolCall",
	);
	return hasThinking && !hasOtherVisibleContent;
}

// Re-lays out pi's base render (already produced at insetRenderWidth) inside
// transparent `left`/`right` gutters on the sides. Text lines carry the
// base's own 1-char outputPad margin, which is folded into the left gutter;
// tool-call cards span the whole base width and are shifted into the
// gutters (their borders stay intact, trimmed defensively if a card ever
// renders over-wide); kitty image lines pass through untouched. The OSC 133
// zones are stripped and re-applied so the shell-integration markers stay at
// the line edges.
export function insetRenderedLines(
	base: string[],
	width: number,
	left: number,
	right: number,
): string[] {
	const inner = Math.max(1, width - left - right);
	const zones = new Map<number, { start?: string; end?: string }>();
	const stripped = base.map((line, index) => {
		// pi prepends the zones: ZONE_START to the first line, ZONE_END +
		// ZONE_FINAL to the last (both at the line start).
		const start = /^(?:\x1b\]133;[ABC]\x07)+/.exec(line)?.[0];
		const end = /(?:\x1b\]133;[ABC]\x07)+$/.exec(line)?.[0];
		if (start || end) zones.set(index, { start, end });
		return line.replace(OSC_ZONE, "");
	});
	const out = stripped.map((line) => {
		if (line.includes("\x1b_G")) return line;
		if (!line.startsWith(" ")) {
			// Tool-call card line: spans the whole base width, shift it into
			// the gutters so the rounded/dynamic borders sit at the margins.
			return (
				" ".repeat(left) + truncateToWidth(line, inner) + " ".repeat(right)
			);
		}
		// Markdown/text line: fold the base's 1-char margin into the left gutter.
		let content = line.slice(1).trimEnd();
		content = truncateToWidth(content, inner, "");
		return (
			" ".repeat(left) +
			content +
			" ".repeat(Math.max(0, inner - visibleWidth(content))) +
			" ".repeat(right)
		);
	});
	for (const [index, zone] of zones) {
		const line = out[index] ?? "";
		out[index] = (zone.start ?? "") + line + (zone.end ?? "");
	}
	return out;
}
