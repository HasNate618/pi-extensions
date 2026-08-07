# Unified Chat Margins Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Re-integrate the stashed assistant-message inset (currently `stash@{0}`) and unify all chat-region gutters under a single `chatMargins` config key, keeping `margins` and `footerMargins` as aliases.

**Architecture:** The assistant-message feature patches `AssistantMessageComponent.prototype.render` (wrapped via a shared `installPrototypePatch` helper) to render pi's native message at a narrower width and re-lay it out inside transparent left/right gutters, re-applying pi's OSC 133 zones at the line edges. Task 1 restores that exact verified code; Task 2 generalizes the symmetric inset to asymmetric `{left, right}` gutters and makes `chatMargins` the single knob that drives composer, user messages, assistant messages, thinking, and tool cards. `margins` remains an explicit per-region override for composer/user messages; `footerMargins` stays independent.

**Tech Stack:** TypeScript (EraSable style — tabs, double quotes, semicolons, explicit `.ts` import suffixes), `node --test` for tests, pi extension API (`pi.events`, `AssistantMessageComponent` from `@earendil-works/pi-coding-agent`), OSC 133 shell-integration zones.

## Root Cause (why the stash "was not working")

`stash@{0}` was created at `47e89be`. Since then, commits `4bbb858` (prefix sidebar blending) and `c380119` (timeout) added wiring to the **same** `session_start`/`session_shutdown` blocks in `extensions/opencode-ui.ts` that the stash modifies. A plain `git stash pop` therefore produces merge conflicts in `opencode-ui.ts` (verified: `git stash apply` on `c380119` → `UU extensions/opencode-ui.ts`). The assistant-message patch never got wired in, so assistant messages rendered natively (1-char `outputPad`, no inset) — appearing as "not working". The patch code itself was live-verified at 2-char inset on `47e89be`. **Do NOT `git stash pop` — hand-apply per Task 1.**

## Global Constraints

- EraSable TS only: tabs for indentation, double quotes, semicolons, explicit `.ts` on relative imports.
- Tests run with `node --test tests/opencode-ui/*.test.ts`; all must pass before each commit.
- Colors come from the theme tokens only (via `uiTheme.fg`/`bg` escapes) — never hardcode ANSI or truecolor.
- No compositors, timers, or polling in the extension; renders stay O(rows×width).
- Rendered rows must never exceed the terminal width — pi hard-crashes on over-wide lines (`visibleWidth(line) > width`). Every layout function must guarantee rows pad exactly to `width`.
- OSC 133 zone markers (`\x1b]133;A/B/C\x07`) must stay at the start of the first/last message lines; kitty image lines (`\x1b_G`) pass through untouched.
- Config gutter values clamp to 0–4; inset 0 must short-circuit to pi's native render.
- pi loads extensions from the path pinned in `~/.pi/agent/settings.json` (`../../Projects/pi-extensions`), NOT from the CWD — all live verification runs happen from the main repo working tree.
- `stash@{0}` must not be dropped until Task 1's files are committed to the tree.

## File Structure

- `extensions/opencode-ui/config.ts` — config schema: Task 1 adds `chatInset`; Task 2 replaces it with `chatMargins {left, right}`, makes `margins` optional (alias), adds `composerMargins()` helper.
- `extensions/opencode-ui/assistant-layout.ts` — pure layout helpers (`insetRenderWidth`, `insetRenderedLines`); Task 2 changes the signature from symmetric `inset` to asymmetric `left, right`.
- `extensions/opencode-ui/assistant-message.ts` — `installAssistantMessagePatch(configProvider)` wrapping `AssistantMessageComponent.prototype.render`.
- `extensions/opencode-ui/patch.ts` — shared `installPrototypePatch` (new, from stash).
- `extensions/opencode-ui.ts` — session wiring: prefix event subscription (existing) + assistant patch install/cleanup (Task 1).
- `extensions/opencode-ui/composer.ts` / `user-message.ts` — read effective composer margins via `composerMargins(config)` (Task 2).
- `tests/opencode-ui/assistant-message.test.ts` — layout/patch tests (new, from stash; Task 2 updates for asymmetric).
- `tests/opencode-ui/config.test.ts` — Task 2 adds chatMargins/alias tests.

