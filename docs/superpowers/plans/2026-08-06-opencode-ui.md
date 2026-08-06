# opencode-ui Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace pi's stock TUI chrome with a single custom extension (theme, composer, footer, user messages, margins) in the opencode style, CPU-light, without zentui.

**Architecture:** One extension entry (`extensions/opencode-ui.ts`) that installs a custom editor component (composer), a custom footer, and a `UserMessageComponent` render patch; a custom pi theme file supplies the palette and the chrome reads theme tokens. All render logic is split into pure, dependency-free modules (`format`, `border`, `config`, `usage`, `layout`) so it is unit-testable with node's native TS runner; the pi-facing classes are thin wrappers.

**Tech Stack:** TypeScript (erasable syntax only — node 24 type-stripping for tests), `node --test`, pi extension API (`@earendil-works/pi-coding-agent`, `@earendil-works/pi-tui`), JSON theme.

## Global Constraints

- **Erasable TS only** in all `.ts` files (node native type-stripping): no `enum`, no `namespace`, no parameter properties (`constructor(private x)` is forbidden — declare fields and assign), no `import =`.
- **Relative imports must use explicit `.ts` extensions** (e.g. `import { x } from "./format.ts"`) — required by node's ESM type-stripping, supported by bun.
- **Pure modules must not import `@earendil-works/*`** (node tests cannot resolve them): `format.ts`, `border.ts`, `config.ts`, `usage.ts`, `layout.ts`, and all `tests/opencode-ui/*.test.ts`.
- **Test runner:** `node --test "tests/opencode-ui/*.test.ts"` from repo root (`~/Projects/pi-extensions`); node v24.18.0 available.
- **Code style:** match repo (tabs for indent, double quotes, semicolons, `import type` for type-only imports) — see `extensions/prefix-keys.ts`.
- **Chrome colors** resolve from theme tokens at render time by default (rail=`border`, bar=`accent`, model=`accent`, provider=`muted`, thinking=thinking tokens); config may override with raw strings.
- **No timers/polling** in runtime paths; invalidate + `tui.requestRender()` only on data-change events.
- All new files live under `~/Projects/pi-extensions`; the only out-of-repo writes are `~/.pi/agent/settings.json` and `~/.pi/agent/prefix-keys.json`.
- Type-check before each `/reload` via `lsp_diagnostics` on the changed files.

---

### Task 1: Custom theme + manifest + activation

**Files:**

- Create: `themes/opencode.json`
- Create: `tests/opencode-ui/theme.test.ts`
- Modify: `package.json` (add `"themes": ["./themes"]` to the `pi` field)
- Modify: `~/.pi/agent/settings.json` (set `"theme": "opencode"`)

**Interfaces:**

- Produces: theme named `opencode` (loadable by pi as a package resource), test asserting the 51 required tokens exist.

- [ ] **Step 1: Write the failing theme-token test**

Create `tests/opencode-ui/theme.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import assert from "node:assert/strict";

const REQUIRED_TOKENS = [
 "accent", "border", "borderAccent", "borderMuted", "success", "error",
 "warning", "muted", "dim", "text", "thinkingText", "selectedBg",
 "userMessageBg", "userMessageText", "customMessageBg", "customMessageText",
 "customMessageLabel", "toolPendingBg", "toolSuccessBg", "toolErrorBg",
 "toolTitle", "toolOutput", "mdHeading", "mdLink", "mdLinkUrl", "mdCode",
 "mdCodeBlock", "mdCodeBlockBorder", "mdQuote", "mdQuoteBorder", "mdHr",
 "mdListBullet", "toolDiffAdded", "toolDiffRemoved", "toolDiffContext",
 "syntaxComment", "syntaxKeyword", "syntaxFunction", "syntaxVariable",
 "syntaxString", "syntaxNumber", "syntaxType", "syntaxOperator",
 "syntaxPunctuation", "thinkingOff", "thinkingMinimal", "thinkingLow",
 "thinkingMedium", "thinkingHigh", "thinkingXhigh", "bashMode",
];

test("opencode theme defines all required color tokens", () => {
 const raw = readFileSync(
  join(import.meta.dirname, "../../themes/opencode.json"),
  "utf8",
 );
 const theme = JSON.parse(raw) as { name?: string; colors?: Record<string, unknown> };
 assert.equal(theme.name, "opencode");
 const missing = REQUIRED_TOKENS.filter((token) => !(token in (theme.colors ?? {})));
 assert.deepEqual(missing, []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test "tests/opencode-ui/*.test.ts"`
Expected: FAIL — `ENOENT` reading `themes/opencode.json`.

- [ ] **Step 3: Create the theme**

Create `themes/opencode.json` (dark neutral bg, green accent; every required token defined; `vars` referenced for coherence):

```json
{
  "$schema": "https://raw.githubusercontent.com/earendil-works/pi/main/packages/coding-agent/src/modes/interactive/theme/theme-schema.json",
  "name": "opencode",
  "vars": {
    "accent": "#4ade80",
    "border": "#3a3f4b",
    "muted": "#8b93a3",
    "dim": "#5c6474",
    "bg": "#0b0d10",
    "bgRaised": "#131722",
    "text": "#d6dae2"
  },
  "colors": {
    "accent": "accent",
    "border": "border",
    "borderAccent": "accent",
    "borderMuted": "dim",
    "success": "accent",
    "error": "#f0626e",
    "warning": "#f2c14e",
    "muted": "muted",
    "dim": "dim",
    "text": "text",
    "thinkingText": "muted",
    "selectedBg": "bgRaised",
    "userMessageBg": "bgRaised",
    "userMessageText": "text",
    "customMessageBg": "bgRaised",
    "customMessageText": "text",
    "customMessageLabel": "accent",
    "toolPendingBg": "bgRaised",
    "toolSuccessBg": "#0e1a12",
    "toolErrorBg": "#1e1214",
    "toolTitle": "accent",
    "toolOutput": "text",
    "mdHeading": "accent",
    "mdLink": "accent",
    "mdLinkUrl": "muted",
    "mdCode": "#7dd3fc",
    "mdCodeBlock": "text",
    "mdCodeBlockBorder": "dim",
    "mdQuote": "muted",
    "mdQuoteBorder": "dim",
    "mdHr": "dim",
    "mdListBullet": "accent",
    "toolDiffAdded": "accent",
    "toolDiffRemoved": "error",
    "toolDiffContext": "muted",
    "syntaxComment": "dim",
    "syntaxKeyword": "#c792ea",
    "syntaxFunction": "#82aaff",
    "syntaxVariable": "accent",
    "syntaxString": "#c3e88d",
    "syntaxNumber": "#f78c6c",
    "syntaxType": "#82aaff",
    "syntaxOperator": "accent",
    "syntaxPunctuation": "muted",
    "thinkingOff": "dim",
    "thinkingMinimal": "accent",
    "thinkingLow": "#82aaff",
    "thinkingMedium": "#7dd3fc",
    "thinkingHigh": "#c792ea",
    "thinkingXhigh": "#f0626e",
    "thinkingMax": "#f78c6c",
    "bashMode": "#f2c14e"
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test "tests/opencode-ui/*.test.ts"`
Expected: PASS (1 test).

- [ ] **Step 5: Register the theme in the package manifest**

Edit `package.json`, inside the existing `"pi"` object:

```json
  "pi": {
    "extensions": ["./extensions"],
    "themes": ["./themes"],
    "subagents": {
      "agents": ["./agents"]
    }
  }
```

- [ ] **Step 6: Activate the theme globally**

Edit `~/.pi/agent/settings.json` — change `"theme": "matugen"` to `"theme": "opencode"` (leave everything else untouched).

- [ ] **Step 7: Verify theme loads**

Run: `pi -r` (or `/reload` in a live session). Expected: no theme errors; the UI takes the new dark/green palette; `/settings` shows the theme; `pi --list-models`-style startup is unaffected. If the theme doesn't load, confirm `themes/opencode.json` is valid JSON and the `pi` field edit is correct.

- [ ] **Step 8: Commit**

```bash
git add themes/opencode.json tests/opencode-ui/theme.test.ts package.json
git commit -m "feat(theme): add opencode theme with 51 tokens"
```

---

### Task 2: Pure utility modules (format, border, config, usage) with tests

