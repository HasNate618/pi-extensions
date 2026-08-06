/**
 * prefix-keys — tmux-style leader/prefix keybindings for pi.
 *
 * Press a configurable prefix (default `ctrl+x`) to arm "prefix mode", then a
 * single follow-up key to run an action. While armed, a status chip shows in
 * the footer (`prefix ⌗`). Any action already bound to the prefix key is
 * reported at session start so the override is explicit.
 *
 * Config: ~/.pi/agent/prefix-keys.json
 *   {
 *     "prefix": "ctrl+x",            // KeyId or KeyId[] (alternative prefixes)
 *     "timeoutMs": 1500,             // auto-disarm after this long with no key
 *     "bindings": {                  // next-key (parseKey output) -> target
 *       "m": "command:/model",
 *       "T": "key:shift+tab"
 *     }
 *   }
 *
 * Targets:
 *   "command:/name"  → run a slash command via the session input channel
 *   "key:ctrl+l"     → inject a keybinding chord (limited chord set, see below)
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { matchesKey, parseKey } from "@earendil-works/pi-tui";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import type {
	ExtensionAPI,
	ExtensionContext,
	KeybindingsManager,
} from "@earendil-works/pi-coding-agent";
import type { InputListener, TUI } from "@earendil-works/pi-tui";

interface PrefixConfig {
	prefix: string | string[];
	timeoutMs: number;
	bindings: Record<string, string>;
}

const CONFIG_FILE = "prefix-keys.json";
const STATUS_KEY = "prefix";

const DEFAULT_CONFIG: PrefixConfig = {
	prefix: "ctrl+x",
	timeoutMs: 1500,
	bindings: {
		m: "command:/model",
		n: "command:/new",
		t: "command:/tree",
		f: "command:/fork",
		r: "command:/resume",
		z: "command:/zentui",
		T: "key:shift+tab",
		o: "command:/compact",
		c: "command:/copy",
	},
};

/** Zero-line component returned from the TUI-capture custom() so nothing renders. */
const EMPTY_COMPONENT = {
	render: () => [] as string[],
	invalidate: () => {},
};

function loadConfig(): PrefixConfig {
	const path = join(getAgentDir(), CONFIG_FILE);
	if (!existsSync(path)) {
		try {
			writeFileSync(
				path,
				`${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`,
				"utf8",
			);
		} catch {
			// Config is best-effort; defaults still apply.
		}
		return DEFAULT_CONFIG;
	}
	try {
		const raw = JSON.parse(readFileSync(path, "utf8")) as Partial<PrefixConfig>;
		const prefix = raw.prefix ?? DEFAULT_CONFIG.prefix;
		const timeoutMs =
			typeof raw.timeoutMs === "number" && Number.isFinite(raw.timeoutMs)
				? raw.timeoutMs
				: DEFAULT_CONFIG.timeoutMs;
		const bindings = raw.bindings ?? DEFAULT_CONFIG.bindings;
		return { prefix, timeoutMs, bindings };
	} catch {
		return DEFAULT_CONFIG;
	}
}

/**
 * KeyId → raw terminal bytes for the subset of chords we support as `key:`
 * injection targets. ctrl+letter covers most common pickers/cycles; the
 * specials cover the rest of the default-relevant set.
 */
function keyToData(keyId: string): string | undefined {
	const ctrl = /^ctrl\+([a-z])$/.exec(keyId);
	const ctrlLetter = ctrl?.[1];
	if (ctrlLetter !== undefined) {
		return String.fromCharCode(ctrlLetter.charCodeAt(0) - 96); // ctrl+a = \x01
	}
	switch (keyId) {
		case "shift+tab":
			return "\x1b[Z";
		case "escape":
			return "\x1b";
		case "enter":
			return "\r";
		case "home":
			return "\x1b[H";
		case "end":
			return "\x1b[F";
		case "up":
			return "\x1b[A";
		case "down":
			return "\x1b[B";
		case "left":
			return "\x1b[D";
		case "right":
			return "\x1b[C";
		case "pageUp":
			return "\x1b[5~";
		case "pageDown":
			return "\x1b[6~";
		default:
			if (/^[a-z0-9]$/.test(keyId)) {
				return keyId;
			}
			return undefined;
	}
}

/**
 * Pure prefix state machine. `handle(data)` returns the listener result and
 * reports state changes through callbacks so the wiring stays side-effect
 * free (and unit-testable).
 */
