import { AgentConfig, AgentInvocation, AgentRequest, AgentResult, AgentRunner, splitArgs } from "./AgentRunner";

/**
 * Kimi Code CLI (Moonshot AI, `kimi`), non-interactive prompt mode.
 * Docs: https://moonshotai.github.io/kimi-code/en/reference/kimi-command
 * (The legacy Python kimi-cli repo is archived and points to Kimi Code CLI.)
 *
 * Command shape:
 *   kimi -p "<system prompt + task>" --output-format stream-json [-m <model>]
 *
 * `-p` runs without the TUI and always uses the `auto` permission policy (no
 * human approval; `--yolo`/`--auto` are rejected together with `-p`). Only
 * static deny rules from the config file still apply. There is no system
 * prompt flag, so instructions are prepended. stream-json prints one message
 * object per line: assistant messages (some with `tool_calls`), then tool
 * messages; thinking and progress go to stderr.
 */
export class KimiAgent implements AgentRunner {
  id = "kimi";
  displayName = "Kimi Code CLI";
  defaultBinary = "kimi";
  defaultAllowedTools = "";
  docsUrl = "https://moonshotai.github.io/kimi-code/en/reference/kimi-command";
  isolation = "none" as const;
  safetyNote =
    "Headless mode auto-approves every tool call, including shell commands, with your user's full permissions and no sandbox.";
  verified = false;

  buildInvocation(req: AgentRequest, cfg: AgentConfig): AgentInvocation {
    const args = ["-p", `${req.systemPrompt}\n\n---\n\n${req.userPrompt}`, "--output-format", "stream-json"];
    if (cfg.model.trim()) args.push("--model", cfg.model.trim());
    args.push(...splitArgs(cfg.extraArgs));
    return { command: cfg.binary.trim() || this.defaultBinary, args };
  }

  versionArgs(): string[] {
    return ["--version"];
  }

  parseResult(stdout: string, stderr: string, exitCode: number | null): AgentResult {
    let last = "";
    let sawJson = false;
    for (const line of stdout.split(/\r?\n/)) {
      const t = line.trim();
      if (!t.startsWith("{")) continue;
      let m: any;
      try {
        m = JSON.parse(t);
      } catch {
        continue;
      }
      sawJson = true;
      if (m?.role !== "assistant") continue;
      const text = contentText(m.content);
      if (text) last = text;
    }
    const text = stdout.trim();
    const summary = sawJson ? last : text;
    if (exitCode === 0) return { ok: true, summary: summary || "Done." };
    return { ok: false, summary: (stderr.trim() || summary || `Exited with code ${exitCode}`).slice(0, 500) };
  }
}

function contentText(content: unknown): string {
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((p: any) => (typeof p === "string" ? p : p?.type === "text" || p?.text ? p.text ?? "" : ""))
      .join("")
      .trim();
  }
  return "";
}