**Files:**

- Create: `extensions/opencode-ui/format.ts`
- Create: `extensions/opencode-ui/border.ts`
- Create: `extensions/opencode-ui/config.ts`
- Create: `extensions/opencode-ui/usage.ts`
- Create: `tests/opencode-ui/format.test.ts`
- Create: `tests/opencode-ui/border.test.ts`
- Create: `tests/opencode-ui/config.test.ts`
- Create: `tests/opencode-ui/usage.test.ts`

**Interfaces:**

- Produces (used by later tasks):
  - `format.ts`: `formatCount(value: number): string`, `formatProviderLabel(provider: string | undefined): string`, `thinkingTokenForLevel(level: string | undefined): string`, `buildGauge(percent: number, width: number): string`, `ansiStrip(text: string): string`, `visibleWidth(text: string): number`, `padTo(text: string, width: number): string`, `truncateToWidth(text: string, width: number, ellipsis?: string): string`, `wrapText(text: string, width: number): string[]`, `formatContextLabel(tokens: number | null | undefined, contextWindow: number | undefined): string`, `formatCostLabel(cost: number): string`
  - `border.ts`: `ViewportCounts` (type: `{ above?: string; below?: string }`), `parseEditorBorder(line: string, direction: "above" | "below"): { count?: string } | undefined`, `stripEditorFrame(lines: string[], width: number): { content: string[]; viewport: ViewportCounts } | undefined`
  - `config.ts`: `OpenCodeUiMargins` (`{ left: number; right: number; bottom: boolean }`), `OpenCodeUiConfig` (`{ margins: OpenCodeUiMargins; railChar: string; barChar: string; gaugeWidth: number; showLastMessage: boolean; showThinking: boolean; newSessionBadge: boolean }`), `DEFAULT_CONFIG: OpenCodeUiConfig`, `parseConfig(raw: unknown): OpenCodeUiConfig`
  - `usage.ts`: `SessionEntry` (type), `computeUsageTotals(entries: readonly SessionEntry[]): { input: number; output: number; cacheRead: number; cacheWrite: number; cost: number }`, `computeUsageFingerprint(entries: readonly SessionEntry[]): string`

- [ ] **Step 1: Write the failing tests**

Create `tests/opencode-ui/format.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
 formatCount,
 formatProviderLabel,
 thinkingTokenForLevel,
 buildGauge,
 ansiStrip,
 visibleWidth,
 padTo,
 truncateToWidth,
 wrapText,
 formatContextLabel,
 formatCostLabel,
} from "../../extensions/opencode-ui/format.ts";

test("formatCount compact form", () => {
 assert.equal(formatCount(995), "995");
 assert.equal(formatCount(229_000), "229k");
 assert.equal(formatCount(1_050_000), "1.1M");
 assert.equal(formatCount(1_000_000), "1M");
});

test("formatProviderLabel title-cases", () => {
 assert.equal(formatProviderLabel("opencode-go"), "Opencode Go");
 assert.equal(formatProviderLabel("OpenCode Go"), "OpenCode Go");
 assert.equal(formatProviderLabel(undefined), "Unknown");
});

test("thinkingTokenForLevel maps levels", () => {
 assert.equal(thinkingTokenForLevel("high"), "thinkingHigh");
 assert.equal(thinkingTokenForLevel("max"), "thinkingMax");
 assert.equal(thinkingTokenForLevel(undefined), "thinkingOff");
 assert.equal(thinkingTokenForLevel("bogus"), "thinkingOff");
});

test("buildGauge fills blocks", () => {
 assert.equal(buildGauge(0, 13), "▱".repeat(13));
 assert.equal(buildGauge(100, 13), "▰".repeat(13));
 assert.equal(buildGauge(50, 13), "▰".repeat(7) + "▱".repeat(6));
 assert.equal(buildGauge(150, 13), "▰".repeat(13));
});

test("ansiStrip removes escape codes", () => {
 assert.equal(ansiStrip("\x1b[32mgreen\x1b[0m"), "green");
});

test("visibleWidth counts wide chars as 2", () => {
 assert.equal(visibleWidth("abc"), 3);
 assert.equal(visibleWidth("▰▱"), 2);
 assert.equal(visibleWidth("中"), 2);
});

test("padTo pads to target width", () => {
 assert.equal(padTo("ab", 4), "ab  ");
});

test("truncateToWidth adds ellipsis", () => {
 assert.equal(truncateToWidth("abcdef", 4), "abc…");
 assert.equal(truncateToWidth("abc", 4), "abc");
});

test("wrapText wraps long lines", () => {
 const wrapped = wrapText("one two three", 7);
 assert.deepEqual(wrapped, ["one two", "three"]);
});

test("formatContextLabel uses compact counts", () => {
 assert.equal(formatContextLabel(229_000, 1_000_000), "229k/1M");
 assert.equal(formatContextLabel(undefined, undefined), "--");
 assert.equal(formatContextLabel(0, 100_000), "0/100k");
});

test("formatCostLabel", () => {
 assert.equal(formatCostLabel(0.005), "$0.005");
 assert.equal(formatCostLabel(0.123), "$0.12");
 assert.equal(formatCostLabel(1.5), "$1.50");
 assert.equal(formatCostLabel(0), "");
});
```

Create `tests/opencode-ui/border.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
 parseEditorBorder,
 stripEditorFrame,
} from "../../extensions/opencode-ui/border.ts";

test("parseEditorBorder detects plain and scrolled borders", () => {
 assert.deepEqual(parseEditorBorder("─".repeat(10), "above"), {});
 assert.deepEqual(parseEditorBorder("─── ↑ 3 more ─────", "above"), { count: "3" });
 assert.deepEqual(parseEditorBorder("─── ↓ 2 more ─────", "below"), { count: "2" });
 assert.equal(parseEditorBorder("not a border", "above"), undefined);
});

test("stripEditorFrame strips top/bottom and side glyphs", () => {
 const lines = [
  "─".repeat(12),
  "│ hello ",
  "│ world ",
  "─".repeat(12),
 ];
 const result = stripEditorFrame(lines, 12);
 assert.ok(result);
 assert.deepEqual(result.content, ["hello", "world"]);
});

test("stripEditorFrame returns undefined for malformed input", () => {
 assert.equal(stripEditorFrame(["a", "b"], 12), undefined);
 assert.equal(stripEditorFrame(["─".repeat(12), "│ x ", "not-a-border"], 12), undefined);
});
```

Create `tests/opencode-ui/config.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CONFIG, parseConfig } from "../../extensions/opencode-ui/config.ts";

test("parseConfig returns defaults for empty input", () => {
 assert.deepEqual(parseConfig(undefined), DEFAULT_CONFIG);
 assert.deepEqual(parseConfig({}), DEFAULT_CONFIG);
});

test("parseConfig merges partial overrides", () => {
 const config = parseConfig({ gaugeWidth: 20, showLastMessage: false });
 assert.equal(config.gaugeWidth, 20);
 assert.equal(config.showLastMessage, false);
 assert.equal(config.margins.left, 1);
});

test("parseConfig rejects invalid types", () => {
 assert.throws(() => parseConfig({ gaugeWidth: "wide" }));
 assert.throws(() => parseConfig({ margins: { left: "1", right: 1, bottom: true } }));
});

test("parseConfig clamps margins to 0..2", () => {
 const config = parseConfig({ margins: { left: 9, right: -1, bottom: true } });
 assert.equal(config.margins.left, 2);
 assert.equal(config.margins.right, 0);
});
```

Create `tests/opencode-ui/usage.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import {
 computeUsageTotals,
 computeUsageFingerprint,
 type SessionEntry,
} from "../../extensions/opencode-ui/usage.ts";

const entries: SessionEntry[] = [
 { type: "message", message: { role: "assistant", usage: { input: 100, output: 50, cost: { total: 0.005 } } } },
 { type: "message", message: { role: "user", usage: { input: 10 } } },
 { type: "message", message: { role: "toolResult", usage: { input: 20 } } },
 { type: "compaction", usage: { input: 5, output: 2 } },
];

test("computeUsageTotals aggregates assistant/tool/compaction usage", () => {
 const totals = computeUsageTotals(entries);
 assert.equal(totals.input, 125);
 assert.equal(totals.output, 52);
 assert.equal(totals.cost, 0.005);
});

test("computeUsageFingerprint changes when entries change", () => {
 assert.notEqual(computeUsageFingerprint(entries), computeUsageFingerprint([]));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test "tests/opencode-ui/*.test.ts"`