class PrefixState {
	private armed = false;
	private timer: ReturnType<typeof setTimeout> | undefined;
	private flashTimer: ReturnType<typeof setTimeout> | undefined;

	constructor(
		private config: PrefixConfig,
		private onIndicator: (label: string | null) => void,
		private onDispatchCommand: (command: string) => void,
	) {}

	private isPrefix(data: string): boolean {
		const prefixes = Array.isArray(this.config.prefix)
			? this.config.prefix
			: [this.config.prefix];
		return prefixes.some((p) => matchesKey(data, p));
	}

	private arm(): void {
		this.armed = true;
		if (this.flashTimer !== undefined) {
			clearTimeout(this.flashTimer);
			this.flashTimer = undefined;
		}
		const prefixLabel = Array.isArray(this.config.prefix)
			? this.config.prefix.join("|")
			: this.config.prefix;
		this.onIndicator(`prefix ⌗ (${prefixLabel})`);
		this.scheduleDisarm();
	}

	private flash(label: string): void {
		this.onIndicator(label);
		if (this.flashTimer !== undefined) {
			clearTimeout(this.flashTimer);
		}
		// Auto-clear the "x → target" confirmation chip after a moment.
		this.flashTimer = setTimeout(() => this.onIndicator(null), 1200);
	}

	private disarm(): void {
		this.armed = false;
		if (this.timer !== undefined) {
			clearTimeout(this.timer);
			this.timer = undefined;
		}
		this.onIndicator(null);
	}

	private scheduleDisarm(): void {
		if (this.timer !== undefined) {
			clearTimeout(this.timer);
		}
		this.timer = setTimeout(() => this.disarm(), this.config.timeoutMs);
	}

	handle(data: string): { consume?: boolean; data?: string } | undefined {
		if (this.armed) {
			this.scheduleDisarm();
			// Repeated prefix key: stay armed, no action.
			if (this.isPrefix(data)) {
				return { consume: true };
			}
			// Escape cancels prefix mode entirely.
			if (matchesKey(data, "escape")) {
				this.disarm();
				return { consume: true };
			}
			const key = parseKey(data);
			if (key === undefined) {
				// Multi-byte paste / IME marker: stop intercepting, let it through whole.
				this.disarm();
				return undefined;
			}
			const target = this.config.bindings[key];
			this.disarm();
			if (target === undefined) {
				this.onIndicator(null);
				return { consume: true };
			}
			if (target.startsWith("command:")) {
				this.flash(`prefix ⌗ ${key} → ${target.slice("command:".length)}`);
				this.onDispatchCommand(target.slice("command:".length));
				return { consume: true };
			}
			if (target.startsWith("key:")) {
				const chord = target.slice("key:".length);
				const bytes = keyToData(chord);
				if (bytes === undefined) {
					this.flash(`prefix ⌗ ${key} → unsupported chord (${chord})`);
					return { consume: true };
				}
				this.flash(`prefix ⌗ ${key} → ${chord}`);
				return { data: bytes };
			}
			return { consume: true };
		}
		if (this.isPrefix(data)) {
			this.arm();
			return { consume: true };
		}
		return undefined;
	}
}

