import { AgentConfig, AgentInvocation, AgentRequest, AgentResult, AgentRunner, splitArgs } from "./AgentRunner";

/**
 * OpenClaude (`openclaude`, npm `@twigpine/openclaude`, formerly
 * `@gitlawb/openclaude`), a multi-provider fork of the Claude Code CLI.
 * Docs: https://github.com/Twigpine/openclaude (README + `src/main.tsx` option list)
 *
 * Command shape (same flags as `claude -p`):
 *   openclaude -p --output-format json --append-system-prompt "<system prompt>"
 *     --tools Read Edit ... --allowedTools "Read(./**)" "Edit(./**)" ...
 *     [--model <model>]          (task on stdin)
 *
 * The provider is picked from env vars / settings, or with `--provider <name>`
 * through extra args. `--output-format json` prints one
 * `{"type":"result","is_error":...,"result":"..."}` object.
 */
export class OpenClaudeAgent implements AgentRunner {
  id = "openclaude";
  displayName = "OpenClaude";
  defaultBinary = "openclaude";
  defaultAllowedTools = "Read,Write,Edit,MultiEdit,Glob,Grep,LS";
  docsUrl = "https://github.com/Twigpine/openclaude";
  isolation = "partial" as const;
  safetyNote =
    "Only file tools are enabled and pre-approved for paths inside the vault, using Claude Code's permission rules, but this fork's confinement has not been verified.";
  verified = false;

  buildInvocation(req: AgentRequest, cfg: AgentConfig): AgentInvocation {
    const args = [
      "-p",
      "--output-format", "json",
      "--append-system-prompt", req.systemPrompt,
    ];
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
    // json = one object; stream-json (via extra args) ends with a `result` line.
    const candidates = [text, ...text.split(/\r?\n/).reverse()];
    for (const c of candidates) {
      const start = c.indexOf("{");
      if (start < 0) continue;
      let json: any;
      try {
        json = JSON.parse(c.slice(start));
      } catch {
        continue;
      }
      if (!json || typeof json !== "object" || (json.type !== "result" && !("result" in json) && !("is_error" in json))) continue;
      const result = typeof json.result === "string" ? json.result.trim() : "";
      const isError = json.is_error === true || json.subtype?.startsWith?.("error");
      const ok = !isError && exitCode === 0;
      if (ok) return { ok, summary: result || "Done." };
      return {
        ok: false,
        summary: (result || (isError ? `Agent error (${json.subtype ?? "unknown"})` : "") || stderr.trim() || `Exited with code ${exitCode}`).slice(0, 500),
      };
    }
    if (exitCode === 0) return { ok: true, summary: text || "Done." };
    return { ok: false, summary: (stderr.trim() || text || `Exited with code ${exitCode}`).slice(0, 500) };
  }
}
