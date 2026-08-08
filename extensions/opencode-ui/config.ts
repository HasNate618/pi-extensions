export type OpenCodeUiMargins = {
	left: number;
	right: number;
	bottom: boolean;
};

export type OpenCodeUiConfig = {
	// Composer/user-message override: when set, wins for those two regions.
	// Otherwise chatMargins applies everywhere.
	margins?: OpenCodeUiMargins;
	// Footer bar insets (the footer has no box, just text insets).
	footerMargins: { left: number; right: number };
	// Global chat gutters: composer, user messages, assistant messages,
	// thinking, and tool-call cards.
	chatMargins: { left: number; right: number };
	railChar: string;
	gaugeWidth: number;
	// Minimum ms between spinner ticks (pi's built-in loader defaults to 80ms
	// and re-renders the whole TUI per tick).
	spinnerIntervalMs: number;
	showThinking: boolean;
};

export const DEFAULT_CONFIG: OpenCodeUiConfig = {
	margins: undefined,
	footerMargins: { left: 3, right: 3 },
	chatMargins: { left: 3, right: 3 },
	railChar: "┃",
	gaugeWidth: 15,
	spinnerIntervalMs: 500,
	showThinking: true,
};

const clamp = (value: number, min: number, max: number): number =>
	Math.max(min, Math.min(max, value));

export function parseConfig(raw: unknown): OpenCodeUiConfig {
	const source = (raw ?? {}) as Record<string, unknown>;
	const margins = (source.margins ?? {}) as Record<string, unknown>;
	const footerMargins = (source.footerMargins ?? {}) as Record<string, unknown>;
	const chatMargins = (source.chatMargins ?? {}) as Record<string, unknown>;
	const config: OpenCodeUiConfig = {
		margins: source.margins
			? {
					left: clamp(
						numberOr(margins.left, DEFAULT_CONFIG.chatMargins.left),
						0,
						4,
					),
					right: clamp(
						numberOr(margins.right, DEFAULT_CONFIG.chatMargins.right),
						0,
						4,
					),
					bottom: booleanOr(margins.bottom, true),
				}
			: undefined,
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
		chatMargins: {
			left: clamp(
				numberOr(chatMargins.left, DEFAULT_CONFIG.chatMargins.left),
				0,
				4,
			),
			right: clamp(
				numberOr(chatMargins.right, DEFAULT_CONFIG.chatMargins.right),
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
	};
	return config;
}

// Effective margins for the composer and user-message boxes (they share the
// same visual box): the explicit `margins` alias wins when set, otherwise
// the boxes sit one cell closer to the sidebar than the chat body — a
// 2-cell left gutter, with the right side following chatMargins.
export function composerMargins(config: OpenCodeUiConfig): OpenCodeUiMargins {
	return (
		config.margins ?? {
			left: 2,
			right: config.chatMargins.right,
			bottom: true,
		}
	);
}

// Alias kept for call sites that want to be explicit about the box margins
// (composer + user messages) vs the chat body's chatMargins.
export function composerBoxMargins(
	config: OpenCodeUiConfig,
): OpenCodeUiMargins {
	return composerMargins(config);
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
