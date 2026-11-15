import { AgentConfig, AgentInvocation, AgentRequest, AgentResult, AgentRunner, splitArgs } from "./AgentRunner";

/**
 * Devin CLI, local agent mode (not `--cloud`, which runs in a remote VM).
 * Docs: https://docs.devin.ai/cli/reference/commands
 *
 * Command shape:
 *   devin --permission-mode accept-edits --respect-workspace-trust false
 *         [--model <model>] -p -- <SYS + task>
 *
 * `-p/--print` runs one turn and prints the response. Stdin input for `-p` is
 * not documented, so the prompt is passed as a positional argument after `--`.
 * There is no system prompt flag, so the Obsidian instructions are prepended.
 * `accept-edits` auto-approves file edits inside the workspace (cwd) and keeps
 * prompting for shell commands, which cannot be answered in print mode.
 * Print mode fails in an untrusted directory unless workspace trust is skipped.
 * Output is plain text.
 */
export class DevinAgent implements AgentRunner {
  id = "devin";
  displayName = "Devin CLI";
  defaultBinary = "devin";
  defaultAllowedTools = "";
  docsUrl = "https://docs.devin.ai/cli/reference/commands";
  isolation = "partial" as const;
  safetyNote = "Accept-edits mode auto-approves edits inside the vault and asks for anything else, but how print mode handles those asks is not documented.";
  verified = false;

  buildInvocation(req: AgentRequest, cfg: AgentConfig): AgentInvocation {
    const args = ["--permission-mode", "accept-edits", "--respect-workspace-trust", "false"];
    if (cfg.model.trim()) args.push("--model", cfg.model.trim());
    args.push(...splitArgs(cfg.extraArgs));
    args.push("-p", "--", `${req.systemPrompt}\n\n---\n\n${req.userPrompt}`);
    return { command: cfg.binary.trim() || this.defaultBinary, args };
  }

  versionArgs(): string[] {
    return ["--version"];
  }

  parseResult(stdout: string, stderr: string, exitCode: number | null): AgentResult {
    const text = stdout.trim();
    if (exitCode === 0) return { ok: true, summary: text || "Done." };
    return { ok: false, summary: (stderr.trim() || text || `Exited with code ${exitCode}`).slice(0, 500) };
  }
}
