import { AgentConfig, AgentInvocation, AgentRequest, AgentResult, AgentRunner, splitArgs } from "./AgentRunner";

/**
 * Mistral Vibe (`vibe`, pip/uv package `mistral-vibe`), programmatic mode.
 * Docs: https://docs.mistral.ai/vibe/code/cli/work-with-cli
 *       https://github.com/mistralai/mistral-vibe/blob/main/docs/programmatic-mode.md
 *
 * Command shape:
 *   vibe --output json --agent accept-edits
 *        --enabled-tools read_file --enabled-tools write_file --enabled-tools edit --enabled-tools grep
 *        [--model <alias>] -p          < SYS + task on stdin
 *
 * `-p` with no text reads the prompt from stdin. There is no "append system
 * prompt" flag (`--system-prompt-file` replaces Vibe's own instructions), so
 * the Obsidian instructions are prepended to the task.
 * We do NOT pass `--auto-approve`: the `accept-edits` agent approves file edits
 * inside the working directory, and any call that would need approval (shell,
 * paths outside the cwd) is denied because nobody can answer. `--enabled-tools`
 * disables every tool not listed (no bash, no web).
 * `--output json` prints the session messages as a JSON array at the end.
 */
export class MistralVibeAgent implements AgentRunner {
  id = "mistral-vibe";
  displayName = "Mistral Vibe";
  defaultBinary = "vibe";
  defaultAllowedTools = "read_file,write_file,edit,grep";
  docsUrl = "https://docs.mistral.ai/vibe/code/cli/work-with-cli";
  isolation = "partial" as const;
  safetyNote = "Only file tools are enabled and edits outside the vault need an approval that headless runs deny, but your own Vibe config can loosen this.";
  verified = false;

  buildInvocation(req: AgentRequest, cfg: AgentConfig): AgentInvocation {
    const args = ["--output", "json", "--agent", "accept-edits"];
    const tools = cfg.allowedTools.split(/[\s,]+/).filter(Boolean);
    for (const t of tools) args.push("--enabled-tools", t);
    if (cfg.model.trim()) args.push("--model", cfg.model.trim());
    // `-p` last so its optional value is not taken from another flag; stdin is the prompt.
    args.push("-p");
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
    const text = stdout.trim();
    const messages = parseMessages(text);
    if (messages) {
      const last = [...messages].reverse().find((m) => m?.role === "assistant" && contentText(m.content));
      const answer = last ? contentText(last.content) : "";
      if (exitCode === 0) return { ok: true, summary: answer || "Done." };
      return { ok: false, summary: failure(exitCode, stderr, answer) };
    }
    if (exitCode === 0) return { ok: true, summary: text || "Done." };
    return { ok: false, summary: failure(exitCode, stderr, text) };
  }
}

interface VibeMessage {
  role?: string;
  content?: unknown;
}

function parseMessages(text: string): VibeMessage[] | null {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start < 0 || end <= start) return null;
  try {
    const json = JSON.parse(text.slice(start, end + 1));
    if (Array.isArray(json)) return json as VibeMessage[];
    if (Array.isArray(json?.messages)) return json.messages as VibeMessage[];
  } catch {
    /* not JSON */
  }
  return null;
}

/** Content is a plain string (older releases) or a list of `{type:"text", text}` parts. */
function contentText(content: unknown): string {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  return content
    .filter((c) => c && c.type === "text" && typeof c.text === "string")
    .map((c) => c.text as string)
    .join("\n")
    .trim();
}

function failure(exitCode: number | null, stderr: string, fallback: string): string {
  // Exit codes from the docs: 1 usage/config error, 2 API/runtime failure, 3 stopped early.
  const reason =
    exitCode === 3 ? "Vibe stopped before finishing (turn, token, price or time limit). " : "";
  const detail = stderr.trim() || fallback || `Exited with code ${exitCode}`;
  return (reason + detail).slice(0, 500);
}
