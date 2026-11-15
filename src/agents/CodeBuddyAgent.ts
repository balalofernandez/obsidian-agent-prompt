import { AgentConfig, AgentInvocation, AgentRequest, AgentResult, AgentRunner, splitArgs } from "./AgentRunner";

/**
 * CodeBuddy Code (Tencent), npm `@tencent-ai/codebuddy-code`.
 * Docs: https://www.workbuddy.ai/docs/cli/cli-reference
 *       https://www.workbuddy.ai/docs/cli/headless
 *       https://www.workbuddy.ai/docs/cli/permissions
 *
 * Command shape:
 *   codebuddy -p --output-format json --append-system-prompt <SYS>
 *             --permission-mode dontAsk
 *             [--tools Read,Write,Edit,... --allowedTools Read(./**) Edit(./**) ...]
 *             [--model <name>]   < task on stdin
 *
 * Mirrors Claude Code: `--tools` limits which tools exist (no Bash),
 * `--allowedTools Tool(./**)` pre-approves them only under cwd, and `dontAsk`
 * turns every remaining ask into a deny. JSON output carries `.result`.
 */
export class CodeBuddyAgent implements AgentRunner {
  id = "codebuddy";
  displayName = "CodeBuddy Code";
  defaultBinary = "codebuddy";
  defaultAllowedTools = "Read,Write,Edit,MultiEdit,Glob,Grep";
  docsUrl = "https://www.workbuddy.ai/docs/cli/headless";
  isolation = "partial" as const;
  safetyNote = "File tools are pre-approved only inside the vault and other asks are denied, but search tools need no approval and are not documented as confined.";
  verified = false;

  buildInvocation(req: AgentRequest, cfg: AgentConfig): AgentInvocation {
    const args = [
      "-p",
      "--output-format", "json",
      "--append-system-prompt", req.systemPrompt,
      "--permission-mode", "dontAsk",
    ];
    const tools = cfg.allowedTools.split(/[\s,]+/).filter(Boolean);
    if (tools.length) {
      args.push("--tools", tools.map((t) => t.replace(/\(.*$/, "")).join(","));
      args.push("--allowedTools", ...tools.map((t) => (t.includes("(") ? t : `${t}(./**)`)));
    }
    if (cfg.model.trim()) args.push("--model", cfg.model.trim());
    args.push(...splitArgs(cfg.extraArgs));
    return { command: cfg.binary.trim() || this.defaultBinary, args, stdin: req.userPrompt };
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
        const result = typeof json.result === "string" ? json.result.trim()
          : typeof json.response === "string" ? json.response.trim() : "";
        const isError = json.is_error === true || (typeof json.subtype === "string" && json.subtype.startsWith("error"));
        return {
          ok: !isError && exitCode === 0,
          summary: result || (isError ? `Agent error (${json.subtype ?? "unknown"})` : exitCode === 0 ? "Done." : (stderr.trim() || `Exited with code ${exitCode}`).slice(0, 500)),
        };
      } catch {
        /* fall through */
      }
    }
    if (exitCode === 0) return { ok: true, summary: text || "Done." };
    return { ok: false, summary: (stderr.trim() || text || `Exited with code ${exitCode}`).slice(0, 500) };
  }
}
