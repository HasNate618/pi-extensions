# opencode-ui — custom pi TUI theme & chrome

**Date:** 2026-08-06
**Status:** Draft for review
**Repo:** ~/Projects/pi-extensions

## Goal

Replace pi's stock look (plus the current zentui-based chrome) with a single
custom UI inspired by opencode's composer: a distinct rail, a composer that
shows the last user message and model metadata, a bottom bar shared between the
composer and footer, user messages drawn with the same rail, a 1-cell global
margin on sides and bottom, our own theme palette, and a CPU-light
implementation that rides pi's native render pipeline.

## Decisions (from design Q&A)

| Question | Decision |
| ---------- | ---------- |
| zentui | **Dropped entirely** — its footer, user-message styles, and editor are all replaced by ours. `npm:pi-zentui` removed from settings packages; `/zentui` command goes with it |
| Bottom bar | **One shared bar** — the composer's bottom edge (`╹▀▀▀▀…`) IS the top edge of the footer region. The footer renders only the info line (plus the blank bottom-margin row) |
| Composer header | Last **user message** as the top row(s); then `model · provider · thinking level`; no "Build" mode label; "(New)" badge optional until the first message is sent |
| Context readout | **Footer only**: `▰▰▰▰▱▱▱▱▱▱▱▱▱ 229k/1M · $0.005` (tokens used / total + block gauge + cost). Composer stays clean of context |
| Colors | Custom theme file with our own palette; all chrome reads colors **from theme tokens** (`accent`, `border`, `muted`, …) so the look stays coherent |
| Margin | **Component-level 1-cell margin** (CPU-light; see Performance) — not a compositor |

## Target layout

```
 <1-cell margin>┃                                                          <margin>
 <1-cell margin>┃  <last user message, wrapped>
 <1-cell margin>┃  <model> · <provider> · <thinking>
 <1-cell margin>┃  <input rows (base editor content, border stripped)>
╹▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀   <- bar, full width incl. margins
 project:branch            ▰▰▰▰▱▱▱▱▱▱▱▱▱ 229k/1M · $0.005                  <- footer info line
 <blank>                                                                    <- bottom margin
```

User messages in the transcript:

```
┃
┃  Hello
┃
```

## Architecture

