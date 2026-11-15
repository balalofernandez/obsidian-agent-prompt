import { describe, expect, it } from "vitest";
import { CommandCodeAgent } from "../../../src/agents/CommandCodeAgent";

const cfg = { binary: "", model: "", allowedTools: "", extraArgs: "" };
const req = { vaultPath: "/v", systemPrompt: "SYS", userPrompt: "do it" };

describe("CommandCodeAgent", () => {
  const a = new CommandCodeAgent();
  it("builds a headless invocation with prompt on stdin", () => {
    const inv = a.buildInvocation(req, cfg);
    expect(inv.command).toBe("command-code");
    expect(inv.args).toEqual(["-p", "--output-format", "json", "--yolo"]);
    expect(inv.stdin).toBe("SYS\n\n---\n\ndo it");
  });
  it("adds model and extra args", () => {
    const inv = a.buildInvocation(req, { ...cfg, binary: "cmdc", model: "claude-sonnet-4-6", extraArgs: "--max-turns 20" });
    expect(inv.command).toBe("cmdc");
    expect(inv.args).toEqual(expect.arrayContaining(["-m", "claude-sonnet-4-6", "--max-turns", "20"]));
  });
  it("parses NDJSON with a final result line", () => {
    const out = [
      '{"type":"event","event":{"type":"tool_call","name":"edit_file"}}',
      '{"type":"event","event":{"type":"text","text":"Working"}}',
      '{"type":"result","subtype":"success","sessionId":"s1","stopReason":"end_turn","usage":{},"durationMs":8421,"finalText":"Rewrote the intro in Notes/A.md."}',
    ].join("\n");
    expect(a.parseResult(out, "", 0)).toEqual({ ok: true, summary: "Rewrote the intro in Notes/A.md." });
    const err = '{"type":"result","subtype":"error","usage":{},"durationMs":10,"finalText":"","error":"Not authenticated"}';
    expect(a.parseResult(err, "", 3)).toEqual({ ok: false, summary: "Not authenticated" });
    expect(a.parseResult('{"type":"result","subtype":"max_turns","finalText":"partial"}', "", 8).ok).toBe(false);
    expect(a.parseResult("", "boom", 1)).toEqual({ ok: false, summary: "boom" });
  });
});
