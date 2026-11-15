import { AgentConfig, AgentInvocation, AgentRequest, AgentResult, AgentRunner, splitArgs } from "./AgentRunner";

/**
 * Goose (Block / AAIF, `goose` CLI), `goose run` headless mode.
 * Docs: https://block.github.io/goose/docs/guides/goose-cli-commands
 *       https://github.com/aaif-goose/goose (crates/goose-cli/src/cli.rs)
 *
 * Command shape:
 *   GOOSE_MODE=auto goose run -i - --system <SYS> --no-session --output-format json
 *                   [--model <model>]          < task on stdin
 *
 * `-i -` reads the instructions from stdin; `--system` adds extra system
 * instructions. GOOSE_MODE=auto approves tool calls without asking (the env var
 * overrides the config file, which might say `approve`). Goose has no tool
 * allow-list flag: the enabled extensions (usually `developer`, which includes a
 * shell) decide what it can do.
 * `--output-format json` prints `{ messages: [...], metadata: { status } }` at
 * the end; the answer is the text of the last assistant message.
 */
export class GooseAgent implements AgentRunner {
  id = "goose";
  displayName = "Goose";
  defaultBinary = "goose";
  defaultAllowedTools = "";
  docsUrl = "https://block.github.io/goose/docs/guides/goose-cli-commands";
  isolation = "none" as const;
  safetyNote = "Goose runs in auto mode with your enabled extensions, including shell access, and is not confined to the vault.";
  verified = false;

  buildInvocation(req: AgentRequest, cfg: AgentConfig): AgentInvocation {
    const args = [
      "run",
      "-i", "-",
      "--system", req.systemPrompt,
      "--no-session",
      "--output-format", "json",
    ];
    if (cfg.model.trim()) args.push("--model", cfg.model.trim());
    args.push(...splitArgs(cfg.extraArgs));
    return {
      command: cfg.binary.trim() || this.defaultBinary,
      args,
      stdin: req.userPrompt,
      env: { GOOSE_MODE: "auto" },
    };
  }

  versionArgs(): string[] {
    return ["--version"];
  }

  parseResult(stdout: string, stderr: string, exitCode: number | null): AgentResult {
    const text = stdout.trim();
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        const json = JSON.parse(text.slice(start, end + 1)) as GooseOutput;
        if (Array.isArray(json.messages)) {
          const last = [...json.messages].reverse().find((m) => m?.role === "assistant" && messageText(m));
          const answer = last ? messageText(last) : "";
          const isError = json.metadata?.status === "error";
          if (!isError && exitCode === 0) return { ok: true, summary: answer || "Done." };
          return {
            ok: false,
            summary: (stderr.trim() || answer || `Goose ${isError ? "reported an error" : `exited with code ${exitCode}`}`).slice(0, 500),
          };
        }
      } catch {
        /* fall through */
      }
    }
    if (exitCode === 0) return { ok: true, summary: text || "Done." };
    return { ok: false, summary: (stderr.trim() || text || `Exited with code ${exitCode}`).slice(0, 500) };
  }
}

interface GooseMessage {
  role?: string;
  content?: { type?: string; text?: string }[] | string;
}

interface GooseOutput {
  messages?: GooseMessage[];
  metadata?: { status?: string };
}

function messageText(m: GooseMessage): string {
  if (typeof m.content === "string") return m.content.trim();
  if (!Array.isArray(m.content)) return "";
  return m.content
    .filter((c) => c?.type === "text" && typeof c.text === "string")
    .map((c) => c.text as string)
    .join("\n")
    .trim();
}
