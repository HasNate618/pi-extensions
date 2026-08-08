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

type BgTheme = { bg(color: string, text: string): string };

// Foreground escape for the box fill color (userMessageBg), or "" when the
// theme has no usable token. Used to draw the rail in the box color so it
// blends into the dark surface instead of standing out.
export function userMessageBgFgEscape(theme: BgTheme): string {
	try {
		return bgToFgEscape(theme.bg("userMessageBg", "")) ?? "";
	} catch {
		return "";
	}
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

const SGR_FG_RESET = "\x1b[39m";

// Theme token for the gauge's filled cells by context load: success < 50%,
// warning < 80%, error otherwise. The caller maps the token to a color from
// the active theme.
export function gaugeLevel(percent: number): "success" | "warning" | "error" {
	if (percent < 50) return "success";
	if (percent < 80) return "warning";
	return "error";
}

export function buildGauge(
	percent: number,
	width: number,
	colorForPercent: (percent: number) => string,
): string {
	const clamped = Math.max(0, Math.min(100, percent));
	const filled = Math.round((clamped / 100) * width);
	return (
		colorForPercent(clamped) +
		"▰".repeat(filled) +
		SGR_FG_RESET +
		"▱".repeat(Math.max(0, width - filled))
	);
}

// pi's native user-message render wraps the markdown in a Box with a
// userMessageBg fill: OSC 133 shell zones on the first/last lines, a
// full-width background on every line, 1 char of left padding on the
// content, and one empty padding row above/below. The opencode layout
// replaces that box with its own, so strip the native one: remove the OSC
// zones, the background escapes, the left padding, and the leading/trailing
// padding rows (interior blank lines — markdown paragraphs — are kept).
export function stripBaseMessageBox(lines: string[]): string[] {
	const stripped = lines.map((line) => {
		let s = line.replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "");
		s = s.replace(/^\x1b\[48;([0-9;]+)m/, "");
		s = s.replace(/\x1b\[49m\s*$/, "").trimEnd();
		if (s.startsWith(" ")) s = s.slice(1);
		return s;
	});
	let start = 0;
	let end = stripped.length;
	while (start < end && stripped[start] === "") start++;
	while (end > start && stripped[end - 1] === "") end--;
	return stripped.slice(start, end);
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

// ---- width accounting (must match pi's visibleWidth exactly) ----
// pi counts graphemes as: tab=3, zero-width (marks/VS/ZWJ/control)=0,
// RGI emoji=2, else the east-asian width. The extension must agree with it
// or a row padded to `width` here can measure `width + 1` in pi and
// hard-crash the TUI ("Rendered line exceeds terminal width"). The wide
// ranges below are merged from the get-east-asian-width table pi uses:
// hand-rolled approximations drifted by a cell on chars like ☰ (U+2630,
// wide per the table but not in any obvious CJK block), which padded rows
// one cell too wide and crashed pi.
const WIDE_RANGES: readonly (readonly [number, number])[] = [
	[0x1100, 0x115f],
	[0x231a, 0x231b],
	[0x2329, 0x232a],
	[0x23e9, 0x23ec],
	[0x23f0, 0x23f0],
	[0x23f3, 0x23f3],
	[0x25fd, 0x25fe],
	[0x2614, 0x2615],
	[0x2630, 0x2637],
	[0x2648, 0x2653],
	[0x267f, 0x267f],
	[0x268a, 0x268f],
	[0x2693, 0x2693],
	[0x26a1, 0x26a1],
	[0x26aa, 0x26ab],
	[0x26bd, 0x26be],
	[0x26c4, 0x26c5],
	[0x26ce, 0x26ce],
	[0x26d4, 0x26d4],
	[0x26ea, 0x26ea],
	[0x26f2, 0x26f3],
	[0x26f5, 0x26f5],
	[0x26fa, 0x26fa],
	[0x26fd, 0x26fd],
	[0x2705, 0x2705],
	[0x270a, 0x270b],
	[0x2728, 0x2728],
	[0x274c, 0x274c],
	[0x274e, 0x274e],
	[0x2753, 0x2755],
	[0x2757, 0x2757],
	[0x2795, 0x2797],
	[0x27b0, 0x27b0],
	[0x27bf, 0x27bf],
	[0x2b1b, 0x2b1c],
	[0x2b50, 0x2b50],
	[0x2b55, 0x2b55],
	[0x2e80, 0x2e99],
	[0x2e9b, 0x2ef3],
	[0x2f00, 0x2fd5],
	[0x2ff0, 0x2ffb],
	[0x3000, 0x3029],
	[0x3030, 0x303e],
	[0x3041, 0x3096],
	[0x309b, 0x30ff],
	[0x3105, 0x312f],
	[0x3131, 0x318e],
	[0x3190, 0x31e3],
	[0x31f0, 0x321e],
	[0x3220, 0x3247],
	[0x3250, 0x4dbf],
	[0x4e00, 0xa48c],
	[0xa490, 0xa4c6],
	[0xa960, 0xa97c],
	[0xac00, 0xd7a3],
	[0xf900, 0xfaff],
	[0xfe10, 0xfe19],
	[0xfe30, 0xfe52],
	[0xfe54, 0xfe66],
	[0xfe68, 0xfe6b],
	[0xff00, 0xff60],
	[0xffe0, 0xffe6],
	[0x16fe0, 0x16fe4],
	[0x16ff0, 0x16ff1],
	[0x17000, 0x187f7],
	[0x18800, 0x18cd5],
	[0x18d00, 0x18d08],
	[0x1aff0, 0x1aff3],
	[0x1aff5, 0x1affb],
	[0x1affd, 0x1affe],
	[0x1b000, 0x1b122],
	[0x1b132, 0x1b132],
	[0x1b150, 0x1b152],
	[0x1b155, 0x1b155],
	[0x1b164, 0x1b167],
	[0x1b170, 0x1b2fb],
	[0x1f004, 0x1f004],
	[0x1f0cf, 0x1f0cf],
	[0x1f18e, 0x1f18e],
	[0x1f191, 0x1f19a],
	[0x1f200, 0x1f202],
	[0x1f210, 0x1f23b],
	[0x1f240, 0x1f248],
	[0x1f250, 0x1f251],
	[0x1f260, 0x1f265],
	[0x1f300, 0x1f320],
	[0x1f32d, 0x1f335],
	[0x1f337, 0x1f37c],
	[0x1f37e, 0x1f393],
	[0x1f3a0, 0x1f3ca],
	[0x1f3cf, 0x1f3d3],
	[0x1f3e0, 0x1f3f0],
	[0x1f3f4, 0x1f3f4],
	[0x1f3f8, 0x1f43e],
	[0x1f440, 0x1f440],
	[0x1f442, 0x1f4fc],
	[0x1f4ff, 0x1f53d],
	[0x1f54b, 0x1f54e],
	[0x1f550, 0x1f567],
	[0x1f57a, 0x1f57a],
	[0x1f595, 0x1f596],
	[0x1f5a4, 0x1f5a4],
	[0x1f5fb, 0x1f64f],
	[0x1f680, 0x1f6c5],
	[0x1f6cc, 0x1f6cc],
	[0x1f6d0, 0x1f6d2],
	[0x1f6d5, 0x1f6d7],
	[0x1f6dc, 0x1f6df],
	[0x1f6eb, 0x1f6ec],
	[0x1f6f4, 0x1f6fc],
	[0x1f7e0, 0x1f7eb],
	[0x1f7f0, 0x1f7f0],
	[0x1f90c, 0x1f93a],
	[0x1f93c, 0x1f945],
	[0x1f947, 0x1f9ff],
	[0x1fa70, 0x1fa7c],
	[0x1fa80, 0x1fa88],
	[0x1fa90, 0x1fabd],
	[0x1fabf, 0x1fac5],
	[0x1face, 0x1fadb],
	[0x1fae0, 0x1fae8],
	[0x1faf0, 0x1faf8],
	[0x20000, 0x2fffd],
	[0x30000, 0x3fffd],
];

// Binary search over the sorted range table.
function isWideCodePoint(code: number): boolean {
	let lo = 0;
	let hi = WIDE_RANGES.length - 1;
	while (lo <= hi) {
		const mid = (lo + hi) >> 1;
		const [start, end] = WIDE_RANGES[mid] ?? [0, 0];
		if (code < start) hi = mid - 1;
		else if (code > end) lo = mid + 1;
		else return true;
	}
	return false;
}

const ZERO_WIDTH_RE =
	/^(?:\p{Default_Ignorable_Code_Point}|\p{Control}|\p{Mark}|\p{Surrogate})+$/u;
// RGI_Emoji requires the `v` flag (same as pi's own rgiEmojiRegex).
const RGI_EMOJI_RE = /^\p{RGI_Emoji}$/v;
const LEADING_NON_PRINTING_RE =
	/^[\p{Default_Ignorable_Code_Point}\p{Control}\p{Format}\p{Mark}\p{Surrogate}]+/v;
const SEGMENTER = new Intl.Segmenter(undefined, { granularity: "grapheme" });

// Result cache: the TUI re-renders the whole chat on every keystroke, so
// the hot path is a map lookup. The chat can hold thousands of unique lines,
// so the cache must be sized for that and evict oldest-first instead of
// clearing (clearing forced a full re-measure every render and re-introduced
// the lag).
const WIDTH_CACHE = new Map<string, number>();
const WIDTH_CACHE_MAX = 16_384;

function isSimpleAscii(text: string): boolean {
	for (let i = 0; i < text.length; i++) {
		const code = text.charCodeAt(i);
		if (code < 0x20 || code > 0x7e) return false;
	}
	return true;
}

export function visibleWidth(text: string): number {
	const cached = WIDTH_CACHE.get(text);
	if (cached !== undefined) {
		// Refresh recency so the stable chat lines stay cached while the
		// composer generates new strings each keystroke.
		WIDTH_CACHE.delete(text);
		WIDTH_CACHE.set(text, cached);
		return cached;
	}
	// Fast path: plain printable ASCII (no escapes, tabs, or control chars)
	// is one cell per char.
	const width = isSimpleAscii(text) ? text.length : measureWidth(text);
	if (WIDTH_CACHE.size >= WIDTH_CACHE_MAX) {
		const oldest = WIDTH_CACHE.keys().next().value;
		if (oldest !== undefined) WIDTH_CACHE.delete(oldest);
	}
	WIDTH_CACHE.set(text, width);
	return width;
}

// Mirrors pi's graphemeWidth: tab=3, zero-width=0, RGI emoji=2, then the
// east-asian width of the base codepoint (plus trailing FF/HF forms).
function measureWidth(text: string): number {
	const clean = ansiStrip(text);
	let width = 0;
	for (const { segment } of SEGMENTER.segment(clean)) {
		if (segment === "\t") {
			width += 3;
			continue;
		}
		if (ZERO_WIDTH_RE.test(segment)) continue;
		if (RGI_EMOJI_RE.test(segment)) {
			width += 2;
			continue;
		}
		const base = segment.replace(LEADING_NON_PRINTING_RE, "");
		const cp = base.codePointAt(0);
		if (cp === undefined) continue;
		// Regional indicator symbols (flags) render 2 cells even in isolation.
		if (cp >= 0x1f1e6 && cp <= 0x1f1ff) {
			width += 2;
			continue;
		}
		let w = isWideCodePoint(cp) ? 2 : 1;
		// Trailing halfwidth/fullwidth forms and AM vowels in the segment.
		if (segment.length > 1) {
			for (const ch of segment.slice(1)) {
				const c = ch.codePointAt(0) ?? 0;
				if (c >= 0xff00 && c <= 0xffef) {
					w += isWideCodePoint(c) ? 2 : 1;
				} else if (c === 0x0e33 || c === 0x0eb3) {
					w += 1;
				}
			}
		}
		width += w;
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
		const code = text.charCodeAt(i);
		const pair =
			code >= 0xd800 && code <= 0xdbff && i + 1 < text.length
				? text.slice(i, i + 2)
				: ch;
		const cw = visibleWidth(pair);
		if (w + cw > budget) break;
		out += pair;
		w += cw;
		i += pair.length;
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

// Prompt-cache hit rate: cached-read tokens as a share of all input read
// (cached + uncached). Returns "" when there is no cache data at all. The
// label uses the nerd-font cache glyph (U+F1625) instead of the word.
const CACHE_GLYPH = "󱘥";

export function formatCacheHitRate(cacheRead: number, input: number): string {
	const read =
		typeof cacheRead === "number" && Number.isFinite(cacheRead) && cacheRead > 0
			? cacheRead
			: 0;
	const uncached =
		typeof input === "number" && Number.isFinite(input) && input > 0
			? input
			: 0;
	if (read <= 0 && uncached <= 0) return "";
	const percent = Math.round((read / (read + uncached)) * 100);
	return `${CACHE_GLYPH} ${percent}%`;
}
