import { AgentConfig, AgentInvocation, AgentRequest, AgentResult, AgentRunner, splitArgs } from "./AgentRunner";

/**
 * Qwen Code (`qwen`), headless mode.
 * Docs: https://github.com/QwenLM/qwen-code/blob/main/docs/users/features/headless.md
 *       https://github.com/QwenLM/qwen-code/blob/main/docs/users/features/approval-mode.md
 *       https://github.com/QwenLM/qwen-code/blob/main/docs/users/configuration/settings.md
 *
 * Command shape:
 *   qwen --output-format json --approval-mode auto-edit
 *     --append-system-prompt "<system prompt>" [-m <model>] [--allowed-tools a,b]
 *     (stdin: task)
 *
 * Piped stdin runs headless. `auto-edit` auto-approves file edits; shell
 * commands still need approval, which nobody can give in headless mode.
 * `--json` output is an array of messages ending with a `result` message.
 */
export class QwenCodeAgent implements AgentRunner {
  id = "qwen-code";
  displayName = "Qwen Code";
  defaultBinary = "qwen";
  /** Tool names that skip confirmation (e.g. read_file, glob, grep_search); edits are already auto-approved. */
  defaultAllowedTools = "";
  docsUrl = "https://github.com/QwenLM/qwen-code/blob/main/docs/users/features/headless.md";
  isolation = "partial" as const;
  safetyNote =
    "File edits are auto-approved and shell commands need an approval that never comes, but there is no sandbox keeping the agent inside the vault.";
  verified = false;

  buildInvocation(req: AgentRequest, cfg: AgentConfig): AgentInvocation {
    const args = [
      "--output-format", "json",
      "--approval-mode", "auto-edit",
      "--append-system-prompt", req.systemPrompt,
    ];
    if (cfg.model.trim()) args.push("--model", cfg.model.trim());
    const tools = cfg.allowedTools.split(/[\s,]+/).filter(Boolean);
    if (tools.length) args.push("--allowed-tools", tools.join(","));
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
    const messages = parseMessages(text);
    if (messages.length) {
      const result = [...messages].reverse().find((m) => m?.type === "result");
      let msg = typeof result?.result === "string" ? result.result.trim() : "";
      if (!msg) msg = lastAssistantText(messages);
      const isError = result?.is_error === true || (typeof result?.subtype === "string" && result.subtype !== "success");
      const ok = !isError && exitCode === 0;
      if (ok) return { ok, summary: msg || "Done." };
      const err = result?.error?.message ?? (typeof result?.error === "string" ? result.error : "");
      return { ok, summary: (err || stderr.trim() || msg || `Agent error (${result?.subtype ?? exitCode})`).slice(0, 500) };
    }
    if (exitCode === 0) return { ok: true, summary: text || "Done." };
    return { ok: false, summary: (stderr.trim() || text || `Exited with code ${exitCode}`).slice(0, 500) };
  }
}

/** Accepts the `json` array format or `stream-json` lines. */
function parseMessages(text: string): any[] {
  const start = text.indexOf("[");
  if (start >= 0) {
    try {
      const arr = JSON.parse(text.slice(start));
      if (Array.isArray(arr)) return arr;
    } catch {
      /* try JSONL */
    }
  }
  const out: any[] = [];
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t.startsWith("{")) continue;
    try {
      out.push(JSON.parse(t));
    } catch {
      /* skip */
    }
  }
  return out;
}

function lastAssistantText(messages: any[]): string {
  for (const m of [...messages].reverse()) {
    if (m?.type !== "assistant") continue;
    const content = m.message?.content;
    if (Array.isArray(content)) {
      const t = content.filter((c: any) => c?.type === "text").map((c: any) => c.text).join("").trim();
      if (t) return t;
    }
  }
  return "";
}
