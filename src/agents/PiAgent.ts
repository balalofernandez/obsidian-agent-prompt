import { AgentConfig, AgentInvocation, AgentRequest, AgentResult, AgentRunner, splitArgs } from "./AgentRunner";

/**
 * Pi coding agent (earendil-works/pi, formerly @mariozechner/pi-coding-agent).
 * Docs: https://docs.pi.dev/latest/cli (JSON events: https://docs.pi.dev/latest/json)
 *
 * Command shape:
 *   pi -p --mode json --no-session --append-system-prompt <SYS>
 *      [--tools read,edit,write,grep,find,ls] [--model <provider/id>]   < task on stdin
 *
 * Piped stdin becomes the prompt. Pi has no per-action approval prompts, so the
 * only control is which tools exist; leaving out `bash` removes shell access.
 * `--mode json` prints JSONL events; the final answer is the last assistant
 * message (from `agent_end.messages` or the last `message_end`).
 */
export class PiAgent implements AgentRunner {
  id = "pi";
  displayName = "Pi";
  defaultBinary = "pi";
  defaultAllowedTools = "read,edit,write,grep,find,ls";
  docsUrl = "https://docs.pi.dev/latest/cli";
  isolation = "partial" as const;
  safetyNote = "Shell is off when bash is not in the tool list, but Pi has no approval prompts and its file tools are not confined to the vault.";
  verified = false;

  buildInvocation(req: AgentRequest, cfg: AgentConfig): AgentInvocation {
    const args = ["-p", "--mode", "json", "--no-session", "--append-system-prompt", req.systemPrompt];
    const tools = cfg.allowedTools.split(/[\s,]+/).filter(Boolean);
    if (tools.length) args.push("--tools", tools.join(","));
    if (cfg.model.trim()) args.push("--model", cfg.model.trim());
    args.push(...splitArgs(cfg.extraArgs));
    return { command: cfg.binary.trim() || this.defaultBinary, args, stdin: req.userPrompt };
  }

  versionArgs(): string[] {
    return ["--version"];
  }

  parseResult(stdout: string, stderr: string, exitCode: number | null): AgentResult {
    let last: PiMessage | null = null;
    let sawJson = false;
    for (const line of stdout.split(/\r?\n/)) {
      const t = line.trim();
      if (!t.startsWith("{")) continue;
      let ev: { type?: string; message?: PiMessage; messages?: PiMessage[] };
      try {
        ev = JSON.parse(t);
      } catch {
        continue;
      }
      sawJson = true;
      if (ev.type === "message_end" && ev.message?.role === "assistant") last = ev.message;
      if (ev.type === "agent_end" && Array.isArray(ev.messages)) {
        const a = [...ev.messages].reverse().find((m) => m?.role === "assistant");
        if (a) last = a;
      }
    }
    if (last) {
      const text = (Array.isArray(last.content) ? last.content : [])
        .filter((c) => c?.type === "text" && typeof c.text === "string")
        .map((c) => c.text as string)
        .join("\n")
        .trim();
      const isError = last.stopReason === "error" || last.stopReason === "aborted";
      if (isError) {
        return { ok: false, summary: (last.errorMessage || text || stderr.trim() || `Agent ${last.stopReason}`).slice(0, 500) };
      }
      return { ok: exitCode === 0, summary: text || (exitCode === 0 ? "Done." : stderr.trim().slice(0, 500) || `Exited with code ${exitCode}`) };
    }
    const text = sawJson ? "" : stdout.trim();
    if (exitCode === 0) return { ok: true, summary: text || "Done." };
    return { ok: false, summary: (stderr.trim() || text || `Exited with code ${exitCode}`).slice(0, 500) };
  }
}

interface PiMessage {
  role?: string;
  content?: { type?: string; text?: string }[];
  stopReason?: string;
  errorMessage?: string;
}
