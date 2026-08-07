#!/usr/bin/env node
/**
 * p — standalone pi session picker (no dependencies).
 *
 * Renders a full-screen dashboard of recent sessions for the current working
 * directory (same visuals as the extensions/dashboard.ts launcher), then
 * prints the choice to stdout:
 *   - `<session file path>` — resume that session
 *   - `new` — start a fresh session
 *   - `quit` — do nothing (exit)
 *
 * The terminal lives on /dev/tty (stdout is captured by the caller), and
 * stdin must be the interactive terminal, so the picker reads keys raw from
 * fd 0 and writes frames to /dev/tty. The caller (a shell function) execs
 * `pi --session <file>` with the result.
 *
 * Mirrors SessionManager.list() parsing:
 *   - name: last session_info entry's name
 *   - firstMessage: first user message's text content
 *   - modified: message activity time, else header time, else mtime
 */
import { spawnSync } from "node:child_process";
import {
	readdirSync,
	readFileSync,
	statSync,
	openSync,
	writeSync,
	closeSync,
} from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";

// ── config ────────────────────────────────────────────────────────────────

const MAX_CONTENT_WIDTH = 72;
const MAX_SESSION_SCAN_BYTES = 1024 * 256; // per file, first 256KB scanned
const MAX_SESSIONS = 40;

// The pi "P" logo (same as extensions/dashboard.ts).
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

const ICON_CLOCK = "\uF017"; // nf-fa-clock-o
const ICON_BRANCH = "\uE0A0"; // nf-dev-git_branch

const ESC = "\u001b";

// ── theme (matugen colors from ~/.pi/agent/themes/<name>.json) ──────────

function themeColors() {
	const settingsPath = join(homedir(), ".pi", "agent", "settings.json");
	let themeName = "matugen";
	try {
		const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
		if (typeof settings.theme === "string" && settings.theme !== "") {
			themeName = settings.theme;
		}
	} catch {
		// Default to matugen.
	}
	const themePath = join(homedir(), ".pi", "agent", "themes", `${themeName}.json`);
	try {
		const theme = JSON.parse(readFileSync(themePath, "utf8"));
		// vars: name -> hex; colors: role -> var name (or hex, or "")
		const vars = theme.vars ?? {};
		const colors = theme.colors ?? {};
		const resolve = (name) => {
			const raw = colors[name] ?? name;
			if (raw === "") return "";
			if (raw.startsWith("#")) return raw;
			const hex = vars[raw];
			return typeof hex === "string" && hex.startsWith("#") ? hex : "";
		};
		return {
			accent: resolve("accent"),
			muted: resolve("muted"),
			dim: resolve("dim"),
			error: resolve("error"),
		};
	} catch {
		return { accent: "", muted: "", dim: "", error: "" };
	}
}

const COLORS = themeColors();

function fg(color, text) {
	if (color === "") return text;
	const r = parseInt(color.slice(1, 3), 16);
	const g = parseInt(color.slice(3, 5), 16);
	const b = parseInt(color.slice(5, 7), 16);
	return `${ESC}[38;2;${r};${g};${b}m${text}${ESC}[39m`;
}

// ── sessions ──────────────────────────────────────────────────────────────

function sessionDir() {
	const cwd = process.cwd().replace(/\/+$/, "");
	return join(
		homedir(),
		".pi",
		"agent",
		"sessions",
		`--${cwd.replace(/\//g, "-").replace(/^-/, "")}--`,
	);
}

function extractTextContent(message) {
	if (Array.isArray(message?.content)) {
		const parts = message.content
			.filter((c) => c?.type === "text" && typeof c.text === "string")
			.map((c) => c.text);
		if (parts.length > 0) return parts.join(" ");
	}
	return "";
}

