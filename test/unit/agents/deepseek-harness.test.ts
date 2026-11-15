import { describe, expect, it } from "vitest";
import { DeepSeekHarnessAgent } from "../../../src/agents/DeepSeekHarnessAgent";

const cfg = { binary: "", model: "deepseek-v4", allowedTools: "", extraArgs: "" };
const req = { vaultPath: "/v", systemPrompt: "SYS", userPrompt: "do it" };

describe("DeepSeekHarnessAgent", () => {
  const a = new DeepSeekHarnessAgent();
  it("builds a headless invocation reading the task from stdin", () => {
    const inv = a.buildInvocation(req, cfg);
    expect(inv.command).toBe("dsh");
    expect(inv.args).toEqual([
      "headless", "--json", "--permission-mode", "workspace-write", "--approval-policy", "never", "-",
    ]);
    expect(inv.stdin).toContain("SYS");
    expect(inv.stdin).toContain("do it");
    expect(inv.stdin!.indexOf("SYS")).toBeLessThan(inv.stdin!.indexOf("do it"));
    expect(inv.args).not.toContain("--model");
  });
  it("puts extra args before the stdin marker", () => {
    const inv = a.buildInvocation(req, { ...cfg, extraArgs: "--add-dir /x" });
    expect(inv.args.slice(-3)).toEqual(["--add-dir", "/x", "-"]);
  });
  it("parses the JSONL event stream", () => {
    const out = [
      '{"type":"session","sessionId":"session-1","cwd":"/v"}',
      '{"type":"status","phase":"turn_start","turn":1}',
      '{"type":"tool_call","callId":"c1","tool":"write","input":{"path":"A.md"}}',
      '{"type":"tool_result","callId":"c1","status":"ok","result":"written"}',
      '{"type":"text","text":"Created A.md"}',
      '{"type":"status","phase":"turn_end","turn":1,"reason":"completed"}',
      '{"type":"final","text":"Created A.md with the summary."}',
    ].join("\n");
    expect(a.parseResult(out, "", 0)).toEqual({ ok: true, summary: "Created A.md with the summary." });
    const failed = '{"type":"session","sessionId":"s","cwd":"/v"}\n{"type":"status","phase":"turn_end","reason":"aborted"}\n{"type":"final","text":""}';
    expect(a.parseResult(failed, "", 1)).toEqual({ ok: false, summary: "Turn ended: aborted" });
    expect(a.parseResult('{"type":"error","message":"unknown option"}', "", 1)).toEqual({ ok: false, summary: "unknown option" });
  });
  it("falls back to plain output and stderr", () => {
    expect(a.parseResult("All done", "", 0)).toEqual({ ok: true, summary: "All done" });
    expect(a.parseResult("", "dsh: command not found", 127)).toEqual({ ok: false, summary: "dsh: command not found" });
  });
});
