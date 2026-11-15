import { AgentConfig, AgentInvocation, AgentRequest, AgentResult, AgentRunner, splitArgs } from "./AgentRunner";

/**
 * Autohand Code CLI. https://github.com/autohandai/code-cli
 * Docs: https://docs.autohand.ai/working-with-autohand-code/headless-mode
 *       https://docs.autohand.ai/working-with-autohand-code/cli-reference
 *
 * Command shape:
 *   autohand --json local --yes --append-system-prompt <SYS>
 *            [--allowed-tools read_file,write_file,...] [--model <id>] -p   < task on stdin
 *
 * `-p` with piped stdin runs one instruction headless. `--json local` prints
 * one object at the end: {"type":"result","content":...} or
 * {"type":"error","message":...}; progress goes to stderr. `--yes` confirms
 * actions without prompting; `--allowed-tools` limits which tools are offered.
 */
export class AutohandAgent implements AgentRunner {
  id = "autohand";
  displayName = "Autohand Code";
  defaultBinary = "autohand";
  defaultAllowedTools = "read_file,write_file,apply_patch,search_replace,append_file,create_directory,list_tree,file_stats,fff_grep,fff_find";
  docsUrl = "https://docs.autohand.ai/working-with-autohand-code/headless-mode";
  isolation = "partial" as const;
  safetyNote = "Only the listed tools are offered and they run without confirmation, and Autohand does not document that file access stays inside the vault.";
  verified = false;

  buildInvocation(req: AgentRequest, cfg: AgentConfig): AgentInvocation {
    const args = ["--json", "local", "--yes", "--append-system-prompt", req.systemPrompt];
    const tools = cfg.allowedTools.split(/[\s,]+/).filter(Boolean);
    if (tools.length) args.push("--allowed-tools", tools.join(","));
    if (cfg.model.trim()) args.push("--model", cfg.model.trim());
    args.push(...splitArgs(cfg.extraArgs));
    // `-p` last so its optional value can't swallow another flag's argument.
    args.push("-p");
    return { command: cfg.binary.trim() || this.defaultBinary, args, stdin: req.userPrompt };
  }

  versionArgs(): string[] {
    return ["--version"];
  }

  parseResult(stdout: string, stderr: string, exitCode: number | null): AgentResult {
    const text = stdout.trim();
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.startsWith("{"));
    for (const candidate of [text.slice(Math.max(0, text.indexOf("{"))), ...lines.reverse()]) {
      if (!candidate.startsWith("{")) continue;
      try {
        const json = JSON.parse(candidate);
        if (json.type === "error") {
          return { ok: false, summary: String(json.message ?? json.error ?? "Agent error").slice(0, 500) };
        }
        if (json.type === "result") {
          const content = typeof json.content === "string" ? json.content.trim() : "";
          return { ok: exitCode === 0, summary: content || (exitCode === 0 ? "Done." : stderr.trim().slice(0, 500) || `Exited with code ${exitCode}`) };
        }
      } catch {
        /* try next candidate */
      }
    }
    if (exitCode === 0) return { ok: true, summary: text || "Done." };
    return { ok: false, summary: (stderr.trim() || text || `Exited with code ${exitCode}`).slice(0, 500) };
  }
}
