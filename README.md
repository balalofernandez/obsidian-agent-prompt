# Agent Prompt for Obsidian

Select some text, press `Ctrl/Cmd+J`, type an instruction and press Enter. The plugin runs a CLI coding agent (Claude Code, Codex, Gemini CLI, Cursor and 29 more) in the background, inside your vault folder, and the agent edits your Markdown files.

Example: you select a paragraph and write "Redáctame esto en una nueva página". The agent creates `New note.md` with the expanded text and replaces your selection with `[[New note]]`. It leaves the rest of the note alone.

| Prompt | Result |
| --- | --- |
| ![modal](docs/modal.png) | ![result](docs/result.png) |

## How it works

Each run starts from scratch. The plugin sends the agent the path of the active note, your selection (with its line and column range) or your cursor position, and your instruction. The agent reads and writes the files on disk, and Obsidian reloads them.

The agent also gets a system prompt about Obsidian: notes are `.md` files, links use `[[wikilinks]]`, frontmatter stays, `.obsidian/` stays untouched, edits stay small, and new notes go in the same folder as the active one.

If you select nothing, the instruction applies to the whole note, with focus on the text before your cursor. Try "mejora esta nota".

With Claude Code, the plugin runs this command:

```
claude -p --output-format json \
       --append-system-prompt "<obsidian rules>" \
       --tools Read Write Edit MultiEdit Glob Grep LS \
       --allowedTools "Read(./**)" "Edit(./**)" "Write(./**)" ...   < task-on-stdin
```

`--tools` decides which tools exist: no `Bash`, no web access. `--allowedTools` approves them only for paths inside your vault. Claude Code denies anything outside the vault, because nobody can approve a prompt in `-p` mode.

## Supported agents

The first time you enable the plugin, it looks for these CLIs on your computer, picks the first one it finds and tells you which others it found. You can switch in the plugin settings, where installed agents appear first with a ✓.

Limits says how far the plugin can confine each agent:

- vault only: tools pre-approved for the vault folder, everything else denied. Tested.
- partial: the plugin turns off the shell or limits tools or writes, but the CLI doesn't guarantee reads stay in the vault.
- none: the CLI has no way to restrict a headless run, so the agent works with your user's full permissions.

"Tested" means someone ran it end to end against the real CLI. The others follow each CLI's docs and pass unit tests, but nobody has run them yet. If you use one, run `npm run smoke -- <id>` and open an issue or PR with the result.

