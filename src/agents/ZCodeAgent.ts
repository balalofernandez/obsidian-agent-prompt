import { AgentConfig, AgentInvocation, AgentRequest, AgentResult, AgentRunner, splitArgs } from "./AgentRunner";

/**
 * Z.ai ZCode Agent CLI (`zcode`), non-interactive `--prompt` mode.
 * Docs: https://github.com/zai-org/ZCode/blob/main/apps/zcode-cli/docs/usage/02-cli-reference.md
 *       https://github.com/zai-org/ZCode/blob/main/apps/zcode-cli/docs/usage/05-permissions.md
 *       https://github.com/zai-org/ZCode/blob/main/apps/zcode-cli/docs/usage/04-tools.md
 *
 * Command shape:
 *   zcode --prompt "<system prompt + task>" --cwd <vault> --mode edit
 *         --output-format json --no-color
 *         --disallowed-tools "Bash,WebSearch,WebFetch,AskUserQuestion,EnterPlanMode,ExitPlanMode"
 *
 * `--prompt` must carry the text (no stdin, no bare positional). There is no
 * system-prompt flag, so it is prepended. `--prompt` defaults to `--mode yolo`,
 * so `edit` is passed explicitly: workspace file edits are approved, everything
 * else follows `build` rules and fails because headless has no approval client.
 * The docs say not to use `--model`; the model comes from
 * ~/.zcode/v2/provider_config.json, so `cfg.model` is ignored.
 * JSON output (fields may vary by build):
 *   {"sessionId","traceId","response","eventCount","projection":{...}}
 * `stream-json` ends with a `type: "result"` line.
 */
const DISALLOWED = ["Bash", "WebSearch", "WebFetch", "AskUserQuestion", "EnterPlanMode", "ExitPlanMode"];

export class ZCodeAgent implements AgentRunner {
  id = "zcode";
  displayName = "ZCode (Z.ai)";
  defaultBinary = "zcode";
  defaultAllowedTools = "";
  docsUrl = "https://github.com/zai-org/ZCode/blob/main/apps/zcode-cli/docs/usage/02-cli-reference.md";
  isolation = "partial" as const;
  safetyNote =
    "Shell and web tools are removed and only workspace edits are auto-approved, but this is not an OS sandbox and the agent may read files outside the vault.";
  verified = false;

  buildInvocation(req: AgentRequest, cfg: AgentConfig): AgentInvocation {
    const args = [
      "--prompt", `${req.systemPrompt}\n\n---\n\n${req.userPrompt}`,
      "--cwd", req.vaultPath,
      "--mode", "edit",
      "--output-format", "json",
      "--no-color",
      "--disallowed-tools", DISALLOWED.join(","),
      ...splitArgs(cfg.extraArgs),
    ];
    return { command: cfg.binary.trim() || this.defaultBinary, args };
  }

  versionArgs(): string[] {
    return ["--version"];
  }

  parseResult(stdout: string, stderr: string, exitCode: number | null): AgentResult {
    const text = stdout.trim();
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
      if (!json || typeof json !== "object") continue;
      const response =
        typeof json.response === "string" ? json.response.trim()
        : typeof json.result === "string" ? json.result.trim()
        : "";
      const isResult = "response" in json || json.type === "result";
      if (!isResult) continue;
      const err = typeof json.error === "string" ? json.error : json.error?.message;
      const ok = exitCode === 0 && !err && json.is_error !== true;
      if (ok) return { ok, summary: response || "Done." };
      return { ok: false, summary: String(err || stderr.trim() || response || `Exited with code ${exitCode}`).slice(0, 500) };
    }
    if (exitCode === 0) return { ok: true, summary: text || "Done." };
    return { ok: false, summary: (stderr.trim() || text || `Exited with code ${exitCode}`).slice(0, 500) };
  }
}
