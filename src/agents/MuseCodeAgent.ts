import { AgentConfig, AgentInvocation, AgentRequest, AgentResult, AgentRunner, splitArgs } from "./AgentRunner";

/**
 * Meta Muse Code (`muse`), headless mode `muse exec`.
 * Docs: https://dev.meta.ai/docs/muse-code
 *       https://dev.meta.ai/docs/muse-code/extending#headless
 *       https://dev.meta.ai/docs/muse-code/permissions
 *       https://dev.meta.ai/docs/muse-code/configuration
 *
 * Command shape:
 *   muse exec --disable-approval --sandbox-network restricted --trust-workspace
 *             --workspace <vault> [--model <model>] "<system prompt + task>"
 *
 * The prompt is positional (or `--prompt-file`); stdin is not documented.
 * There is no system-prompt flag, so it is prepended to the task.
 * `--disable-approval` skips prompts but keeps the sandbox: writes are allowed
 * only in the workspace and a temp dir, the rest of the filesystem is
 * read-only, and file tools are workspace-confined. `--sandbox-network
 * restricted` blocks network. The shell tool stays available (sandboxed); on
 * Linux the sandbox needs bubblewrap. `--json` exists but its JSONL schema is
 * not documented, so plain text output (the agent's answer on stdout) is used.
 * Exit codes: 0 completed, 1 failed/cancelled, 2 usage error.
 */
export class MuseCodeAgent implements AgentRunner {
  id = "muse-code";
  displayName = "Muse Code (Meta)";
  defaultBinary = "muse";
  defaultAllowedTools = "";
  docsUrl = "https://dev.meta.ai/docs/muse-code/extending#headless";
  isolation = "partial" as const;
  safetyNote =
    "An OS sandbox limits writes to the vault and blocks network, but the agent can run sandboxed shell commands and read files outside the vault.";
  verified = false;

  buildInvocation(req: AgentRequest, cfg: AgentConfig): AgentInvocation {
    const args = [
      "exec",
      "--disable-approval",
      "--sandbox-network", "restricted",
      "--trust-workspace",
      "--workspace", req.vaultPath,
    ];
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
    // If the user forces `--json` via extra args, try to pull a final text out of the JSONL.
    const lines = text.split(/\r?\n/).filter((l) => l.trim().startsWith("{"));
    if (lines.length && lines.length === text.split(/\r?\n/).filter((l) => l.trim()).length) {
      let last = "";
      for (const l of lines) {
        try {
          const ev: any = JSON.parse(l);
          const p = ev?.payload ?? ev;
          const s = p?.text ?? p?.message ?? p?.result ?? p?.output;
          if (typeof s === "string" && s.trim()) last = s.trim();
        } catch {
          /* ignore */
        }
      }
      if (exitCode === 0) return { ok: true, summary: last || "Done." };
      return { ok: false, summary: (stderr.trim() || last || `Exited with code ${exitCode}`).slice(0, 500) };
    }
    if (exitCode === 0) return { ok: true, summary: text || "Done." };
    return { ok: false, summary: (stderr.trim() || text || `Exited with code ${exitCode}`).slice(0, 500) };
  }
}