| Agent | Command | Limits | Tested |
| --- | --- | --- | --- |
| [Claude Code](https://docs.claude.com/en/docs/claude-code/cli-reference) | `claude` | vault only | yes |
| [Codex (OpenAI)](https://developers.openai.com/codex/noninteractive) | `codex` | partial | no |
| [Gemini CLI](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/headless.md) | `gemini` | partial | no |
| [Cursor CLI](https://cursor.com/docs/cli/headless) | `cursor-agent` | partial | no |
| [GitHub Copilot CLI](https://docs.github.com/en/copilot/how-tos/copilot-cli/automate-copilot-cli/run-cli-programmatically) | `copilot` | partial | no |
| [OpenCode](https://opencode.ai/docs/cli/) | `opencode` | none | no |
| [Amp](https://ampcode.com/docs/cli/execute-mode) | `amp` | none | no |
| [Droid (Factory)](https://docs.factory.com/cli/droid-exec/overview) | `droid` | partial | no |
| [Grok Build (xAI)](https://docs.x.ai/build/cli/headless-scripting) | `grok` | partial | no |
| [Qwen Code](https://github.com/QwenLM/qwen-code/blob/main/docs/users/features/headless.md) | `qwen` | partial | no |
| [Kimi Code CLI](https://moonshotai.github.io/kimi-code/en/reference/kimi-command) | `kimi` | none | no |
| [DeepSeek Harness (dsh)](https://github.com/deepseek-ai/deepseek-harness/blob/main/docs/cli-help.md) | `dsh` | partial | no |
| [Mistral Vibe](https://docs.mistral.ai/vibe/code/cli/work-with-cli) | `vibe` | partial | no |
| [Aider](https://aider.chat/docs/scripting.html) | `aider` | partial | no |
| [Goose](https://block.github.io/goose/docs/guides/goose-cli-commands) | `goose` | none | no |
| [Cline](https://docs.cline.bot/cline-cli/cli-reference) | `cline` | none | no |
| [Continue (cn)](https://docs.continue.dev/cli/headless-mode) | `cn` | partial | no |
| [Kilo Code](https://kilo.ai/docs/code-with-ai/platforms/cli) | `kilo` | partial | no |
| [Kiro CLI](https://kiro.dev/docs/cli/headless/) | `kiro-cli` | partial | no |
| [Rovo Dev (Atlassian)](https://support.atlassian.com/rovo/docs/rovo-dev-cli-commands/) | `acli` | none | no |
| [Antigravity CLI (Google)](https://antigravity.google/docs/cli/headless/) | `agy` | partial | no |
| [Auggie (Augment Code)](https://docs.augmentcode.com/cli/reference) | `auggie` | partial | no |
| [Devin CLI](https://docs.devin.ai/cli/reference/commands) | `devin` | partial | no |
| [CodeBuddy Code](https://www.workbuddy.ai/docs/cli/headless) | `codebuddy` | partial | no |
| [MiMo Code (Xiaomi)](https://github.com/XiaomiMiMo/MiMo-Code) | `mimo` | partial | no |
| [ZCode (Z.ai)](https://github.com/zai-org/ZCode/blob/main/apps/zcode-cli/docs/usage/02-cli-reference.md) | `zcode` | partial | no |
| [Muse Code (Meta)](https://dev.meta.ai/docs/muse-code/extending#headless) | `muse` | partial | no |
| [Pi](https://docs.pi.dev/latest/cli) | `pi` | partial | no |
| [oh-my-pi (omp)](https://omp.sh/docs/cli) | `omp` | partial | no |
| [Hermes Agent](https://hermes-agent.nousresearch.com/docs/reference/cli-commands) | `hermes` | partial | no |
| [Autohand Code](https://docs.autohand.ai/working-with-autohand-code/headless-mode) | `autohand` | partial | no |
| [Command Code](https://commandcode.ai/docs/core-concepts/headless) | `command-code` | none | no |
| [OpenClaude](https://github.com/Twigpine/openclaude) | `openclaude` | partial | no |

Not supported: Codebuff/Freebuff (no headless mode), Harness (its CLI manages pipelines, it doesn't edit files) and Code Charm (no CLI found).

## Privacy and safety

- Each run sends your instruction, the selected text, the note path and any note the agent decides to read to the agent's provider (Anthropic, OpenAI, Google...), through your own account.
- The agent writes changes without asking you. Cancel stops the process, but files it already wrote stay written. Use git or Obsidian's File recovery core plugin if you want to roll back.
- The permission rules above come from Claude Code, not from the operating system. The `claude` process runs as your user. If you add tools or widen the rules in Extra arguments, you lose that limit. Other agents have the limits listed in the table above.

## Install

You need the Obsidian desktop app and one of the agents above, installed and logged in. Run it once in a terminal first (for example `claude` or `codex`).

### Manual

1. Download `main.js`, `manifest.json` and `styles.css` from the [latest release](https://github.com/balalofernandez/obsidian-agent-prompt/releases/latest).
2. Copy them into `<your vault>/.obsidian/plugins/agent-prompt/`.
3. In Obsidian, open Settings → Community plugins and enable Agent Prompt.

### BRAT

Add `balalofernandez/obsidian-agent-prompt` as a beta plugin.

### From source

```bash
git clone https://github.com/balalofernandez/obsidian-agent-prompt && cd obsidian-agent-prompt
npm install && npm run build
mkdir -p "$VAULT/.obsidian/plugins/agent-prompt" && cp main.js manifest.json styles.css "$VAULT/.obsidian/plugins/agent-prompt/"
```

## Usage

| Command | Default hotkey |
| --- | --- |
| Agent Prompt: Run agent on selection / note | `Ctrl/Cmd+J` |
| Agent Prompt: Cancel running agent | none |

Change the hotkey in Settings → Hotkeys, or use the button in the plugin settings. While the agent runs, the status bar shows `🤖 Claude Code working…`. When it finishes, a notification shows the agent's summary.

## Settings

- CLI agent: the backend to use. Under it you see how far the plugin can limit that agent and a link to its docs.
- Executable: `claude` or an absolute path. Apps launched from a dock don't get your shell `PATH`, so the plugin adds `~/.local/bin`, `~/.claude/local`, `/usr/local/bin`, `/opt/homebrew/bin` and a few others. The Test button runs `--version`. On Windows the plugin resolves `.cmd` shims and escapes arguments with cross-spawn.
- Model, allowed tools, extra arguments: one set per agent. Each name in Allowed tools gets the `(./**)` vault scope unless you write your own rule, such as `Read(~/Templates/**)`.
- Timeout, extra instructions (appended to the system prompt), result notification on/off.

## Adding another agent

Implement `AgentRunner` in `src/agents/AgentRunner.ts`, add a file in `src/agents/` and register it in `src/agents/registry.ts`. `ClaudeCodeAgent.ts` and `CodexAgent.ts` are good examples.

```ts
export interface AgentRunner {
  id: string; displayName: string; defaultBinary: string; defaultAllowedTools: string;
  buildInvocation(req: AgentRequest, cfg: AgentConfig): { command: string; args: string[]; stdin?: string; env?: Record<string,string> };
  docsUrl: string; isolation: "vault" | "partial" | "none"; safetyNote: string; verified: boolean;
  versionArgs(): string[];
  parseResult(stdout: string, stderr: string, exitCode: number | null): { ok: boolean; summary: string };
}
```

`src/runProcess.ts` handles spawning, `PATH`, timeouts and cancellation for every agent. The settings dropdown lists every registered agent.

## Development and tests

```bash
npm run dev     # esbuild watch
npm run build   # typecheck + production bundle
npm test        # unit tests (vitest)
npm run e2e     # end-to-end in a real Obsidian
npm run smoke   # every installed agent CLI against a temp vault (or: npm run smoke -- codex gemini-cli)
```

`test/e2e/run.mjs` launches Obsidian with its own config folder (`XDG_CONFIG_HOME`) and a throwaway vault, installs the built plugin and connects through the Chrome DevTools Protocol with Playwright's `connectOverCDP`. It selects text, presses `Ctrl+J`, types a prompt and checks two cases on disk:

1. With a selection, the agent creates `Abejas.md` and replaces the selection in the original note with `[[Abejas]]`. The rest of the note stays the same.
2. With no selection, the agent fixes the spelling in a draft note.

Set `OBSIDIAN_BIN` to your Obsidian executable or AppImage. The default is `~/AppImages/obsidian.appimage`. The test calls the real agent twice and saves screenshots to `test/e2e/.run/screenshots/`.

## License

MIT
