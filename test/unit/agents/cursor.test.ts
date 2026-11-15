import { describe, expect, it } from "vitest";
import { CursorAgent } from "../../../src/agents/CursorAgent";

const cfg = { binary: "", model: "", allowedTools: "", extraArgs: "" };
const req = { vaultPath: "/v", systemPrompt: "SYS", userPrompt: "do it" };

describe("CursorAgent", () => {
  const a = new CursorAgent();
  it("builds print mode with sandbox, trust, no --force and the prompt last", () => {
    const inv = a.buildInvocation(req, cfg);
    expect(inv.command).toBe("cursor-agent");
    expect(inv.args.slice(0, 6)).toEqual(["-p", "--output-format", "json", "--trust", "--sandbox", "enabled"]);
    expect(inv.args).not.toContain("--force");
    expect(inv.args).not.toContain("--yolo");
    expect(inv.args[inv.args.length - 1]).toBe("SYS\n\n---\n\ndo it");
    expect(inv.stdin).toBeUndefined();
  });
  it("adds the model", () => {
    const inv = a.buildInvocation(req, { ...cfg, model: "sonnet-4.5" });
    expect(inv.args).toEqual(expect.arrayContaining(["--model", "sonnet-4.5"]));
  });
  it("parses json and stream-json results", () => {
    const json = '{"type":"result","subtype":"success","is_error":false,"duration_ms":1234,"duration_api_ms":1234,"result":"Rewrote the intro.","session_id":"abc"}\n';
    expect(a.parseResult(json, "", 0)).toEqual({ ok: true, summary: "Rewrote the intro." });
    const stream = [
      '{"type":"system","subtype":"init","apiKeySource":"login","cwd":"/v","session_id":"abc","model":"Claude 4 Sonnet","permissionMode":"default"}',
      '{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"Working"}]},"session_id":"abc"}',
      '{"type":"result","subtype":"success","is_error":false,"duration_ms":10,"result":"All done","session_id":"abc"}',
    ].join("\n");
    expect(a.parseResult(stream, "", 0)).toEqual({ ok: true, summary: "All done" });
    expect(a.parseResult("", "Authentication required", 1)).toEqual({ ok: false, summary: "Authentication required" });
  });
});
