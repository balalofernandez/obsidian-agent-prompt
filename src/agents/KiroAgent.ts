import { AgentConfig, AgentInvocation, AgentRequest, AgentResult, AgentRunner, splitArgs } from "./AgentRunner";

/**
 * Kiro CLI (AWS): `kiro-cli chat --no-interactive` (headless mode).
 * Docs: https://kiro.dev/docs/cli/headless/
 *       https://kiro.dev/docs/reference/cli-commands/
 *       https://kiro.dev/docs/reference/built-in-tools/
 *
 * Command shape (task on stdin):
 *   kiro-cli chat --no-interactive --wrap never --trust-tools=<ids> [--model <id>]
 *
 * - "When stdin is piped and no positional argument is given, Kiro reads the
 *   full stream as the instruction."
 * - Headless runs need the KIRO_API_KEY environment variable (set it in the
 *   environment Obsidian is launched from).
 * - `--trust-tools` pre-approves only the listed tools. Defaults use the
 *   CLI 2.x / V2 names (read, write, glob, grep), which V3 also accepts from
 *   3.3.0 on. Untrusted tools (e.g. `shell`) cannot be approved headless.
 * - No system prompt flag: it is prepended to the task.
 * - Plain text output (stream-json exists but its schema is undocumented);
 *   ANSI escapes are stripped when parsing.
 */
export class KiroAgent implements AgentRunner {
  id = "kiro";
  displayName = "Kiro CLI";
  defaultBinary = "kiro-cli";
  defaultAllowedTools = "read,write,glob,grep";
  docsUrl = "https://kiro.dev/docs/cli/headless/";
  isolation = "partial" as const;
  safetyNote =
    "Only the listed tools are pre-approved and shell is left out, but Kiro does not limit the write tool to the vault by default.";
  verified = false;

  buildInvocation(req: AgentRequest, cfg: AgentConfig): AgentInvocation {
    const args = ["chat", "--no-interactive", "--wrap", "never"];
    const tools = cfg.allowedTools.split(/[\s,]+/).filter(Boolean);
    if (tools.length) args.push(`--trust-tools=${tools.join(",")}`);
    if (cfg.model.trim()) args.push("--model", cfg.model.trim());
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
    // eslint-disable-next-line no-control-regex
    const strip = (s: string) => s.replace(/\x1b\[[0-9;?]*[ -/]*[@-~]/g, "").replace(/\r/g, "").trim();
    const text = strip(stdout);
    if (exitCode === 0) return { ok: true, summary: (text.length > 2000 ? "…" + text.slice(-2000) : text) || "Done." };
    const err = strip(stderr);
    let summary = err || text || `Exited with code ${exitCode}`;
    if (exitCode === 3) summary = `MCP server failed to start. ${summary}`;
    if (exitCode === 4) summary = `Requested agent is not available. ${summary}`;
    return { ok: false, summary: summary.slice(0, 500) };
  }
}
