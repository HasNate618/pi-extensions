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
): { content: string[]; viewport: ViewportCounts } | undefined {
	if (lines.length < 2) return undefined;
	const top = parseEditorBorder(lines[0] ?? "", "above");
	const bottom = parseEditorBorder(lines.at(-1) ?? "", "below");
	if (!top || !bottom) return undefined;
	const viewport: ViewportCounts = { above: top.count, below: bottom.count };
	const interior = lines.slice(1, -1).map((line) => ansiStrip(line));
	const content: string[] = [];
	for (const line of interior) {
		// Base editor content rows are "│ <text>" (optionally "│<text>"); drop the
		// left glyph and a single following space. Defensive: leave rows that
		// don't start with a side glyph untouched.
		const match = /^[│┃▍] ?/.exec(line);
		content.push(match ? line.slice(match[0].length).trimEnd() : line.trimEnd());
	}
	return { content, viewport };
}
