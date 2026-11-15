import { describe, expect, it } from "vitest";
import { GeminiCliAgent } from "../../../src/agents/GeminiCliAgent";

const cfg = { binary: "", model: "", allowedTools: "", extraArgs: "" };
const req = { vaultPath: "/v", systemPrompt: "SYS", userPrompt: "do it" };

describe("GeminiCliAgent", () => {
  const a = new GeminiCliAgent();
  it("builds a headless invocation with system prompt + task on stdin", () => {
    const inv = a.buildInvocation(req, cfg);
    expect(inv.command).toBe("gemini");
    expect(inv.args).toEqual(["--output-format", "json", "--approval-mode", "auto_edit"]);
    expect(inv.args).not.toContain("--yolo");
    expect(inv.stdin).toBe("SYS\n\n---\n\ndo it");
  });
  it("adds model, allowed tools and extra args", () => {
    const inv = a.buildInvocation(req, { ...cfg, model: "gemini-2.5-pro", allowedTools: "read_file, glob", extraArgs: "--sandbox" });
    expect(inv.args).toEqual(expect.arrayContaining(["--model", "gemini-2.5-pro", "--allowed-tools", "read_file,glob", "--sandbox"]));
  });
  it("parses json output", () => {
    const out = JSON.stringify({
      response: "Added a summary section to Notes/A.md.",
      stats: { models: { "gemini-2.5-pro": { api: { totalRequests: 2 } } }, tools: { totalCalls: 1 } },
    }, null, 2);
    expect(a.parseResult(out, "Loaded cached credentials.", 0)).toEqual({ ok: true, summary: "Added a summary section to Notes/A.md." });
    const err = JSON.stringify({ error: { type: "ApiError", message: "Quota exceeded", code: 429 } });
    expect(a.parseResult(err, "", 1)).toEqual({ ok: false, summary: "Quota exceeded" });
    expect(a.parseResult("", "command not found", 127)).toEqual({ ok: false, summary: "command not found" });
  });
});
