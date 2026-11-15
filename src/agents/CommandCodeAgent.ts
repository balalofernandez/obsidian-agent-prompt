import { AgentConfig, AgentInvocation, AgentRequest, AgentResult, AgentRunner, splitArgs } from "./AgentRunner";

/**
 * Command Code: `command-code -p` (headless / print mode).
 * Docs: https://commandcode.ai/docs/core-concepts/headless
 *       https://commandcode.ai/docs/reference/cli
 *       https://commandcode.ai/docs/permissions
 *
 * Command shape (task on stdin, no query argument):
 *   command-code -p --output-format json --yolo [-m <model>]
 *
 * - The short binary `cmd` collides with cmd.exe on Windows, so the default
 *   is the full `command-code` name, which the docs say works everywhere.
 * - "Command Code auto-detects piped input when no query argument is provided."
 * - Headless mode blocks file writes, edits and shell unless `--yolo` is
 *   passed (`--permission-mode yolo`/`accept-edits` do not lift that block).
 *   `--yolo` bypasses prompts for everything, including shell; only deny
 *   rules in `.commandcode/settings.json` still apply. There is no CLI
 *   allow-list flag and no system prompt flag, so the system prompt is
 *   prepended to the task.
 * - `--output-format json` is NDJSON; the last line is
 *   {type:"result", subtype:"success"|"error"|"max_turns", finalText, error?}.
 */
export class CommandCodeAgent implements AgentRunner {
  id = "command-code";
  displayName = "Command Code";
  defaultBinary = "command-code";
  defaultAllowedTools = "";
  docsUrl = "https://commandcode.ai/docs/core-concepts/headless";
  isolation = "none" as const;
  safetyNote =
    "Headless edits need --yolo, which also allows shell commands and paths outside the vault, so only your own deny rules in .commandcode/settings.json limit it.";
  verified = false;

  buildInvocation(req: AgentRequest, cfg: AgentConfig): AgentInvocation {
    const args = ["-p", "--output-format", "json", "--yolo"];
    if (cfg.model.trim()) args.push("-m", cfg.model.trim());
    args.push(...splitArgs(cfg.extraArgs));
    return {
      command: cfg.binary.trim() || this.defaultBinary,
      args,
      stdin: `${req.systemPrompt}\n\n---\n\n${req.userPrompt}`,
    };
  }

  versionArgs(): string[] {
    return ["--version"];
  }

  parseResult(stdout: string, stderr: string, exitCode: number | null): AgentResult {
    const text = stdout.trim();
    const lines = text.split(/\r?\n/).reverse();
    let sawJson = false;
    for (const line of lines) {
      const s = line.trim();
      if (!s.startsWith("{")) continue;
      try {
        const json = JSON.parse(s);
        sawJson = true;
        if (json.type !== "result") continue;
        const final = typeof json.finalText === "string" ? json.finalText.trim() : "";
        const subtype = typeof json.subtype === "string" ? json.subtype : "unknown";
        const isError = subtype !== "success";
        const err =
          typeof json.error === "string" ? json.error : json.error?.message ? String(json.error.message) : "";
        return {
          ok: !isError && exitCode === 0,
          summary: isError ? (err || final || `Agent error (${subtype})`).slice(0, 500) : final || "Done.",
        };
      } catch {
        /* not JSON, keep looking */
      }
    }
    if (exitCode === 0) return { ok: true, summary: sawJson ? "Done." : text || "Done." };
    return { ok: false, summary: (stderr.trim() || (sawJson ? "" : text) || `Exited with code ${exitCode}`).slice(0, 500) };
  }
}
