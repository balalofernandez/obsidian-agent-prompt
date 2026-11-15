import { Editor, FileSystemAdapter, MarkdownView, Notice, Plugin } from "obsidian";
import { getAgent } from "./agents/registry";
import { buildUserPrompt, EditorContext } from "./context";
import { buildSystemPrompt } from "./prompt";
import { PromptModal } from "./PromptModal";
import { RunningProcess, runProcess } from "./runProcess";
import { AgentPromptSettings, AgentPromptSettingTab, agentEntry, DEFAULT_SETTINGS, detectInstalled } from "./settings";
import { AGENTS } from "./agents/registry";

export default class AgentPromptPlugin extends Plugin {
  settings!: AgentPromptSettings;
  private running: RunningProcess | null = null;
  private statusEl!: HTMLElement;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.statusEl = this.addStatusBarItem();

    this.addCommand({
      id: "run",
      name: "Run agent on selection / note",
      hotkeys: [{ modifiers: ["Mod"], key: "j" }],
      editorCallback: (editor, view) => {
        if (view instanceof MarkdownView) void this.openPrompt(editor, view);
      },
    });

    this.addCommand({
      id: "cancel",
      name: "Cancel running agent",
      checkCallback: (checking) => {
        if (!this.running) return false;
        if (!checking) this.running.cancel();
        return true;
      },
    });

    this.addSettingTab(new AgentPromptSettingTab(this.app, this));
    this.app.workspace.onLayoutReady(() => void this.chooseDefaultAgent());
  }

  /** First run: pick an installed agent (registry order) and tell the user. */
  private async chooseDefaultAgent(): Promise<void> {
    if (this.settings.agentChosen) return;
    const installed = detectInstalled(this.settings);
    const pick = AGENTS.find((a) => installed.has(a.id));
    if (!pick) {
      new Notice("Agent Prompt: no supported agent CLI found. Install one (e.g. Claude Code) or set its path in the plugin settings.", 15000);
      return;
    }
    this.settings.agentId = pick.id;
    this.settings.agentChosen = true;
    await this.saveSettings();
    const others = AGENTS.filter((a) => a !== pick && installed.has(a.id)).map((a) => a.displayName);
    new Notice(
      `Agent Prompt: using ${pick.displayName}.` + (others.length ? ` Also found: ${others.join(", ")}. Change it in the plugin settings.` : ""),
      10000,
    );
  }

  onunload(): void {
    this.running?.cancel();
  }

  vaultPath(): string {
    const adapter = this.app.vault.adapter;
    if (adapter instanceof FileSystemAdapter) return adapter.getBasePath();
    throw new Error("Agent Prompt requires the desktop app (filesystem vault).");
  }

  private async openPrompt(editor: Editor, view: MarkdownView): Promise<void> {
    const file = view.file;
    if (!file) return;
    if (this.running) {
      new Notice("Agent Prompt: an agent is already running. Use \"Cancel running agent\" to stop it.");
      return;
    }
    const cursor = editor.getCursor();
    const ctx: EditorContext = {
      notePath: file.path,
      noteTitle: file.basename,
      selection: editor.getSelection(),
      from: editor.getCursor("from"),
      to: editor.getCursor("to"),
      cursor,
      cursorLine: editor.getLine(cursor.line),
    };
    const label = ctx.selection
      ? `Selection in ${ctx.notePath}: "${ctx.selection.slice(0, 160)}${ctx.selection.length > 160 ? "…" : ""}"`
      : `No selection — acting on ${ctx.notePath} (cursor at line ${cursor.line + 1})`;

    new PromptModal(this.app, label, (prompt) => {
      void this.runAgent(prompt, ctx, view);
    }).open();
  }

  private async runAgent(prompt: string, ctx: EditorContext, view: MarkdownView): Promise<void> {
    // Flush unsaved editor changes so the agent reads the real file on disk.
    try {
      await view.save();
    } catch {
      /* ignore */
    }

    const runner = getAgent(this.settings.agentId);
    const entry = agentEntry(this.settings, runner.id);
    const vaultPath = this.vaultPath();
    const inv = runner.buildInvocation(
      {
        vaultPath,
        systemPrompt: buildSystemPrompt(this.settings.extraInstructions),
        userPrompt: buildUserPrompt(prompt, ctx),
      },
      entry,
    );

    this.setStatus(`🤖 ${runner.displayName} working…`);
    const started = new Notice(`🤖 ${runner.displayName} is working on: ${prompt.slice(0, 80)}`, 4000);
    const proc = runProcess({
      command: inv.command,
      args: inv.args,
      stdin: inv.stdin,
      env: inv.env,
      cwd: vaultPath,
      timeoutMs: this.settings.timeoutSeconds * 1000,
    });
    this.running = proc;

    try {
      const r = await proc.promise;
      started.hide();
      if (r.cancelled) {
        new Notice("Agent Prompt: cancelled.");
        return;
      }
      if (r.timedOut) {
        new Notice(`Agent Prompt: timed out after ${this.settings.timeoutSeconds}s.`, 8000);
        return;
      }
      const result = runner.parseResult(r.stdout, r.stderr, r.exitCode);
      console.log("[agent-prompt]", { exitCode: r.exitCode, result, stderr: r.stderr });
      if (!result.ok) new Notice(`❌ ${runner.displayName}: ${result.summary}`, 15000);
      else if (this.settings.showResultNotice) new Notice(`✅ ${result.summary}`, 8000);
    } finally {
      this.running = null;
      this.setStatus("");
    }
  }

  private setStatus(text: string): void {
    this.statusEl.setText(text);
    this.statusEl.toggleClass("agent-prompt-status-running", text.length > 0);
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    this.settings.agents = { ...(this.settings.agents ?? {}) };
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