---

### Task 1: Re-integrate the assistant-message inset (restore `chatInset`)

Restores the exact verified feature from `stash@{0}`. User messages/composer are untouched.

**Files:**

- Create: `extensions/opencode-ui/assistant-layout.ts`, `extensions/opencode-ui/assistant-message.ts`, `extensions/opencode-ui/patch.ts`, `tests/opencode-ui/assistant-message.test.ts` (materialize from stash)
- Modify: `extensions/opencode-ui/config.ts`, `extensions/opencode-ui.ts`

**Interfaces:**

- Consumes: existing `OpenCodeUiConfig` type.
- Produces: `installAssistantMessagePatch(configProvider: () => OpenCodeUiConfig): () => void` (uninstall), `insetRenderWidth(width: number, inset: number): number`, `insetRenderedLines(base: string[], width: number, inset: number): string[]`, `installPrototypePatch(prototype, key, patchKey, patch)`.

- [x] **Step 1: Materialize the four stash files (do NOT pop the stash)**

```bash
git checkout stash@{0}^3 -- \
  extensions/opencode-ui/assistant-layout.ts \
  extensions/opencode-ui/assistant-message.ts \
  extensions/opencode-ui/patch.ts \
  tests/opencode-ui/assistant-message.test.ts
git restore --staged extensions/opencode-ui/assistant-layout.ts \
  extensions/opencode-ui/assistant-message.ts \
  extensions/opencode-ui/patch.ts \
  tests/opencode-ui/assistant-message.test.ts
```

Verify each file exists and is untracked (`git status --short` shows `??` for all four). Do not touch `extensions/opencode-ui/user-message.ts` — main keeps its own inline patch helper; `patch.ts` is only used by `assistant-message.ts` for now.

- [x] **Step 2: Add `chatInset` to the config**

In `extensions/opencode-ui/config.ts`:

```ts
export type OpenCodeUiConfig = {
 // ...existing keys...
 showThinking: boolean;
 // Horizontal transparent gutters for chat messages (the chat body has
 // no rail — pi's native messages span the full width otherwise).
 chatInset: number;
};
```

In `DEFAULT_CONFIG` add `chatInset: 2,` after `showThinking: true,`. In `parseConfig`, after the `showThinking` line:

```ts
  chatInset: clamp(
   numberOr(source.chatInset, DEFAULT_CONFIG.chatInset),
   0,
   4,
  ),
```

- [x] **Step 3: Wire the patch into `extensions/opencode-ui.ts`** (hand-merge — keep ALL existing prefix wiring)

Imports — after the `installUserMessagePatch` import:

```ts
import { installAssistantMessagePatch } from "./opencode-ui/assistant-message.ts";
```

Declarations — after `let offPrefixArmed: (() => void) | null = null;`:

```ts
 let offAssistantPatch: (() => void) | null = null;
```

In `session_start`, after the `pi.events.on("prefix:armed", ...)` subscription block (which ends with `});`), before `state = createState(ctx);`:

```ts
  offAssistantPatch?.();
  offAssistantPatch = installAssistantMessagePatch(() => config);
```

In `session_shutdown`, after `setPrefixArmed(false);`, before `offBranchChange?.();`:

```ts
  offAssistantPatch?.();
  offAssistantPatch = null;
```

- [x] **Step 4: Write/run the failing test (verify the stash tests run)**

Run: `node --test tests/opencode-ui/*.test.ts`
Expected: 56 pass, 0 fail (48 current + 8 assistant-message tests).

- [x] **Step 5: Commit**

```bash
git add extensions/opencode-ui/assistant-layout.ts \
  extensions/opencode-ui/assistant-message.ts extensions/opencode-ui/patch.ts \
  extensions/opencode-ui.ts extensions/opencode-ui/config.ts \
  tests/opencode-ui/assistant-message.test.ts
git commit -m "feat(opencode-ui): re-integrate assistant-message chat inset (chatInset)"
```

---

### Task 2: Unify config — `chatMargins` with `margins`/`footerMargins` aliases

Generalizes the inset to asymmetric gutters and makes `chatMargins` drive every chat region. Default per user decision: **ON, {left: 2, right: 2}** — composer/user/assistant all inset at 2 unless `margins` is explicitly set (then it wins for composer/user).

