import type { Theme } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import type { OpenCodeUiConfig } from "./config.ts";
import { buildGauge, formatContextLabel, formatCostLabel } from "./format.ts";
import { composeFooterLines, type Styler } from "./layout.ts";

export type FooterRenderData = {
	tokens: number | null | undefined;
	contextWindow: number | undefined;
	cost: number;
};

export class OpencodeFooter implements Component {
	private readonly config: OpenCodeUiConfig;
	private readonly uiTheme: Theme;
	private readonly leftLabel: () => string;
	private readonly getData: () => FooterRenderData;

	constructor(
		config: OpenCodeUiConfig,
		uiTheme: Theme,
		leftLabel: () => string,
		getData: () => FooterRenderData,
	) {
		this.config = config;
		this.uiTheme = uiTheme;
		this.leftLabel = leftLabel;
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
			contextLabel: formatContextLabel(data.tokens, data.contextWindow),
			gauge: buildGauge(percent, this.config.gaugeWidth),
			costLabel: formatCostLabel(data.cost),
			style: this.styleRole,
			config: this.config,
		});
	}

	invalidate(): void {}
}
