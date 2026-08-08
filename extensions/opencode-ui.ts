import {
	type ExtensionAPI,
	type ExtensionContext,
	getAgentDir,
} from "@earendil-works/pi-coding-agent";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parseConfig, type OpenCodeUiConfig } from "./opencode-ui/config.ts";
import { ComposerEditor, type ComposerState } from "./opencode-ui/composer.ts";
import { OpencodeFooter, type FooterRenderData } from "./opencode-ui/footer.ts";
import {
	installUserMessagePatch,
	removeUserMessagePatch,
} from "./opencode-ui/user-message.ts";
import { installAssistantMessagePatch } from "./opencode-ui/assistant-message.ts";
import { installToolCardPatch } from "./opencode-ui/tool-card.ts";
import { installSpinnerThrottle } from "./opencode-ui/spinner.ts";
import {
	computeUsageFingerprint,
	computeUsageTotals,
	type SessionEntry,
} from "./opencode-ui/usage.ts";
import { formatProviderLabel } from "./opencode-ui/format.ts";
import { setPrefixArmed } from "./opencode-ui/prefix-state.ts";

const CONFIG_FILE = "opencode-ui.json";

function loadConfig(): OpenCodeUiConfig {
	const path = join(getAgentDir(), CONFIG_FILE);
	if (!existsSync(path)) return parseConfig(undefined);
	try {
		return parseConfig(JSON.parse(readFileSync(path, "utf8")));
	} catch {
		return parseConfig(undefined);
	}
}

type SessionState = {
	modelLabel: string;
	providerLabel: string;
	thinkingLabel: string | undefined;
	usageFingerprint: string;
	cost: number;
	cacheRead: number;
	input: number;
};

function createState(ctx: ExtensionContext): SessionState {
	const entries = getEntries(ctx);
	const model = ctx.model;
	const totals = computeUsageTotals(entries);
	return {
		modelLabel: modelLabelFor(model),
		providerLabel: formatProviderLabel(model?.provider),
		thinkingLabel: undefined,
		usageFingerprint: computeUsageFingerprint(entries),
		cost: totals.cost,
		cacheRead: totals.cacheRead,
		input: totals.input,
	};
}

// Some model catalogs (e.g. opencode-go) mark new models with a "(New)"
// suffix in their display name; strip it so the composer shows a clean label.
function cleanModelName(raw: string): string {
	return raw.replace(/\s*\(New\)\s*$/i, "");
}

function modelLabelFor(
	model: { name?: string; id?: string } | undefined,
): string {
	const raw = model?.name ?? model?.id ?? "model";
	return cleanModelName(raw);
}

function getEntries(ctx: ExtensionContext): readonly SessionEntry[] {
	const manager = ctx.sessionManager as {
		getEntries?: () => readonly SessionEntry[];
		getBranch?: () => readonly SessionEntry[];
	};
	if (typeof manager.getEntries === "function") return manager.getEntries();
	if (typeof manager.getBranch === "function") return manager.getBranch();
	return [];
}

function requestRender(ctx: ExtensionContext): void {
	const tui = (ctx.ui as unknown as { requestRender?: () => void })
		.requestRender;
	tui?.();
}

