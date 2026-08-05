/**
 * Clean Footer — replaces pi's default footer with a usage line only,
 * hiding extension status noise (e.g. "LSP Inactive", MCP status).
 *
 * - Usage line: ↑input ↓output RcacheRead CHcacheHit% $cost ctx%/window
 * - Right side: model id + git branch
 * - No extension statuses (setStatus texts) are rendered.
 *
 * Drop this file from the package (or uninstall it) to restore the default footer.
 */
import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

interface UsageTotals {
	input: number;
	output: number;
	cacheRead: number;
	cacheWrite: number;
	cost: number;
	latestCh: number | null;
}

function num(v: number | undefined): number {
	return typeof v === "number" ? v : 0;
}

function computeUsage(entries: unknown[]): UsageTotals {
	let input = 0,
		output = 0,
		cacheRead = 0,
		cacheWrite = 0,
		cost = 0;
	let latestCh: number | null = null;

	for (let i = entries.length - 1; i >= 0; i--) {
		const entry = entries[i] as {
			type?: string;
			message?: { role?: string; usage?: AssistantMessage["usage"] };
		};
		if (entry?.type !== "message" || entry.message?.role !== "assistant")
			continue;
		const usage = entry.message.usage;
		if (!usage) continue;
		input += num(usage.input);
		output += num(usage.output);
		cacheRead += num(usage.cacheRead);
		cacheWrite += num(usage.cacheWrite);
		cost += num(usage.cost?.total);
		// CH is computed from the latest assistant prompt only.
		const denom =
			num(usage.input) + num(usage.cacheRead) + num(usage.cacheWrite);
		if (latestCh === null && denom > 0) {
			latestCh = (num(usage.cacheRead) / denom) * 100;
		}
	}

	return { input, output, cacheRead, cacheWrite, cost, latestCh };
}

function formatTokens(n: number): string {
	if (n < 1000) return `${n}`;
	if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
	return `${(n / 1_000_000).toFixed(1)}M`;
}

function buildUsageParts(
	usage: UsageTotals,
	contextTokens: number | undefined,
	contextWindow: number | undefined,
): string[] {
	const parts = [
		`↑${formatTokens(usage.input)}`,
		`↓${formatTokens(usage.output)}`,
	];
	if (usage.cacheRead > 0) parts.push(`R${formatTokens(usage.cacheRead)}`);
	if (usage.latestCh !== null) parts.push(`CH${usage.latestCh.toFixed(1)}%`);
	parts.push(`$${usage.cost.toFixed(3)}`);
	if (typeof contextTokens === "number" && contextTokens > 0 && contextWindow) {
		parts.push(
			`${((contextTokens / contextWindow) * 100).toFixed(1)}%/${formatTokens(contextWindow)}`,
		);
	}
	return parts;
}

export default function (pi: ExtensionAPI) {
	pi.on("session_start", (_event, ctx) => {
		if (ctx.mode !== "tui" || !ctx.hasUI) return;

		ctx.ui.setFooter((tui, theme, footerData) => {
			const unsub = footerData.onBranchChange(() => tui.requestRender());

			return {
				dispose: unsub,
				invalidate() {},
				render(width: number): string[] {
					const usage = computeUsage(ctx.sessionManager.getBranch());
					const ctxUsage = ctx.getContextUsage?.();
					const left = theme.fg(
						"dim",
						buildUsageParts(
							usage,
							ctxUsage?.tokens,
							ctx.model?.contextWindow,
						).join(" "),
					);
					const branch = footerData.getGitBranch();
					const right = theme.fg(
						"dim",
						`${ctx.model?.id || "no-model"}${branch ? ` (${branch})` : ""}`,
					);
					const pad = " ".repeat(
						Math.max(1, width - visibleWidth(left) - visibleWidth(right)),
					);
					return [truncateToWidth(left + pad + right, width)];
				},
			};
		});
	});
}
