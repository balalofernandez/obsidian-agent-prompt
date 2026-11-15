import { AgentConfig, AgentInvocation, AgentRequest, AgentResult, AgentRunner, splitArgs } from "./AgentRunner";

/**
 * Xiaomi MiMo Code (`mimo`, npm `@mimo-ai/cli`), an OpenCode fork.
 * Docs: https://github.com/XiaomiMiMo/MiMo-Code
 *       https://mimo.mi.com/docs/en-US/tokenplan/integration/mimo-code
 *       Permissions reference (in repo):
 *       packages/cli/src/skill/builtin/.bundle/mimocode-docs/reference/permissions.md
 *       `run` command source: packages/cli/src/cli/cmd/run.ts
 *
 * Command shape:
 *   MIMOCODE_PERMISSION='{"bash":"deny",...,"read":"allow","edit":"allow"}' \
 *   mimo run --format json [--model provider/model]     (task on stdin)
 *
 * `mimo run` appends piped stdin to the message. There is no system-prompt
 * flag, so the system prompt is prepended to the task. In `run`, any
 * permission that resolves to "ask" is auto-rejected (unless --yolo), so with
 * no human nothing waits. `MIMOCODE_PERMISSION` is JSON deep-merged into the
 * `permission` config: we allow the configured tools and deny shell, web,
 * subagents, skills and `external_directory` (reads/writes outside the project).
 * `--format json` prints JSONL events: step_start, text {part:{text}},
 * tool_use, step_finish, reasoning, error {error:{name,data:{message}}}.
 */
const DENIED = ["bash", "webfetch", "websearch", "codesearch", "task", "actor", "skill", "external_directory"];

export class MimoCodeAgent implements AgentRunner {
  id = "mimo-code";
  displayName = "MiMo Code (Xiaomi)";
  defaultBinary = "mimo";
  defaultAllowedTools = "read,edit,glob,grep,list";
  docsUrl = "https://github.com/XiaomiMiMo/MiMo-Code";
  isolation = "partial" as const;
  safetyNote =
    "Shell, web and access outside the project folder are denied through permission rules, but this is not an OS sandbox and MCP tools from your config are not covered.";
  verified = false;

  buildInvocation(req: AgentRequest, cfg: AgentConfig): AgentInvocation {
    const allowed = cfg.allowedTools.split(/[\s,]+/).filter(Boolean);
    const permission: Record<string, string> = {};
    for (const t of DENIED) if (!allowed.includes(t)) permission[t] = "deny";
    for (const t of allowed) permission[t] = "allow";
    const args = ["run", "--format", "json"];
    if (cfg.model.trim()) args.push("--model", cfg.model.trim());
    args.push(...splitArgs(cfg.extraArgs));
    return {
      command: cfg.binary.trim() || this.defaultBinary,
      args,
      stdin: `${req.systemPrompt}\n\n---\n\n${req.userPrompt}`,
      env: { MIMOCODE_PERMISSION: JSON.stringify(permission) },
    };
  }

  versionArgs(): string[] {
    return ["--version"];
  }

  parseResult(stdout: string, stderr: string, exitCode: number | null): AgentResult {
    const texts: string[] = [];
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
      if (ev.type === "text" && typeof ev.part?.text === "string" && ev.part.text.trim()) {
        texts.push(ev.part.text.trim());
      } else if (ev.type === "error") {
        const e = ev.error;
        error = String(e?.data?.message ?? e?.message ?? e?.name ?? "Agent error");
      }
    }
    if (sawEvents) {
      const answer = texts[texts.length - 1] ?? "";
      const ok = exitCode === 0 && !error;
      if (ok) return { ok, summary: answer || "Done." };
      return { ok: false, summary: (error || stderr.trim() || answer || `Exited with code ${exitCode}`).slice(0, 500) };
    }
    const text = stdout.trim();
    if (exitCode === 0) return { ok: true, summary: text || "Done." };
    return { ok: false, summary: (stderr.trim() || text || `Exited with code ${exitCode}`).slice(0, 500) };
  }
}
