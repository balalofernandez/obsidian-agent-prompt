import { AgentConfig, AgentInvocation, AgentRequest, AgentResult, AgentRunner, splitArgs } from "./AgentRunner";

/**
 * DeepSeek Harness (`dsh`, npm `@deepseek-ai/dsh`), DeepSeek's official
 * open-source agent harness. Headless profile docs:
 *   https://github.com/deepseek-ai/deepseek-harness/blob/main/docs/cli-help.md
 *   https://github.com/deepseek-ai/deepseek-harness/blob/main/packages/bundle/headless/README.md
 *
 * Command shape:
 *   dsh headless --json --permission-mode workspace-write --approval-policy never -
 *   (task on stdin; `-` = read stdin)
 *
 * There is no system-prompt flag, so the system prompt is prepended to the task.
 * There is no per-run `--model` flag ("deliberately out of scope"): the model
 * comes from the dsh profile / provider configuration, so `cfg.model` is ignored.
 * `--json` prints JSONL events: session, status, text, thinking, tool_call,
 * tool_result, error, and a terminal `{"type":"final","text":...}` line.
 * Exit 0 means the turn completed; 1 means it aborted or errored.
 * `workspace-write` fences file writes (fs tools and sandboxed bash) to the cwd;
 * reads and network are not covered by the sandbox modes. `--approval-policy
 * never` rejects anything that would need a human (e.g. sandbox escalation).
 */
export class DeepSeekHarnessAgent implements AgentRunner {
  id = "deepseek-harness";
  displayName = "DeepSeek Harness (dsh)";
  defaultBinary = "dsh";
  defaultAllowedTools = "";
  docsUrl = "https://github.com/deepseek-ai/deepseek-harness/blob/main/docs/cli-help.md";
  isolation = "partial" as const;
  safetyNote =
    "The workspace-write sandbox limits file writes and shell commands to the vault, but the agent can still read files outside it and reach the network.";
  verified = false;

  buildInvocation(req: AgentRequest, cfg: AgentConfig): AgentInvocation {
    const args = [
      "headless",
      "--json",
      "--permission-mode", "workspace-write",
      "--approval-policy", "never",
      ...splitArgs(cfg.extraArgs),
      "-",
    ];
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
    let final = "";
    let lastText = "";
    let error = "";
    let endReason = "";
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
      if (ev.type === "final" && typeof ev.text === "string") final = ev.text.trim();
      else if (ev.type === "text" && typeof ev.text === "string" && ev.text.trim()) lastText = ev.text.trim();
      else if (ev.type === "error" && typeof ev.message === "string") error = ev.message;
      else if (ev.type === "status" && ev.phase === "turn_end" && typeof ev.reason === "string") endReason = ev.reason;
    }
    if (sawEvents) {
      const answer = final || lastText;
      const ok = exitCode === 0 && !error;
      if (ok) return { ok, summary: answer || "Done." };
      const why = error || (endReason && endReason !== "completed" ? `Turn ended: ${endReason}` : "");
      return {
        ok: false,
        summary: (why || stderr.trim() || answer || `Exited with code ${exitCode}`).slice(0, 500),
      };
    }
    const text = stdout.trim();
    if (exitCode === 0) return { ok: true, summary: text || "Done." };
    return { ok: false, summary: (stderr.trim() || text || `Exited with code ${exitCode}`).slice(0, 500) };
  }
}
