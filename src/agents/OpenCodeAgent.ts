import { AgentConfig, AgentInvocation, AgentRequest, AgentResult, AgentRunner, splitArgs } from "./AgentRunner";

/**
 * OpenCode (`opencode`, anomalyco/opencode, formerly sst/opencode), `opencode run`.
 * Docs: https://opencode.ai/docs/cli/  and  https://opencode.ai/docs/permissions/
 *
 * Command shape:
 *   opencode run --format json [--model <provider/model>]     < SYS + task on stdin
 *
 * With no message argument, `run` reads the whole message from piped stdin.
 * There is no system prompt flag (agent prompts live in config files), so the
 * Obsidian instructions are prepended to the task.
 * We do NOT pass `--dangerously-skip-permissions` / `--auto`: OpenCode's default
 * policy already allows edits, and any permission that resolves to "ask" is
 * auto-rejected in `run` mode, which is the safer behaviour. Tool limits are only
 * configurable through opencode.json `permission(s)` rules, not flags.
 * `--format json` prints JSONL events: `{"type":"text","part":{"id","text",...}}`,
 * `tool_use`, `step_start`, `step_finish`, `error`. In 2.x text events carry
 * deltas per part id, in 1.x the full part text; both are handled by
 * accumulating per part id and keeping the last part.
 */
export class OpenCodeAgent implements AgentRunner {
  id = "opencode";
  displayName = "OpenCode";
  defaultBinary = "opencode";
  defaultAllowedTools = "";
  docsUrl = "https://opencode.ai/docs/cli/";
  isolation = "none" as const;
  safetyNote = "OpenCode's default policy allows every tool, including the shell and paths outside the vault, unless your opencode.json denies them.";
  verified = false;

  buildInvocation(req: AgentRequest, cfg: AgentConfig): AgentInvocation {
    const args = ["run", "--format", "json"];
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
    const parts = new Map<string, string>();
    let lastId: string | null = null;
    let error: string | null = null;
    let sawJson = false;
    let n = 0;
    for (const line of stdout.split(/\r?\n/)) {
      const t = line.trim();
      if (!t.startsWith("{")) continue;
      let ev: OpenCodeEvent;
      try {
        ev = JSON.parse(t);
      } catch {
        continue;
      }
      sawJson = true;
      if (ev.type === "text" && typeof ev.part?.text === "string") {
        const id = ev.part.id ?? `anon-${n++}`;
        const prev = parts.get(id) ?? "";
        const next = ev.part.text;
        // 1.x re-sends the full text, 2.x sends deltas.
        parts.set(id, next.startsWith(prev) ? next : prev + next);
        lastId = id;
      } else if (ev.type === "error") {
        error = errorMessage(ev.error) || error || "Unknown error";
      }
    }
    const answer = lastId ? (parts.get(lastId) ?? "").trim() : "";
    if (sawJson) {
      if (!error && exitCode === 0) return { ok: true, summary: answer || "Done." };
      return { ok: false, summary: (error || stderr.trim() || answer || `Exited with code ${exitCode}`).slice(0, 500) };
    }
    const text = stdout.trim();
    if (exitCode === 0) return { ok: true, summary: text || "Done." };
    return { ok: false, summary: (stderr.trim() || text || `Exited with code ${exitCode}`).slice(0, 500) };
  }
}

interface OpenCodeEvent {
  type?: string;
  part?: { id?: string; text?: string };
  error?: unknown;
}

/** 2.x: `{type, message}`; 1.x: `{name, data: {message}}`. */
function errorMessage(e: unknown): string {
  if (!e) return "";
  if (typeof e === "string") return e;
  const o = e as { message?: unknown; name?: unknown; data?: { message?: unknown } };
  if (typeof o.message === "string") return o.message;
  if (typeof o.data?.message === "string") return o.data.message;
  if (typeof o.name === "string") return o.name;
  return "";
}