function parseSessionFile(file) {
	try {
		const stats = statSync(file);
		const text = readFileSync(file, "utf8").slice(0, MAX_SESSION_SCAN_BYTES);
		let headerTime = NaN;
		let lastActivityTime;
		let name;
		let firstMessage;
		for (const line of text.split("\n")) {
			let entry;
			try {
				entry = JSON.parse(line);
			} catch {
				continue;
			}
			if (!entry || typeof entry !== "object") continue;
			if (entry.type === "session") {
				const t = Date.parse(entry.timestamp);
				if (!Number.isNaN(t)) headerTime = t;
				continue;
			}
			if (entry.type === "session_info") {
				const n = typeof entry.name === "string" ? entry.name.trim() : "";
				if (n !== "") name = n;
				continue;
			}
			if (entry.type !== "message") continue;
			const ts = Date.parse(entry.timestamp);
			if (!Number.isNaN(ts)) {
				lastActivityTime = Math.max(lastActivityTime ?? 0, ts);
			}
			const message = entry.message;
			if (!message || typeof message !== "object") continue;
			if (message.role !== "user" && message.role !== "assistant") continue;
			const textContent = extractTextContent(message);
			if (textContent === "") continue;
			if (firstMessage === undefined && message.role === "user") {
				firstMessage = textContent;
			}
		}
		let modified;
		if (lastActivityTime !== undefined) {
			modified = lastActivityTime;
		} else if (!Number.isNaN(headerTime)) {
			modified = headerTime;
		} else {
			modified = stats.mtimeMs;
		}
		return {
			file,
			name,
			firstMessage,
			modified,
		};
	} catch {
		return null;
	}
}

function listSessions() {
	const dir = sessionDir();
	let entries;
	try {
		entries = readdirSync(dir);
	} catch {
		return [];
	}
	const sessions = entries
		.filter((f) => f.endsWith(".jsonl"))
		.map((f) => parseSessionFile(join(dir, f)))
		.filter((s) => s !== null)
		.sort((a, b) => b.modified - a.modified)
		.slice(0, MAX_SESSIONS);
	return sessions;
}

// ── helpers ───────────────────────────────────────────────────────────────

function sessionLabel(session) {
	const raw = session.name ?? session.firstMessage ?? basename(session.file);
	const firstLine = raw.split("\n")[0] ?? "";
	return firstLine.length > 44 ? `${firstLine.slice(0, 41)}...` : firstLine;
}

function formatRelativeTime(mtimeMs) {
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

function visibleWidth(text) {
	let w = 0;
	for (const ch of text) {
		w +=
			/[\u1100-\u115F\u2E80-\uA4CF\uAC00-\uD7A3\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFF60\uFFE0-\uFFE6]/.test(
				ch,
			)
				? 2
				: 1;
	}
	return w;
}

function truncateToWidth(text, width) {
	if (visibleWidth(text) <= width) return text;
	let out = "";
	let w = 0;
	for (const ch of text) {
		const cw = visibleWidth(ch);
		if (w + cw > width) break;
		out += ch;
		w += cw;
	}
	return out;
}

function getGitBranch() {
	const res = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
		encoding: "utf8",
		timeout: 2000,
	});
	if (res.status !== 0) return "";
	return res.stdout.trim().replace(/^detached at /, "detached");
}

function getCwdDisplay() {
	const cwd = process.cwd();
	const home = homedir();
	return cwd.startsWith(home) ? `~${cwd.slice(home.length)}` : cwd;
}

// ── tty / raw mode ────────────────────────────────────────────────────────

let ttyFd = null;

/** Open the terminal for writing. Fish captures stdout for command
 * substitution but leaves stderr on the terminal, so fall back to stderr,
 * then stdout, then /dev/tty. */
function openTtyWrite() {
	const candidates = ["/dev/tty", null]; // null = stderr
	for (const path of candidates) {
		if (path === null) {
			if (process.stderr.isTTY) {
				try {
					ttyFd = process.stderr.fd ?? 2;
					return true;
				} catch {
					continue;
				}
			}
			continue;
		}
		try {
			ttyFd = openSync(path, "w");
			return true;
		} catch {
		}
	}
	return false;
}

function initTty() {
	if (!process.stdin.isTTY) return false;
	if (!openTtyWrite()) return false;
	try {
		process.stdin.setRawMode(true);
		process.stdin.resume();
	} catch {
		return false;
	}
	process.stdin.on("data", onInput);
	return true;
}

function ttyWrite(text) {
	if (ttyFd !== null) {
		try {
			writeSync(ttyFd, text);
		} catch {
			// Ignore.
		}
	}
}

