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
import { installUserMessagePatch, removeUserMessagePatch } from "./opencode-ui/user-message.ts";
import {
	computeUsageFingerprint,
	computeUsageTotals,
	type SessionEntry,
} from "./opencode-ui/usage.ts";
import { formatProviderLabel } from "./opencode-ui/format.ts";

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
	lastMessage: string | undefined;
	modelLabel: string;
	providerLabel: string;
	thinkingLabel: string | undefined;
	usageFingerprint: string;
	cost: number;
};

function createState(ctx: ExtensionContext): SessionState {
	const entries = getEntries(ctx);
	const lastUser = [...entries]
		.reverse()
		.find((entry) => entry.type === "message" && entry.message?.role === "user");
	const messageContent = (lastUser?.message as { content?: unknown } | undefined)?.content;
	const lastMessage = contentToText(messageContent);
	const model = ctx.model;
	const totals = computeUsageTotals(entries);
	return {
		lastMessage,
		modelLabel: modelLabelFor(model),
		providerLabel: formatProviderLabel(model?.provider),
		thinkingLabel: undefined,
		usageFingerprint: computeUsageFingerprint(entries),
		cost: totals.cost,
	};
}

function contentToText(content: unknown): string | undefined {
	if (typeof content === "string") return content;
	if (Array.isArray(content)) {
		return (content as { text?: string }[])
			.map((part) => (typeof part.text === "string" ? part.text : ""))
			.join("");
	}
	return undefined;
}

// Some model catalogs (e.g. opencode-go) mark new models with a "(New)"
// suffix in their display name; strip it so the composer shows a clean label.
function cleanModelName(raw: string): string {
	return raw.replace(/\s*\(New\)\s*$/i, "");
}

function modelLabelFor(model: { name?: string; id?: string } | undefined): string {
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
	const tui = (ctx.ui as unknown as { requestRender?: () => void }).requestRender;
	tui?.();
}

export default function opencodeUi(pi: ExtensionAPI): void {
	let state: SessionState | null = null;
	let activeCtx: ExtensionContext | null = null;
	let config: OpenCodeUiConfig = parseConfig(undefined);
	let offBranchChange: (() => void) | null = null;

	let usageRefreshPending = false;
	const refreshUsage = (ctx: ExtensionContext): void => {
		if (usageRefreshPending) return;
		usageRefreshPending = true;
		setImmediate(() => {
			usageRefreshPending = false;
			if (!state || activeCtx !== ctx) return;
			const entries = getEntries(ctx);
			const fingerprint = computeUsageFingerprint(entries);
			if (fingerprint === state.usageFingerprint) return;
			state.usageFingerprint = fingerprint;
			state.cost = computeUsageTotals(entries).cost;
			requestRender(ctx);
		});
	};

	pi.on("session_start", (_event, ctx) => {
		config = loadConfig();
		state = createState(ctx);
		activeCtx = ctx;

		ctx.ui.setEditorComponent((tui, theme, keybindings) =>
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
			return new OpencodeFooter(config, ctx.ui.theme, leftLabel, getData);
		});

		installUserMessagePatch(
			() => config,
			() => ctx.ui.theme,
		);
	});

	pi.on("session_shutdown", () => {
		removeUserMessagePatch();
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

	pi.on("message_end", (event, ctx) => {
		if (!state || event.message?.role !== "user") return;
		state.lastMessage = contentToText(
			(event.message as { content?: unknown } | undefined)?.content,
		);
		refreshUsage(ctx);
		requestRender(ctx);
	});

	pi.on("agent_end", (_event, ctx) => {
		refreshUsage(ctx);
	});
}

function emptyState(): ComposerState {
	return {
		lastMessage: undefined,
		modelLabel: "model",
		providerLabel: "",
		thinkingLabel: undefined,
	};
}

function basename(path: string): string {
	return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}
