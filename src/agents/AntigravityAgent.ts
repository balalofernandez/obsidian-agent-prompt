import { AgentConfig, AgentInvocation, AgentRequest, AgentResult, AgentRunner, splitArgs } from "./AgentRunner";

/**
 * Google Antigravity CLI (`agy`), headless / print mode.
 * Docs: https://antigravity.google/docs/cli/headless/
 *       https://antigravity.google/docs/cli/reference
 *       https://antigravity.google/docs/cli/modes
 *       https://antigravity.google/docs/permissions?tab=cli
 *
 * Command shape:
 *   agy --mode accept-edits --sandbox --disable-slash-commands
 *       --output-format json [--model <slug>] -p "<system prompt + task>"
 *
 * The prompt is the value of `-p` (stdin is only read with
 * `--input-format stream-json`). There is no system-prompt flag, so it is
 * prepended to the task. `accept-edits` auto-approves file creations/edits
 * inside the workspace; anything that still needs approval (terminal commands,
 * non-workspace file access) is soft-denied in headless mode. Tool allow/deny
 * rules live only in ~/.gemini/antigravity-cli/settings.json (no CLI flag), so
 * user rules there can widen access.
 * `--output-format json` prints one envelope:
 *   {"conversation_id","status":"SUCCESS"|"ERROR"|...,"response","error"?, ...}
 */
export class AntigravityAgent implements AgentRunner {
  id = "antigravity";
  displayName = "Antigravity CLI (Google)";
  defaultBinary = "agy";
  defaultAllowedTools = "";
  docsUrl = "https://antigravity.google/docs/cli/headless/";
  isolation = "partial" as const;
  safetyNote =
    "Only file edits inside the vault are auto-approved and commands are denied in headless mode, but permission rules in your Antigravity settings can widen this.";
  verified = false;

  buildInvocation(req: AgentRequest, cfg: AgentConfig): AgentInvocation {
    const args = [
      "--mode", "accept-edits",
      "--sandbox",
      "--disable-slash-commands",
      "--output-format", "json",
    ];
    if (cfg.model.trim()) args.push("--model", cfg.model.trim());
    args.push(...splitArgs(cfg.extraArgs));
    args.push("-p", `${req.systemPrompt}\n\n---\n\n${req.userPrompt}`);
    return { command: cfg.binary.trim() || this.defaultBinary, args };
  }

  versionArgs(): string[] {
    return ["--version"];
  }

  parseResult(stdout: string, stderr: string, exitCode: number | null): AgentResult {
    const text = stdout.trim();
    // json = one envelope; stream-json (if forced via extra args) ends with a `result` event.
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
      if (!json || typeof json !== "object" || typeof json.status !== "string") continue;
      const response = typeof json.response === "string" ? json.response.trim() : "";
      const ok = json.status === "SUCCESS" && exitCode === 0;
      if (ok) return { ok, summary: response || "Done." };
      const err = typeof json.error === "string" && json.error.trim() ? json.error.trim() : "";
      return {
        ok: false,
        summary: (err || stderr.trim() || response || `Agent status ${json.status}`).slice(0, 500),
      };
    }
    if (exitCode === 0) return { ok: true, summary: text || "Done." };
    return { ok: false, summary: (stderr.trim() || text || `Exited with code ${exitCode}`).slice(0, 500) };
  }
}