Expected: FAIL — modules cannot be resolved (`ERR_MODULE_NOT_FOUND` for `../../extensions/opencode-ui/format.ts` etc.).

- [ ] **Step 3: Implement `format.ts`**

Create `extensions/opencode-ui/format.ts` (no imports):

```ts
export function formatCount(value: number): string {
 if (!Number.isFinite(value) || value < 0) return "0";
 if (value < 1000) return String(Math.round(value));
 if (value < 10_000) return `${(value / 1000).toFixed(1)}k`;
 if (value < 1_000_000) return `${Math.round(value / 1000)}k`;
 return `${(value / 1_000_000).toFixed(1)}M`;
}

export function formatProviderLabel(provider: string | undefined): string {
 if (!provider) return "Unknown";
 return provider
  .replace(/[-_]/g, " ")
  .replace(/\b\w/g, (char) => char.toUpperCase());
}

const THINKING_TOKENS: Record<string, string> = {
 off: "thinkingOff",
 minimal: "thinkingMinimal",
 low: "thinkingLow",
 medium: "thinkingMedium",
 high: "thinkingHigh",
 xhigh: "thinkingXhigh",
 max: "thinkingMax",
};

export function thinkingTokenForLevel(level: string | undefined): string {
 return (level && THINKING_TOKENS[level]) || "thinkingOff";
}

export function buildGauge(percent: number, width: number): string {
 const clamped = Math.max(0, Math.min(100, percent));
 const filled = Math.round((clamped / 100) * width);
 return "▰".repeat(filled) + "▱".repeat(Math.max(0, width - filled));
}

export function ansiStrip(text: string): string {
 return text
  .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
  .replace(/\x1b\][^\x07]*(?:\x07|\x1b\\)/g, "");
}

export function visibleWidth(text: string): number {
 let width = 0;
 for (const ch of ansiStrip(text)) {
  const code = ch.codePointAt(0) ?? 0;
  const wide =
   (code >= 0x1100 && code <= 0x115f) ||
   code === 0x2329 || code === 0x232a ||
   (code >= 0x2e80 && code <= 0xa4cf && code !== 0x303f) ||
   (code >= 0xac00 && code <= 0xd7a3) ||
   (code >= 0xf900 && code <= 0xfaff) ||
   (code >= 0xfe30 && code <= 0xfe6f) ||
   (code >= 0xff00 && code <= 0xff60) ||
   (code >= 0xffe0 && code <= 0xffe6) ||
   (code >= 0x1f300 && code <= 0x1faff) ||
   (code >= 0x20000 && code <= 0x3fffd);
  width += wide ? 2 : 1;
 }
 return width;
}

export function padTo(text: string, width: number): string {
 const pad = Math.max(0, width - visibleWidth(text));
 return text + " ".repeat(pad);
}

export function truncateToWidth(text: string, width: number, ellipsis = "…"): string {
 if (visibleWidth(text) <= width) return text;
 let out = "";
 let w = 0;
 for (const ch of text) {
  const cw = visibleWidth(ch);
  if (w + cw > width - visibleWidth(ellipsis)) break;
  out += ch;
  w += cw;
 }
 return out + ellipsis;
}

export function wrapText(text: string, width: number): string[] {
 const lines: string[] = [];
 for (const raw of text.split("\n")) {
  const words = raw.split(/(\s+)/);
  let line = "";
  let lineWidth = 0;
  for (const word of words) {
   const ww = visibleWidth(word);
   if (lineWidth + ww > width && lineWidth > 0) {
    lines.push(line);
    line = word.trimStart();
    lineWidth = visibleWidth(line);
   } else {
    line += word;
    lineWidth += ww;
   }
  }
  lines.push(line);
 }
 return lines.filter((line, index) => line.length > 0 || index === lines.length - 1 || lines.length === 1);
}

export function formatContextLabel(
 tokens: number | null | undefined,
 contextWindow: number | undefined,
): string {
 if (!contextWindow || contextWindow <= 0) return "--";
 const used =
  typeof tokens === "number" && Number.isFinite(tokens) && tokens >= 0
   ? tokens
   : 0;
 return `${formatCount(used)}/${formatCount(contextWindow)}`;
}

export function formatCostLabel(cost: number): string {
 if (!Number.isFinite(cost) || cost <= 0) return "";
 if (cost < 0.01) return `$${cost.toFixed(3)}`;
 if (cost < 1) return `$${cost.toFixed(2)}`;
 return `$${cost.toFixed(2)}`;
}
```

- [ ] **Step 4: Run format tests to verify they pass**

Run: `node --test tests/opencode-ui/format.test.ts`
Expected: PASS (12 tests). If `wrapText`/`buildGauge` rounding differs, adjust implementation to match the asserted values (round-half-up `Math.round` is the intended behavior).

- [ ] **Step 5: Implement `border.ts`**

Create `extensions/opencode-ui/border.ts` (imports only from `./format.ts`):

```ts
import { ansiStrip } from "./format.ts";

export type ViewportCounts = { above?: string; below?: string };

export function parseEditorBorder(
 line: string,
 direction: "above" | "below",
): { count?: string } | undefined {
 const plain = ansiStrip(line);
 if (/^─+$/.test(plain)) return {};
 const arrow = direction === "above" ? "↑" : "↓";
 const match = new RegExp(`^─── ${arrow} ([1-9]\\d*) more ─*$`).exec(plain);
 return match?.[1] ? { count: match[1] } : undefined;
}

export function stripEditorFrame(
 lines: string[],
 _width: number,
): { content: string[]; viewport: ViewportCounts } | undefined {
 if (lines.length < 2) return undefined;
 const top = parseEditorBorder(lines[0] ?? "", "above");
 const bottom = parseEditorBorder(lines.at(-1) ?? "", "below");
 if (!top || !bottom) return undefined;
 const viewport: ViewportCounts = { above: top.count, below: bottom.count };
 const interior = lines.slice(1, -1).map((line) => ansiStrip(line));
 const content: string[] = [];
 for (const line of interior) {
  // Base editor content rows are "│ <text>" (optionally "│<text>"); drop the
  // left glyph and a single following space. Defensive: leave rows that
  // don't start with a side glyph untouched.
  const match = /^[│┃▍] ?/.exec(line);
  content.push(match ? line.slice(match[0].length) : line);
 }
 return { content, viewport };
}
```

- [ ] **Step 6: Run border tests to verify they pass**

Run: `node --test tests/opencode-ui/border.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 7: Implement `config.ts`**

Create `extensions/opencode-ui/config.ts` (no imports):

```ts
export type OpenCodeUiMargins = { left: number; right: number; bottom: boolean };

export type OpenCodeUiConfig = {
 margins: OpenCodeUiMargins;
 railChar: string;
 barChar: string;
 gaugeWidth: number;
 showLastMessage: boolean;
 showThinking: boolean;
 newSessionBadge: boolean;
};

export const DEFAULT_CONFIG: OpenCodeUiConfig = {
 margins: { left: 1, right: 1, bottom: true },
 railChar: "┃",
 barChar: "▀",
 gaugeWidth: 13,
 showLastMessage: true,
 showThinking: true,
 newSessionBadge: true,
};

const clamp = (value: number, min: number, max: number): number =>
 Math.max(min, Math.min(max, value));

export function parseConfig(raw: unknown): OpenCodeUiConfig {
 const source = (raw ?? {}) as Record<string, unknown>;
 const margins = (source.margins ?? {}) as Record<string, unknown>;
 const config: OpenCodeUiConfig = {
  margins: {
   left: clamp(numberOr(margins.left, DEFAULT_CONFIG.margins.left), 0, 2),
   right: clamp(numberOr(margins.right, DEFAULT_CONFIG.margins.right), 0, 2),
   bottom: booleanOr(margins.bottom, DEFAULT_CONFIG.margins.bottom),
  },
  railChar: stringOr(source.railChar, DEFAULT_CONFIG.railChar),
  barChar: stringOr(source.barChar, DEFAULT_CONFIG.barChar),
  gaugeWidth: clamp(numberOr(source.gaugeWidth, DEFAULT_CONFIG.gaugeWidth), 5, 40),
  showLastMessage: booleanOr(source.showLastMessage, DEFAULT_CONFIG.showLastMessage),
  showThinking: booleanOr(source.showThinking, DEFAULT_CONFIG.showThinking),
  newSessionBadge: booleanOr(source.newSessionBadge, DEFAULT_CONFIG.newSessionBadge),
 };
 return config;
}

