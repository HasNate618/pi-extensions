# pi-extensions

TUI extensions for the [pi coding agent](https://pi.dev), as an installable pi package.

- **opencode-ui** — restyles pi's TUI to look like opencode's
- **prefix-keys** — tmux-style prefix/leader keybindings

## Install

```bash
pi install git:github.com/HasNate618/pi-extensions
# or, from a checkout:
pi install ./
```

Restart pi (or `/reload`). Enabling individual extensions is done in
`~/.pi/agent/settings.json` by listing them against the package source:

```json
{
  "source": "/path/to/pi-extensions",
  "extensions": ["extensions/opencode-ui.ts", "extensions/prefix-keys.ts"]
}
```

## opencode-ui

Pi's default TUI stretches messages and tool cards across the full terminal
width. This extension pulls them into a consistent chat gutter and adds the
opencode furniture:

- `render()` of `AssistantMessageComponent`, `UserMessageComponent`,
  `ToolExecutionComponent` and `BashExecutionComponent` is wrapped so content
  draws inside `chatMargins`
- custom footer via `ctx.ui.setFooter` — cwd, git branch, session name and a
  context gauge with cache-hit rate
- spinner throttling so the working indicator updates on a fixed interval
- user messages get a framed block styled from the active theme

Config lives in `~/.pi/agent/opencode-ui.json` (optional — omitted keys fall
back to defaults). Useful keys:

| Key | Default | Meaning |
| --- | --- | --- |
| `chatMargins.left` / `.right` | `3` / `3` | transparent gutter size |
| `spinnerIntervalMs` | `500` | spinner frame interval |

Patches are installed per prototype and removed on shutdown, and every patch
falls back to pi's original renderer if it throws — a styling bug can never take
down pi.

## prefix-keys

Press a configurable prefix (default `ctrl+x`), then a mapped key, to run an
action — tmux-style. While armed a `prefix` chip shows in the footer; the key you
then press is consumed and never reaches the editor.

```json
{
  "prefix": "ctrl+x",
  "timeoutMs": 4000,
  "bindings": {
    "m": "command:/model",
    "n": "command:/new",
    "t": "command:/tree",
    "q": "command:/quit"
  }
}
```

Config: `~/.pi/agent/prefix-keys.json`.

Targets: `command:/name` runs a slash command through the editor's submit path
(the same mechanism as typing `/name` + enter — the only public command-dispatch
route pi exposes); `key:ctrl+l` injects a keybinding chord (ctrl+letter, plain
keys, `shift+tab`, and common specials).

On session start the extension warns about any built-in action your prefix
overrides (by default `ctrl+x` is `app.message.copy` and
`app.models.clearAll`) — change `prefix` if you want those keys back. `escape`
cancels an armed prefix; it auto-disarms after `timeoutMs`. Status and the
active config are available from the `/prefix-keys` command.

Self-test (no TUI needed): `PREFIX_KEYS_SELFTEST=1 pi -p --no-session "Say OK."`

## Subagents are not in this repo

`pi-subagents` agent definitions (for example the `researcher` and `planner`
agents) live in pi's user agent directory, `~/.pi/agent/agents/*.md`, because
they are personal agents rather than extensions.

## Development

- `extensions/` — the two extensions plus `opencode-ui/` helpers
- `tests/opencode-ui/` — run with `node --test tests/opencode-ui/*.test.ts`
- `@earendil-works/*` packages are `peerDependencies`; packages load with
  separate module roots, so pi must supply pi-ai/pi-agent-core/pi-coding-agent/pi-tui
