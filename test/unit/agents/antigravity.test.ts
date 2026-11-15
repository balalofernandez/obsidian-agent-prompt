import { describe, expect, it } from "vitest";
import { AntigravityAgent } from "../../../src/agents/AntigravityAgent";

const cfg = { binary: "", model: "", allowedTools: "", extraArgs: "" };
const req = { vaultPath: "/v", systemPrompt: "SYS", userPrompt: "do it" };

describe("AntigravityAgent", () => {
  const a = new AntigravityAgent();
  it("builds a print-mode invocation with accept-edits", () => {
    const inv = a.buildInvocation(req, cfg);
    expect(inv.command).toBe("agy");
    expect(inv.args.slice(0, 2)).toEqual(["--mode", "accept-edits"]);
    expect(inv.args).toContain("--sandbox");
    expect(inv.args[inv.args.indexOf("--output-format") + 1]).toBe("json");
    expect(inv.args).not.toContain("--dangerously-skip-permissions");
    const p = inv.args.indexOf("-p");
    expect(p).toBe(inv.args.length - 2);
    expect(inv.args[p + 1]).toMatch(/^SYS[\s\S]*do it$/);
    expect(inv.stdin).toBeUndefined();
  });
  it("adds model and extra args", () => {
    const inv = a.buildInvocation(req, { ...cfg, binary: "/opt/agy", model: "gemini-3-pro", extraArgs: "--effort high" });
    expect(inv.command).toBe("/opt/agy");
    expect(inv.args).toEqual(expect.arrayContaining(["--model", "gemini-3-pro", "--effort", "high"]));
  });
  it("parses the json envelope", () => {
    const ok = '{"conversation_id":"c1","status":"SUCCESS","response":"Rewrote the paragraph in Notes/A.md.","duration_seconds":12.3,"num_turns":3,"usage":{"input_tokens":1000,"output_tokens":80,"thinking_tokens":0,"cache_read_tokens":0,"total_tokens":1080}}';
    expect(a.parseResult(ok, "", 0)).toEqual({ ok: true, summary: "Rewrote the paragraph in Notes/A.md." });
    const err = '{"conversation_id":"c1","status":"ERROR","response":"","error":"not authenticated"}';
    expect(a.parseResult(err, "", 1)).toEqual({ ok: false, summary: "not authenticated" });
  });
  it("falls back to plain output and stderr", () => {
    expect(a.parseResult("hello", "", 0)).toEqual({ ok: true, summary: "hello" });
    expect(a.parseResult("", "boom", 2)).toEqual({ ok: false, summary: "boom" });
  });
});