function ttyRows() {
	return process.stdin.rows || 24;
}

function ttyCols() {
	return process.stdin.columns || 80;
}

function restoreTty() {
	ttyWrite(`${ESC}[?25h${ESC}[?1049l`);
	try {
		process.stdin.setRawMode(false);
	} catch {
		// Ignore.
	}
	if (ttyFd !== null) {
		try {
			closeSync(ttyFd);
		} catch {
			// Ignore.
		}
		ttyFd = null;
	}
}

// ── picker state ──────────────────────────────────────────────────────────

const sessions = listSessions();
let selectedIndex = 0;
let filter = "";
let filtering = false;
let done = false;

function filtered() {
	if (filter === "") return sessions;
	const needle = filter.toLowerCase();
	return sessions.filter((s) => sessionLabel(s).toLowerCase().includes(needle));
}

function snap() {
	const len = filtered().length;
	selectedIndex = Math.max(0, Math.min(selectedIndex, Math.max(0, len - 1)));
}

function finish(result) {
	if (done) return;
	done = true;
	restoreTty();
	process.stdout.write(`${result}\n`);
	process.exit(0);
}

function move(dir) {
	snap();
	const len = filtered().length;
	if (len === 0) return;
	selectedIndex = Math.max(0, Math.min(selectedIndex + dir, len - 1));
	render();
}

function launchSelected() {
	const list = filtered();
	if (list.length === 0) return;
	snap();
	finish(list[selectedIndex].file);
}

// ── rendering ─────────────────────────────────────────────────────────────

function render() {
	const rows = Math.max(10, ttyRows());
	const cols = Math.max(20, ttyCols());
	const contentWidth = Math.min(cols, MAX_CONTENT_WIDTH);
	const offset = Math.max(0, Math.floor((cols - contentWidth) / 2));

	const list = filtered();
	snap();

	const sessionLines = buildSessionLines(list, contentWidth);
	const hintLine = filtering
		? `search: ${fg(COLORS.accent, `${filter}\u2588`)}`
		: "j/k scroll · enter continue · n new · / search · q/esc quit";
	const statusLine = buildStatusLine();

	const logoWidth = Math.max(...LOGO.map((l) => visibleWidth(l)));
	const logoPad = Math.max(0, Math.floor((contentWidth - logoWidth) / 2));
	const logoLines = LOGO.map((l) => fg(COLORS.accent, " ".repeat(logoPad) + l));

	const centerLine = (text) => {
		const pad = Math.max(0, Math.floor((contentWidth - visibleWidth(text)) / 2));
		return " ".repeat(pad) + text;
	};

	const blocks = [];
	blocks.push(logoLines);
	blocks.push([""]);
	blocks.push(sessionLines);
	blocks.push([""]);
	blocks.push([centerLine(fg(COLORS.muted, hintLine))]);
	blocks.push([centerLine(fg(COLORS.dim, statusLine))]);

	const totalHeight = blocks.reduce((sum, b) => sum + b.length, 0);
	const topPad = Math.max(0, Math.floor((rows - totalHeight) / 2));

	const out = [];
	for (let i = 0; i < topPad; i += 1) out.push(" ".repeat(cols));
	for (const block of blocks) {
		for (const line of block) {
			out.push(" ".repeat(offset) + truncateToWidth(line, contentWidth));
		}
	}
	while (out.length < rows) out.push(" ".repeat(cols));

	ttyWrite(`${ESC}[2J${ESC}[H${out.join("\r\n")}`);
}

