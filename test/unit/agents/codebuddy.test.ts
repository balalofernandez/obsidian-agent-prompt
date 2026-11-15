import { describe, expect, it } from "vitest";
import { CodeBuddyAgent } from "../../../src/agents/CodeBuddyAgent";

const cfg = { binary: "", model: "", allowedTools: "Read,Edit", extraArgs: "" };
const req = { vaultPath: "/v", systemPrompt: "SYS", userPrompt: "do it" };

describe("CodeBuddyAgent", () => {
  const a = new CodeBuddyAgent();
  it("builds a headless invocation scoped to cwd", () => {
    const inv = a.buildInvocation(req, { ...cfg, model: "sonnet" });
    expect(inv.command).toBe("codebuddy");
    expect(inv.args).toEqual([
      "-p", "--output-format", "json", "--append-system-prompt", "SYS", "--permission-mode", "dontAsk",
      "--tools", "Read,Edit", "--allowedTools", "Read(./**)", "Edit(./**)", "--model", "sonnet",
    ]);
    expect(inv.stdin).toBe("do it");
  });
  it("parses json results", () => {
    const ok = '{"type":"result","subtype":"success","is_error":false,"result":"Created Notes/B.md","session_id":"s1","total_cost_usd":0.01}';
    expect(a.parseResult(ok, "", 0)).toEqual({ ok: true, summary: "Created Notes/B.md" });
    expect(a.parseResult('{"type":"result","subtype":"error_max_turns","is_error":true}', "", 1).ok).toBe(false);
    expect(a.parseResult("", "codebuddy: not found", 127)).toEqual({ ok: false, summary: "codebuddy: not found" });
  });
});
