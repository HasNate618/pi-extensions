import {
	CustomEditor,
	type KeybindingsManager,
	type Theme,
} from "@earendil-works/pi-coding-agent";
import type { TUI } from "@earendil-works/pi-tui";
import type { EditorTheme } from "@earendil-works/pi-tui/dist/components/editor.ts";
import { stripEditorFrame } from "./border.ts";
import type { OpenCodeUiConfig } from "./config.ts";
import {
	bgToFgEscape,
	reapplyBackground,
	thinkingTokenForLevel,
} from "./format.ts";
import { composeComposerLines, type Styler } from "./layout.ts";

export type ComposerState = {
	modelLabel: string;
	providerLabel: string;
	thinkingLabel: string | undefined;
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
			case "fill": {
				// Solid dark box fill behind the whole row (opencode renders its
				// composer as a solid background box). The editor's cursor block
				// ends with \x1b[0m, which resets the background mid-row, so the
				// fill is re-applied after every reset. Falls back to no fill
				// when the theme has no usable background token.
				let fill: string;
				try {
					const bgEscape = this.uiTheme
						.bg("userMessageBg", "")
						.replace(/\x1b\[49m$/, "");
					fill = `${bgEscape}${reapplyBackground(bgEscape, text)}\x1b[49m`;
				} catch {
					fill = text;
				}
				return fill;
			}
			case "bar": {
				// Half-height edge glyphs in the same dark color as the fill. The
				// palette has no fg token for the box color (userMessageBg is a
				// bg-only key), so derive the fg escape from the bg escape.
				let glyph: string;
				try {
					const bg = this.uiTheme.bg("userMessageBg", "");
					const fgEscape = bgToFgEscape(bg);
					glyph = fgEscape ? `${fgEscape}${text}\x1b[39m` : text;
				} catch {
					glyph = text;
				}
				return glyph;
			}
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
		// Two columns narrower than the box so the editor's own wrap width
		// (inner - 1, reserving a column for the cursor) equals the composer's
		// text budget — full lines fit without a spurious ellipsis.
		const inner = Math.max(
			0,
			width - this.config.margins.left - this.config.margins.right - 2,
		);
		if (inner <= 4) return super.render(width);
		const base = super.render(inner);
		// Pass the editor's own paddingX so the frame strip removes the side
		// padding without touching SGR codes or the cursor marker.
		const stripped = stripEditorFrame(base, inner, this.paddingX);
		const contentLines = stripped ? stripped.content : base;
		const state = this.getState();
		return composeComposerLines({
			width,
			contentLines,
			modelLabel: state.modelLabel,
			providerLabel: state.providerLabel,
			thinkingLabel: this.config.showThinking ? state.thinkingLabel : undefined,
			style: this.styleRole,
			config: this.config,
		});
	}
}