One extension, `extensions/opencode-ui.ts`, owning everything. Config:
`~/.pi/agent/opencode-ui.json` (colors resolve to theme tokens by default;
overridable with raw values, same pattern as zentui's `colorSource`).

### 1. Theme — `~/.pi/agent/themes/opencode.json`

Full 51-token pi theme (schema per `themes.md`). Palette: dark neutral
background, green accent (opencode-like), muted grays, readable syntax colors.
Set `"theme": "opencode"` in `~/.pi/agent/settings.json`. pi hot-reloads the
theme file on edit — instant feedback while tuning.

Chrome token mapping:

- Bottom bar → `accent`
- Rail `┃` → `border` (dimmer than accent so it doesn't compete)
- Metadata / footer text → `muted`
- Model name → `accent`; thinking level → thinking tokens (`thinkingOff`…)

### 2. Margins (CPU-light)

- `outputPad: 1` in settings.json → pi natively pads user/assistant/thinking
  messages 1 cell each side (covers the transcript).
- Composer, footer, and user-message rows render at `width - 2` and are wrapped
  in `" " + line + " "` so every line is full-width with margins.
- Bottom margin: the footer component renders `[info line, ""]` — the final
  blank row.
- Known residual: pi's status line (top), selector popups (model picker,
  `/settings`), and the autocomplete dropdown render edge-to-edge. Accepted for
  v1; a later render wrapper could pad them.

### 3. Composer (editor component)

`class ComposerEditor extends CustomEditor` installed via
`ctx.ui.setEditorComponent(...)` in `session_start`.

Render pipeline per `render(width)`:

1. Fall back to `super.render(width)` when `width` is too small.
2. Render the base editor at `innerWidth = width - 2` (margins already outside
   the rail — rail sits at column 2, i.e. inside the margin).
3. Strip the base editor's border: drop the top/bottom border rows and the
   left/right border characters from content rows (the parse/strip technique
   zentui uses — `parseEditorBorder` + interior rail-stripping; includes the
   `─── ↑ N more ───` scroll indicators which are kept as content chrome).
4. Compose rows:
   - optional: `rail + "  " + lastUserMessage` wrapped to inner width
   - `rail + "  " + modelLabel · providerLabel · thinkingLabel`
   - input content rows: `rail + " " + contentRow` (autocomplete lines from the
     base editor pass through here, above the bar)
   - bottom bar: `╹` + `▀` × `(width - 1)` in the bar color — spans the margins
5. Preserve the `CURSOR_MARKER` (from pi-tui) inside the input rows exactly
   once so the hardware cursor lands in the input area.

State (injected via constructor callbacks, updated from events):

- last user message: scan `ctx.sessionManager.getBranch()` for the last
  `type: "message", role: "user"` entry at `session_start`; update on
  `message_update` / `message_end` when role is user.
- model label + provider: `ctx.model` at start; `model_select` event after.
- thinking level: `thinking_level_select` event.
- `(New)` badge: shown until the first user message is sent in the session
  (config toggle).

Invalidate + `tui.requestRender()` only on those events.

### 4. Footer (`ctx.ui.setFooter`)

Component renders 2 rows: `[infoLine, ""]`.

Info line, full width minus margins:

- Left: `project:branch` — cwd basename (`footerData` cwd) + `:` + git branch
  from `footerData.getGitBranch()`.
- Right (right-aligned): `<gauge> <used>/<total> · $<cost>`
  - gauge: 13–20 `▰`/`▱` blocks (configurable width, default 13 per mockup)
  - used/total: `ctx.getContextUsage()` → `{tokens, contextWindow, percent}`;
    compact format via a `formatCount` helper (`229k`, `1M`)
  - cost: cached aggregation of session usage (input/output/cacheRead/cacheWrite
    cost) over `ctx.sessionManager.getEntries()`, cache invalidated by
    fingerprint (zentui's `getUsageTotals` approach, ~40 lines)

Re-render triggers: `footerData.onBranchChange(...)`, usage events
(`message_end`, `agent_end`, `session_compact` — debounced), `model_select`,
`thinking_level_select`. No timers.

### 5. User messages

Patch `UserMessageComponent.prototype.render` (same prototype-patch technique
zentui uses, kept minimal): produce

```
┃
┃  <content wrapped>
┃
```

- Preserve OSC-133 prompt-zone markers around the rendered block so terminal
  integrations keep working.
- Content padded to `width - 4` (margin + rail + 2 spaces) and wrapped.

### 6. zentui removal

- settings.json: drop `"npm:pi-zentui"` from `packages`.
- `~/.pi/agent/zentui.json`: delete (or leave; it becomes inert).
- `~/.pi/agent/prefix-keys.json`: remove the `"z": "command:/zentui"` binding.
- Lost functionality (accepted): transcript mouse-wheel scroll + text
  selection/copy (zentui's fixedEditor compositor), selector borders, `/zentui`
  config UI. Keyboard transcript scrolling is native.

## Performance

- **No compositor.** pi's TUI already coalesces renders (16 ms min interval,
  dirty flag + timer) and writes only changed lines. We do not intercept the
  render or write pipeline, so there is no per-frame overhead beyond pi's own.
- **Invalidate-on-change only.** Renders fire on keystrokes and the specific
  events above — nothing periodic.
- **Cached formatters.** Gauge string and labels are cached and keyed on their
  inputs (tokens/window/cost); unchanged inputs return the cached string.
- **No polling.** Git branch comes from `footerData` (pi watches `.git/HEAD`);
  usage aggregation is cached with fingerprint invalidation, not recomputed per
  frame.
- **No timers.** No clock in the footer; nothing wakes the TUI while idle.

## Data flow

```
events ──► opencode-ui state (lastMsg, model, thinking, usageCache, branch)
                │ (invalidate + requestRender)
                ▼
   ComposerEditor.render / FooterComponent.render / UserMessage patch
                │
                ▼
   pi TUI (coalesced, diffed writes)
```

## Risks & mitigations

| Risk | Mitigation |
| ------ | ------------ |
| Base editor border format changes in a pi update → border stripping breaks | Parse defensively (regex on the border rows, as zentui does); fall back to `super.render(width)` undecorated on any parse failure |
| `outputPad` changes or doesn't cover tool outputs | Tool outputs may sit edge-to-edge; acceptable; revisit with a render wrapper if it bothers |
| Losing fixedEditor mouse-scroll/selection | Accepted tradeoff for dropping zentui; keyboard scroll is native |
| Custom editor + autocomplete cursor misplacement | Preserve `CURSOR_MARKER` invariants; verify with multi-line input + autocomplete during testing |
| Theme switch alters unrelated surfaces (markdown, syntax) | Intended — the whole UI takes the new palette; tune tokens before finalizing |
| Extension load order vs. other extensions touching the editor/footer | `opencode-ui` is last in the packages list; uses the same ownership checks zentui had (only act if we own the component) |

## Testing

- Type-check + LSP on the extension before reload.
- `/reload`, then visually verify per component: composer chrome (empty input,
  multi-line, autocomplete, long last message wrapping), footer (branch change,
  context growth during a turn, cost), user messages (single/multi-line,
  wrapped), margins (transcript, composer, footer, bottom blank row).
- CPU check: `htop` on idle pi before/after; typing burst; long-session context
  aggregation timing.
- `pi --mode json` unaffected (UI-only extension).

## Build order

1. Theme file + switch settings theme → verify palette everywhere.
2. User-message rail patch.
3. Composer (editor component) — largest piece.
4. Footer (setFooter) + usage/branch data.
5. Margins (outputPad + component wrapping + bottom blank row).
6. Remove zentui + clean prefix-keys binding; verify nothing else breaks.
7. Performance pass (formatter caches, debounce) + CPU measurement.
