import {
	CustomEditor,
	type KeybindingsManager,
	type Theme,
} from "@earendil-works/pi-coding-agent";
import type { TUI } from "@earendil-works/pi-tui";
import type { EditorTheme } from "@earendil-works/pi-tui/dist/components/editor.ts";
import { stripEditorFrame } from "./border.ts";
import type { OpenCodeUiConfig } from "./config.ts";
import { thinkingTokenForLevel } from "./format.ts";
import { composeComposerLines, type Styler } from "./layout.ts";

export type ComposerState = {
	lastMessage: string | undefined;
	modelLabel: string;
	providerLabel: string;
	thinkingLabel: string | undefined;
	isNewSession: boolean;
};

export class ComposerEditor extends CustomEditor {
	private readonly config: OpenCodeUiConfig;
	private readonly uiTheme: Theme;
	private readonly getState: () => ComposerState;

	constructor(
		tui: TUI,
		theme: EditorTheme,
		keybindings: KeybindingsManager,
		config: OpenCodeUiConfig,
		uiTheme: Theme,
		getState: () => ComposerState,
	) {
		super(tui, theme, keybindings, { paddingX: 0 });
		this.config = config;
		this.uiTheme = uiTheme;
		this.getState = getState;
	}

	private styleRole: Styler = (text, role) => {
		switch (role) {
			case "rail":
				return this.uiTheme.fg("border", text);
			case "bar":
				return this.uiTheme.fg("accent", text);
			case "model":
				return this.uiTheme.fg("accent", text);
			case "muted":
				return this.uiTheme.fg("muted", text);
			case "thinking": {
				const level = this.getState().thinkingLabel;
				return this.uiTheme.fg(thinkingTokenForLevel(level), text);
			}
			default:
				return text;
		}
	};

	override render(width: number): string[] {
		const inner = Math.max(0, width - this.config.margins.left - this.config.margins.right);
		if (inner <= 4) return super.render(width);
		const base = super.render(inner);
		const stripped = stripEditorFrame(base, inner);
		const contentLines = stripped ? stripped.content : base;
		const state = this.getState();
		return composeComposerLines({
			width,
			contentLines,
			lastMessage: this.config.showLastMessage ? state.lastMessage : undefined,
			modelLabel: state.modelLabel,
			providerLabel: state.providerLabel,
			thinkingLabel: this.config.showThinking ? state.thinkingLabel : undefined,
			showNewSessionBadge:
				this.config.newSessionBadge && state.isNewSession ? true : undefined,
			style: this.styleRole,
			config: this.config,
		});
	}
}