function numberOr(value: unknown, fallback: number): number {
 if (typeof value === "number" && Number.isFinite(value)) return value;
 if (value === undefined) return fallback;
 throw new TypeError(`expected number, got ${typeof value}`);
}

function booleanOr(value: unknown, fallback: boolean): boolean {
 if (typeof value === "boolean") return value;
 if (value === undefined) return fallback;
 throw new TypeError(`expected boolean, got ${typeof value}`);
}

function stringOr(value: unknown, fallback: string): string {
 if (typeof value === "string") return value;
 if (value === undefined) return fallback;
 throw new TypeError(`expected string, got ${typeof value}`);
}
```

- [ ] **Step 8: Run config tests to verify they pass**

Run: `node --test tests/opencode-ui/config.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 9: Implement `usage.ts`**

Create `extensions/opencode-ui/usage.ts` (no imports):

```ts
export type SessionUsage = {
 input?: unknown;
 output?: unknown;
 cacheRead?: unknown;
 cacheWrite?: unknown;
 cost?: { total?: unknown };
};

export type SessionEntry = {
 type?: string;
 id?: string | number;
 timestamp?: string | number;
 usage?: SessionUsage;
 message?: { role?: string; usage?: SessionUsage };
};

export type UsageTotals = {
 input: number;
 output: number;
 cacheRead: number;
 cacheWrite: number;
 cost: number;
};

const normalize = (value: unknown): number =>
 typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;

export function computeUsageTotals(entries: readonly SessionEntry[]): UsageTotals {
 let input = 0;
 let output = 0;
 let cacheRead = 0;
 let cacheWrite = 0;
 let cost = 0;
 for (const entry of entries) {
  if (entry.type === "message" && entry.message?.role !== "assistant" && entry.message?.role !== "toolResult") {
   continue;
  }
  const usage = entry.message?.usage ?? entry.usage;
  input += normalize(usage?.input);
  output += normalize(usage?.output);
  cacheRead += normalize(usage?.cacheRead);
  cacheWrite += normalize(usage?.cacheWrite);
  const total = usage?.cost?.total;
  cost += normalize(total);
 }
 return { input, output, cacheRead, cacheWrite, cost };
}

export function computeUsageFingerprint(entries: readonly SessionEntry[]): string {
 return entries
  .map((entry) =>
   JSON.stringify([
    entry.id ?? null,
    entry.timestamp ?? null,
    entry.type ?? null,
    entry.message?.role ?? null,
    entry.message?.usage?.input ?? entry.usage?.input ?? null,
    entry.message?.usage?.output ?? entry.usage?.output ?? null,
    entry.message?.usage?.cost?.total ?? entry.usage?.cost?.total ?? null,
   ]),
  )
  .join("\0");
}
```

- [ ] **Step 10: Run usage tests to verify they pass**

Run: `node --test tests/opencode-ui/usage.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 11: Run the full suite**

Run: `node --test "tests/opencode-ui/*.test.ts"`
Expected: PASS (21 tests total across the 5 files).

- [ ] **Step 12: Type-check**

Run `lsp_diagnostics` on `extensions/opencode-ui/` and `tests/opencode-ui/`.
Expected: clean (no errors).

- [ ] **Step 13: Commit**

```bash
git add extensions/opencode-ui tests/opencode-ui
git commit -m "feat(opencode-ui): pure utility modules (format, border, config, usage)"
```

---

### Task 3: Composer — layout compose + editor component

**Files:**

- Create: `extensions/opencode-ui/layout.ts` (add `composeComposerLines` here; this file grows in Tasks 4-5)
- Create: `extensions/opencode-ui/composer.ts`
- Create: `tests/opencode-ui/layout.test.ts` (composer section)

**Interfaces:**

- Consumes: `OpenCodeUiConfig` (Task 2), `wrapText`, `truncateToWidth`, `visibleWidth`, `padTo`, `ansiStrip` (Task 2)
- Produces:
  - `layout.ts`: `type Styler = (text: string, role: "rail" | "bar" | "model" | "muted" | "thinking" | "text") => string`, `type ComposerLayoutOptions = { width: number; contentLines: string[]; lastMessage?: string; modelLabel: string; providerLabel: string; thinkingLabel?: string; showNewSessionBadge?: boolean; style: Styler; config: OpenCodeUiConfig }`, `composeComposerLines(options: ComposerLayoutOptions): string[]`
  - `composer.ts`: `class ComposerEditor extends CustomEditor` with `constructor(tui: TUI, theme: EditorTheme, keybindings: KeybindingsManager, config: OpenCodeUiConfig, uiTheme: Theme, getState: () => ComposerState)` and `render(width: number): string[]`; `type ComposerState = { lastMessage: string | undefined; modelLabel: string; providerLabel: string; thinkingLabel: string | undefined; isNewSession: boolean }`

- [ ] **Step 1: Write the failing composer-layout tests**

Append to `tests/opencode-ui/layout.test.ts` (create the file with this content):

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CONFIG, type OpenCodeUiConfig } from "../../extensions/opencode-ui/config.ts";
import { composeComposerLines } from "../../extensions/opencode-ui/layout.ts";

const identity = (text: string): string => text;

const config: OpenCodeUiConfig = DEFAULT_CONFIG;

test("composer draws rail, metadata, input and bar with margins", () => {
 const lines = composeComposerLines({
  width: 20,
  contentLines: ["input"],
  modelLabel: "M",
  providerLabel: "P",
  thinkingLabel: "high",
  style: identity,
  config,
 });
 assert.equal(lines.length, 3);
 assert.equal(lines[0], " ┃  M · P · high        ");
 assert.equal(lines[1], " ┃ input                ");
 assert.equal(lines[2], "╹" + "▀".repeat(19));
});

test("composer includes wrapped last message when provided", () => {
 const lines = composeComposerLines({
  width: 20,
  contentLines: ["input"],
  lastMessage: "hello world",
  modelLabel: "M",
  providerLabel: "P",
  style: identity,
  config,
 });
 assert.equal(lines[0], " ┃  hello world         ");
 assert.equal(lines[1], " ┃  M · P               ");
 assert.equal(lines[2], " ┃ input                ");
 assert.equal(lines[3], "╹" + "▀".repeat(19));
});

test("composer omits thinking when undefined", () => {
 const lines = composeComposerLines({
  width: 20,
  contentLines: ["x"],
  modelLabel: "M",
  providerLabel: "P",
  style: identity,
  config,
 });
 assert.equal(lines[0], " ┃  M · P               ");
});

test("composer preserves input rows verbatim after the rail", () => {
 const lines = composeComposerLines({
  width: 12,
  contentLines: ["ab", "cd"],
  modelLabel: "M",
  providerLabel: "P",
  style: identity,
  config,
 });
 assert.equal(lines[1], " ┃ ab  ");
 assert.equal(lines[2], " ┃ cd  ");
});

test("composer with margins disabled has no left space", () => {
 const noMargin = { ...DEFAULT_CONFIG, margins: { left: 0, right: 0, bottom: true } };
 const lines = composeComposerLines({
  width: 10,
  contentLines: ["x"],
  modelLabel: "M",
  providerLabel: "P",
  style: identity,
  config: noMargin,
 });
 assert.equal(lines[0], "┃  M · P ");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/opencode-ui/layout.test.ts`
Expected: FAIL — `layout.ts` cannot be resolved.

- [ ] **Step 3: Implement `composeComposerLines`**

Create `extensions/opencode-ui/layout.ts` (imports only from `./config.ts` and `./format.ts`):

