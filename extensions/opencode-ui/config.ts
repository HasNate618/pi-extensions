export type OpenCodeUiMargins = { left: number; right: number; bottom: boolean };

export type OpenCodeUiConfig = {
	margins: OpenCodeUiMargins;
	railChar: string;
	barChar: string;
	gaugeWidth: number;
	showLastMessage: boolean;
	showThinking: boolean;
	newSessionBadge: boolean;
};

export const DEFAULT_CONFIG: OpenCodeUiConfig = {
	margins: { left: 1, right: 1, bottom: true },
	railChar: "┃",
	barChar: "▀",
	gaugeWidth: 13,
	showLastMessage: true,
	showThinking: true,
	newSessionBadge: true,
};

const clamp = (value: number, min: number, max: number): number =>
	Math.max(min, Math.min(max, value));

export function parseConfig(raw: unknown): OpenCodeUiConfig {
	const source = (raw ?? {}) as Record<string, unknown>;
	const margins = (source.margins ?? {}) as Record<string, unknown>;
	const config: OpenCodeUiConfig = {
		margins: {
			left: clamp(numberOr(margins.left, DEFAULT_CONFIG.margins.left), 0, 2),
			right: clamp(numberOr(margins.right, DEFAULT_CONFIG.margins.right), 0, 2),
			bottom: booleanOr(margins.bottom, DEFAULT_CONFIG.margins.bottom),
		},
		railChar: stringOr(source.railChar, DEFAULT_CONFIG.railChar),
		barChar: stringOr(source.barChar, DEFAULT_CONFIG.barChar),
		gaugeWidth: clamp(numberOr(source.gaugeWidth, DEFAULT_CONFIG.gaugeWidth), 5, 40),
		showLastMessage: booleanOr(source.showLastMessage, DEFAULT_CONFIG.showLastMessage),
		showThinking: booleanOr(source.showThinking, DEFAULT_CONFIG.showThinking),
		newSessionBadge: booleanOr(source.newSessionBadge, DEFAULT_CONFIG.newSessionBadge),
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
