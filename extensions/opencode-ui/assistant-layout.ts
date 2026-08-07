// Pure layout helpers for the assistant-message inset patch. Kept free of
// pi imports so the tests can run them directly.

import { truncateToWidth, visibleWidth } from "./format.ts";

// pi's OSC 133 shell-integration zones: added by the native render to the
// first (prompt start) and last (prompt end + final) lines of the message.
const OSC_ZONE = /\x1b\]133;[ABC]\x07/g;

// Width the base render must be called with so markdown/text wraps inside
// `inset`-cell gutters: the base adds its own 1-char outputPad margin around
// those lines, which is folded into the inset.
export function insetRenderWidth(width: number, inset: number): number {
	return Math.max(1, width - 2 * inset + 2);
}

// Re-lays out pi's base render (already produced at insetRenderWidth) inside
// `inset`-cell transparent gutters on both sides. Text lines carry the base's
// own 1-char outputPad margin, which is folded into the inset gutter;
// tool-call cards span the full render width and are padded to the right
// (their borders stay intact); kitty image lines pass through untouched. The
// OSC 133 zones are stripped and re-applied so the shell-integration markers
// stay at the line edges.
export function insetRenderedLines(
	base: string[],
	width: number,
	inset: number,
): string[] {
	const inner = Math.max(1, width - 2 * inset);
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
			// Tool-call card line: spans the full render width, keep intact.
			return line + " ".repeat(Math.max(0, width - visibleWidth(line)));
		}
		// Markdown/text line: fold the base's 1-char margin into the inset.
		let content = line.slice(1).trimEnd();
		content = truncateToWidth(content, inner, "");
		return (
			" ".repeat(inset) +
			content +
			" ".repeat(Math.max(0, inner - visibleWidth(content))) +
			" ".repeat(inset)
		);
	});
	for (const [index, zone] of zones) {
		const line = out[index] ?? "";
		out[index] = (zone.start ?? "") + line + (zone.end ?? "");
	}
	return out;
}
