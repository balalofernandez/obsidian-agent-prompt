import { describe, expect, it } from "vitest";
import { AmpAgent } from "../../../src/agents/AmpAgent";

const req = { vaultPath: "/v", systemPrompt: "SYS", userPrompt: "do it" };

describe("AmpAgent", () => {
  const a = new AmpAgent();
  it("builds an execute-mode invocation with stdin prompt", () => {
    const inv = a.buildInvocation(req, { binary: "", model: "openai/gpt-6-astra", allowedTools: "", extraArgs: "" });
    expect(inv.command).toBe("amp");
    expect(inv.args).toEqual(["-x", "--stream-json", "--model", "openai/gpt-6-astra"]);
    expect(inv.stdin).toBe("SYS\n\n---\n\ndo it");
  });
  it("parses stream-json output (docs sample)", () => {
    const out = [
      '{"type":"system","subtype":"init","cwd":"/Users/orb/project","session_id":"T-1","tools":["Bash","create_file","edit_file"],"mcp_servers":[]}',
      '{"type":"user","message":{"role":"user","content":[{"type":"text","text":"list files using a tool"}]},"parent_tool_use_id":null,"session_id":"T-1"}',
      '{"type":"assistant","message":{"type":"message","role":"assistant","content":[{"type":"text","text":"Two files: index.js and README.md"}],"stop_reason":"end_turn"},"parent_tool_use_id":null,"session_id":"T-1"}',
      '{"type":"result","subtype":"success","duration_ms":7363,"is_error":false,"num_turns":2,"result":"Two files: index.js and README.md","session_id":"T-1"}',
    ].join("\n");
    expect(a.parseResult(out, "", 0)).toEqual({ ok: true, summary: "Two files: index.js and README.md" });
    const err = '{"type":"result","subtype":"error_during_execution","duration_ms":10,"is_error":true,"num_turns":0,"error":"Out of credits","session_id":"T-2"}';
    expect(a.parseResult(err, "", 1)).toEqual({ ok: false, summary: "Out of credits" });
    expect(a.parseResult("", "AMP_API_KEY not set", 1)).toEqual({ ok: false, summary: "AMP_API_KEY not set" });
  });
});
