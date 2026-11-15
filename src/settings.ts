import { App, Notice, PluginSettingTab, Setting } from "obsidian";
import { AGENTS, DEFAULT_AGENT_ID, getAgent } from "./agents/registry";
import { runProcess } from "./runProcess";
import type AgentPromptPlugin from "./main";

export interface AgentSettingsEntry {
  binary: string;
  model: string;
  allowedTools: string;
  extraArgs: string;
}

export interface AgentPromptSettings {
  agentId: string;
  /** Per-agent configuration, keyed by agent id. */
  agents: Record<string, AgentSettingsEntry>;
  timeoutSeconds: number;
  extraInstructions: string;
  showResultNotice: boolean;
}

export const DEFAULT_SETTINGS: AgentPromptSettings = {
  agentId: DEFAULT_AGENT_ID,
  agents: {},
  timeoutSeconds: 300,
  extraInstructions: "",
  showResultNotice: true,
};

export function agentEntry(settings: AgentPromptSettings, agentId: string): AgentSettingsEntry {
  const runner = getAgent(agentId);
  const existing = settings.agents[agentId];
  if (existing) return existing;
  const fresh: AgentSettingsEntry = {
    binary: runner.defaultBinary,
    model: "",
    allowedTools: runner.defaultAllowedTools,
    extraArgs: "",
  };
  settings.agents[agentId] = fresh;
  return fresh;
}

export class AgentPromptSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: AgentPromptPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    const s = this.plugin.settings;
    containerEl.empty();

    new Setting(containerEl).setName("Hotkey").setHeading();
    new Setting(containerEl)
      .setName("Shortcut")
      .setDesc("Default: Ctrl/Cmd+J. Change it in Settings → Hotkeys (search \"Agent Prompt\").")
      .addButton((b) =>
        b.setButtonText("Configure hotkey").onClick(() => this.openHotkeys()),
      );

    new Setting(containerEl).setName("Agent").setHeading();
    new Setting(containerEl)
      .setName("CLI agent")
      .setDesc("Command-line agent that runs the task inside the vault folder.")
      .addDropdown((d) => {
        for (const a of AGENTS) d.addOption(a.id, a.displayName + (a.verified ? "" : " (beta)"));
        d.setValue(s.agentId).onChange(async (v) => {
          s.agentId = v;
          await this.plugin.saveSettings();
          this.display();
        });
      });

    const runner = getAgent(s.agentId);
    const entry = agentEntry(s, s.agentId);
    const badge = { vault: "🔒 Limited to the vault", partial: "⚠️ Partially restricted", none: "⚠️ Full user permissions" }[runner.isolation];
    const info = containerEl.createDiv({ cls: "setting-item-description agent-prompt-safety" });
    info.createSpan({ text: `${badge}${runner.verified ? "" : " · not tested end to end yet"}. ${runner.safetyNote} ` });
    info.createEl("a", { text: "Docs", href: runner.docsUrl });

    new Setting(containerEl)
      .setName("Executable")
      .setDesc(`Command name or absolute path (default "${runner.defaultBinary}").`)
      .addText((t) =>
        t.setPlaceholder(runner.defaultBinary).setValue(entry.binary).onChange(async (v) => {
          entry.binary = v;
          await this.plugin.saveSettings();
        }),
      )
      .addButton((b) =>
        b.setButtonText("Test").onClick(async () => {
          const r = await runProcess({
            command: entry.binary.trim() || runner.defaultBinary,
            args: runner.versionArgs(),
            cwd: this.plugin.vaultPath(),
            timeoutMs: 15000,
          }).promise;
          if (r.exitCode === 0) new Notice(`✅ ${runner.displayName}: ${r.stdout.trim()}`);
          else new Notice(`❌ Could not run ${runner.displayName}: ${(r.stderr || r.stdout).trim().slice(0, 300)}`, 10000);
        }),
      );

    new Setting(containerEl)
      .setName("Model")
      .setDesc("Optional model override (e.g. sonnet, opus). Empty = agent default.")
      .addText((t) =>
        t.setValue(entry.model).onChange(async (v) => {
          entry.model = v;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Allowed tools")
      .setDesc(`Tools the agent may use without asking. Default: ${runner.defaultAllowedTools}`)
      .addText((t) =>
        t.setValue(entry.allowedTools).onChange(async (v) => {
          entry.allowedTools = v;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Extra arguments")
      .setDesc("Additional raw CLI arguments.")
      .addText((t) =>
        t.setValue(entry.extraArgs).onChange(async (v) => {
          entry.extraArgs = v;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl).setName("Behaviour").setHeading();
    new Setting(containerEl)
      .setName("Timeout (seconds)")
      .addText((t) =>
        t.setValue(String(s.timeoutSeconds)).onChange(async (v) => {
          const n = parseInt(v, 10);
          if (!isNaN(n) && n > 0) {
            s.timeoutSeconds = n;
            await this.plugin.saveSettings();
          }
        }),
      );

    new Setting(containerEl)
      .setName("Extra instructions")
      .setDesc("Appended to the system prompt on every run (style, folders for new notes, language...).")
      .addTextArea((t) =>
        t.setValue(s.extraInstructions).onChange(async (v) => {
          s.extraInstructions = v;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Show result notification")
      .addToggle((t) =>
        t.setValue(s.showResultNotice).onChange(async (v) => {
          s.showResultNotice = v;
          await this.plugin.saveSettings();
        }),
      );
  }

  private openHotkeys(): void {
    // Uses Obsidian's (undocumented) settings API; falls back to a hint.
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const setting = (this.app as any).setting;
      setting.open();
      const tab = setting.openTabById("hotkeys");
      tab?.searchComponent?.setValue?.("Agent Prompt");
      tab?.updateHotkeyVisibility?.();
    } catch {
      new Notice("Open Settings → Hotkeys and search for \"Agent Prompt\".");
    }
  }
}
