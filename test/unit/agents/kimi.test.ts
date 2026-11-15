import { describe, expect, it } from "vitest";
import { KimiAgent } from "../../../src/agents/KimiAgent";

const cfg = { binary: "", model: "", allowedTools: "", extraArgs: "" };
const req = { vaultPath: "/v", systemPrompt: "SYS", userPrompt: "do it" };

describe("KimiAgent", () => {
  const a = new KimiAgent();
  it("passes system prompt + task via -p with stream-json and no --yolo", () => {
    const inv = a.buildInvocation(req, cfg);
    expect(inv.command).toBe("kimi");
    expect(inv.args).toEqual(["-p", "SYS\n\n---\n\ndo it", "--output-format", "stream-json"]);
    expect(inv.args).not.toContain("--yolo");
  });
  it("adds the model", () => {
    expect(a.buildInvocation(req, { ...cfg, model: "kimi-k2" }).args).toEqual(expect.arrayContaining(["--model", "kimi-k2"]));
  });
  it("parses stream-json messages", () => {
    const out = [
      '{"role":"assistant","content":"Let me read the note.","tool_calls":[{"type":"function","id":"tc_1","function":{"name":"ReadFile","arguments":"{\\"path\\":\\"A.md\\"}"}}]}',
      '{"role":"tool","tool_call_id":"tc_1","content":"# A"}',
      '{"role":"assistant","content":[{"type":"text","text":"Added a summary to A.md."}]}',
    ].join("\n");
    expect(a.parseResult(out, "thinking...", 0)).toEqual({ ok: true, summary: "Added a summary to A.md." });
    expect(a.parseResult("", "LLM not set", 1)).toEqual({ ok: false, summary: "LLM not set" });
  });
});
