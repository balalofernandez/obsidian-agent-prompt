import { AgentConfig, AgentInvocation, AgentRequest, AgentResult, AgentRunner, splitArgs } from "./AgentRunner";

/**
 * OpenAI Codex CLI: `codex exec` (non-interactive mode).
 * Docs: https://developers.openai.com/codex/noninteractive
 *       https://developers.openai.com/codex/cli/reference
 *       https://developers.openai.com/codex/config-reference
 *
 * Command shape:
 *   codex exec --json --sandbox workspace-write --skip-git-repo-check --ephemeral
 *     -c approval_policy="never" -c developer_instructions="<system prompt>"
 *     [-m <model>] -          (task on stdin)
 *
 * `workspace-write` is an OS sandbox (Seatbelt / Landlock) that limits writes
 * to the cwd (the vault) plus temp dirs and blocks network for commands.
 * Reads are not restricted. `approval_policy=never` means nothing ever waits
 * for a human: actions outside the sandbox fail instead of prompting.
 */
export class CodexAgent implements AgentRunner {
  id = "codex";
  displayName = "Codex (OpenAI)";
  defaultBinary = "codex";
  defaultAllowedTools = "";
  docsUrl = "https://developers.openai.com/codex/noninteractive";
  isolation = "partial" as const;
  safetyNote =
    "An OS sandbox limits writes to the vault and blocks network for commands, but the agent can still read any file your user can read.";
  verified = false;

  buildInvocation(req: AgentRequest, cfg: AgentConfig): AgentInvocation {
    const args = [
      "exec",
      "--json",
      "--sandbox", "workspace-write",
      "--skip-git-repo-check",
      "--ephemeral",
      "-c", 'approval_policy="never"',
      "-c", `developer_instructions=${tomlString(req.systemPrompt)}`,
    ];
    if (cfg.model.trim()) args.push("-m", cfg.model.trim());
    args.push(...splitArgs(cfg.extraArgs));
    // "-" = read the prompt from stdin.
    args.push("-");
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
    let lastMessage = "";
    let error = "";
    let sawEvents = false;
    for (const line of stdout.split(/\r?\n/)) {
      const t = line.trim();
      if (!t.startsWith("{")) continue;
      let ev: any;
      try {
        ev = JSON.parse(t);
      } catch {
        continue;
      }
      if (!ev || typeof ev.type !== "string") continue;
      sawEvents = true;
      if (ev.type === "item.completed" && ev.item?.type === "agent_message" && typeof ev.item.text === "string") {
        lastMessage = ev.item.text.trim();
      } else if (ev.type === "turn.failed") {
        error = ev.error?.message ?? "Turn failed";
      } else if (ev.type === "error" && typeof ev.message === "string") {
        error = ev.message;
      }
    }
    if (sawEvents) {
      const ok = exitCode === 0 && !error;
      if (ok) return { ok, summary: lastMessage || "Done." };
      return { ok, summary: (error || stderr.trim() || lastMessage || `Exited with code ${exitCode}`).slice(0, 500) };
    }
    const text = stdout.trim();
    if (exitCode === 0) return { ok: true, summary: text || "Done." };
    return { ok: false, summary: (stderr.trim() || text || `Exited with code ${exitCode}`).slice(0, 500) };
  }
}

/** Encode a string as a TOML basic string (codex parses `-c` values as TOML). */
function tomlString(s: string): string {
  // JSON escapes (\n, \", \\, \uXXXX, \t ...) are all valid TOML escapes;
  // TOML additionally forbids a raw DEL character.
  return JSON.stringify(s).replace(/\u007f/g, "\\u007F");
}