**Files:**

- Modify: `extensions/opencode-ui/config.ts`, `extensions/opencode-ui/assistant-layout.ts`, `extensions/opencode-ui/assistant-message.ts`, `extensions/opencode-ui/composer.ts`, `extensions/opencode-ui/user-message.ts`, `tests/opencode-ui/config.test.ts`, `tests/opencode-ui/assistant-message.test.ts`

**Interfaces:**

- Consumes: Task 1's `installAssistantMessagePatch`, `insetRenderWidth`, `insetRenderedLines` (signatures change in this task).
- Produces: `composerMargins(config: OpenCodeUiConfig): OpenCodeUiMargins` — `config.margins ?? { ...config.chatMargins, bottom: true }`.

- [x] **Step 1: Write the failing tests (config parse + asymmetric layout)**

Add to `tests/opencode-ui/config.test.ts`:

```ts
test("chatMargins parses with 0-4 clamp and drives composerMargins fallback", () => {
 const cfg = parseConfig({ chatMargins: { left: 9, right: -1 } });
 assert.equal(cfg.chatMargins.left, 4);
 assert.equal(cfg.chatMargins.right, 0);
 const m = composerMargins(cfg);
 assert.equal(m.left, 4);
 assert.equal(m.right, 0);
 assert.equal(m.bottom, true);
});

test("margins alias overrides chatMargins for the composer when set", () => {
 const cfg = parseConfig({
  chatMargins: { left: 2, right: 2 },
  margins: { left: 1, right: 3, bottom: false },
 });
 const m = composerMargins(cfg);
 assert.deepEqual(m, { left: 1, right: 3, bottom: false });
});

test("footerMargins stays an independent alias", () => {
 const cfg = parseConfig({ footerMargins: { left: 4, right: 0 } });
 assert.deepEqual(cfg.footerMargins, { left: 4, right: 0 });
});
```

Update `tests/opencode-ui/assistant-message.test.ts` to the asymmetric signature. Replace every `insetRenderWidth(W, n)` with `insetRenderWidth(W, n, n)` and every `insetRenderedLines(base, W, n)` with `insetRenderedLines(base, W, n, n)`. Then add:

```ts
test("insetRenderedLines supports asymmetric left/right gutters", () => {
 // inner = 20 - 1 - 3 = 16, base rendered at insetRenderWidth(20, 1, 3) = 18
 const base = [baseLine(18, "hello world")];
 const out = insetRenderedLines(base, 20, 1, 3);
 assert.equal(out[0], " hello world" + " ".repeat(6) + "   ");
 assert.equal(visibleWidth(out[0]), 20);
});
```

Run: `node --test tests/opencode-ui/*.test.ts`
Expected: FAIL (composerMargins/chatMargins not defined; signature mismatch).

- [x] **Step 2: Config — `chatMargins` replaces `chatInset`; `margins` becomes optional**

In `extensions/opencode-ui/config.ts`:

```ts
export type OpenCodeUiConfig = {
 // Composer/user-message override: when set, wins for those two regions.
 // Otherwise chatMargins applies everywhere.
 margins?: OpenCodeUiMargins;
 // Footer bar insets (the footer has no box, just text insets).
 footerMargins: { left: number; right: number };
 // Global chat gutters: composer, user messages, assistant messages,
 // thinking, and tool-call cards.
 chatMargins: { left: number; right: number };
 railChar: string;
 gaugeWidth: number;
 spinnerIntervalMs: number;
 showThinking: boolean;
};
```

`DEFAULT_CONFIG` becomes:

```ts
export const DEFAULT_CONFIG: OpenCodeUiConfig = {
 margins: undefined,
 footerMargins: { left: 2, right: 2 },
 chatMargins: { left: 2, right: 2 },
 railChar: "┃",
 gaugeWidth: 15,
 spinnerIntervalMs: 500,
 showThinking: true,
};
```

In `parseConfig`, replace the `margins:` block (remove the `chatInset` block added in Task 1) with:

