import { spawn, ChildProcess } from "child_process";
import * as os from "os";
import * as path from "path";

export interface ProcessResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  cancelled: boolean;
}

export interface RunningProcess {
  promise: Promise<ProcessResult>;
  cancel(): void;
}

/**
 * GUI apps (Obsidian launched from a dock/launcher) don't inherit the shell
 * PATH, so CLIs installed in the usual user locations wouldn't be found.
 */
export function augmentedPath(current = process.env.PATH ?? ""): string {
  const home = os.homedir();
  const extra = [
    path.join(home, ".local", "bin"),
    path.join(home, ".claude", "local"),
    path.join(home, ".npm-global", "bin"),
    path.join(home, ".bun", "bin"),
    path.join(home, ".volta", "bin"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
  ];
  const parts = current.split(path.delimiter).filter(Boolean);
  for (const p of extra) if (!parts.includes(p)) parts.push(p);
  return parts.join(path.delimiter);
}

export function runProcess(opts: {
  command: string;
  args: string[];
  cwd: string;
  stdin?: string;
  env?: Record<string, string>;
  timeoutMs: number;
}): RunningProcess {
  let child: ChildProcess | null = null;
  let timedOut = false;
  let cancelled = false;

  const promise = new Promise<ProcessResult>((resolve) => {
    let stdout = "";
    let stderr = "";
    try {
      child = spawn(opts.command, opts.args, {
        cwd: opts.cwd,
        env: { ...process.env, PATH: augmentedPath(), ...opts.env },
        stdio: ["pipe", "pipe", "pipe"],
        shell: process.platform === "win32",
      });
    } catch (e) {
      resolve({ stdout, stderr: String(e), exitCode: null, timedOut, cancelled });
      return;
    }
    const timer = setTimeout(() => {
      timedOut = true;
      child?.kill("SIGTERM");
    }, opts.timeoutMs);

    child.stdout?.on("data", (d) => (stdout += d.toString()));
    child.stderr?.on("data", (d) => (stderr += d.toString()));
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ stdout, stderr: stderr + String(err), exitCode: null, timedOut, cancelled });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: code, timedOut, cancelled });
    });
    child.stdin?.on("error", () => { /* process may exit before reading stdin */ });
    if (opts.stdin !== undefined) child.stdin?.write(opts.stdin);
    child.stdin?.end();
  });

  return {
    promise,
    cancel() {
      cancelled = true;
      child?.kill("SIGTERM");
    },
  };
}
