/**
 * dashboard — full-screen pi launcher.
 *
 * Replaces pi's built-in startup screen with a centered launcher: the pi logo,
 * a recent-sessions picker, quick actions, a status line, and a hint bar.
 *
 * Keybindings:
 *   j/k (or up/down)  scroll sessions
 *   enter             open the selected session (default = most recent)
 *   n                 start a new session
 *   /                 filter/search sessions (esc cancels)
 *   q / esc           quit pi
 *
 * On startup, the dashboard is skipped entirely when the cwd has no
 * sessions, letting pi proceed straight to a fresh session. It is also
 * skipped when pi was launched with a session-selecting CLI flag
 * (--session/--resume/--continue/--fork), since the opened session was
 * explicitly chosen.
 *
 * Resuming a session re-executes pi with `--session <file>` (or uses
 * `ctx.switchSession` when invoked via the /dashboard command), because a
 * real resume requires rebuilding the agent runtime from the saved file —
 * merely rebinding the session file on the running manager loses history.
 *
 * The terminal pane is cleared when the dashboard mounts, and again right
 * before pi shuts down (after leaving the alternate screen buffer so the
 * clear lands on the main buffer), so no leftover TUI frames or stale shell
 * content remain after pi exits.
 */
import { spawn, spawnSync } from "node:child_process";
import { statSync } from "node:fs";
import { basename } from "node:path";
import { buildResumeArgs, hasSessionSelectFlag } from "./dashboard/resume.ts";
import {
	decodePrintableKey,
	matchesKey,
	truncateToWidth,
	visibleWidth,
} from "@earendil-works/pi-tui";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import type {
	ExtensionAPI,
	ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";

// The pi "P" logo (recovered from the pre-restructure dashboard).
const LOGO = [
	"████████████",
	"████████████",
	"████    ████",
	"████    ████",
	"████████    ████",
	"████████    ████",
	"████        ████",
	"████        ████",
];

// Nerd Font icons (no emoji).
const ICON_CLOCK = "\uF017"; // nf-fa-clock-o
const ICON_BRANCH = "\uE0A0"; // nf-dev-git_branch

/** Clear screen + home. Used on mount (clears the alternate screen). */
const CLEAR = "\x1b[2J\x1b[H";

/** Exit the alternate screen, then clear the main buffer + home. Used just
 * before pi shuts down so the user is left with a clean terminal. */
const CLEAR_ON_EXIT = "\x1b[?1049l" + CLEAR;

/** Max width of the centered content column; wider terminals get margins. */
const MAX_CONTENT_WIDTH = 72;

/** Re-exec pi with `--session <file>` so the full session-replacement lifecycle
 * runs: the runtime is rebuilt from the saved file, restoring the conversation
 * history, model, and thinking level. `ctx.sessionManager.setSessionFile()`
 * alone cannot do this — it only rebinds the file pointer on the existing
 * session manager, leaving the agent runtime on the fresh startup session
 * (history gone). The current process shuts down and the child takes over the
 * terminal. Returns the spawned child for callers that want to await exit. */
function relaunchPiWithSession(file: string): ReturnType<typeof spawn> {
	const child = spawn(
		process.execPath,
		buildResumeArgs(process.argv.slice(2), file),
		{ stdio: "inherit" },
	);
	child.unref();
	return child;
}

const OVERLAY_OPTIONS = {
	overlay: true,
	overlayOptions: {
		anchor: "top-left",
		margin: 0,
		width: "100%",
		height: "100%",
	},
} as const;

interface SessionEntry {
	file: string;
	path?: string;
	name?: string;
	displayName?: string;
	firstMessage?: string;
}

type DashboardChoice =
	| { type: "resume"; file: string }
	| { type: "new" }
	| { type: "quit" };

interface MinimalTui {
	terminal: { rows: number; columns: number; write(data: string): void };
	requestRender(): void;
}

type ThemeFn = (color: string, text: string) => string;

function sessionFile(session: SessionEntry): string {
	return session.file ?? session.path ?? "";
}

function sessionLabel(session: SessionEntry): string {
	const raw =
		session.displayName ??
		session.name ??
		session.firstMessage ??
		basename(sessionFile(session));
	const firstLine = raw.split("\n")[0] ?? "";
	return firstLine.length > 44 ? `${firstLine.slice(0, 41)}...` : firstLine;
}

function formatRelativeTime(mtimeMs: number): string {
	const diffMs = Date.now() - mtimeMs;
	const s = Math.floor(diffMs / 1000);
	if (s < 60) return "now";
	const m = Math.floor(s / 60);
	if (m < 60) return `${m}m ago`;
	const h = Math.floor(m / 60);
	if (h < 24) return `${h}h ago`;
	const d = Math.floor(h / 24);
	if (d < 7) return `${d}d ago`;
	return new Date(mtimeMs).toISOString().slice(0, 10);
}

function getGitBranch(): string {
	// spawnSync (not execSync): a failing execSync relays git's stderr to the
	// terminal even when the error is caught, spamming "fatal: not a git
	// repository" on every dashboard render. spawnSync never throws or prints.
	const res = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
		encoding: "utf8",
		timeout: 2000,
	});
	if (res.status !== 0) {
		return "";
	}
	return res.stdout.trim().replace(/^detached at /, "detached");
}

