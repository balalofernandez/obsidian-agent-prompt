import { AgentConfig, AgentInvocation, AgentRequest, AgentResult, AgentRunner, splitArgs } from "./AgentRunner";

/**
 * Cline CLI (`cline`, npm package `cline`), headless one-shot mode.
 * Docs: https://docs.cline.bot/cline-cli/cli-reference
 *       https://docs.cline.bot/cline-cli/three-core-flows (headless)
 *
 * Command shape:
 *   cline --json -y --cwd <vault> [-m <model>]     < SYS + task on stdin
 *
 * Piped stdin is the prompt when no prompt argument is given. `-y/--yolo`
 * skips approval prompts (otherwise required approvals are denied when stdin is
 * not a TTY), exits when the turn finishes and disables spawn/team tools.
 * `-s/--system` would REPLACE Cline's whole system prompt, so the Obsidian
 * instructions are prepended to the task instead. Cline has no tool allow-list
 * flag. `--json` prints NDJSON; the final answer is `run_result.text` (or the
 * `agent_event` with `event.type == "done"`). Errors go to stderr as
 * `{"type":"error","message":...}`.
 */
export class ClineAgent implements AgentRunner {
  id = "cline";
  displayName = "Cline";
  defaultBinary = "cline";
  defaultAllowedTools = "";
  docsUrl = "https://docs.cline.bot/cline-cli/cli-reference";
  isolation = "none" as const;
  safetyNote = "Cline runs in yolo mode with every tool auto-approved, including the shell, and is not confined to the vault.";
  verified = false;

  buildInvocation(req: AgentRequest, cfg: AgentConfig): AgentInvocation {
    const args = ["--json", "-y", "--cwd", req.vaultPath];
    if (cfg.model.trim()) args.push("-m", cfg.model.trim());
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
    let result: { text?: string; finishReason?: string } | null = null;
    let done: { text?: string; reason?: string } | null = null;
    let error: string | null = null;
    let sawJson = false;
    for (const line of `${stdout}\n${stderr}`.split(/\r?\n/)) {
      const t = line.trim();
      if (!t.startsWith("{")) continue;
      let ev: ClineEvent;
      try {
        ev = JSON.parse(t);
      } catch {
        continue;
      }
      sawJson = true;
      if (ev.type === "run_result") result = ev;
      else if (ev.type === "agent_event" && ev.event?.type === "done") done = ev.event;
      else if (ev.type === "agent_event" && ev.event?.type === "error") error = str(ev.event.message) || str(ev.event.error) || error;
      else if (ev.type === "error") error = str(ev.message) || error;
      else if (ev.type === "run_aborted") error = str(ev.message) || str(ev.reason) || "Run aborted";
    }
    const answer = (result?.text ?? done?.text ?? "").trim();
    const reason = result?.finishReason ?? done?.reason;
    const failed = reason === "aborted" || reason === "error" || (!!error && !answer);
    if ((result || done) && !failed && exitCode === 0) return { ok: true, summary: answer || "Done." };
    if (sawJson && (failed || exitCode !== 0)) {
      return { ok: false, summary: (error || answer || stripJson(stderr) || `Exited with code ${exitCode}`).slice(0, 500) };
    }
    const text = sawJson ? "" : stdout.trim();
    if (exitCode === 0) return { ok: true, summary: text || "Done." };
    return { ok: false, summary: (stderr.trim() || text || `Exited with code ${exitCode}`).slice(0, 500) };
  }
}

interface ClineEvent {
  type?: string;
  text?: string;
  finishReason?: string;
  message?: unknown;
  reason?: string;
  event?: { type?: string; text?: string; reason?: string; message?: unknown; error?: unknown };
}

function str(v: unknown): string {
  if (typeof v === "string") return v;
  if (v && typeof v === "object" && typeof (v as { message?: unknown }).message === "string") {
    return (v as { message: string }).message;
  }
  return "";
}

function stripJson(stderr: string): string {
  return stderr
    .split(/\r?\n/)
    .filter((l) => !l.trim().startsWith("{"))
    .join("\n")
    .trim();
}