```ts
import type { OpenCodeUiConfig } from "./config.ts";
import { padTo, truncateToWidth, visibleWidth, wrapText } from "./format.ts";

export type Styler = (
 text: string,
 role: "rail" | "bar" | "model" | "muted" | "thinking" | "text",
) => string;

export type ComposerLayoutOptions = {
 width: number;
 contentLines: string[];
 lastMessage?: string;
 modelLabel: string;
 providerLabel: string;
 thinkingLabel?: string;
 showNewSessionBadge?: boolean;
 style: Styler;
 config: OpenCodeUiConfig;
};

export function composeComposerLines(options: ComposerLayoutOptions): string[] {
 const { width, contentLines, style, config } = options;
 const mLeft = config.margins.left;
 const mRight = config.margins.right;
 const rail = style(config.railChar, "rail");
 const contentMax = Math.max(1, width - mLeft - mRight - 1 - 2);
 const rows: string[] = [];

 const railRow = (text: string): string =>
  " ".repeat(mLeft) + rail + "  " + text;

 if (options.lastMessage) {
  for (const line of wrapText(options.lastMessage, contentMax)) {
   rows.push(padTo(railRow(line), width));
  }
 }

 let metadata = style(options.modelLabel, "model");
 metadata += " · " + style(options.providerLabel, "muted");
 if (options.showNewSessionBadge) metadata += style(" (New)", "muted");
 if (options.thinkingLabel) {
  metadata += " · " + style(options.thinkingLabel, "thinking");
 }
 rows.push(
  padTo(railRow(truncateToWidth(metadata, contentMax)), width),
 );

 for (const line of contentLines) {
  const inner = Math.max(0, width - mLeft - mRight - 1 - 1);
  rows.push(
   padTo(
    " ".repeat(mLeft) + rail + " " + truncateToWidth(line, inner),
    width,
   ),
  );
 }

 rows.push(style("╹", "bar") + style(config.barChar.repeat(Math.max(0, width - 1)), "bar"));
 return rows;
}

// Safety: referenced here so later tasks can reuse; imported at top for visibility.
void visibleWidth;
```

- [ ] **Step 4: Run composer-layout tests to verify they pass**

Run: `node --test tests/opencode-ui/layout.test.ts`
Expected: PASS (5 tests). If spacing assertions differ (e.g. rail `┃` width), adjust the implementation — the mockup contract is: `margins.left` spaces, rail char, two spaces, content, padded to `width`.

- [ ] **Step 5: Implement `ComposerEditor`**

Create `extensions/opencode-ui/composer.ts`:

```ts
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
```

Note: `EditorTheme` is exported from `@earendil-works/pi-tui`'s `components/editor` module. If the export name differs at type-check time, import `Theme` from `@earendil-works/pi-coding-agent` instead and use it for the `theme` parameter type.

- [ ] **Step 6: Type-check**

Run `lsp_diagnostics` on `extensions/opencode-ui/composer.ts` and `extensions/opencode-ui/layout.ts`.
Expected: clean. If `EditorTheme`/`CustomEditor` types don't line up, adjust the import to the resolved type from `@earendil-works/pi-coding-agent` (the runtime behavior only needs `super(tui, theme, keybindings, { paddingX: 0 })`).

- [ ] **Step 7: Live visual verification (calibration)**

Run `/reload` in a live pi session (with the theme from Task 1 active).
Expected:

- The composer renders: `┃  model · provider · thinking`, the input rows with the `┃` rail, and the `╹▀▀▀…` bar.
- **Calibrate `stripEditorFrame`:** inspect the base editor's actual border glyphs (top/bottom rows and the left glyph on content rows). If content rows do not start with `│`/`┃`/`▍`, update the regex in `stripEditorFrame` and the border test expectations to match reality.
- Cursor lands in the input row; typing and Enter submit work; `/model` opens the picker over the composer.

- [ ] **Step 8: Commit**

```bash
git add extensions/opencode-ui/layout.ts extensions/opencode-ui/composer.ts tests/opencode-ui/layout.test.ts
git commit -m "feat(opencode-ui): opencode composer editor component"
```

---

### Task 4: Footer — layout compose + component + usage cache

**Files:**

- Modify: `extensions/opencode-ui/layout.ts` (add `composeFooterLines`)
- Create: `extensions/opencode-ui/footer.ts`
- Modify: `tests/opencode-ui/layout.test.ts` (footer section)

**Interfaces:**

- Consumes: `computeUsageTotals`, `computeUsageFingerprint`, `SessionEntry` (Task 2), `formatContextLabel`, `formatCostLabel`, `buildGauge`, `formatProviderLabel` (Task 2)
- Produces:
  - `layout.ts`: `type FooterLayoutOptions = { width: number; left: string; contextLabel: string; gauge: string; costLabel: string; style: Styler; config: OpenCodeUiConfig }`, `composeFooterLines(options: FooterLayoutOptions): string[]` (returns `[infoLine]` plus `""` when `config.margins.bottom`)
  - `footer.ts`: `class OpencodeFooter implements Component` with `constructor(config: OpenCodeUiConfig, uiTheme: Theme, footerData: { cwd: string; getGitBranch(): string | undefined; onBranchChange(cb: () => void): () => void }, getData: () => { tokens: number | null | undefined; contextWindow: number | undefined; cost: number })`

- [ ] **Step 1: Write the failing footer-layout tests**

Append to `tests/opencode-ui/layout.test.ts`:

```ts
import { composeFooterLines } from "../../extensions/opencode-ui/layout.ts";

test("footer aligns left and right segments with margins", () => {
 const lines = composeFooterLines({
  width: 45,
  left: "proj:main",
  contextLabel: "229k/1M",
  gauge: "▰▰▰▰▱▱▱▱▱▱▱▱▱",
  costLabel: "$0.005",
  style: identity,
  config,
 });
 assert.equal(lines.length, 2);
 assert.equal(lines[1], "");
 const line = lines[0] ?? "";
 assert.ok(line.startsWith(" proj:main"));
 assert.ok(line.endsWith("▰▰▰▰▱▱▱▱▱▱▱▱▱ 229k/1M · $0.005 "));
 assert.equal(line.length, 45);
});

test("footer without cost omits it", () => {
 const lines = composeFooterLines({
  width: 20,
  left: "p:b",
  contextLabel: "1k/2k",
  gauge: "▰▱",
  costLabel: "",
  style: identity,
  config,
 });
 assert.ok((lines[0] ?? "").endsWith("▰▱ 1k/2k "));
});

test("footer drops bottom blank row when margins.bottom is false", () => {
 const noBottom = { ...DEFAULT_CONFIG, margins: { left: 1, right: 1, bottom: false } };
 const lines = composeFooterLines({
  width: 20,
  left: "p:b",
  contextLabel: "1k/2k",
  gauge: "▰▱",
  costLabel: "",
  style: identity,
  config: noBottom,
 });
 assert.equal(lines.length, 1);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/opencode-ui/layout.test.ts`
Expected: FAIL — `composeFooterLines` is not exported.

- [ ] **Step 3: Implement `composeFooterLines`**

Append to `extensions/opencode-ui/layout.ts` (add `formatContextLabel`, `formatCostLabel`, `buildGauge` imports from `./format.ts` as needed — they are used by the component, not here):

```ts
export type FooterLayoutOptions = {
 width: number;
 left: string;
 contextLabel: string;
 gauge: string;
 costLabel: string;
 style: Styler;
 config: OpenCodeUiConfig;
};

export function composeFooterLines(options: FooterLayoutOptions): string[] {
 const { width, left, contextLabel, gauge, costLabel, style, config } = options;
 const mLeft = config.margins.left;
 const mRight = config.margins.right;
 const contentWidth = Math.max(1, width - mLeft - mRight);
 const rightText = style([gauge, contextLabel, costLabel].filter(Boolean).join(" "), "muted");
 const rightWidth = visibleWidth(rightText);
 const leftText = truncateToWidth(style(left, "text"), Math.max(0, contentWidth - rightWidth - 1));
 const gap = " ".repeat(Math.max(1, contentWidth - visibleWidth(leftText) - rightWidth));
 const rows: string[] = [
  " ".repeat(mLeft) + leftText + gap + rightText + " ".repeat(Math.max(0, mRight)),
 ];
 if (config.margins.bottom) rows.push("");
 return rows;
}
```

- [ ] **Step 4: Run footer-layout tests to verify they pass**

Run: `node --test tests/opencode-ui/layout.test.ts`
Expected: PASS (8 tests total in the file).