export default function (pi: ExtensionAPI) {
	let activePrefix: PrefixState | undefined;
	let removeListener: (() => void) | undefined;
	let ui: ExtensionContext["ui"] | undefined;

	function clearIndicator(): void {
		ui?.setStatus(STATUS_KEY, undefined);
	}

	pi.on("session_start", async (_event, ctx) => {
		if (ctx.mode !== "tui") {
			return;
		}
		ui = ctx.ui;
		// Tear down any prior wiring first: covers /reload re-runs and new
		// sessions in the same process, so a stale listener never stays
		// authoritative and fresh config is always picked up.
		removeListener?.();
		removeListener = undefined;
		activePrefix = undefined;
		clearIndicator();

		const config = loadConfig();

		// Capture the raw TUI + keybinding manager. `done()` is called synchronously
		// inside the factory, so the component is closed before it can mount — no
		// editor swap, no visual flash.
		await ctx.ui.custom<unknown>((tui: TUI, _theme, keybindings, done) => {
			setup(tui, keybindings, config, ctx);
			done(undefined);
			return EMPTY_COMPONENT;
		});
	});

	function setup(
		tui: TUI,
		keybindings: KeybindingsManager,
		config: PrefixConfig,
		ctx: ExtensionContext,
	): void {
		warnOnOverriddenBindings(keybindings, config, ctx);

		// The editor's own submit path is pi's only public command-dispatch
		// mechanism: submitting "/model" is literally typing /model + enter, and
		// the submit handler parses slash commands. pi keeps the editor focused
		// in the TUI (`setFocus(this.editor)`), so the focused component's
		// onSubmit is the live session submit handler — even for a custom editor
		// component (pi wires onSubmit onto it). Cache the last editor we saw so
		// dispatch still works while an overlay/picker briefly holds focus.
		type SubmitEditor = { onSubmit?: (text: string) => unknown };
		let lastSubmitEditor: SubmitEditor | undefined;
		const findSubmitEditor = (): SubmitEditor | undefined => {
			const focused = (tui as unknown as { focusedComponent?: SubmitEditor })
				.focusedComponent;
			if (typeof focused?.onSubmit === "function") {
				lastSubmitEditor = focused;
				return focused;
			}
			return typeof lastSubmitEditor?.onSubmit === "function"
				? lastSubmitEditor
				: undefined;
		};

		const state = new PrefixState(
			config,
			(label) => {
				if (label === null) {
					clearIndicator();
					return;
				}
				ui?.setStatus(STATUS_KEY, label);
			},
			(command) => {
				const editor = findSubmitEditor();
				if (editor?.onSubmit === undefined) {
					// Fallback (non-editor focus or a future pi without the
					// focused-component route): queue as a user message.
					pi.sendUserMessage(command, { deliverAs: "followUp" });
					return;
				}
				void Promise.resolve(editor.onSubmit(command)).catch(() => {});
			},
		);
		activePrefix = state;

		const listener: InputListener = (data) => state.handle(data);
		removeListener = tui.addInputListener(listener);
	}

	function warnOnOverriddenBindings(
		keybindings: KeybindingsManager,
		config: PrefixConfig,
		ctx: ExtensionContext,
	): void {
		const prefixes = Array.isArray(config.prefix)
			? config.prefix
			: [config.prefix];
		const resolved = keybindings.getResolvedBindings();
		const overridden: string[] = [];
		for (const [actionId, keys] of Object.entries(resolved)) {
			let keyList: string[] = [];
			if (Array.isArray(keys)) {
				keyList = keys;
			} else if (keys !== undefined) {
				keyList = [keys];
			}
			if (keyList.some((k) => prefixes.includes(k))) {
				const def = keybindings.getDefinition(actionId);
				const desc = def?.description ?? "";
				overridden.push(desc ? `${actionId} (${desc})` : actionId);
			}
		}
		if (overridden.length > 0) {
			ctx.ui.notify(
				`prefix-keys: ${prefixes.join(", ")} overrides: ${overridden.join(", ")}`,
				"warning",
			);
		}
	}

	pi.on("session_shutdown", () => {
		removeListener?.();
		removeListener = undefined;
		activePrefix = undefined;
		clearIndicator();
	});

	pi.registerCommand("prefix-keys", {
		description: "Show prefix-keys configuration and armed state",
		handler: async (args: string[], ctx: ExtensionContext) => {
			const config = loadConfig();
			const prefixLabel = Array.isArray(config.prefix)
				? config.prefix.join("|")
				: config.prefix;
			const lines = [
				`prefix: ${prefixLabel}  (timeout ${config.timeoutMs}ms)`,
				"bindings:",
				...Object.entries(config.bindings).map(
					([key, target]) => `  ${key} → ${target}`,
				),
			];
			if (activePrefix !== undefined) {
				lines.push("state: listener attached");
			}
			await ctx.ui.select(`/prefix-keys (${prefixLabel})`, lines);
		},
	});

	if (process.env.PREFIX_KEYS_SELFTEST === "1") {
		runSelfTest();
	}
}

/**
 * In-host self-test: exercises the state machine with the real matchesKey /
 * parseKey from pi-tui, but no TUI. Run with PREFIX_KEYS_SELFTEST=1 pi -p.
 * Output goes to stderr (never console.*) so pi-lens's console rule stays
 * clean; it is gated behind the env var and never runs in normal sessions.
 */
interface SelfTestHarness {
	check(name: string, ok: boolean, detail?: string): void;
	makeState(timeoutMs?: number): {
		state: PrefixState;
		indicators: Array<string | null>;
		commands: string[];
	};
}

function emitLine(line: string): void {
	process.stderr.write(`[prefix-keys selftest] ${line}\n`);
}

