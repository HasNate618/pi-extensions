import type { Theme } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import type { OpenCodeUiConfig } from "./config.ts";
import { buildGauge } from "./format.ts";
import { composeFooterLines, type Styler } from "./layout.ts";

export type FooterRenderData = {
	tokens: number | null | undefined;
	contextWindow: number | undefined;
	cost: number;
};

export class OpencodeFooter implements Component {
	private readonly config: OpenCodeUiConfig;
	private readonly uiTheme: Theme;
	private readonly getData: () => FooterRenderData;

	constructor(
		config: OpenCodeUiConfig,
		uiTheme: Theme,
		getData: () => FooterRenderData,
	) {
		this.config = config;
		this.uiTheme = uiTheme;
		this.getData = getData;
	}

	private styleRole: Styler = (text, role) => {
		switch (role) {
			case "muted":
				return this.uiTheme.fg("muted", text);
			case "text":
				return this.uiTheme.fg("text", text);
			default:
				return text;
		}
	};

	render(width: number): string[] {
		const data = this.getData();
		const tokens = data.tokens ?? 0;
		const percent =
			data.contextWindow && data.contextWindow > 0
				? Math.min(100, (tokens / data.contextWindow) * 100)
				: 0;
		return composeFooterLines({
			width,
			left: this.leftLabel(),
			contextLabel: this.formatContext(data),
			gauge: buildGauge(percent, this.config.gaugeWidth),
			costLabel: this.formatCost(data.cost),
			style: this.styleRole,
			config: this.config,
		});
	}

	private leftLabel(): string {
		// Overridden by the entry via a getter when git data is wired in;
		// kept as a plain method so the component stays self-contained.
		return "";
	}

	private formatContext(data: FooterRenderData): string {
		const { tokens: used, contextWindow } = data;
		if (!contextWindow || contextWindow <= 0) return "--";
		const count = typeof used === "number" && used >= 0 ? used : 0;
		const compact = (value: number): string =>
			value < 1000
				? String(Math.round(value))
				: value < 1_000_000
					? `${Math.round(value / 1000)}k`
					: `${(value / 1_000_000).toFixed(1)}M`;
		return `${compact(count)}/${compact(contextWindow)}`;
	}

	private formatCost(cost: number): string {
		if (!Number.isFinite(cost) || cost <= 0) return "";
		if (cost < 0.01) return `$${cost.toFixed(3)}`;
		return `$${cost.toFixed(2)}`;
	}

	invalidate(): void {}
}
