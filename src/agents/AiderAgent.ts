import { AgentConfig, AgentInvocation, AgentRequest, AgentResult, AgentRunner, splitArgs } from "./AgentRunner";

/**
 * Aider (`aider`, pip package `aider-chat`), scripting mode.
 * Docs: https://aider.chat/docs/scripting.html
 *       https://aider.chat/docs/config/options.html
 *
 * Command shape:
 *   aider --message <SYS + task> --yes-always --no-git --no-auto-commits --no-dirty-commits
 *         --no-suggest-shell-commands --no-detect-urls --no-pretty --no-stream
 *         --no-fancy-input --no-check-update --no-show-model-warnings --no-analytics
 *         [--model <model>] [--file <active note>]
 *
 * Aider has no stdin prompt (only `--message` or `--message-file <path>`) and no
 * system prompt flag, so the Obsidian instructions are prepended to the message.
 * `--no-git` keeps it from touching any git repo (no commits at all).
 * `--yes-always` answers every confirmation, which would also run suggested shell
 * commands, so `--no-suggest-shell-commands` is mandatory.
 * Aider only edits files that are "in the chat", so the active note (parsed from
 * the task) is added with `--file`; with `--yes-always` it may add other files it
 * names. Output is plain text (its reply, edit blocks, "Applied edit to ..." lines).
 */
export class AiderAgent implements AgentRunner {
  id = "aider";
  displayName = "Aider";
  defaultBinary = "aider";
  defaultAllowedTools = "";
  docsUrl = "https://aider.chat/docs/scripting.html";
  isolation = "partial" as const;
  safetyNote = "Aider has no shell here and only edits files it adds to the chat, but nothing confines those paths to the vault.";
  verified = false;

  buildInvocation(req: AgentRequest, cfg: AgentConfig): AgentInvocation {
    const args = [
      "--message", `${req.systemPrompt}\n\n---\n\n${req.userPrompt}`,
      "--yes-always",
      "--no-git",
      "--no-auto-commits",
      "--no-dirty-commits",
      "--no-suggest-shell-commands",
      "--no-detect-urls",
      "--no-pretty",
      "--no-stream",
      "--no-fancy-input",
      "--no-check-update",
      "--no-show-model-warnings",
      "--no-analytics",
    ];
    if (cfg.model.trim()) args.push("--model", cfg.model.trim());
    const note = activeNote(req.userPrompt);
    if (note) args.push("--file", note);
    args.push(...splitArgs(cfg.extraArgs));
    return { command: cfg.binary.trim() || this.defaultBinary, args };
  }

  versionArgs(): string[] {
    return ["--version"];
  }

  parseResult(stdout: string, stderr: string, exitCode: number | null): AgentResult {
    const text = stdout.trim();
    if (exitCode !== 0) {
      return { ok: false, summary: (stderr.trim() || tail(text) || `Exited with code ${exitCode}`).slice(0, 500) };
    }
    const lines = text.split(/\r?\n/);
    const applied = lines.filter((l) => /^Applied edit to /.test(l.trim())).map((l) => l.trim());
    // Aider exits 0 on many API errors; surface them.
    const err = lines.find((l) => /^(litellm\.\w*Error|Error:|.*APIError|.*AuthenticationError)/.test(l.trim()));
    if (!applied.length && err) return { ok: false, summary: err.trim().slice(0, 500) };
    if (applied.length) return { ok: true, summary: applied.join("\n").slice(0, 500) };
    return { ok: true, summary: tail(text) || "Done." };
  }
}

/** The task built by `buildUserPrompt` names the note as: - Active note: `path` */
function activeNote(userPrompt: string): string | null {
  const m = /Active note: `([^`]+)`/.exec(userPrompt);
  return m ? m[1] : null;
}

function tail(text: string): string {
  return text.length > 500 ? "…" + text.slice(-499) : text;
}
