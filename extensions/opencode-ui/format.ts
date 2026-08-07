export function formatCount(value: number): string {
	if (!Number.isFinite(value) || value < 0) return "0";
	if (value < 1000) return String(Math.round(value));
	if (value < 10_000) return `${(value / 1000).toFixed(1)}k`;
	if (value < 1_000_000) return `${Math.round(value / 1000)}k`;
	return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}

export function formatProviderLabel(provider: string | undefined): string {
	if (!provider) return "Unknown";
	return provider
		.replace(/[-_]/g, " ")
		.replace(/\b\w/g, (char) => char.toUpperCase());
}

// The palette's background tokens (e.g. userMessageBg) are not reachable
// through theme.fg() — pi's Theme only registers bg-suffixed keys in its
// bgColors map. Derive the matching foreground escape from a bg escape so
// bar glyphs can reuse the same dark box color.
export function bgToFgEscape(bgEscape: string): string | undefined {
	const match = /^\x1b\[48;([0-9;]+)m/.exec(bgEscape);
	return match ? `\x1b[38;${match[1]}m` : undefined;
}

// Re-apply a background escape after every SGR reset (\x1b[0m) so a row
// stays solid even when its content resets styles mid-row — the editor's
// cursor block ends with \x1b[0m, which would otherwise drop the box fill
// for the rest of the row.
export function reapplyBackground(bgEscape: string, text: string): string {
	return text.replace(/\x1b\[0m/g, `\x1b[0m${bgEscape}`);
}

const THINKING_TOKENS: Record<string, string> = {
	off: "thinkingOff",
	minimal: "thinkingMinimal",
	low: "thinkingLow",
	medium: "thinkingMedium",
	high: "thinkingHigh",
	xhigh: "thinkingXhigh",
	max: "thinkingMax",
};

export function thinkingTokenForLevel(level: string | undefined): string {
	return (level && THINKING_TOKENS[level]) || "thinkingOff";
}

export function buildGauge(percent: number, width: number): string {
	const clamped = Math.max(0, Math.min(100, percent));
	const filled = Math.round((clamped / 100) * width);
	return "▰".repeat(filled) + "▱".repeat(Math.max(0, width - filled));
}

export function ansiStrip(text: string): string {
	return (
		text
			.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
			.replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "")
			// DCS (\x1bP…\x1b\) and APC (\x1b_…\x1b\) or \x1b_…\x07, e.g. pi's
			// cursor marker \x1b_pi:c\x07) — either ST or BEL terminates.
			.replace(/\x1b[P_][\s\S]*?(?:\x1b\\|\x07)/g, "")
	);
}

export function visibleWidth(text: string): number {
	let width = 0;
	for (const ch of ansiStrip(text)) {
		const code = ch.codePointAt(0) ?? 0;
		const wide =
			(code >= 0x1100 && code <= 0x115f) ||
			code === 0x2329 ||
			code === 0x232a ||
			(code >= 0x2e80 && code <= 0xa4cf && code !== 0x303f) ||
			(code >= 0xac00 && code <= 0xd7a3) ||
			(code >= 0xf900 && code <= 0xfaff) ||
			(code >= 0xfe30 && code <= 0xfe6f) ||
			(code >= 0xff00 && code <= 0xff60) ||
			(code >= 0xffe0 && code <= 0xffe6) ||
			(code >= 0x1f300 && code <= 0x1faff) ||
			(code >= 0x20000 && code <= 0x3fffd);
		width += wide ? 2 : 1;
	}
	return width;
}

export function padTo(text: string, width: number): string {
	const pad = Math.max(0, width - visibleWidth(text));
	return text + " ".repeat(pad);
}

/**
 * Length of the escape sequence starting at `text[index]` (which must be
 * "\x1b"), or 1 for a lone ESC. Handles CSI, OSC, DCS, and APC; DCS/APC may
 * be terminated by ST ("\x1b\\") or BEL ("\x07"). Returns a length that
 * covers the whole sequence so callers never split one.
 */
function escapeSequenceLength(text: string, index: number): number {
	const rest = text.slice(index + 1);
	if (rest.startsWith("[")) {
		// CSI: params + intermediates, then one final byte in 0x40-0x7E.
		for (let i = 1; i < rest.length; i++) {
			const code = rest.charCodeAt(i);
			if (code >= 0x40 && code <= 0x7e) return i + 2;
		}
		return rest.length + 1;
	}
	if (rest.startsWith("]") || rest.startsWith("P") || rest.startsWith("_")) {
		const body = rest.slice(1);
		const st = body.indexOf("\x1b\\");
		const bel = body.indexOf("\x07");
		if (st !== -1 && (bel === -1 || st < bel)) return st + 4; // 1 ESC + 1 intro + st + 2 ST
		if (bel !== -1) return bel + 3; // 1 ESC + 1 intro + bel + 1 BEL
		return rest.length + 1; // unterminated: consume the rest
	}
	return 1;
}

export function truncateToWidth(
	text: string,
	width: number,
	ellipsis = "…",
): string {
	if (visibleWidth(text) <= width) return text;
	let out = "";
	let w = 0;
	const budget = width - visibleWidth(ellipsis);
	let i = 0;
	while (i < text.length) {
		const ch = text[i];
		if (ch === "\x1b") {
			// Zero-width sequence: always include it wholesale — never split it,
			// even past the budget, so pi's cursor marker survives truncation.
			const len = escapeSequenceLength(text, i);
			out += text.slice(i, i + len);
			i += len;
			continue;
		}
		const cw = visibleWidth(ch);
		if (w + cw > budget) break;
		out += ch;
		w += cw;
		i += 1;
	}
	return out + ellipsis;
}

export function wrapText(text: string, width: number): string[] {
	const lines: string[] = [];
	for (const raw of text.split("\n")) {
		const words = raw.split(/(\s+)/);
		let line = "";
		let lineWidth = 0;
		for (const word of words) {
			const ww = visibleWidth(word);
			if (lineWidth + ww > width && lineWidth > 0) {
				lines.push(line);
				line = word.trimStart();
				lineWidth = visibleWidth(line);
			} else {
				line += word;
				lineWidth += ww;
			}
		}
		lines.push(line);
	}
	return lines.filter(
		(line, index) =>
			line.length > 0 || index === lines.length - 1 || lines.length === 1,
	);
}

export function formatContextLabel(
	tokens: number | null | undefined,
	contextWindow: number | undefined,
): string {
	if (!contextWindow || contextWindow <= 0) return "--";
	const used =
		typeof tokens === "number" && Number.isFinite(tokens) && tokens >= 0
			? tokens
			: 0;
	return `${formatCount(used)}/${formatCount(contextWindow)}`;
}

export function formatCostLabel(cost: number): string {
	if (!Number.isFinite(cost) || cost <= 0) return "";
	if (cost < 0.01) return `$${cost.toFixed(3)}`;
	return `$${cost.toFixed(2)}`;
}