function getCwdDisplay(): string {
	const cwd = process.cwd();
	const home = process.env.HOME ?? "";
	return cwd.startsWith(home) ? `~${cwd.slice(home.length)}` : cwd;
}

function getPiVersion(pi: ExtensionAPI): string {
	const withVersion = pi as ExtensionAPI & { getVersion?: () => string };
	try {
		return withVersion.getVersion?.() ?? "";
	} catch {
		return "";
	}
}

class DashboardComponent implements Component {
	private selectedIndex = 0;
	private filter = "";
	private filtering = false;

	constructor(
		private tui: MinimalTui,
		private sessions: SessionEntry[],
		private theme: { fg: ThemeFn },
		private done: (choice: DashboardChoice) => void,
	) {}

	private filtered(): SessionEntry[] {
		if (this.filter === "") {
			return this.sessions;
		}
		const needle = this.filter.toLowerCase();
		return this.sessions.filter((s) =>
			sessionLabel(s).toLowerCase().includes(needle),
		);
	}

	private snap(): void {
		const len = this.filtered().length;
		this.selectedIndex = Math.max(
			0,
			Math.min(this.selectedIndex, Math.max(0, len - 1)),
		);
	}

	private move(dir: number): void {
		this.snap();
		const len = this.filtered().length;
		if (len === 0) return;
		this.selectedIndex = Math.max(
			0,
			Math.min(this.selectedIndex + dir, len - 1),
		);
		this.tui.requestRender();
	}

	private launchSelected(): void {
		const list = this.filtered();
		if (list.length === 0) return;
		this.snap();
		const file = sessionFile(list[this.selectedIndex]);
		if (file !== "") {
			this.done({ type: "resume", file });
		}
	}

	handleInput(data: string): void {
		if (this.filtering && this.handleFilterInput(data)) {
			return;
		}
		this.handleNavInput(data);
	}

	private handleFilterInput(data: string): boolean {
		if (matchesKey(data, "escape")) {
			this.filtering = false;
			this.filter = "";
			this.snap();
			this.tui.requestRender();
			return true;
		}
		if (matchesKey(data, "backspace")) {
			this.filter = this.filter.slice(0, -1);
			this.snap();
			this.tui.requestRender();
			return true;
		}
		if (matchesKey(data, "enter")) {
			this.launchSelected();
			return true;
		}
		const ch = decodePrintableKey(data);
		if (ch !== undefined) {
			this.filter += ch;
			this.snap();
			this.tui.requestRender();
			return true;
		}
		return false;
	}

	private handleNavInput(data: string): void {
		if (matchesKey(data, "j") || matchesKey(data, "down")) {
			this.move(1);
			return;
		}
		if (matchesKey(data, "k") || matchesKey(data, "up")) {
			this.move(-1);
			return;
		}
		if (matchesKey(data, "enter")) {
			this.launchSelected();
			return;
		}
		if (matchesKey(data, "n")) {
			this.done({ type: "new" });
			return;
		}
		if (matchesKey(data, "q") || matchesKey(data, "escape")) {
			this.done({ type: "quit" });
			return;
		}
		if (matchesKey(data, "/")) {
			this.filtering = true;
			this.tui.requestRender();
		}
	}

	invalidate(): void {}

