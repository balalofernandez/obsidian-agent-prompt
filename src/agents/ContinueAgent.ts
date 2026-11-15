import { AgentConfig, AgentInvocation, AgentRequest, AgentResult, AgentRunner, splitArgs } from "./AgentRunner";

/**
 * Continue CLI (`cn`, npm package `@continuedev/cli`), headless print mode.
 * Docs: https://docs.continue.dev/cli/headless-mode
 *       https://github.com/continuedev/continue/tree/main/extensions/cli (shared-options.ts)
 *
 * Command shape:
 *   cn -p --silent --rule <SYS>
 *      --allow Read --allow List --allow Search --allow Edit --allow MultiEdit --allow Write
 *      --exclude Bash --exclude Fetch [--model <hub slug>]     < task on stdin
 *
 * With `-p` and no prompt argument the whole of stdin is the prompt.
 * `--rule` accepts a string (anything with spaces/newlines is used as content)
 * and is added to the system message. In headless mode Edit/MultiEdit/Write are
 * "ask" by default and therefore excluded, while Bash and MCP tools are allowed,
 * so we allow the file tools and exclude the shell and web fetch explicitly.
 * `--format json` only forces the model to answer in JSON, so we use plain text:
 * stdout is the final assistant reply (`--silent` strips <think> tags).
 */
export class ContinueAgent implements AgentRunner {
  id = "continue";
  displayName = "Continue (cn)";
  defaultBinary = "cn";
  defaultAllowedTools = "Read,List,Search,Edit,MultiEdit,Write";
  docsUrl = "https://docs.continue.dev/cli/headless-mode";
  isolation = "partial" as const;
  safetyNote = "Shell and web fetch are excluded and only file tools are allowed, but those tools are not confined to the vault and MCP tools stay enabled.";
  verified = false;

  buildInvocation(req: AgentRequest, cfg: AgentConfig): AgentInvocation {
    const args = ["-p", "--silent", "--rule", req.systemPrompt];
    const tools = cfg.allowedTools.split(/[\s,]+/).filter(Boolean);
    for (const t of tools) args.push("--allow", t);
    for (const t of ["Bash", "Fetch"]) if (!tools.includes(t)) args.push("--exclude", t);
    if (cfg.model.trim()) args.push("--model", cfg.model.trim());
    args.push(...splitArgs(cfg.extraArgs));
    return { command: cfg.binary.trim() || this.defaultBinary, args, stdin: req.userPrompt };
  }

  versionArgs(): string[] {
    return ["--version"];
  }

  parseResult(stdout: string, stderr: string, exitCode: number | null): AgentResult {
    const text = stdout.trim();
    // Be tolerant if a user adds `--format json` via extra args.
    if (text.startsWith("{")) {
      try {
        const json = JSON.parse(text);
        if (typeof json.response === "string") {
          if (exitCode === 0) return { ok: true, summary: json.response.trim() || "Done." };
          return { ok: false, summary: (stderr.trim() || json.response || `Exited with code ${exitCode}`).slice(0, 500) };
        }
      } catch {
        /* plain text */
      }
    }
    if (exitCode === 0) return { ok: true, summary: text || "Done." };
    return { ok: false, summary: (stderr.trim() || text || `Exited with code ${exitCode}`).slice(0, 500) };
  }
}
