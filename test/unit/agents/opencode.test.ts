import { describe, expect, it } from "vitest";
import { OpenCodeAgent } from "../../../src/agents/OpenCodeAgent";

const req = { vaultPath: "/v", systemPrompt: "SYS", userPrompt: "do it" };

describe("OpenCodeAgent", () => {
  const a = new OpenCodeAgent();
  it("builds a run invocation with stdin prompt", () => {
    const inv = a.buildInvocation(req, { binary: "", model: "anthropic/claude-sonnet-4-5", allowedTools: "", extraArgs: "" });
    expect(inv.command).toBe("opencode");
    expect(inv.args).toEqual(["run", "--format", "json", "--model", "anthropic/claude-sonnet-4-5"]);
    expect(inv.args).not.toContain("--dangerously-skip-permissions");
    expect(inv.stdin).toBe("SYS\n\n---\n\ndo it");
  });
  it("parses JSONL events (full text and deltas)", () => {
    const out = [
      '{"type":"step_start","timestamp":1,"sessionID":"s","part":{"id":"p0","type":"step-start"}}',
      '{"type":"text","timestamp":2,"sessionID":"s","part":{"id":"p1","type":"text","text":"Let me read the note."}}',
      '{"type":"tool_use","timestamp":3,"sessionID":"s","part":{"id":"p2","type":"tool","tool":"edit","state":{"status":"completed"}}}',
      '{"type":"text","timestamp":4,"sessionID":"s","part":{"id":"p3","type":"text","text":"Added "}}',
      '{"type":"text","timestamp":5,"sessionID":"s","part":{"id":"p3","type":"text","text":"a summary."}}',
      '{"type":"step_finish","timestamp":6,"sessionID":"s","part":{"id":"p4","type":"step-finish"}}',
    ].join("\n");
    expect(a.parseResult(out, "", 0)).toEqual({ ok: true, summary: "Added a summary." });
    const v1 = '{"type":"text","part":{"id":"p","text":"Hello"}}\n{"type":"text","part":{"id":"p","text":"Hello world"}}';
    expect(a.parseResult(v1, "", 0).summary).toBe("Hello world");
  });
  it("reports errors", () => {
    const e2 = '{"type":"error","timestamp":1,"sessionID":"","error":{"type":"unknown","message":"Model not found"}}';
    expect(a.parseResult(e2, "", 1)).toEqual({ ok: false, summary: "Model not found" });
    const e1 = '{"type":"error","error":{"name":"ProviderAuthError","data":{"message":"Bad key"}}}';
    expect(a.parseResult(e1, "", 0)).toEqual({ ok: false, summary: "Bad key" });
    expect(a.parseResult("", "boom", 1)).toEqual({ ok: false, summary: "boom" });
  });
});
