import { ansiStrip } from "./format.ts";

export type ViewportCounts = { above?: string; below?: string };

export function parseEditorBorder(
	line: string,
	direction: "above" | "below",
): { count?: string } | undefined {
	const plain = ansiStrip(line);
	if (/^─+$/.test(plain)) return {};
	const arrow = direction === "above" ? "↑" : "↓";
	const match = new RegExp(`^─── ${arrow} ([1-9]\\d*) more ─*$`).exec(plain);
	return match?.[1] ? { count: match[1] } : undefined;
}

export function stripEditorFrame(
	lines: string[],
	_width: number,
	paddingX = 0,
): { content: string[]; viewport: ViewportCounts } | undefined {
	if (lines.length < 2) return undefined;
	const top = parseEditorBorder(lines[0] ?? "", "above");
	const bottom = parseEditorBorder(lines.at(-1) ?? "", "below");
	if (!top || !bottom) return undefined;
	const viewport: ViewportCounts = { above: top.count, below: bottom.count };
	const content: string[] = [];
	for (const line of lines.slice(1, -1)) {
		let s = line;
		// Drop the editor's side padding (paddingX spaces) and, defensively,
		// any legacy side glyph ("│ <text>").
		if (paddingX > 0 && s.startsWith(" ".repeat(paddingX))) {
			s = s.slice(paddingX);
		}
		const glyph = /^[│┃▍] ?/.exec(s);
		if (glyph) s = s.slice(glyph[0].length);
		// Keep SGR (syntax colors, the reverse-video cursor block) and pi's
		// cursor marker (\x1b_pi:c\x07) intact — only trim trailing padding
		// spaces so the cursor stays visible in the composed row.
		content.push(s.trimEnd());
	}
	return { content, viewport };
}