- [ ] **Step 5: Implement `OpencodeFooter`**

Create `extensions/opencode-ui/footer.ts`:

```ts
import type { Theme } from "@earendil-works/pi-coding-agent";
import type { Component } from "@earendil-works/pi-tui";
import type { OpenCodeUiConfig } from "./config.ts";
import { buildGauge } from "./format.ts";
import { composeFooterLines, type Styler } from "./layout.ts";

export type FooterRenderData = {
 tokens: number | null | undefined;
 contextWindow: number | undefined;
 cost: number;
};

export class OpencodeFooter implements Component {
 private readonly config: OpenCodeUiConfig;
 private readonly uiTheme: Theme;
 private readonly getData: () => FooterRenderData;

 constructor(
  config: OpenCodeUiConfig,
  uiTheme: Theme,
  getData: () => FooterRenderData,
 ) {
  this.config = config;
  this.uiTheme = uiTheme;
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
   contextLabel: this.formatContext(data),
   gauge: buildGauge(percent, this.config.gaugeWidth),
   costLabel: this.formatCost(data.cost),
   style: this.styleRole,
   config: this.config,
  });
 }

 private leftLabel(): string {
  // Overridden by the entry via a getter when git data is wired in;
  // kept as a plain method so the component stays self-contained.
  return "";
 }

 private formatContext(data: FooterRenderData): string {
  const { tokens: used, contextWindow } = data;
  if (!contextWindow || contextWindow <= 0) return "--";
  const count = typeof used === "number" && used >= 0 ? used : 0;
  const compact = (value: number): string =>
   value < 1000
    ? String(Math.round(value))
    : value < 1_000_000
     ? `${Math.round(value / 1000)}k`
     : `${(value / 1_000_000).toFixed(1)}M`;
  return `${compact(count)}/${compact(contextWindow)}`;
 }

 private formatCost(cost: number): string {
  if (!Number.isFinite(cost) || cost <= 0) return "";
  if (cost < 0.01) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(2)}`;
 }

 invalidate(): void {}
}
```

Note: `leftLabel()` and the local `compact`/`formatCost` helpers duplicate `formatContextLabel`/`formatCostLabel` from Task 2 — **replace them** with imports from `./format.ts` during Task 10 (the entry wiring) when the left label gets real git data; keep the local versions only until then so this task compiles standalone. (Simplest alternative: import `formatContextLabel`, `formatCostLabel` now and delete the private helpers.)

- [ ] **Step 6: Type-check**

Run `lsp_diagnostics` on `extensions/opencode-ui/footer.ts`.
Expected: clean.

- [ ] **Step 7: Live visual verification**

Wire a throwaway `ctx.ui.setFooter((tui, theme, footerData) => new OpencodeFooter(config, ctx.ui.theme, () => ({ tokens: 100, contextWindow: 1000, cost: 0.005 })))` in a scratch copy of the entry (Task 10 is the real wiring), or defer visual check to Task 10. If deferred, just confirm type-check + tests pass here.

- [ ] **Step 8: Commit**

```bash
git add extensions/opencode-ui/layout.ts extensions/opencode-ui/footer.ts tests/opencode-ui/layout.test.ts
git commit -m "feat(opencode-ui): opencode footer component with context gauge + cost"
```

---

### Task 5: User messages — block compose + prototype patch

**Files:**

- Modify: `extensions/opencode-ui/layout.ts` (add `composeUserMessageBlock`)
- Create: `extensions/opencode-ui/user-message.ts`
- Modify: `tests/opencode-ui/layout.test.ts` (user-message section)

**Interfaces:**

- Consumes: `wrapText`, `padTo` (Task 2)
- Produces:
  - `layout.ts`: `composeUserMessageBlock(options: { width: number; lines: string[]; style: Styler; config: OpenCodeUiConfig }): string[]` — returns `["┃", "┃  <line>", …, "┃"]` with margins
  - `user-message.ts`: `installUserMessagePatch(configProvider: () => OpenCodeUiConfig, uiThemeProvider: () => Theme | undefined): () => void` (returns cleanup), `removeUserMessagePatch(): void`

- [ ] **Step 1: Write the failing user-message tests**

Append to `tests/opencode-ui/layout.test.ts`:

```ts
import { composeUserMessageBlock } from "../../extensions/opencode-ui/layout.ts";

test("user message block draws rail around content", () => {
 const lines = composeUserMessageBlock({
  width: 12,
  lines: ["Hello"],
  style: identity,
  config,
 });
 assert.deepEqual(lines, [" ┃          ", " ┃  Hello   ", " ┃          "]);
});

