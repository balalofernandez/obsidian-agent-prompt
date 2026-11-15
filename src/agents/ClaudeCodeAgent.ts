import { AgentConfig, AgentInvocation, AgentRequest, AgentResult, AgentRunner, splitArgs } from "./AgentRunner";

/**
 * Claude Code: `claude -p` (print / headless mode).
 * The task is sent through stdin so arbitrary prompt length/characters are safe
 * and the variadic `--allowedTools` flag can't swallow it.
 */
export class ClaudeCodeAgent implements AgentRunner {
  id = "claude-code";
  displayName = "Claude Code";
  defaultBinary = "claude";
  defaultAllowedTools = "Read,Write,Edit,MultiEdit,Glob,Grep,LS";

  buildInvocation(req: AgentRequest, cfg: AgentConfig): AgentInvocation {
    const args = [
      "-p",
      "--output-format", "json",
      "--append-system-prompt", req.systemPrompt,
    ];
    // `--tools` limits which tools exist at all (no Bash, no web).
    // `--allowedTools Tool(./**)` pre-approves them only for paths inside the
    // vault (cwd). Anything else needs approval, which `-p` mode denies.
    const tools = cfg.allowedTools.split(/[\s,]+/).filter(Boolean);
    if (tools.length) {
      args.push("--tools", ...tools);
      args.push("--allowedTools", ...tools.map((t) => (t.includes("(") ? t : `${t}(./**)`)));
    }
    if (cfg.model.trim()) args.push("--model", cfg.model.trim());
    args.push(...splitArgs(cfg.extraArgs));
    return {
      command: cfg.binary.trim() || this.defaultBinary,
      args,
      stdin: req.userPrompt,
    };
  }

  versionArgs(): string[] {
    return ["--version"];
  }

  parseResult(stdout: string, stderr: string, exitCode: number | null): AgentResult {
    const text = stdout.trim();
    // --output-format json prints one JSON object; be tolerant to leading noise.
    const start = text.indexOf("{");
    if (start >= 0) {
      try {
        const json = JSON.parse(text.slice(start));
        const result = typeof json.result === "string" ? json.result.trim() : "";
        const isError = json.is_error === true || json.subtype?.startsWith?.("error");
        return {
          ok: !isError && exitCode === 0,
          summary: result || (isError ? `Agent error (${json.subtype ?? "unknown"})` : "Done."),
        };
      } catch {
        /* fall through */
      }
    }
    if (exitCode === 0) return { ok: true, summary: text || "Done." };
    return { ok: false, summary: (stderr.trim() || text || `Exited with code ${exitCode}`).slice(0, 500) };
  }
}
