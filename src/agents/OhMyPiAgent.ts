import { AgentConfig, AgentInvocation, AgentRequest, AgentResult, AgentRunner, splitArgs } from "./AgentRunner";

/**
 * oh-my-pi (`omp`), a fork of Pi by can1357. https://github.com/can1357/oh-my-pi
 * Docs: https://omp.sh/docs/cli
 *
 * Command shape:
 *   omp -p --no-session --auto-approve --append-system-prompt <SYS>
 *       [--tools read,write,edit,grep,glob] [--model <id>]   < task on stdin
 *
 * omp reads stdin automatically when it is not a TTY. Print mode cannot answer
 * approval prompts, so `--auto-approve` is passed; `--tools` keeps the set of
 * available tools to file tools (no bash). Default text mode prints the final
 * assistant text, which is used as the summary.
 */
export class OhMyPiAgent implements AgentRunner {
  id = "oh-my-pi";
  displayName = "oh-my-pi (omp)";
  defaultBinary = "omp";
  defaultAllowedTools = "read,write,edit,grep,glob";
  docsUrl = "https://omp.sh/docs/cli";
  isolation = "partial" as const;
  safetyNote = "Only the listed tools are enabled and all of them are auto-approved, and omp does not confine file access to the vault.";
  verified = false;

  buildInvocation(req: AgentRequest, cfg: AgentConfig): AgentInvocation {
    const args = ["-p", "--no-session", "--auto-approve", "--append-system-prompt", req.systemPrompt];
    const tools = cfg.allowedTools.split(/[\s,]+/).filter(Boolean);
    if (tools.length) args.push("--tools", tools.join(","));
    if (cfg.model.trim()) args.push("--model", cfg.model.trim());
    args.push(...splitArgs(cfg.extraArgs));
    return { command: cfg.binary.trim() || this.defaultBinary, args, stdin: req.userPrompt };
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
