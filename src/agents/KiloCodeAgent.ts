import { AgentConfig, AgentInvocation, AgentRequest, AgentResult, AgentRunner, splitArgs } from "./AgentRunner";

/**
 * Kilo Code CLI: `kilo run` (non-interactive mode).
 * Docs: https://kilo.ai/docs/code-with-ai/platforms/cli
 *       https://kilo.ai/docs/code-with-ai/platforms/cli-reference
 *
 * Command shape (task on stdin, permissions via env):
 *   KILO_CONFIG_CONTENT='{"permission":{...}}' kilo run --format json --auto [-m provider/model]
 *
 * - Without `--auto` a non-interactive run auto-rejects permission requests;
 *   `--auto` approves everything "not explicitly denied", so we pass an
 *   explicit permission config: `"*": "deny"`, the allowed tools set to
 *   "allow", and `external_directory: "deny"` (paths outside the cwd).
 * - KILO_CONFIG_CONTENT is merged after global and project config files
 *   (packages/opencode/src/config/config.ts in Kilo-Org/kilocode).
 * - Piped stdin is read as the message when no positional message is given.
 * - No system prompt flag: it is prepended to the task.
 * - `--format json` emits JSONL events {type, timestamp, sessionID, ...};
 *   `type:"text"` carries `part.text`, `type:"error"` carries `error`.
 */
export class KiloCodeAgent implements AgentRunner {
  id = "kilocode";
  displayName = "Kilo Code";
  defaultBinary = "kilo";
  defaultAllowedTools = "read,edit,glob,grep,list";
  docsUrl = "https://kilo.ai/docs/code-with-ai/platforms/cli";
  isolation = "partial" as const;
  safetyNote =
    "Only the listed permissions are allowed and paths outside the vault are denied by config, but this confinement is not verified end to end.";
  verified = false;

  buildInvocation(req: AgentRequest, cfg: AgentConfig): AgentInvocation {
    const args = ["run", "--format", "json", "--auto"];
    if (cfg.model.trim()) args.push("-m", cfg.model.trim());
    args.push(...splitArgs(cfg.extraArgs));

    // "*" first: Kilo evaluates rules with the last match winning.
    const permission: Record<string, string> = { "*": "deny" };
    for (const t of cfg.allowedTools.split(/[\s,]+/).filter(Boolean)) permission[t] = "allow";
    permission.external_directory = "deny";

    return {
      command: cfg.binary.trim() || this.defaultBinary,
      args,
      stdin: `${req.systemPrompt}\n\n---\n\n${req.userPrompt}`,
      env: { KILO_CONFIG_CONTENT: JSON.stringify({ permission }) },
    };
  }

  versionArgs(): string[] {
    return ["--version"];
  }

  parseResult(stdout: string, stderr: string, exitCode: number | null): AgentResult {
    const texts: string[] = [];
    const errors: string[] = [];
    const plain: string[] = [];
    for (const line of stdout.split(/\r?\n/)) {
      const s = line.trim();
      if (!s) continue;
      if (!s.startsWith("{")) {
        plain.push(s);
        continue;
      }
      try {
        const ev = JSON.parse(s);
        if (ev.type === "text" && typeof ev.part?.text === "string" && ev.part.text.trim()) {
          texts.push(ev.part.text.trim());
        } else if (ev.type === "error") {
          const e = ev.error;
          errors.push(String(e?.data?.message ?? e?.message ?? e?.name ?? "Unknown error"));
        }
      } catch {
        plain.push(s);
      }
    }
    const last = texts[texts.length - 1] ?? "";
    if (errors.length) return { ok: false, summary: errors.join("\n").slice(0, 500) };
    if (exitCode === 0) return { ok: true, summary: last || plain.join("\n") || "Done." };
    return {
      ok: false,
      summary: (stderr.trim() || last || plain.join("\n") || `Exited with code ${exitCode}`).slice(0, 500),
    };
  }
}
