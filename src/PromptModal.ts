import { App, Modal } from "obsidian";

export class PromptModal extends Modal {
  private submitted = false;

  constructor(
    app: App,
    private contextLabel: string,
    private onSubmit: (prompt: string) => void,
  ) {
    super(app);
  }

  onOpen(): void {
    this.modalEl.addClass("agent-prompt-modal");
    this.titleEl.setText("Ask the agent");
    const { contentEl } = this;
    contentEl.createDiv({ cls: "agent-prompt-context", text: this.contextLabel });
    const textarea = contentEl.createEl("textarea", {
      attr: { placeholder: "e.g. Redáctame esto en una nueva página", rows: "4" },
    });
    contentEl.createDiv({
      cls: "agent-prompt-hint",
      text: "Enter to run in background · Shift+Enter for a new line · Esc to cancel",
    });
    textarea.addEventListener("keydown", (ev: KeyboardEvent) => {
      if (ev.key === "Enter" && !ev.shiftKey && !ev.isComposing) {
        ev.preventDefault();
        const value = textarea.value.trim();
        if (!value || this.submitted) return;
        this.submitted = true;
        this.close();
        this.onSubmit(value);
      }
    });
    window.setTimeout(() => textarea.focus(), 0);
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
