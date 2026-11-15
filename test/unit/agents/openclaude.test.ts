import { describe, expect, it } from "vitest";
import { OpenClaudeAgent } from "../../../src/agents/OpenClaudeAgent";

const cfg = { binary: "", model: "", allowedTools: "Read,Edit", extraArgs: "" };
const req = { vaultPath: "/v", systemPrompt: "SYS", userPrompt: "do it" };

describe("OpenClaudeAgent", () => {
  const a = new OpenClaudeAgent();
  it("builds a -p invocation with prompt on stdin", () => {
    const inv = a.buildInvocation(req, cfg);
    expect(inv.command).toBe("openclaude");
    expect(inv.args).toContain("-p");
    const t = inv.args.indexOf("--tools");
    expect(inv.args.slice(t, t + 3)).toEqual(["--tools", "Read", "Edit"]);
    const al = inv.args.indexOf("--allowedTools");
    expect(inv.args.slice(al, al + 3)).toEqual(["--allowedTools", "Read(./**)", "Edit(./**)"]);
    expect(inv.args[inv.args.indexOf("--append-system-prompt") + 1]).toBe("SYS");
    expect(inv.stdin).toBe("do it");
  });
  it("adds model and provider via extra args", () => {
    const inv = a.buildInvocation(req, { ...cfg, model: "gpt-5", extraArgs: "--provider openai" });
    expect(inv.args).toEqual(expect.arrayContaining(["--model", "gpt-5", "--provider", "openai"]));
  });
  it("parses json results", () => {
    const ok = '{"type":"result","subtype":"success","is_error":false,"duration_ms":4000,"num_turns":3,"result":"Created X.md","session_id":"abc"}';
    expect(a.parseResult(ok, "", 0)).toEqual({ ok: true, summary: "Created X.md" });
    expect(a.parseResult('{"type":"result","is_error":true,"subtype":"error_max_turns"}', "", 1)).toEqual({
      ok: false,
      summary: "Agent error (error_max_turns)",
    });
    expect(a.parseResult("", "command not found", 127)).toEqual({ ok: false, summary: "command not found" });
    expect(a.parseResult("plain", "", 0)).toEqual({ ok: true, summary: "plain" });
  });
});
