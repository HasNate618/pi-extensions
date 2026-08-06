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
	return text
		.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
		.replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "");
}

export function visibleWidth(text: string): number {
	let width = 0;
	for (const ch of ansiStrip(text)) {
		const code = ch.codePointAt(0) ?? 0;
		const wide =
			(code >= 0x1100 && code <= 0x115f) ||
			code === 0x2329 || code === 0x232a ||
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

export function truncateToWidth(text: string, width: number, ellipsis = "…"): string {
	if (visibleWidth(text) <= width) return text;
	let out = "";
	let w = 0;
	for (const ch of text) {
		const cw = visibleWidth(ch);
		if (w + cw > width - visibleWidth(ellipsis)) break;
		out += ch;
		w += cw;
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
	return lines.filter((line, index) => line.length > 0 || index === lines.length - 1 || lines.length === 1);
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
	if (cost < 1) return `$${cost.toFixed(2)}`;
	return `$${cost.toFixed(2)}`;
}
