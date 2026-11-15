# Agent Prompt for Obsidian

Select text (or not), press **Ctrl/Cmd+J**, type what you want, press **Enter** — a CLI coding agent
(**Claude Code** in v0.1) runs **in the background inside your vault folder** and edits the Markdown files directly.

> "Redáctame esto en una nueva página" → creates `New note.md` with the developed content and replaces
> the selection in the original note with `[[New note]]` (minimal edit).

| Prompt | Result |
| --- | --- |
| ![modal](docs/modal.png) | ![result](docs/result.png) |

## How it works

- **Stateless.** Every run is independent: the plugin sends the agent the active note path, the selection
  (verbatim + line/column range) or the cursor position, and your instruction. The agent reads and writes
  the files on disk; Obsidian picks up the changes automatically.
- The agent gets an Obsidian-specific system prompt: notes are `.md`, links are `[[wikilinks]]`, keep
  frontmatter, never touch `.obsidian/`, make minimal edits, create new notes next to the active one.
- **No selection** → the instruction applies to the whole active note (emphasis on what's before the cursor),
  e.g. "mejora esta nota".
- Under the hood (Claude Code):
  ```
  claude -p --output-format json --permission-mode acceptEdits \
         --append-system-prompt "<obsidian rules>" \
         --allowedTools=Read,Write,Edit,MultiEdit,Glob,Grep,LS   < task-on-stdin
  ```
  No `Bash` tool by default: the agent can only read/edit files in the vault.

## Install

Requires the desktop app and a CLI agent installed and logged in (`claude` — run it once in a terminal first).

**Manual**
1. Download `main.js`, `manifest.json`, `styles.css` from the [latest release](https://github.com/balalofernandez/obsidian-agent-prompt/releases/latest).
2. Copy them into `<your vault>/.obsidian/plugins/agent-prompt/`.
3. Obsidian → Settings → Community plugins → enable **Agent Prompt**.

**BRAT**: add `balalofernandez/obsidian-agent-prompt` as a beta plugin.

**From source**
```bash
git clone https://github.com/balalofernandez/obsidian-agent-prompt && cd obsidian-agent-prompt
npm install && npm run build
mkdir -p "$VAULT/.obsidian/plugins/agent-prompt" && cp main.js manifest.json styles.css "$VAULT/.obsidian/plugins/agent-prompt/"
```

## Usage

| Command | Default hotkey |
| --- | --- |
| Agent Prompt: Run agent on selection / note | `Ctrl/Cmd+J` |
| Agent Prompt: Cancel running agent | — |

The hotkey is configurable in **Settings → Hotkeys** (the plugin settings have a shortcut button).
While the agent works, the status bar shows `🤖 Claude Code working…`; a notification shows the agent's
summary when it finishes.

## Settings

- **CLI agent** – which agent backend to use (Claude Code for now).
- **Executable** – `claude` or an absolute path. `~/.local/bin`, `~/.claude/local`, `/usr/local/bin`,
  `/opt/homebrew/bin`… are added to `PATH` automatically because GUI apps don't inherit your shell PATH.
  The **Test** button runs `--version`.
- **Model**, **Allowed tools**, **Extra arguments** – per agent.
- **Timeout**, **Extra instructions** (appended to the system prompt), **Show result notification**.

## Adding another agent (Codex, Gemini CLI, …)

Implement `AgentRunner` (`src/agents/AgentRunner.ts`) and register it in `src/agents/registry.ts`:

```ts
export interface AgentRunner {
  id: string; displayName: string; defaultBinary: string; defaultAllowedTools: string;
  buildInvocation(req: AgentRequest, cfg: AgentConfig): { command: string; args: string[]; stdin?: string; env?: Record<string,string> };
  versionArgs(): string[];
  parseResult(stdout: string, stderr: string, exitCode: number | null): { ok: boolean; summary: string };
}
```
Spawning, PATH, timeout and cancellation are shared (`src/runProcess.ts`). The settings UI picks it up automatically.

## Development & tests

```bash
npm run dev     # esbuild watch
npm run build   # typecheck + production bundle
npm test        # unit tests (vitest)
npm run e2e     # end-to-end in a real Obsidian
```

The **E2E test** (`test/e2e/run.mjs`) launches a real Obsidian with an isolated config dir
(`XDG_CONFIG_HOME`) and a throwaway vault, installs the built plugin, connects over the Chrome DevTools
Protocol (Playwright `connectOverCDP`), selects text, presses `Ctrl+J`, types a prompt and asserts on the
files the agent wrote:
1. selection → new note `Abejas.md` created, original note now contains `[[Abejas]]`, rest untouched;
2. no selection → note improved (spelling fixed).

Set `OBSIDIAN_BIN` to your Obsidian executable/AppImage (default `~/AppImages/obsidian.appimage`).
It calls the real agent (a couple of short runs). Screenshots go to `test/e2e/.run/screenshots/`.

## License

MIT
