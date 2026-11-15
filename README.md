# Agent Prompt

Select text in Obsidian, press `Ctrl/Cmd+J`, write a prompt. [Claude Code](https://docs.claude.com/en/docs/claude-code) runs in your vault folder and edits the notes.

![result](docs/result.png)

## Requirements

- Obsidian desktop
- Claude Code installed and logged in (`claude` works in your terminal)

## Install

With [BRAT](https://github.com/TfTHacker/obsidian42-brat): *Add beta plugin* → `balalofernandez/obsidian-agent-prompt`.

Or manually:

1. Download `main.js`, `manifest.json` and `styles.css` from the [latest release](https://github.com/balalofernandez/obsidian-agent-prompt/releases/latest).
2. Put them in `<vault>/.obsidian/plugins/agent-prompt/`.
3. Settings → Community plugins → enable **Agent Prompt**.

## Usage

- With a selection: the prompt applies to the selected text.
- Without a selection: it applies to the current note.

Change the hotkey in Settings → Hotkeys. If `claude` isn't found, set its full path in the plugin settings.

## License

MIT
