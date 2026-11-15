import { AgentConfig, AgentInvocation, AgentRequest, AgentResult, AgentRunner, splitArgs } from "./AgentRunner";

/**
 * Cursor CLI (Cursor Agent), print mode.
 * Docs: https://cursor.com/docs/cli/headless
 *       https://cursor.com/docs/cli/reference/parameters
 *       https://cursor.com/docs/cli/reference/output-format
 *       https://cursor.com/docs/cli/reference/permissions
 *
 * Command shape:
 *   cursor-agent -p --output-format json --trust --sandbox enabled
 *     [--model <model>] "<system prompt + task>"
 *
 * The prompt is a positional argument (stdin is not documented as a prompt
 * source). There is no system prompt flag, so instructions are prepended.
 * Without `--force`, print mode writes files inside the workspace and rejects
 * anything that needs approval (writes outside the workspace, shell commands
 * that are not allow-listed and cannot run in the sandbox, web fetches).
 * Tool permissions (Shell(), Read(), Write(), WebFetch()) live only in
 * cli-config.json, there is no CLI flag, so allowedTools is ignored.
 * The installer also provides the binary as `agent`.
 */
export class CursorAgent implements AgentRunner {
  id = "cursor";
  displayName = "Cursor CLI";
  defaultBinary = "cursor-agent";
  defaultAllowedTools = "";
  docsUrl = "https://cursor.com/docs/cli/headless";
  isolation = "partial" as const;
  safetyNote =
    "Writes outside the vault and unapproved commands are rejected and shell runs in a sandbox, but file reads are not confined to the vault.";
  verified = false;

  buildInvocation(req: AgentRequest, cfg: AgentConfig): AgentInvocation {
    const args = ["-p", "--output-format", "json", "--trust", "--sandbox", "enabled"];
    if (cfg.model.trim()) args.push("--model", cfg.model.trim());
    args.push(...splitArgs(cfg.extraArgs));
    args.push(`${req.systemPrompt}\n\n---\n\n${req.userPrompt}`);
    return { command: cfg.binary.trim() || this.defaultBinary, args };
  }

  versionArgs(): string[] {
    return ["--version"];
  }

  parseResult(stdout: string, stderr: string, exitCode: number | null): AgentResult {
    const text = stdout.trim();
    // json: one object; stream-json (if set via extra args): take the last `result` event.
    let result: any = null;
    for (const line of text.split(/\r?\n/).reverse()) {
      const t = line.trim();
      if (!t.startsWith("{")) continue;
      try {
        const ev = JSON.parse(t);
        if (ev?.type === "result") {
          result = ev;
          break;
        }
      } catch {
        /* not JSON */
      }
    }
    if (!result && text.startsWith("{")) {
      try {
        result = JSON.parse(text);
      } catch {
        /* fall through */
      }
    }
    if (result && typeof result === "object") {
      const msg = typeof result.result === "string" ? result.result.trim() : "";
      const isError = result.is_error === true || (typeof result.subtype === "string" && result.subtype !== "success");
      const ok = !isError && exitCode === 0;
      if (ok) return { ok, summary: msg || "Done." };
      return { ok, summary: (stderr.trim() || msg || `Agent error (${result.subtype ?? exitCode})`).slice(0, 500) };
    }
    if (exitCode === 0) return { ok: true, summary: text || "Done." };
    return { ok: false, summary: (stderr.trim() || text || `Exited with code ${exitCode}`).slice(0, 500) };
  }
}
