import { AgentConfig, AgentInvocation, AgentRequest, AgentResult, AgentRunner, splitArgs } from "./AgentRunner";

/**
 * Auggie CLI (Augment Code), 1.x flags.
 * Docs: https://docs.augmentcode.com/cli/reference
 *
 * Command shape:
 *   auggie --print --no-session --append-system-prompt <SYS>
 *          [--tools read,edit,write,grep,find,ls --permission edit:allow ...]
 *          [--model <name>] <task>
 *
 * Stdin is only treated as extra context next to the instruction, so the task
 * is passed as the positional instruction. `--tools` limits which built-in
 * tools exist (no bash) and `--permission <tool>:allow` pre-approves them,
 * since `ask-user` rules are denied without a UI. Default text output is the
 * final response followed by a `Request ID` line, which is stripped.
 * Note: print mode may be disabled on some enterprise plans.
 */
export class AuggieAgent implements AgentRunner {
  id = "auggie";
  displayName = "Auggie (Augment Code)";
  defaultBinary = "auggie";
  defaultAllowedTools = "read,edit,write,grep,find,ls";
  docsUrl = "https://docs.augmentcode.com/cli/reference";
  isolation = "partial" as const;
  safetyNote = "Only the listed tools exist, so shell is off by default, but Auggie does not confine file tools to the vault.";
  verified = false;

  buildInvocation(req: AgentRequest, cfg: AgentConfig): AgentInvocation {
    const args = ["--print", "--no-session", "--append-system-prompt", req.systemPrompt];
    const tools = cfg.allowedTools.split(/[\s,]+/).filter(Boolean);
    if (tools.length) {
      args.push("--tools", tools.join(","));
      for (const t of tools) args.push("--permission", `${t}:allow`);
    }
    if (cfg.model.trim()) args.push("--model", cfg.model.trim());
    args.push(...splitArgs(cfg.extraArgs));
    args.push(req.userPrompt);
    return { command: cfg.binary.trim() || this.defaultBinary, args };
  }

  versionArgs(): string[] {
    return ["--version"];
  }

  parseResult(stdout: string, stderr: string, exitCode: number | null): AgentResult {
    const text = stdout
      .split(/\r?\n/)
      .filter((l) => !/^\s*(--\s*)?Request ID:/i.test(l))
      .join("\n")
      .trim();
    if (exitCode === 0) return { ok: true, summary: text || "Done." };
    return { ok: false, summary: (stderr.trim() || text || `Exited with code ${exitCode}`).slice(0, 500) };
  }
}
