/**
 * Abstraction over a CLI coding agent (Claude Code, Codex, Gemini CLI, ...).
 *
 * A runner only knows how to turn a request into a process invocation and how
 * to interpret its output. Spawning, timeouts and cancellation are handled
 * generically by `runProcess`.
 */
export interface AgentRequest {
  /** Absolute path of the vault root. Used as the process cwd. */
  vaultPath: string;
  /** Obsidian-specific instructions appended to the agent's system prompt. */
  systemPrompt: string;
  /** The task: user prompt + editor context. */
  userPrompt: string;
}

export interface AgentConfig {
  /** Binary or absolute path to it. Empty = runner default. */
  binary: string;
  /** Optional model override. */
  model: string;
  /** Tools the agent may use without asking (runner-specific names). */
  allowedTools: string;
  /** Extra raw CLI args, whitespace separated. */
  extraArgs: string;
}

export interface AgentInvocation {
  command: string;
  args: string[];
  /** Data written to the process stdin (then stdin is closed). */
  stdin?: string;
  env?: Record<string, string>;
}

export interface AgentResult {
  ok: boolean;
  /** Short human readable summary of what the agent did / why it failed. */
  summary: string;
}

export interface AgentRunner {
  id: string;
  displayName: string;
  defaultBinary: string;
  /** Default value for the "allowed tools" setting. Empty if the CLI has no such concept. */
  defaultAllowedTools: string;
  /** Official docs for the headless / non-interactive mode. */
  docsUrl: string;
  /**
   * How well the CLI can be confined to the vault, shown in settings.
   * "vault": tools verified to be limited to the vault folder.
   * "partial": some restriction (e.g. no shell) but not verified to the vault.
   * "none": the agent runs with your user's full permissions.
   */
  isolation: "vault" | "partial" | "none";
  /** One sentence shown under the agent dropdown explaining `isolation`. */
  safetyNote: string;
  /** True once someone ran this runner end to end against the real CLI. */
  verified: boolean;
  buildInvocation(req: AgentRequest, cfg: AgentConfig): AgentInvocation;
  /** Args used by the "Test agent" button (e.g. --version). */
  versionArgs(): string[];
  parseResult(stdout: string, stderr: string, exitCode: number | null): AgentResult;
}

/** Split a string of CLI args honoring simple single/double quotes. */
export function splitArgs(input: string): string[] {
  const out: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input)) !== null) out.push(m[1] ?? m[2] ?? m[3]);
  return out;
}
