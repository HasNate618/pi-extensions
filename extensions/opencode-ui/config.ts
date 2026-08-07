export type OpenCodeUiMargins = {
	left: number;
	right: number;
	bottom: boolean;
};

export type OpenCodeUiConfig = {
	// Composer box margins: left is the transparent rail gutter, right is the
	// box's right gutter (both lie outside the fill).
	margins: OpenCodeUiMargins;
	// Footer bar insets (the footer has no box, just text insets).
	footerMargins: { left: number; right: number };
	railChar: string;
	gaugeWidth: number;
	// Minimum ms between spinner ticks (pi's built-in loader defaults to 80ms
	// and re-renders the whole TUI per tick).
	spinnerIntervalMs: number;
	showThinking: boolean;
	// Horizontal transparent gutters for chat messages (the chat body has
	// no rail — pi's native messages span the full width otherwise).
	chatInset: number;
};

export const DEFAULT_CONFIG: OpenCodeUiConfig = {
	margins: { left: 1, right: 2, bottom: true },
	footerMargins: { left: 2, right: 2 },
	railChar: "┃",
	gaugeWidth: 15,
	spinnerIntervalMs: 500,
	showThinking: true,
	chatInset: 2,
};

const clamp = (value: number, min: number, max: number): number =>
	Math.max(min, Math.min(max, value));

export function parseConfig(raw: unknown): OpenCodeUiConfig {
	const source = (raw ?? {}) as Record<string, unknown>;
	const margins = (source.margins ?? {}) as Record<string, unknown>;
	const footerMargins = (source.footerMargins ?? {}) as Record<string, unknown>;
	const config: OpenCodeUiConfig = {
		margins: {
			left: clamp(numberOr(margins.left, DEFAULT_CONFIG.margins.left), 0, 4),
			right: clamp(numberOr(margins.right, DEFAULT_CONFIG.margins.right), 0, 4),
			bottom: booleanOr(margins.bottom, DEFAULT_CONFIG.margins.bottom),
		},
		footerMargins: {
			left: clamp(
				numberOr(footerMargins.left, DEFAULT_CONFIG.footerMargins.left),
				0,
				4,
			),
			right: clamp(
				numberOr(footerMargins.right, DEFAULT_CONFIG.footerMargins.right),
				0,
				4,
			),
		},
		railChar: stringOr(source.railChar, DEFAULT_CONFIG.railChar),
		gaugeWidth: clamp(
			numberOr(source.gaugeWidth, DEFAULT_CONFIG.gaugeWidth),
			5,
			40,
		),
		spinnerIntervalMs: clamp(
			numberOr(source.spinnerIntervalMs, DEFAULT_CONFIG.spinnerIntervalMs),
			100,
			5000,
		),
		showThinking: booleanOr(source.showThinking, DEFAULT_CONFIG.showThinking),
		chatInset: clamp(
			numberOr(source.chatInset, DEFAULT_CONFIG.chatInset),
			0,
			4,
		),
	};
	return config;
}

function numberOr(value: unknown, fallback: number): number {
	if (typeof value === "number" && Number.isFinite(value)) return value;
	if (value === undefined) return fallback;
	throw new TypeError(`expected number, got ${typeof value}`);
}

function booleanOr(value: unknown, fallback: boolean): boolean {
	if (typeof value === "boolean") return value;
	if (value === undefined) return fallback;
	throw new TypeError(`expected boolean, got ${typeof value}`);
}

function stringOr(value: unknown, fallback: string): string {
	if (typeof value === "string") return value;
	if (value === undefined) return fallback;
	throw new TypeError(`expected string, got ${typeof value}`);
}
