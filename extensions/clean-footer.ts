/**
 * Clean Footer — replaces pi's default footer with a usage line only,
 * hiding extension status noise (e.g. "LSP Inactive", MCP status).
 *
 * - Usage line: ↑input ↓output RcacheRead CHcacheHit% $cost ctx%/window
 * - Right side: model id + git branch
 * - No extension statuses (setStatus texts) are rendered.
 *
 * Drop this file from ~/.pi/agent/extensions/ to restore the default footer.
 */
import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

export default function (pi: ExtensionAPI) {
  pi.on("session_start", async (_event, ctx) => {
    if (ctx.mode !== "tui" || !ctx.hasUI) return;

    ctx.ui.setFooter((tui, theme, footerData) => {
      const unsub = footerData.onBranchChange(() => tui.requestRender());

      return {
        dispose: unsub,
        invalidate() {},
        render(width: number): string[] {
          let input = 0,
            output = 0,
            cacheRead = 0,
            cacheWrite = 0,
            cost = 0;
          let latestCh: number | null = null;

          const entries = ctx.sessionManager.getBranch();
          for (let i = entries.length - 1; i >= 0; i--) {
            const e = entries[i];
            if (e.type !== "message" || e.message.role !== "assistant") continue;
            const usage = (e.message as AssistantMessage).usage;
            if (!usage) continue;
            input += usage.input ?? 0;
            output += usage.output ?? 0;
            cacheRead += usage.cacheRead ?? 0;
            cacheWrite += usage.cacheWrite ?? 0;
            cost += usage.cost?.total ?? 0;
            // CH is computed from the latest assistant prompt only.
            const denom = (usage.input ?? 0) + (usage.cacheRead ?? 0) + (usage.cacheWrite ?? 0);
            if (latestCh === null && denom > 0) {
              latestCh = ((usage.cacheRead ?? 0) / denom) * 100;
            }
          }

          const fmt = (n: number) => {
            if (n < 1000) return `${n}`;
            if (n < 1_000_000) return `${(n / 1000).toFixed(1)}k`;
            return `${(n / 1_000_000).toFixed(1)}M`;
          };

          const parts = [`↑${fmt(input)}`, `↓${fmt(output)}`];
          if (cacheRead > 0) parts.push(`R${fmt(cacheRead)}`);
          if (latestCh !== null) parts.push(`CH${latestCh.toFixed(1)}%`);
          parts.push(`$${cost.toFixed(3)}`);

          const ctxUsage = ctx.getContextUsage?.();
          const window = ctx.model?.contextWindow;
          if (ctxUsage && typeof ctxUsage.tokens === "number" && ctxUsage.tokens > 0 && window) {
            parts.push(`${((ctxUsage.tokens / window) * 100).toFixed(1)}%/${fmt(window)}`);
          }

          const left = theme.fg("dim", parts.join(" "));
          const branch = footerData.getGitBranch();
          const right = theme.fg(
            "dim",
            `${ctx.model?.id || "no-model"}${branch ? ` (${branch})` : ""}`,
          );

          const pad = " ".repeat(Math.max(1, width - visibleWidth(left) - visibleWidth(right)));
          return [truncateToWidth(left + pad + right, width)];
        },
      };
    });
  });
}