export default function opencodeUi(pi: ExtensionAPI): void {
	let state: SessionState | null = null;
	let activeCtx: ExtensionContext | null = null;
	let config: OpenCodeUiConfig = parseConfig(undefined);
	let offBranchChange: (() => void) | null = null;
	let offSpinnerThrottle: (() => void) | null = null;
	let offPrefixArmed: (() => void) | null = null;
	let offAssistantPatch: (() => void) | null = null;
	let offToolCardPatch: (() => void) | null = null;

	let usageRefreshPending = false;
	const refreshUsage = (ctx: ExtensionContext): void => {
		if (usageRefreshPending) return;
		usageRefreshPending = true;
		setImmediate(() => {
			usageRefreshPending = false;
			// No activeCtx identity check here: pi hands each event a fresh
			// context object, so comparing against the session_start context
			// would always fail and the refresh would never run. The null
			// state check covers teardown and the fingerprint gate makes the
			// refresh cheap.
			if (!state) return;
			const entries = getEntries(ctx);
			const fingerprint = computeUsageFingerprint(entries);
			if (fingerprint === state.usageFingerprint) return;
			state.usageFingerprint = fingerprint;
			const totals = computeUsageTotals(entries);
			state.cost = totals.cost;
			state.cacheRead = totals.cacheRead;
			state.input = totals.input;
			requestRender(ctx);
		});
	};

	pi.on("session_start", (_event, ctx) => {
		config = loadConfig();
		offSpinnerThrottle?.();
		offSpinnerThrottle = installSpinnerThrottle(config.spinnerIntervalMs);
		// Subscribe to the prefix-keys extension's armed state (broadcast on the
		// shared event bus) so the sidebar can blend into the background while
		// pi listens for the next key. Works whether or not prefix-keys is
		// installed — without it the event never fires and the sidebar stays
		// border-colored.
		offPrefixArmed?.();
		setPrefixArmed(false);
		offPrefixArmed = pi.events.on("prefix:armed", (data) => {
			setPrefixArmed((data as { armed?: boolean } | undefined)?.armed === true);
			requestRender(ctx);
		});
		offAssistantPatch?.();
		offAssistantPatch = installAssistantMessagePatch(() => config);
		offToolCardPatch?.();
		offToolCardPatch = installToolCardPatch(() => config);
		// The built-in "Working..." status spinner ignores the chat margins
		// and stacks a second static row next to the thinking indicator while
		// a reply streams — hide it (the thinking indicator is separate and
		// stays).
		(
			ctx.ui as { setWorkingVisible?: (visible: boolean) => void }
		).setWorkingVisible?.(false);
		state = createState(ctx);
		activeCtx = ctx;

		ctx.ui.setEditorComponent(
			(tui, theme, keybindings) =>
				new ComposerEditor(
					tui,
					theme,
					keybindings,
					config,
					ctx.ui.theme,
					() => state ?? emptyState(),
				),
		);

		ctx.ui.setFooter((_tui, _theme, footerData) => {
			const fd = footerData as {
				cwd?: string;
				getGitBranch?: () => string | undefined;
				onBranchChange?: (cb: () => void) => () => void;
			};
			const getData = (): FooterRenderData => {
				const usage = ctx.getContextUsage() as
					| { tokens?: number | null; contextWindow?: number }
					| undefined;
				return {
					tokens: usage?.tokens ?? 0,
					contextWindow: usage?.contextWindow,
					cost: state?.cost ?? 0,
					cacheRead: state?.cacheRead ?? 0,
					input: state?.input ?? 0,
				};
			};
			const leftLabel = (): string => {
				const branch = fd.getGitBranch?.();
				const project = basename(fd.cwd ?? "");
				const b = branch ?? "";
				return b ? `${project}:${b}` : project;
			};
			offBranchChange?.();
			// Call as a method so `this` stays bound to the provider (extracting
			// it first would throw "this.branchChangeCallbacks is undefined" and
			// leave pi without any footer).
			offBranchChange =
				fd.onBranchChange?.(() => {
					if (activeCtx !== ctx) return;
					requestRender(ctx);
				}) ?? null;
			return new OpencodeFooter(
				config,
				ctx.ui.theme,
				leftLabel,
				getData,
				// Extension status chips (e.g. prefix-keys' "prefix ⌗" label) are
				// rendered by the built-in footer but lost in the custom one;
				// surface them so prefix feedback still shows.
				() =>
					(
						footerData as {
							getExtensionStatuses?: () => ReadonlyMap<string, string>;
						}
					).getExtensionStatuses?.(),
			);
		});

		installUserMessagePatch(
			() => config,
			() => ctx.ui.theme,
		);
	});

	pi.on("session_shutdown", () => {
		removeUserMessagePatch();
		offSpinnerThrottle?.();
		offSpinnerThrottle = null;
		offPrefixArmed?.();
		offPrefixArmed = null;
		setPrefixArmed(false);
		offAssistantPatch?.();
		offAssistantPatch = null;
		offToolCardPatch?.();
		offToolCardPatch = null;
		offBranchChange?.();
		offBranchChange = null;
		state = null;
		activeCtx = null;
	});

	pi.on("model_select", (event, ctx) => {
		if (!state) return;
		state.modelLabel = modelLabelFor(
			event.model as { name?: string; id?: string } | undefined,
		);
		state.providerLabel = formatProviderLabel(event.model?.provider);
		requestRender(ctx);
	});

	pi.on("thinking_level_select", (event, ctx) => {
		if (!state) return;
		state.thinkingLabel = (event as { level?: string }).level;
		requestRender(ctx);
	});

	pi.on("message_end", (_event, ctx) => {
		if (!state) return;
		// Usage/cost/cache data lands on assistant messages (and tool
		// results); refresh on every completed message so the footer stays
		// current. The fingerprint gate makes the refresh cheap.
		refreshUsage(ctx);
	});

	pi.on("agent_end", (_event, ctx) => {
		refreshUsage(ctx);
	});
}

function emptyState(): ComposerState {
	return {
		modelLabel: "model",
		providerLabel: "",
		thinkingLabel: undefined,
	};
}

function basename(path: string): string {
	return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}
