import { AgentConfig, AgentInvocation, AgentRequest, AgentResult, AgentRunner, splitArgs } from "./AgentRunner";

/**
 * Atlassian Rovo Dev CLI: `acli rovodev run <instruction>` (non-interactive).
 * Docs: https://support.atlassian.com/rovo/docs/rovo-dev-cli-commands/
 *       https://support.atlassian.com/rovo/docs/manage-rovo-dev-cli-settings/
 *
 * Command shape (task as positional argument):
 *   acli rovodev run --yolo "<system prompt>\n\n---\n\n<task>"
 *
 * - `acli rovodev run [instruction]`: "Execute a single instruction
 *   (non-interactive mode)". Stdin input is not documented, so the prompt is
 *   passed as the last argument (very long prompts may hit OS argv limits).
 * - Without `--yolo`, file edits default to "ask" and the docs do not say how
 *   asks behave non-interactively, so `--yolo` is used. YOLO skips permission
 *   prompts for all tools, bash included.
 * - No CLI flag for model or system prompt (config.yml has `agent.modelId`
 *   and `agent.additionalSystemPrompt`); the system prompt is prepended.
 * - Output is plain terminal text; ANSI escapes are stripped when parsing.
 */
export class RovoDevAgent implements AgentRunner {
  id = "rovo-dev";
  displayName = "Rovo Dev (Atlassian)";
  defaultBinary = "acli";
  defaultAllowedTools = "";
  docsUrl = "https://support.atlassian.com/rovo/docs/rovo-dev-cli-commands/";
  isolation = "none" as const;
  safetyNote =
    "Runs in YOLO mode, which approves every tool including bash without asking, so it has your user's full permissions.";
  verified = false;

  buildInvocation(req: AgentRequest, cfg: AgentConfig): AgentInvocation {
    const args = ["rovodev", "run", "--yolo", ...splitArgs(cfg.extraArgs)];
    // No model flag exists; cfg.model is ignored (set agent.modelId in ~/.rovodev/config.yml).
    args.push(`${req.systemPrompt}\n\n---\n\n${req.userPrompt}`);
    return { command: cfg.binary.trim() || this.defaultBinary, args };
  }

  versionArgs(): string[] {
    return ["--version"];
  }

  parseResult(stdout: string, stderr: string, exitCode: number | null): AgentResult {
    // eslint-disable-next-line no-control-regex
    const strip = (s: string) => s.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "").replace(/\r/g, "").trim();
    const text = strip(stdout);
    if (exitCode === 0) return { ok: true, summary: (text.length > 2000 ? "…" + text.slice(-2000) : text) || "Done." };
    return { ok: false, summary: (strip(stderr) || text || `Exited with code ${exitCode}`).slice(0, 500) };
  }
}