	render(width: number): string[] {
		const rows = Math.max(10, this.tui.terminal.rows || 24);
		const contentWidth = Math.min(width, MAX_CONTENT_WIDTH);

		const list = this.filtered();
		this.snap();

		const sessionLines = this.buildSessionLines(list, contentWidth);
		const statusLine = this.buildStatusLine();
		const hintLine = this.filtering
			? `search: ${this.theme.fg("accent", `${this.filter}\u2588`)}`
			: "j/k scroll · enter continue · n new · / search · q/esc quit";

		const version = getPiVersionForLine();
		// Center the logo as a single block (uniform left padding based on the
		// widest line) so the narrower top half lines up with the bottom half
		// instead of each line floating on its own center axis.
		const logoWidth = Math.max(...LOGO.map((l) => visibleWidth(l)));
		const logoLines = LOGO.map((l) => {
			const pad = Math.max(0, Math.floor((contentWidth - logoWidth) / 2));
			return this.theme.fg("accent", " ".repeat(pad) + l);
		});
		// Center a single line within the content column; the render loop below
		// then adds the column offset, which puts it exactly on the terminal's
		// center axis (same axis the logo block and session list are on). This
		// keeps the bottom of the dashboard (version/hint/status) centered
		// instead of hugging the left edge of the content column.
		const centerLine = (text: string): string => {
			const pad = Math.max(0, Math.floor((contentWidth - visibleWidth(text)) / 2));
			return " ".repeat(pad) + text;
		};
		const versionLine =
			version === ""
				? null
				: centerLine(this.theme.fg("muted", `pi  ${version}`));

		const blocks: string[][] = [];
		blocks.push(logoLines);
		if (versionLine !== null) {
			blocks.push([versionLine]);
		}
		blocks.push([""]);
		blocks.push(sessionLines);
		blocks.push([""]);
		blocks.push([centerLine(this.theme.fg("muted", hintLine))]);
		blocks.push([centerLine(this.theme.fg("dim", statusLine))]);

		const totalHeight = blocks.reduce((sum, b) => sum + b.length, 0);
		const topPad = Math.max(0, Math.floor((rows - totalHeight) / 2));
		const offset = Math.max(0, Math.floor((width - contentWidth) / 2));

		const out: string[] = [];
		for (let i = 0; i < topPad; i += 1) {
			out.push(" ".repeat(width));
		}
		for (const block of blocks) {
			for (const line of block) {
				out.push(truncateToWidth(" ".repeat(offset) + line, width, ""));
			}
		}
		while (out.length < rows) {
			out.push(" ".repeat(width));
		}
		return out;
	}

	private buildSessionLines(list: SessionEntry[], width: number): string[] {
		if (list.length === 0) {
			const msg =
				this.filter !== ""
					? `No sessions match "${this.filter}"`
					: "No sessions yet — press n to start one";
			return [
				this.theme.fg("dim", `${ICON_CLOCK} Recent sessions`),
				this.theme.fg("muted", msg),
			];
		}

		// Available rows for the list, accounting for header + the rows below.
		const maxList = Math.max(
			1,
			Math.min(8, (this.tui.terminal.rows || 24) - 18),
		);
		const len = list.length;
		const half = Math.floor(maxList / 2);
		const start = Math.max(
			0,
			Math.min(this.selectedIndex - half, len - maxList),
		);

		const lines: string[] = [];
		const headerCount = len > 1 ? `  (${len})` : "";
		lines.push(
			this.theme.fg("dim", `${ICON_CLOCK} Recent sessions${headerCount}`),
		);
		lines.push("");

		for (let i = start; i < start + maxList && i < len; i += 1) {
			const session = list[i];
			const selected = i === this.selectedIndex;
			const label = sessionLabel(session);
			const time = formatRelativeTime(safeMtime(sessionFile(session)));
			const marker = selected ? "▸ " : "  ";
			const name = selected
				? this.theme.fg("accent", `${marker}${label}`)
				: `${marker}${label}`;
			const gap = Math.max(
				1,
				width - visibleWidth(name) - visibleWidth(time) - 2,
			);
			const line = selected
				? `${name}${" ".repeat(gap)}${this.theme.fg("dim", time)}`
				: `${name}${" ".repeat(gap)}${this.theme.fg("dim", time)}`;
			lines.push(truncateToWidth(line, width, ""));
		}
		if (len > maxList) {
			lines.push(
				this.theme.fg("muted", `  ${this.selectedIndex + 1}/${len} sessions`),
			);
		}
		return lines;
	}

