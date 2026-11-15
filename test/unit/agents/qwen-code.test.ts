import { describe, expect, it } from "vitest";
import { QwenCodeAgent } from "../../../src/agents/QwenCodeAgent";

const cfg = { binary: "", model: "", allowedTools: "", extraArgs: "" };
const req = { vaultPath: "/v", systemPrompt: "SYS", userPrompt: "do it" };

describe("QwenCodeAgent", () => {
  const a = new QwenCodeAgent();
  it("builds headless run with appended system prompt and task on stdin", () => {
    const inv = a.buildInvocation(req, cfg);
    expect(inv.command).toBe("qwen");
    expect(inv.args).toEqual(["--output-format", "json", "--approval-mode", "auto-edit", "--append-system-prompt", "SYS"]);
    expect(inv.stdin).toBe("do it");
  });
  it("adds model and allowed tools", () => {
    const inv = a.buildInvocation(req, { ...cfg, model: "qwen3-coder-plus", allowedTools: "read_file,glob" });
    expect(inv.args).toEqual(expect.arrayContaining(["--model", "qwen3-coder-plus", "--allowed-tools", "read_file,glob"]));
  });
  it("parses the json message array", () => {
    const out = JSON.stringify([
      { type: "system", subtype: "session_start", uuid: "u1", session_id: "s", model: "qwen3-coder-plus" },
      { type: "assistant", uuid: "u2", session_id: "s", message: { id: "m", type: "message", role: "assistant", model: "qwen3-coder-plus", content: [{ type: "text", text: "Updated A.md" }] }, parent_tool_use_id: null },
      { type: "result", subtype: "success", uuid: "u3", session_id: "s", is_error: false, duration_ms: 1234, result: "Updated A.md" },
    ], null, 2);
    expect(a.parseResult(out, "", 0)).toEqual({ ok: true, summary: "Updated A.md" });
    const err = JSON.stringify([{ type: "result", subtype: "error_during_execution", is_error: true, error: { message: "boom" } }]);
    expect(a.parseResult(err, "", 1)).toEqual({ ok: false, summary: "boom" });
    expect(a.parseResult("", "No auth type selected", 1)).toEqual({ ok: false, summary: "No auth type selected" });
  });
});