test("user message block wraps long content", () => {
 const lines = composeUserMessageBlock({
  width: 12,
  lines: ["one two three four"],
  style: identity,
  config,
 });
 // contentMax = 12-1-1-1-2 = 7 → ["one two", "three", "four"] + 2 rail rows
 assert.equal(lines.length, 5);
 assert.ok((lines[1] ?? "").includes("one two"));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/opencode-ui/layout.test.ts`
Expected: FAIL — `composeUserMessageBlock` is not exported.

- [ ] **Step 3: Implement `composeUserMessageBlock`**

Append to `extensions/opencode-ui/layout.ts`:

```ts
export type UserMessageLayoutOptions = {
 width: number;
 lines: string[];
 style: Styler;
 config: OpenCodeUiConfig;
};

export function composeUserMessageBlock(options: UserMessageLayoutOptions): string[] {
 const { width, lines, style, config } = options;
 const mLeft = config.margins.left;
 const mRight = config.margins.right;
 const rail = style(config.railChar, "rail");
 const contentMax = Math.max(1, width - mLeft - mRight - 1 - 2);
 const rows: string[] = [" ".repeat(mLeft) + rail];
 for (const line of lines.flatMap((text) => wrapText(text, contentMax))) {
  rows.push(" ".repeat(mLeft) + rail + "  " + line);
 }
 rows.push(" ".repeat(mLeft) + rail);
 return rows.map((row) => padTo(row, width));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/opencode-ui/layout.test.ts`
Expected: PASS (10 tests total).

- [ ] **Step 5: Implement the prototype patch**

Create `extensions/opencode-ui/user-message.ts`:

```ts
import {
 type ExtensionAPI,
 type Theme,
 UserMessageComponent,
} from "@earendil-works/pi-coding-agent";
import type { OpenCodeUiConfig } from "./config.ts";
import { composeUserMessageBlock, type Styler } from "./layout.ts";

const RENDER_KEY = "opencode-ui-user-message-render";

type Patchable = { render(width: number): string[]; invalidate(): void };

function installPrototypePatch(
 prototype: object,
 key: "render" | "invalidate",
 patchKey: string,
 patch: (receiver: Patchable, args: unknown[]) => unknown,
): () => void {
 const own = Object.getOwnPropertyDescriptor(prototype, key);
 if (!own || !("value" in own) || typeof own.value !== "function") return () => {};
 const previous = own.value;
 Object.defineProperty(prototype, key, {
  ...own,
  value(this: Patchable, ...args: unknown[]) {
   try {
    return patch(this, args);
   } catch {
    return Reflect.apply(previous, this, args);
   }
  },
 });
 (prototype as Record<string, unknown>)[`__oc_${patchKey}`] = previous;
 return () => {
  const saved = (prototype as Record<string, unknown>)[`__oc_${patchKey}`];
  if (typeof saved === "function") {
   Object.defineProperty(prototype, key, { ...own, value: saved });
   delete (prototype as Record<string, unknown>)[`__oc_${patchKey}`];
  }
 };
}

let currentCleanup: (() => void) | null = null;

export function installUserMessagePatch(
 configProvider: () => OpenCodeUiConfig,
 uiThemeProvider: () => Theme | undefined,
): () => void {
 removeUserMessagePatch();
 const prototype = UserMessageComponent.prototype as unknown as object;
 const cleanupRender = installPrototypePatch(
  prototype,
  "render",
  RENDER_KEY,
  (receiver, args) => {
   const width = args[0];
   if (typeof width !== "number") {
    return (receiver.render as () => string[]).call(receiver, ...args);
   }
   const previous = (prototype as Record<string, unknown>)[`__oc_${RENDER_KEY}`];
   const base =
    typeof previous === "function"
     ? (previous as (width: number) => string[]).call(receiver, width)
     : [];
   const lines = Array.isArray(base) ? base : [];
   const uiTheme = uiThemeProvider();
   const style: Styler = (text, role) => {
    if (!uiTheme) return text;
    if (role === "rail") return uiTheme.fg("border", text);
    return text;
   };
   return composeUserMessageBlock({
    width,
    lines,
    style,
    config: configProvider(),
   });
  },
 );
 currentCleanup = () => {
  cleanupRender();
  currentCleanup = null;
 };
 return currentCleanup;
}

export function removeUserMessagePatch(): void {
 currentCleanup?.();
 currentCleanup = null;
}
```

- [ ] **Step 6: Type-check**

Run `lsp_diagnostics` on `extensions/opencode-ui/user-message.ts`.
Expected: clean. If `UserMessageComponent`'s render isn't patchable as written (method on prototype), fall back to wrapping `render` via `Object.getOwnPropertyDescriptor` exactly as above — this mirrors zentui's `prototype-patch-registry` approach.

- [ ] **Step 7: Commit**

```bash
git add extensions/opencode-ui/layout.ts extensions/opencode-ui/user-message.ts tests/opencode-ui/layout.test.ts
git commit -m "feat(opencode-ui): user message rail styling via prototype patch"
```

---

### Task 6: Extension entry — wiring, events, state

**Files:**

- Create: `extensions/opencode-ui.ts`
- Modify: `extensions/opencode-ui/footer.ts` (wire left label + real formatters; remove the scratch helpers)

**Interfaces:**

- Consumes: `ComposerEditor`, `ComposerState` (Task 3), `OpencodeFooter`, `FooterRenderData` (Task 4), `installUserMessagePatch` (Task 5), `computeUsageTotals`, `computeUsageFingerprint` (Task 2), `formatContextLabel`, `formatCostLabel`, `formatProviderLabel`, `formatCount` (Task 2), `parseConfig` (Task 2)
- Produces: default-exported extension factory `(pi: ExtensionAPI) => void`.

- [ ] **Step 1: Implement the entry**

Create `extensions/opencode-ui.ts`:

```ts
import {
 type ExtensionAPI,
 type ExtensionContext,
 type Theme,
 getAgentDir,
} from "@earendil-works/pi-coding-agent";
import { readFileSync, existsSync } from "node:fs";
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
import { formatContextLabel, formatCostLabel, formatProviderLabel } from "./opencode-ui/format.ts";

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
 isNewSession: boolean;
 usageFingerprint: string;
 cost: number;
};

function createState(ctx: ExtensionContext): SessionState {
 const entries = getEntries(ctx);
 const lastUser = [...entries]
  .reverse()
  .find((entry) => entry.type === "message" && entry.message?.role === "user");
 const messageContent = lastUser?.message?.content;
 const lastMessage =
  typeof messageContent === "string"
   ? messageContent
   : Array.isArray(messageContent)
    ? (messageContent as { text?: string }[])
      .map((part) => (typeof part.text === "string" ? part.text : ""))
      .join("")
    : undefined;
 const model = ctx.model;
 const totals = computeUsageTotals(entries);
 return {
  lastMessage,
  modelLabel: model?.name ?? model?.id ?? "model",
  providerLabel: formatProviderLabel(model?.provider),
  thinkingLabel: undefined,
  isNewSession: lastUser === undefined,
  usageFingerprint: computeUsageFingerprint(entries),
  cost: totals.cost,
 };
}

function getEntries(ctx: ExtensionContext): readonly SessionEntry[] {
 const manager = ctx.sessionManager as {
  getEntries?: () => readonly SessionEntry[];
  getBranch: () => readonly SessionEntry[];
 };
 return typeof manager.getEntries === "function"
  ? manager.getEntries()
  : manager.getBranch();
}

function requestRender(ctx: ExtensionContext): void {
 const tui = (ctx.ui as unknown as { requestRender?: () => void }).requestRender;
 tui?.();
}

export default function opencodeUi(pi: ExtensionAPI): void {
 let state: SessionState | null = null;
 let activeCtx: ExtensionContext | null = null;
 let config: OpenCodeUiConfig = parseConfig(undefined);

 const refreshUsage = (ctx: ExtensionContext): void => {
  if (!state) return;
  const entries = getEntries(ctx);
  const fingerprint = computeUsageFingerprint(entries);
  if (fingerprint === state.usageFingerprint) return;
  state.usageFingerprint = fingerprint;
  state.cost = computeUsageTotals(entries).cost;
  requestRender(ctx);
 };

 pi.on("session_start", (_event, ctx) => {
  config = loadConfig();
  state = createState(ctx);
  activeCtx = ctx;

  ctx.ui.setEditorComponent((tui, theme, keybindings) =>
   new ComposerEditor(tui, theme, keybindings, config, ctx.ui.theme, () => state ?? emptyState()),
  );

  ctx.ui.setFooter((_tui, _theme, footerData) => {
   const branch = footerData.getGitBranch();
   const project = basename(footerData.cwd ?? "");
   const getData = (): FooterRenderData => {
    const usage = ctx.getContextUsage();
    return {
     tokens: usage?.tokens ?? 0,
     contextWindow: usage?.contextWindow,
     cost: state?.cost ?? 0,
    };
   };
   const leftLabel = (): string => {
    const b = branch ?? "";
    return b ? `${project}:${b}` : project;
   };
   return new OpencodeFooter(config, ctx.ui.theme, getData, leftLabel);
  });

  installUserMessagePatch(
   () => config,
   () => ctx.ui.theme,
  );
 });

 pi.on("session_shutdown", () => {
  removeUserMessagePatch();
  state = null;
  activeCtx = null;
 });

 pi.on("model_select", (event, ctx) => {
  if (!state) return;
  state.modelLabel = event.model?.name ?? event.model?.id ?? "model";
  state.providerLabel = formatProviderLabel(event.model?.provider);
  requestRender(ctx);
 });

 pi.on("thinking_level_select", (event, ctx) => {
  if (!state) return;
  state.thinkingLabel = event.level;
  requestRender(ctx);
 });

 pi.on("message_end", (event, ctx) => {
  if (!state || event.message?.role !== "user") return;
  const content = event.message?.content;
  state.lastMessage =
   typeof content === "string"
    ? content
    : Array.isArray(content)
     ? (content as { text?: string }[])
       .map((part) => (typeof part.text === "string" ? part.text : ""))
       .join("")
     : undefined;
  state.isNewSession = false;
  refreshUsage(ctx);
  requestRender(ctx);
 });

 pi.on("agent_end", (event, ctx) => {
  refreshUsage(ctx);
 });
}

function emptyState(): ComposerState {
 return {
  lastMessage: undefined,
  modelLabel: "model",
  providerLabel: "",
  thinkingLabel: undefined,
  isNewSession: true,
 };
}

function basename(path: string): string {
 return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}
```

Then update `extensions/opencode-ui/footer.ts`:

- Change the constructor to accept a `leftLabel: () => string` as the fourth argument (before `getData` or after — pick one order and keep it consistent):
  `constructor(config: OpenCodeUiConfig, uiTheme: Theme, leftLabel: () => string, getData: () => FooterRenderData)`
- Replace the `leftLabel()` method body with `return this.leftLabel()` (field), and delete the scratch `formatContext`/`formatCost` helpers in favor of imports:

```ts
import { buildGauge, formatContextLabel, formatCostLabel } from "./format.ts";
```

and in `render`:

```ts
return composeFooterLines({
 width,
 left: this.leftLabel(),
 contextLabel: formatContextLabel(data.tokens, data.contextWindow),
 gauge: buildGauge(percent, this.config.gaugeWidth),
 costLabel: formatCostLabel(data.cost),
 style: this.styleRole,
 config: this.config,
});
```

- [ ] **Step 2: Type-check**

Run `lsp_diagnostics` on `extensions/opencode-ui.ts` and all `extensions/opencode-ui/*.ts`.
Expected: clean. Fix any API mismatches (`footerData.cwd`, `footerData.getGitBranch`, `event.model`, `event.message.content`, `ctx.getContextUsage`) against the resolved `pi-coding-agent` types.

- [ ] **Step 3: Run the full unit suite**

Run: `node --test "tests/opencode-ui/*.test.ts"`
Expected: PASS (21+ tests; unchanged by this task).

- [ ] **Step 4: Live verification**

Run `/reload` in a live session (theme from Task 1 active).
Expected:

- Composer shows last user message (or nothing on a fresh session), `model · provider · thinking`, input rows with rail, and the `╹▀▀▀` bar.
- Footer shows `project:branch` left and the gauge/context/cost right; updates after a turn (usage) and on branch change.
- User messages render with the rail block.
- Switching model (Ctrl+P) updates the composer metadata; thinking cycle updates the thinking label.
- Type multi-line input; autocomplete dropdown appears above the bar; Enter submits.

- [ ] **Step 5: Commit**

```bash
git add extensions/opencode-ui.ts extensions/opencode-ui/footer.ts
git commit -m "feat(opencode-ui): extension entry wiring composer, footer, user messages"
```

---

### Task 7: Margins integration (settings + component wrapping)

**Files:**

- Modify: `~/.pi/agent/settings.json` (add `"outputPad": 1`)

**Interfaces:**

- Consumes: nothing new — margin behavior already implemented in `layout.ts` (composer/footer/user-message rows wrap at `width` with `margins.left/right` spaces and pad to full width) and Task 6's footer (blank bottom row).

- [ ] **Step 1: Enable native transcript padding**

Edit `~/.pi/agent/settings.json`, add (top level):

```json
  "outputPad": 1,
```

- [ ] **Step 2: Live verification**

Run `/reload` (or restart pi).
Expected:

- Transcript messages (user, assistant, thinking) are inset 1 cell on each side (pi-native `outputPad`).
- Composer rows, footer info line, and user-message rail blocks are inset 1 cell left/right (our components).
- There is a blank row between the footer info line and the terminal bottom (`margins.bottom`).
- The `╹▀▀▀` bar spans the full width including the margin columns.
- Confirm tool-output blocks: if they render edge-to-edge and it bothers, note it — accepted for v1.

- [ ] **Step 3: Commit**

```bash
git commit -am "feat(opencode-ui): enable global side margins via outputPad"
```

(If `settings.json` is outside the repo, commit the repo-side changes only and note the settings edit: `~/.pi/agent/settings.json` now has `outputPad: 1`.)

---

### Task 8: Remove zentui

**Files:**

- Modify: `~/.pi/agent/settings.json` (remove `"npm:pi-zentui"` from `packages`)
- Modify: `~/.pi/agent/prefix-keys.json` (remove the `"z": "command:/zentui"` binding)

**Interfaces:**

- Consumes: all previous tasks (the replacement UI must be fully functional before this removal).

- [ ] **Step 1: Remove the package**

Edit `~/.pi/agent/settings.json`: delete the `"npm:pi-zentui"` entry from `packages`. Leave `zentui.json` in place (it becomes inert; optionally delete it).

- [ ] **Step 2: Remove the dangling binding**

Edit `~/.pi/agent/prefix-keys.json`: delete the line `"z": "command:/zentui",` (the `/zentui` command no longer exists once the package is gone).

- [ ] **Step 3: Restart and verify**

Restart pi (package removal needs a fresh start, not just `/reload`).
Expected:

- No zentui errors/warnings at startup; no `Warning: Usage: /zentui …` / `Editor: disabled` messages.
- Our composer, footer, and user-message styling all still render.
- `ctrl+x` prefix still works for the remaining bindings; `ctrl+x z` does nothing (or is unbound).
- No `[Extensions]` listing regression (the startup header is hidden anyway via `quietStartup`).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore(opencode-ui): drop zentui package and its prefix binding"
```

---

### Task 9: Performance pass + CPU measurement

**Files:**

- Modify: `extensions/opencode-ui.ts` (debounce usage refresh; ensure no timers/polling)
- Modify (if needed): `extensions/opencode-ui/footer.ts`, `extensions/opencode-ui/composer.ts` (verify no per-frame work beyond string building)

**Interfaces:**

- Consumes: all previous tasks.

- [ ] **Step 1: Audit for hot paths**

Review the render path:

- `ComposerEditor.render` runs only when pi invalidates the editor (keystrokes, our events). `stripEditorFrame` runs per render — acceptable (few lines). Cache the stripped frame keyed on `(width, baseLines.length)` only if profiling shows it matters.
- `OpencodeFooter.render` calls `getData()` → `ctx.getContextUsage()` (pi computes from the branch — cheap) and reads the cached `state.cost`.
- `refreshUsage` already short-circuits via `computeUsageFingerprint`; add a microtask/`setImmediate` debounce so rapid `message_end`/`agent_end` pairs aggregate once:

```ts
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
```

- Confirm **no `setInterval`/`setTimeout` loops** anywhere in the extension (the only timer is the one-shot `setImmediate` debounce).

- [ ] **Step 2: Type-check + tests**

Run `lsp_diagnostics` on `extensions/opencode-ui/`; run `node --test "tests/opencode-ui/*.test.ts"`.
Expected: clean; all tests pass.

- [ ] **Step 3: CPU measurement**

1. Start pi, idle for 30 s; record idle CPU (`htop` or `top -b -n 1 -p <pid>`), and confirm `pidstat 1 10` shows no periodic wakeups.
2. Paste a large block into the composer and type; confirm responsive and no sustained high CPU after the keystroke burst settles.
3. Run one long agent turn; confirm the footer's context/cost updates without a noticeable frame hitch.
4. Compare with the pre-change baseline if available (zentui era) — the target is **lower or equal** idle CPU.

- [ ] **Step 4: Commit**

```bash
git add extensions/opencode-ui.ts
git commit -m "perf(opencode-ui): debounce usage refresh; verify no timers"
```

---

### Task 10: Spec review checklist + final polish

**Files:** any touched above.

- [ ] **Step 1: Verify against the spec**

Walk the design doc (`docs/superpowers/specs/2026-08-06-opencode-ui-design.md`) and confirm each item:

- Theme `opencode` active; chrome colors come from theme tokens. ✔ Task 1, 3, 4, 5
- 1-cell margins sides+bottom (component-level + `outputPad` + footer blank row). ✔ Task 7
- Composer: last user message, `model · provider · thinking`, input, one shared `╹▀▀▀` bar. ✔ Task 3, 6
- Footer: `project:branch` left, gauge + `229k/1M` + `$cost` right. ✔ Task 4, 6
- User messages rail block. ✔ Task 5
- zentui removed; no startup warnings. ✔ Task 8
- CPU: no compositor, no timers, cached formatters, fingerprint-invalidated usage. ✔ Task 9

- [ ] **Step 2: Final full-suite run + type-check**

Run: `node --test "tests/opencode-ui/*.test.ts"` then `lsp_diagnostics` on `extensions/` and `tests/`.
Expected: all green.

- [ ] **Step 3: Final visual pass**

One full live session: fresh start, resume, `/model` + `/settings` open over the composer, multi-line input, autocomplete, a turn with tool output, branch switch mid-session, resize the terminal narrower and wider (verify truncation and the bar rebuild at new widths).

- [ ] **Step 4: Commit any stragglers**

```bash
git add -A
git commit -m "chore(opencode-ui): final polish"
```

---

## Self-Review Notes

- **Spec coverage:** every spec section maps to a task (see Task 10 Step 1 checklist). The "true global margin" decision was refined to the CPU-light component-level approach per the user's performance requirement — documented in the spec's Decisions table and Margins section.
- **Placeholders:** none — every step has concrete code or an exact verification command.
- **Type consistency:** shared signatures defined once in the Interfaces blocks: `OpenCodeUiConfig` (config.ts), `Styler` + the three compose functions (layout.ts), `ComposerState` (composer.ts), `FooterRenderData` (footer.ts), `SessionEntry`/`computeUsageTotals`/`computeUsageFingerprint` (usage.ts). Task 6's entry consumes exactly those names. One deliberate seam: footer's constructor arg order is finalized in Task 6 Step 1 (adds `leftLabel`) — implementers of Task 4 must not assume a stable signature beyond `config`, `uiTheme`, `getData`.
- **Known calibration point:** `stripEditorFrame`'s side-glyph regex (`/^[│┃▍] ?/`) and the border rows are verified live in Task 3 Step 7; the border test expectations may need a one-line adjustment to the actual base-editor glyphs.
