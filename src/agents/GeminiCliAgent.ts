import { AgentConfig, AgentInvocation, AgentRequest, AgentResult, AgentRunner, splitArgs } from "./AgentRunner";

/**
 * Google Gemini CLI, headless mode.
 * Docs: https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/headless.md
 *       https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/cli-reference.md
 *       https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/policy-engine.md
 *
 * Command shape:
 *   gemini --output-format json --approval-mode auto_edit [-m <model>]
 *     [--allowed-tools a,b]          (stdin: system prompt + task)
 *
 * Headless mode starts automatically when stdin/stdout are not a TTY.
 * Gemini CLI has no "append system prompt" flag (GEMINI_SYSTEM_MD replaces the
 * whole built-in prompt), so the Obsidian instructions are prepended to the task.
 * `auto_edit` auto-approves file edits. In non-interactive mode any tool call
 * that would ask for confirmation (shell, web fetch, ...) is denied.
 */
export class GeminiCliAgent implements AgentRunner {
  id = "gemini-cli";
  displayName = "Gemini CLI";
  defaultBinary = "gemini";
  /** `--allowed-tools` still works but is deprecated in favour of policy files. */
  defaultAllowedTools = "";
  docsUrl = "https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/headless.md";
  isolation = "partial" as const;
  safetyNote =
    "File edits are auto-approved and tools that need confirmation, like shell, are denied, but there is no OS sandbox keeping the agent inside the vault.";
  verified = false;

  buildInvocation(req: AgentRequest, cfg: AgentConfig): AgentInvocation {
    const args = ["--output-format", "json", "--approval-mode", "auto_edit"];
    if (cfg.model.trim()) args.push("--model", cfg.model.trim());
    const tools = cfg.allowedTools.split(/[\s,]+/).filter(Boolean);
    if (tools.length) args.push("--allowed-tools", tools.join(","));
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
    const start = text.indexOf("{");
    if (start >= 0) {
      try {
        const json = JSON.parse(text.slice(start));
        const response = typeof json.response === "string" ? json.response.trim() : "";
        const err = json.error ? String(json.error.message ?? json.error.type ?? "Agent error") : "";
        const ok = !err && exitCode === 0;
        if (ok) return { ok, summary: response || "Done." };
        return { ok, summary: (err || stderr.trim() || response || `Exited with code ${exitCode}`).slice(0, 500) };
      } catch {
        /* fall through */
      }
    }
    if (exitCode === 0) return { ok: true, summary: text || "Done." };
    return { ok: false, summary: (stderr.trim() || text || `Exited with code ${exitCode}`).slice(0, 500) };
  }
}
