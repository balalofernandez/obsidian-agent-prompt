import { describe, expect, it } from "vitest";
import { GooseAgent } from "../../../src/agents/GooseAgent";

const req = { vaultPath: "/v", systemPrompt: "SYS", userPrompt: "do it" };

describe("GooseAgent", () => {
  const a = new GooseAgent();
  it("builds a headless run with stdin instructions and auto mode", () => {
    const inv = a.buildInvocation(req, { binary: "", model: "gpt-5", allowedTools: "", extraArgs: "" });
    expect(inv.command).toBe("goose");
    expect(inv.args).toEqual([
      "run", "-i", "-", "--system", "SYS", "--no-session", "--output-format", "json", "--model", "gpt-5",
    ]);
    expect(inv.stdin).toBe("do it");
    expect(inv.env).toEqual({ GOOSE_MODE: "auto" });
  });
  it("parses the json output", () => {
    const out = JSON.stringify({
      messages: [
        { id: "1", role: "user", created: 1, content: [{ type: "text", text: "do it" }] },
        { id: "2", role: "assistant", created: 2, content: [{ type: "toolRequest", id: "t", toolCall: {} }] },
        { id: "3", role: "user", created: 3, content: [{ type: "toolResponse", id: "t", toolResult: {} }] },
        { id: "4", role: "assistant", created: 4, content: [{ type: "text", text: "Rewrote the intro of Notes/A.md." }] },
      ],
      metadata: { total_tokens: 1234, status: "completed" },
    }, null, 2);
    expect(a.parseResult(out, "", 0)).toEqual({ ok: true, summary: "Rewrote the intro of Notes/A.md." });
    const err = JSON.stringify({ messages: [], metadata: { total_tokens: null, status: "error" } });
    expect(a.parseResult(err, "provider failed", 1)).toEqual({ ok: false, summary: "provider failed" });
    expect(a.parseResult("", "No provider configured", 1)).toEqual({ ok: false, summary: "No provider configured" });
  });
});