function runSelfTest(): void {
	const results: Array<{ name: string; ok: boolean; detail?: string }> = [];
	let failures = 0;

	const t: SelfTestHarness = {
		check(name, ok, detail = "") {
			results.push({ name, ok, detail });
			if (!ok) {
				failures += 1;
			}
		},
		makeState(timeoutMs = 10000) {
			const indicators: Array<string | null> = [];
			const commands: string[] = [];
			const state = new PrefixState(
				{
					prefix: "ctrl+x",
					timeoutMs,
					bindings: {
						m: "command:/model",
						T: "key:shift+tab",
						x: "command:/new",
					},
				},
				(label) => indicators.push(label),
				(command) => commands.push(command),
			);
			return { state, indicators, commands };
		},
	};

	const cases: Array<{
		name: string;
		run: (h: SelfTestHarness) => void | Promise<void>;
	}> = [
		{
			name: "idle passthrough",
			run: (h) => {
				const { state } = h.makeState();
				h.check(
					"idle: plain key passes through",
					state.handle("h") === undefined,
				);
			},
		},
		{
			name: "prefix arms",
			run: (h) => {
				const { state, indicators } = h.makeState();
				const r = state.handle("\x18"); // ctrl+x
				h.check("prefix: consumed while idle", r?.consume === true);
				h.check(
					"prefix: armed indicator shown",
					(indicators.at(-1) ?? "").includes("prefix ⌗"),
				);
			},
		},
		{
			name: "armed dispatches command",
			run: (h) => {
				const { state, indicators, commands } = h.makeState();
				state.handle("\x18");
				const r = state.handle("m");
				h.check("armed: mapped key consumed", r?.consume === true);
				h.check(
					"armed: command dispatched",
					commands.length === 1 && commands[0] === "/model",
				);
				h.check(
					"armed: flash label set",
					(indicators.at(-1) ?? "").includes("→ /model"),
				);
			},
		},
		{
			name: "armed injects key chord",
			run: (h) => {
				const { state } = h.makeState();
				state.handle("\x18");
				const r = state.handle("T");
				h.check(
					"armed: key target injects shift+tab bytes",
					r?.data === "\x1b[Z" && r?.consume !== true,
				);
			},
		},
		{
			name: "escape cancels",
			run: (h) => {
				const { state, indicators } = h.makeState();
				state.handle("\x18");
				const r = state.handle("\x1b");
				h.check("armed: escape cancels and consumes", r?.consume === true);
				h.check(
					"armed: indicator cleared on cancel",
					indicators.at(-1) === null,
				);
			},
		},
		{
			name: "unmapped key disarms",
			run: (h) => {
				const { state, commands } = h.makeState();
				state.handle("\x18");
				const r = state.handle("q");
				h.check("armed: unmapped key consumed", r?.consume === true);
				h.check(
					"armed: unmapped key disarms without dispatch",
					commands.length === 0,
				);
			},
		},
		{
			name: "paste marker passes through",
			run: (h) => {
				const { state } = h.makeState();
				state.handle("\x18");
				const r = state.handle("\x1b[200~"); // bracket-paste start
				h.check("armed: paste marker passes through", r === undefined);
			},
		},
		{
			name: "timeout disarms",
			run: async (h) => {
				const { state, indicators } = h.makeState(20);
				state.handle("\x18");
				const before = indicators.length;
				await new Promise((resolve) => setTimeout(resolve, 60));
				h.check(
					"armed: timeout disarms + clears indicator",
					indicators.length === before + 1 && indicators.at(-1) === null,
				);
			},
		},
		{
			name: "array prefix arms",
			run: (h) => {
				const first = new PrefixState(
					{ prefix: ["ctrl+x", "ctrl+g"], timeoutMs: 10000, bindings: {} },
					() => {},
					() => {},
				);
				h.check(
					"array prefix: first key arms",
					first.handle("\x18")?.consume === true,
				);
				const second = new PrefixState(
					{ prefix: ["ctrl+x", "ctrl+g"], timeoutMs: 10000, bindings: {} },
					() => {},
					() => {},
				);
				h.check(
					"array prefix: second key arms",
					second.handle("\x07")?.consume === true,
				); // ctrl+g
			},
		},
	];

	void (async () => {
		for (const c of cases) {
			await c.run(t);
		}
		for (const r of results) {
			emitLine(
				`${r.ok ? "PASS" : "FAIL"} ${r.name}${r.detail ? ` — ${r.detail}` : ""}`,
			);
		}
		emitLine(failures === 0 ? "ALL PASS" : `${failures} FAILURES`);
		process.exitCode = failures === 0 ? 0 : 1;
	})();
}
