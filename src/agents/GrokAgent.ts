import { AgentConfig, AgentInvocation, AgentRequest, AgentResult, AgentRunner, splitArgs } from "./AgentRunner";

/**
 * xAI Grok Build CLI (`grok`), headless mode.
 * Docs: https://docs.x.ai/build/cli/headless-scripting
 *       https://docs.x.ai/build/cli/reference
 *       https://docs.x.ai/build/features/permissions
 *       https://docs.x.ai/build/features/sandbox
 *       https://docs.x.ai/build/enterprise#permissions
 *
 * Command shape:
 *   grok --no-auto-update -p "<task>" --rules "<system prompt>"
 *     --output-format json --permission-mode dontAsk
 *     --allow Read --allow Grep --allow Edit
 *     --sandbox strict --disable-web-search [-m <model>]
 *
 * `--rules` appends to the built-in system prompt. `dontAsk` silently denies
 * any tool call without an explicit `--allow` rule (no shell, no web fetch).
 * The `strict` sandbox profile (Landlock on Linux, Seatbelt on macOS) limits
 * reads to the cwd and system paths, writes to the cwd, ~/.grok and temp, and
 * blocks child network on Linux. The JSON output schema is not documented, so
 * parsing is defensive.
 */
export class GrokAgent implements AgentRunner {
  id = "grok";
  displayName = "Grok Build (xAI)";
  defaultBinary = "grok";
  /** Permission rule filters: Bash, Edit, Read, Grep, MCPTool, WebFetch, WebSearch (optionally `Tool(pattern)`). */
  defaultAllowedTools = "Read,Grep,Edit";
  docsUrl = "https://docs.x.ai/build/cli/headless-scripting";
  isolation = "partial" as const;
  safetyNote =
    "Only allow-listed tools run and an OS sandbox limits file access to the vault on Linux and macOS, but there is no sandbox on Windows.";
  verified = false;

  buildInvocation(req: AgentRequest, cfg: AgentConfig): AgentInvocation {
    const args = [
      "--no-auto-update",
      "-p", req.userPrompt,
      "--rules", req.systemPrompt,
      "--output-format", "json",
      "--permission-mode", "dontAsk",
    ];
    // Split on commas/whitespace that are not inside parentheses (e.g. Bash(git *)).
    const tools = cfg.allowedTools.split(/[,\n](?![^(]*\))/).map((t) => t.trim()).filter(Boolean);
    for (const t of tools) args.push("--allow", t);
    args.push("--sandbox", "strict", "--disable-web-search");
    if (cfg.model.trim()) args.push("--model", cfg.model.trim());
    args.push(...splitArgs(cfg.extraArgs));
    return { command: cfg.binary.trim() || this.defaultBinary, args };
  }

  versionArgs(): string[] {
    return ["--version"];
  }

  parseResult(stdout: string, stderr: string, exitCode: number | null): AgentResult {
    const text = stdout.trim();
    let json: any = null;
    const start = text.indexOf("{");
    if (start >= 0) {
      try {
        json = JSON.parse(text.slice(start));
      } catch {
        // Maybe streaming-json: use the last parseable line.
        for (const line of text.split(/\r?\n/).reverse()) {
          try {
            json = JSON.parse(line.trim());
            break;
          } catch {
            /* keep looking */
          }
        }
      }
    }
    if (json && typeof json === "object") {
      const msg = pickText(json);
      const err = json.is_error === true || json.error ? String(json.error?.message ?? json.error ?? "Agent error") : "";
      const ok = !err && exitCode === 0;
      if (ok) return { ok, summary: msg || "Done." };
      return { ok, summary: (err || stderr.trim() || msg || `Exited with code ${exitCode}`).slice(0, 500) };
    }
    if (exitCode === 0) return { ok: true, summary: text || "Done." };
    return { ok: false, summary: (stderr.trim() || text || `Exited with code ${exitCode}`).slice(0, 500) };
  }
}

/** Best effort: the final answer under one of the usual field names. */
function pickText(json: any): string {
  for (const k of ["result", "response", "text", "output", "message", "content"]) {
    const v = json[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (v && typeof v === "object") {
      const inner = pickText(v);
      if (inner) return inner;
    }
    if (Array.isArray(v)) {
      const parts = v.map((p: any) => (typeof p === "string" ? p : p?.text ?? "")).join("").trim();
      if (parts) return parts;
    }
  }
  return "";
}