function buildSessionLines(list, width) {
	if (list.length === 0) {
		const msg =
			filter !== ""
				? `No sessions match "${filter}"`
				: "No sessions yet — press n to start one";
		return [
			fg(COLORS.dim, `${ICON_CLOCK} Recent sessions`),
			fg(COLORS.muted, msg),
		];
	}

	const maxList = Math.max(1, Math.min(8, ttyRows() - 18));
	const len = list.length;
	const half = Math.floor(maxList / 2);
	const start = Math.max(0, Math.min(selectedIndex - half, len - maxList));

	const lines = [];
	const headerCount = len > 1 ? `  (${len})` : "";
	lines.push(fg(COLORS.dim, `${ICON_CLOCK} Recent sessions${headerCount}`));
	lines.push("");

	for (let i = start; i < start + maxList && i < len; i += 1) {
		const session = list[i];
		const selected = i === selectedIndex;
		const label = sessionLabel(session);
		const time = formatRelativeTime(session.modified);
		const marker = selected ? "▸ " : "  ";
		const name = selected
			? fg(COLORS.accent, `${marker}${label}`)
			: `${marker}${label}`;
		const nameWidth = visibleWidth(name);
		const timeWidth = visibleWidth(time);
		const gap = Math.max(1, width - nameWidth - timeWidth - 2);
		const line = `${name}${" ".repeat(gap)}${fg(COLORS.dim, time)}`;
		lines.push(truncateToWidth(line, width));
	}
	if (len > maxList) {
		lines.push(fg(COLORS.muted, `  ${selectedIndex + 1}/${len} sessions`));
	}
	return lines;
}

function buildStatusLine() {
	const parts = [getCwdDisplay()];
	const branch = getGitBranch();
	if (branch !== "") parts.push(`${ICON_BRANCH} ${branch}`);
	return fg(COLORS.dim, parts.join(" · "));
}

// ── key input ─────────────────────────────────────────────────────────────

let pending = null;

function onInput(chunk) {
	pending = pending === null ? chunk : Buffer.concat([pending, chunk]);
	while (pending !== null && pending.length > 0) {
		const b = pending[0];
		if (b === 0x1b) {
			// Escape sequence or bare ESC.
			if (pending.length >= 3 && pending[1] === 0x5b) {
				const code = pending[2];
				pending = pending.subarray(3);
				if (code === 0x41) handleKey("up");
				else if (code === 0x42) handleKey("down");
				else handleKey("escape");
			} else {
				pending = pending.subarray(1);
				handleKey("escape");
			}
			continue;
		}
		if (b === 0x0d || b === 0x0a) {
			pending = pending.subarray(1);
			handleKey("enter");
			continue;
		}
		if (b === 0x7f || b === 0x08) {
			pending = pending.subarray(1);
			handleKey("backspace");
			continue;
		}
		if (b < 0x20) {
			// Other control chars: ignore.
			pending = pending.subarray(1);
			continue;
		}
		// Printable: decode one UTF-8 sequence.
		let len;
		if (b < 0xc0) {
			len = 1;
		} else if (b < 0xe0) {
			len = 2;
		} else if (b < 0xf0) {
			len = 3;
		} else {
			len = 4;
		}
		if (pending.length < len) break;
		const bytes = pending.subarray(0, len);
		pending = pending.subarray(len);
		handleKey(bytes.toString("utf8"));
	}
}

function handleKey(key) {
	if (done) return;
	if (filtering && key !== "escape" && key !== "enter" && key !== "backspace") {
		filter += key;
		snap();
		render();
		return;
	}
	switch (key) {
		case "j":
		case "down":
			move(1);
			break;
		case "k":
		case "up":
			move(-1);
			break;
		case "enter":
			launchSelected();
			break;
		case "n":
			finish("new");
			break;
		case "q":
		case "escape":
			if (filtering) {
				filtering = false;
				filter = "";
				snap();
				render();
			} else {
				finish("quit");
			}
			break;
		case "/":
			filtering = true;
			render();
			break;
		case "backspace":
			if (filtering) {
				filter = filter.slice(0, -1);
				snap();
				render();
			}
			break;
		default:
			break;
	}
}

// ── main ──────────────────────────────────────────────────────────────────

if (sessions.length === 0) {
	// No sessions in this cwd — nothing to pick. The caller should launch a
	// fresh session, so emit "new" without touching the terminal.
	process.stdout.write("new\n");
	process.exit(0);
}

if (!initTty()) {
	// Not an interactive terminal; caller handles it.
	process.stdout.write("quit\n");
	process.exit(0);
}

process.on("exit", () => restoreTty());
process.on("SIGINT", () => finish("quit"));
process.on("SIGTERM", () => finish("quit"));
process.on("SIGWINCH", () => render());

ttyWrite(`${ESC}[?1049h${ESC}[?25l`);
render();