	private buildStatusLine(): string {
		const parts: string[] = [getCwdDisplay()];
		const branch = getGitBranch();
		if (branch !== "") {
			parts.push(`${ICON_BRANCH} ${branch}`);
		}
		const modelId = activeModelId();
		if (modelId !== "") {
			parts.push(modelId);
		}
		return this.theme.fg("dim", parts.join(" · "));
	}
}

let cachedVersion: string | null = null;

function getPiVersionForLine(): string {
	return cachedVersion ?? "";
}

function safeMtime(file: string): number {
	try {
		return statSync(file).mtimeMs;
	} catch {
		return 0;
	}
}

let modelForStatus = "";

function activeModelId(): string {
	return modelForStatus;
}

export default function (pi: ExtensionAPI) {
	cachedVersion = getPiVersion(pi);
	let activeTui: MinimalTui | undefined;

	async function showDashboard(ctx: ExtensionContext): Promise<void> {
		const sessions = (await SessionManager.list(
			ctx.cwd,
		)) as unknown as SessionEntry[];
		if (sessions.length === 0) {
			// No sessions in this cwd — nothing to pick from. Skip the
			// dashboard and let pi proceed with its normal startup.
			return;
		}
		modelForStatus = readModelId(ctx);

		const result = await ctx.ui.custom<DashboardChoice>(
			(tui, theme, _keybindings, done) => {
				activeTui = tui;
				try {
					tui.terminal.write(CLEAR);
				} catch {
					// Clearing is best-effort.
				}
				return new DashboardComponent(tui, sessions, theme, done);
			},
			OVERLAY_OPTIONS,
		);

		if (result?.type === "resume" && result.file !== "") {
			// A real session switch needs the full replacement lifecycle
			// (teardown + runtime rebuild from the saved file). `setSessionFile`
			// only rebinds the file pointer on the current session manager and
			// leaves the agent runtime on the fresh startup session — history
			// is lost. `ctx.switchSession` exists only on command contexts, so:
			//  - invoked via the `/dashboard` command → use it directly;
			//  - shown at startup (session_start event ctx has no
			//    switchSession) → re-exec `pi --session <file>`.
			const anyCtx = ctx as ExtensionContext & {
				switchSession?: (file: string, opts?: unknown) => Promise<unknown>;
			};
			if (typeof anyCtx.switchSession === "function") {
				await anyCtx.switchSession(result.file);
			} else {
				relaunchPiWithSession(result.file);
				ctx.shutdown();
			}
		} else if (result?.type === "new") {
			ctx.sessionManager.newSession();
		} else if (result?.type === "quit") {
			// session_shutdown clears the terminal (main buffer) before exit.
			ctx.shutdown();
		}
	}

	pi.on("session_start", async (event, ctx) => {
		if (event.reason !== "startup" || ctx.mode !== "tui") {
			return;
		}
		// pi was asked to open/select a specific session on the command line
		// (e.g. the re-exec from a dashboard resume) — don't overlay the
		// dashboard on top of it.
		if (hasSessionSelectFlag(process.argv.slice(2))) {
			return;
		}
		await showDashboard(ctx);
	});

	pi.registerCommand("dashboard", {
		description: "Open the dashboard launcher",
		handler: async (_args: string[], ctx: ExtensionContext) => {
			if (ctx.mode !== "tui") {
				ctx.ui.notify("Dashboard requires interactive mode", "error");
				return;
			}
			await showDashboard(ctx);
		},
	});

	// Clear the terminal (main buffer) on real exits so no leftover TUI frames
	// or stale content remain after pi quits. Only on "quit" — never when the
	// session is being replaced (new/resume/fork/reload).
	pi.on("session_shutdown", (event) => {
		if (event.reason !== "quit") {
			return;
		}
		try {
			activeTui?.terminal.write(CLEAR_ON_EXIT);
		} catch {
			// Best-effort.
		}
	});
}

function readModelId(ctx: ExtensionContext): string {
	const model = ctx.model as
		| { id?: string; provider?: string }
		| string
		| undefined;
	if (typeof model === "string") {
		return model;
	}
	if (model?.id) {
		return model.provider ? `${model.provider}/${model.id}` : model.id;
	}
	return "";
}
