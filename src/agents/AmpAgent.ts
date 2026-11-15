import { AgentConfig, AgentInvocation, AgentRequest, AgentResult, AgentRunner, splitArgs } from "./AgentRunner";

/**
 * Amp (Sourcegraph / ampcode.com, `amp` CLI), execute mode.
 * Docs: https://ampcode.com/docs/cli/execute-mode
 *       https://ampcode.com/docs/cli/streaming-json
 *
 * Command shape:
 *   amp -x --stream-json [--model <provider/name>]     < SYS + task on stdin
 *
 * `-x/--execute` sends one message, waits for the turn to end and exits; piped
 * stdin is the prompt. Amp has no system prompt flag, so the Obsidian
 * instructions are prepended. Current Amp "does not ask for approval before
 * running tools" (older releases needed `--dangerously-allow-all`, which users
 * on those versions can add via extra args). Tools can only be disabled through
 * `amp.tools.disable` in settings.json, not per invocation.
 * `--stream-json` prints Claude-Code-compatible JSONL; the last line is
 * `{"type":"result","subtype":"success","is_error":false,"result":"..."}` or
 * `{"type":"result","subtype":"error_during_execution","is_error":true,"error":"..."}`.
 * Non-interactive use needs `AMP_API_KEY` in the environment.
 */
export class AmpAgent implements AgentRunner {
  id = "amp";
  displayName = "Amp";
  defaultBinary = "amp";
  defaultAllowedTools = "";
  docsUrl = "https://ampcode.com/docs/cli/execute-mode";
  isolation = "none" as const;
  safetyNote = "Amp runs every tool without asking, including the shell, and is not confined to the vault.";
  verified = false;

  buildInvocation(req: AgentRequest, cfg: AgentConfig): AgentInvocation {
    const args = ["-x", "--stream-json"];
    if (cfg.model.trim()) args.push("--model", cfg.model.trim());
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
    let result: AmpResult | null = null;
    let lastAssistant = "";
    let sawJson = false;
    for (const line of stdout.split(/\r?\n/)) {
      const t = line.trim();
      if (!t.startsWith("{")) continue;
      let ev: AmpResult & { message?: { role?: string; content?: { type?: string; text?: string }[] } };
      try {
        ev = JSON.parse(t);
      } catch {
        continue;
      }
      sawJson = true;
      if (ev.type === "result") result = ev;
      else if (ev.type === "assistant" && Array.isArray(ev.message?.content)) {
        const text = ev.message.content
          .filter((c) => c?.type === "text" && typeof c.text === "string")
          .map((c) => c.text as string)
          .join("\n")
          .trim();
        if (text) lastAssistant = text;
      }
    }
    if (result) {
      const isError = result.is_error === true || (result.subtype ?? "").startsWith("error");
      if (!isError && exitCode === 0) {
        return { ok: true, summary: (typeof result.result === "string" ? result.result.trim() : "") || lastAssistant || "Done." };
      }
      const msg = (typeof result.error === "string" && result.error) || stderr.trim() || `Agent error (${result.subtype ?? `exit ${exitCode}`})`;
      return { ok: false, summary: msg.slice(0, 500) };
    }
    const text = sawJson ? lastAssistant : stdout.trim();
    if (exitCode === 0) return { ok: true, summary: text || "Done." };
    return { ok: false, summary: (stderr.trim() || text || `Exited with code ${exitCode}`).slice(0, 500) };
  }
}

interface AmpResult {
  type?: string;
  subtype?: string;
  is_error?: boolean;
  result?: string;
  error?: string;
}
