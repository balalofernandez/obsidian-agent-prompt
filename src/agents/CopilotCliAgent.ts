import { AgentConfig, AgentInvocation, AgentRequest, AgentResult, AgentRunner, splitArgs } from "./AgentRunner";

/**
 * GitHub Copilot CLI, programmatic mode (piped prompt).
 * Docs: https://docs.github.com/en/copilot/how-tos/copilot-cli/automate-copilot-cli/run-cli-programmatically
 *       https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference
 *
 * Command shape:
 *   copilot -s --no-ask-user --disallow-temp-dir
 *     --allow-tool=read,write --deny-tool=shell,url,memory [--model=<model>]
 *     (stdin: system prompt + task)
 *
 * A piped prompt runs non-interactively (same as `-p`, without argv length
 * limits). There is no system prompt flag, so the Obsidian instructions are
 * prepended to the task. File tools are path-verified against the cwd (the
 * vault) unless `--allow-all-paths` is passed; we never pass it.
 * Tool permission patterns use the `Kind(argument)` syntax
 * (kinds: shell, write, read, url, memory, <mcp-server>).
 */
export class CopilotCliAgent implements AgentRunner {
  id = "copilot-cli";
  displayName = "GitHub Copilot CLI";
  defaultBinary = "copilot";
  defaultAllowedTools = "read,write";
  docsUrl = "https://docs.github.com/en/copilot/how-tos/copilot-cli/automate-copilot-cli/run-cli-programmatically";
  isolation = "partial" as const;
  safetyNote =
    "Shell and web access are denied and file tools are checked against the vault folder, but this is a tool level check, not an OS sandbox.";
  verified = false;

  buildInvocation(req: AgentRequest, cfg: AgentConfig): AgentInvocation {
    const args = ["-s", "--no-ask-user", "--disallow-temp-dir"];
    const tools = cfg.allowedTools.split(/,(?![^(]*\))/).map((t) => t.trim()).filter(Boolean);
    if (tools.length) args.push(`--allow-tool=${tools.join(",")}`);
    // Deny risky kinds unless the user explicitly allowed (part of) them.
    const allowedKinds = new Set(tools.map((t) => t.replace(/\(.*$/, "").toLowerCase()));
    const deny = ["shell", "url", "memory"].filter((k) => !allowedKinds.has(k));
    if (deny.length) args.push(`--deny-tool=${deny.join(",")}`);
    if (cfg.model.trim()) args.push(`--model=${cfg.model.trim()}`);
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
    // Default output is plain text (-s). If the user added
    // `--output-format json` (JSONL), pick the last assistant text we can find.
    const fromJson = lastAssistantText(text);
    const summary = fromJson ?? text;
    if (exitCode === 0) return { ok: true, summary: summary || "Done." };
    return { ok: false, summary: (stderr.trim() || summary || `Exited with code ${exitCode}`).slice(0, 500) };
  }
}

function lastAssistantText(text: string): string | null {
  let found: string | null = null;
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t.startsWith("{")) continue;
    try {
      const ev = JSON.parse(t);
      const type = String(ev?.type ?? "");
      if (!/assistant|result/i.test(type)) continue;
      const c = ev.data?.content ?? ev.data?.result ?? ev.content ?? ev.result;
      if (typeof c === "string" && c.trim()) found = c.trim();
    } catch {
      /* not JSON */
    }
  }
  return found;
}
