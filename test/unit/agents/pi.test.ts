import { describe, expect, it } from "vitest";
import { PiAgent } from "../../../src/agents/PiAgent";

const cfg = { binary: "", model: "", allowedTools: "read,edit,write", extraArgs: "" };
const req = { vaultPath: "/v", systemPrompt: "SYS", userPrompt: "do it" };

describe("PiAgent", () => {
  const a = new PiAgent();
  it("builds a print-mode json invocation with prompt on stdin", () => {
    const inv = a.buildInvocation(req, cfg);
    expect(inv.command).toBe("pi");
    expect(inv.args.slice(0, 4)).toEqual(["-p", "--mode", "json", "--no-session"]);
    expect(inv.args[inv.args.indexOf("--append-system-prompt") + 1]).toBe("SYS");
    expect(inv.args[inv.args.indexOf("--tools") + 1]).toBe("read,edit,write");
    expect(inv.stdin).toBe("do it");
    expect(inv.args).not.toContain("do it");
  });
  it("adds model and extra args", () => {
    const inv = a.buildInvocation(req, { ...cfg, model: "anthropic/claude-sonnet-4", extraArgs: "--thinking low" });
    expect(inv.args).toEqual(expect.arrayContaining(["--model", "anthropic/claude-sonnet-4", "--thinking", "low"]));
  });
  it("parses the final assistant message from JSONL", () => {
    const out = [
      '{"type":"session","version":3,"id":"abc"}',
      '{"type":"agent_start"}',
      '{"type":"message_end","message":{"role":"assistant","content":[{"type":"toolCall","id":"1","name":"edit"}],"stopReason":"toolUse"}}',
      '{"type":"message_end","message":{"role":"assistant","content":[{"type":"thinking","thinking":"..."},{"type":"text","text":"Updated Notes/A.md."}],"stopReason":"stop"}}',
      '{"type":"agent_end","messages":[{"role":"assistant","content":[{"type":"text","text":"Updated Notes/A.md."}],"stopReason":"stop"}],"willRetry":false}',
    ].join("\n");
    expect(a.parseResult(out, "", 0)).toEqual({ ok: true, summary: "Updated Notes/A.md." });
  });
  it("reports errors", () => {
    const out = '{"type":"message_end","message":{"role":"assistant","content":[],"stopReason":"error","errorMessage":"No API key"}}';
    expect(a.parseResult(out, "", 1)).toEqual({ ok: false, summary: "No API key" });
    expect(a.parseResult("", "pi: command not found", 127)).toEqual({ ok: false, summary: "pi: command not found" });
    expect(a.parseResult("plain answer", "", 0)).toEqual({ ok: true, summary: "plain answer" });
  });
});