```ts
 const chatMargins = (source.chatMargins ?? {}) as Record<string, unknown>;
 const config: OpenCodeUiConfig = {
  margins: source.margins
   ? {
     left: clamp(
      numberOr(margins.left, DEFAULT_CONFIG.chatMargins.left),
      0,
      4,
     ),
     right: clamp(
      numberOr(margins.right, DEFAULT_CONFIG.chatMargins.right),
      0,
      4,
     ),
     bottom: booleanOr(margins.bottom, true),
    }
   : undefined,
  footerMargins: {
   left: clamp(
    numberOr(footerMargins.left, DEFAULT_CONFIG.footerMargins.left),
    0,
    4,
   ),
   right: clamp(
    numberOr(footerMargins.right, DEFAULT_CONFIG.footerMargins.right),
    0,
    4,
   ),
  },
  chatMargins: {
   left: clamp(
    numberOr(chatMargins.left, DEFAULT_CONFIG.chatMargins.left),
    0,
    4,
   ),
   right: clamp(
    numberOr(chatMargins.right, DEFAULT_CONFIG.chatMargins.right),
    0,
    4,
   ),
  },
  railChar: stringOr(source.railChar, DEFAULT_CONFIG.railChar),
  gaugeWidth: clamp(
   numberOr(source.gaugeWidth, DEFAULT_CONFIG.gaugeWidth),
   5,
   40,
  ),
  spinnerIntervalMs: clamp(
   numberOr(source.spinnerIntervalMs, DEFAULT_CONFIG.spinnerIntervalMs),
   100,
   5000,
  ),
  showThinking: booleanOr(source.showThinking, DEFAULT_CONFIG.showThinking),
 };
```

At the bottom of `config.ts` add:

```ts
// Effective margins for the composer and user-message boxes: the explicit
// `margins` alias wins when set, otherwise the global chatMargins apply.
export function composerMargins(config: OpenCodeUiConfig): OpenCodeUiMargins {
 return config.margins ?? { ...config.chatMargins, bottom: true };
}
```

- [x] **Step 3: Asymmetric layout — `extensions/opencode-ui/assistant-layout.ts`**

Replace the symmetric functions:

```ts
export function insetRenderWidth(
 width: number,
 left: number,
 right: number,
): number {
 return Math.max(1, width - left - right + 2);
}
```

In `insetRenderedLines(base, width, left, right)`, replace `const inner = Math.max(1, width - 2 * inset);` with `const inner = Math.max(1, width - left - right);`, and the text-line return with:

```ts
  return (
   " ".repeat(left) +
   content +
   " ".repeat(Math.max(0, inner - visibleWidth(content))) +
   " ".repeat(right)
  );
```

Tool-card lines and the zones map stay unchanged. Every output line must pad to exactly `width` — the tests assert this.

- [x] **Step 4: Patch reads `chatMargins` — `extensions/opencode-ui/assistant-message.ts`**

Replace the inset read and the short-circuit:

```ts
   const { left, right } = configProvider().chatMargins;
   if (left <= 0 && right <= 0) {
    return typeof saved === "function"
     ? (saved as (w: number) => string[]).call(receiver, width)
     : [];
   }
   const base =
    typeof saved === "function"
     ? (saved as (w: number) => string[]).call(
       receiver,
       insetRenderWidth(width, left, right),
      )
     : [];
   return insetRenderedLines(
    Array.isArray(base) ? base : [],
    width,
    left,
    right,
   );
```

- [x] **Step 5: Composer/user messages use `composerMargins`**

`extensions/opencode-ui/composer.ts` (line ~98): import `composerMargins` from `./config.ts`, then replace `this.config.margins.left` with `composerMargins(this.config).left` and `this.config.margins.right` with `composerMargins(this.config).right`.

`extensions/opencode-ui/user-message.ts` (line ~68): same replacement for `config.margins.left` / `config.margins.right` (compute once: `const m = composerMargins(config);`).

- [x] **Step 6: Run the tests**

Run: `node --test tests/opencode-ui/*.test.ts`
Expected: all pass (56 + the new config tests). Every `visibleWidth(line)` assertion passes (no over-wide rows).

- [x] **Step 7: Commit**

```bash
git add extensions/opencode-ui/config.ts extensions/opencode-ui/assistant-layout.ts \
  extensions/opencode-ui/assistant-message.ts extensions/opencode-ui/composer.ts \
  extensions/opencode-ui/user-message.ts tests/opencode-ui/config.test.ts \
  tests/opencode-ui/assistant-message.test.ts
git commit -m "feat(opencode-ui): unify chat margins under chatMargins with margins/footerMargins aliases"
```

