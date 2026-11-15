import { AgentConfig, AgentInvocation, AgentRequest, AgentResult, AgentRunner, splitArgs } from "./AgentRunner";

/**
 * Hermes Agent (Nous Research). https://github.com/NousResearch/hermes-agent
 * Docs: https://hermes-agent.nousresearch.com/docs/reference/cli-commands
 *
 * Command shape:
 *   hermes chat --oneshot -Q --query-file - [--toolsets file] [-m <model>]   < SYS + task on stdin
 *
 * `--query-file -` reads the query from stdin; `--oneshot` answers and exits;
 * `-Q` prints only the final reply (no banner, spinner or tool previews).
 * Hermes has no system prompt flag, so the Obsidian instructions are prepended
 * to the task. Restricting toolsets to `file` leaves out the terminal toolset,
 * whose dangerous commands would need approval. Exit codes: 0 done,
 * 1 done without text, 2 failed or partial, 130 interrupted.
 */
export class HermesAgent implements AgentRunner {
  id = "hermes";
  displayName = "Hermes Agent";
  defaultBinary = "hermes";
  defaultAllowedTools = "file";
  docsUrl = "https://hermes-agent.nousresearch.com/docs/reference/cli-commands";
  isolation = "partial" as const;
  safetyNote = "Only the listed toolsets are enabled, so shell is off with the default file toolset, but Hermes does not confine file tools to the vault.";
  verified = false;

  buildInvocation(req: AgentRequest, cfg: AgentConfig): AgentInvocation {
    const args = ["chat", "--oneshot", "-Q", "--query-file", "-"];
    const toolsets = cfg.allowedTools.split(/[\s,]+/).filter(Boolean);
    if (toolsets.length) args.push("--toolsets", toolsets.join(","));
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
    if (exitCode === 0 || exitCode === 1) return { ok: true, summary: text || "Done." };
    return { ok: false, summary: (stderr.trim() || text || `Exited with code ${exitCode}`).slice(0, 500) };
  }
}
