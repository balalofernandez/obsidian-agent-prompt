import { AgentConfig, AgentInvocation, AgentRequest, AgentResult, AgentRunner, splitArgs } from "./AgentRunner";

/**
 * Factory Droid: `droid exec` (headless mode).
 * Docs: https://docs.factory.com/cli/droid-exec/overview
 *       https://docs.factory.com/reference/cli-reference
 *
 * Command shape (task on stdin):
 *   droid exec --auto low -o json --append-system-prompt <sys>
 *              [--only-tools <ids> | --remove-tools Execute] [-m <model>]
 *
 * - Default autonomy is read-only; `--auto low` allows "Create/edit files, run
 *   formatters, non-destructive commands". It does not say writes stay in cwd.
 * - `--only-tools` restricts the tool set (comma separated ids). Only `Read`,
 *   `Grep`, `Glob`, `LS` and `Execute` are named in the docs; edit tool ids
 *   are not documented, so by default we remove the shell (`Execute`) instead.
 *   Unknown tool ids make the run fail before it starts.
 * - `-o json` prints one object: {type:"result", subtype, is_error, result, ...}.
 * - Exit 0 means the run completed, not that the task succeeded.
 */
export class DroidAgent implements AgentRunner {
  id = "droid";
  displayName = "Droid (Factory)";
  defaultBinary = "droid";
  defaultAllowedTools = "";
  docsUrl = "https://docs.factory.com/cli/droid-exec/overview";
  isolation = "partial" as const;
  safetyNote =
    "Runs with --auto low and the Execute (shell) tool removed unless you list tools, but Droid does not document that file edits stay inside the vault.";
  verified = false;

  buildInvocation(req: AgentRequest, cfg: AgentConfig): AgentInvocation {
    const args = ["exec", "--auto", "low", "-o", "json", "--append-system-prompt", req.systemPrompt];
    const tools = cfg.allowedTools.split(/[\s,]+/).filter(Boolean);
    if (tools.length) args.push("--only-tools", tools.join(","));
    else args.push("--remove-tools", "Execute");
    if (cfg.model.trim()) args.push("-m", cfg.model.trim());
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
    // -o json prints a single object at the end; tolerate leading noise and
    // stream-json style output by scanning lines from the end.
    const candidates = [text.slice(Math.max(0, text.indexOf("{"))), ...text.split(/\r?\n/).reverse()];
    for (const c of candidates) {
      const s = c.trim();
      if (!s.startsWith("{")) continue;
      try {
        const json = JSON.parse(s);
        if (json.type !== "result" && typeof json.result !== "string") continue;
        const result = typeof json.result === "string" ? json.result.trim() : "";
        const isError = json.is_error === true || (typeof json.subtype === "string" && json.subtype !== "success");
        return {
          ok: !isError && exitCode === 0,
          summary: result || (isError ? `Agent error (${json.subtype ?? "unknown"})` : "Done."),
        };
      } catch {
        /* try next candidate */
      }
    }
    if (exitCode === 0) return { ok: true, summary: text || "Done." };
    return { ok: false, summary: (stderr.trim() || text || `Exited with code ${exitCode}`).slice(0, 500) };
  }
}