---

### Task 3: Live PTY verification

pi loads extensions from the `~/.pi/agent/settings.json` pin (the main repo), so run pi from `/home/nate/Projects/pi-extensions` — the committed code is what loads. No worktree.

**Files:**

- Create (scratch, not committed): `/tmp/capture_chatmargins.py`

- [x] **Step 1: Write the capture harness**

Adapt `/tmp/capture_pi16.py`: launch pi at 70×30 from `/home/nate/Projects/pi-extensions`, press `n` if the session dashboard appears, type `hello` + Enter, wait up to 40s for the reply to render, then dump the raw PTY buffer to `/tmp/chatmargins.bin` and kill pi.

- [x] **Step 2: Assert the unified margins live**

Strip ANSI from the buffer and assert:

1. **Assistant reply**: first reply line starts `\x1b]133;B\x07\x1b]133;C\x07` followed by **2** spaces then text (inset left=2), and the stripped line's visible width is exactly 70.
2. **Composer rail**: the `┃` rail sits at column 2 (left=2), i.e. the row is `" " + " " + "┃" + ...`.
3. **User message box**: same rail position in the sent-message block.
4. **Footer**: gauge/label text starts at column 2 (`footerMargins.left=2`).
5. **No over-wide rows**: every stripped line ≤ 70 cells.
6. **Prefix blend still works**: press `\x18` (ctrl+x) and confirm the composer rail's fg escape becomes the theme's `userMessageBg` color; press `\x03` to disarm.

- [x] **Step 3: Optional alias check**

Temporarily write `~/.pi/agent/opencode-ui.json` with `{ "margins": { "left": 1, "right": 2, "bottom": true } }`, restart, and confirm the composer/user rail moves back to column 1 while the assistant reply stays at 2. Delete the file afterwards.

- [x] **Step 4: Report results in the task summary** (do not commit the scratch harness).

---

### Task 4: Cleanup and docs

**Files:**

- Modify: `docs/superpowers/plans/2026-08-07-chat-margins.md` (mark completed) or a short `extensions/opencode-ui/README.md` note; drop the stash.

- [x] **Step 1: Update the config doc comment** in `extensions/opencode-ui/config.ts` if the README/config example lists keys — otherwise skip.

- [x] **Step 2: Drop the obsolete stash** (Task 1's files are committed to the tree now)

```bash
git stash drop stash@{0}
```

- [x] **Step 3: Final verification**

Run: `node --test tests/opencode-ui/*.test.ts` — all pass. `git status --short` clean. `git log --oneline -3` shows the two new commits.

---

## Self-Review

**1. Spec coverage (user request: "research global margins → if not, how to implement" → "sure" to Option 1 + stash fix):**

- Stash "not working" root cause: documented in the header; Task 1 hand-applies instead of popping (fixes the failure).
- Re-integration of the assistant inset: Task 1.
- Unified `chatMargins` key: Task 2 (config + all four chat regions: composer, user messages, assistant/thinking via the patch, tool cards via right-pad).
- Aliases: `margins` (Task 2 Step 2/5 — wins for composer/user when set) and `footerMargins` (independent, tested).
- Default ON at {2,2} (user decision): `DEFAULT_CONFIG.chatMargins` — Task 2 Step 2; visual-change note in Global Constraints.
- Live verification: Task 3 (assistant inset, composer/user rail at 2, footer, prefix-blend regression, no over-wide crash).

**2. Placeholder scan:** no TBDs; every code step has concrete content; the only scratch artifact (capture harness) is fully specified.

**3. Type consistency:**

- `insetRenderWidth(width, left, right)` / `insetRenderedLines(base, width, left, right)` — Task 1 defines symmetric; Task 2 changes both consistently (tests updated in the same task).
- `composerMargins(config)` — defined in Task 2 Step 2, consumed in Step 5; signature matches.
- `installAssistantMessagePatch(configProvider)` — same signature across both tasks.
- `chatInset` appears only in Task 1 (removed in Task 2 Step 2).

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-07-chat-margins.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
