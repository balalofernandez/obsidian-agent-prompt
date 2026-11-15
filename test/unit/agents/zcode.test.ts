import { describe, expect, it } from "vitest";
import { ZCodeAgent } from "../../../src/agents/ZCodeAgent";

const cfg = { binary: "", model: "glm-5", allowedTools: "", extraArgs: "" };
const req = { vaultPath: "/vault", systemPrompt: "SYS", userPrompt: "do it" };

describe("ZCodeAgent", () => {
  const a = new ZCodeAgent();
  it("builds a --prompt invocation in edit mode", () => {
    const inv = a.buildInvocation(req, cfg);
    expect(inv.command).toBe("zcode");
    expect(inv.args[inv.args.indexOf("--prompt") + 1]).toMatch(/^SYS[\s\S]*do it$/);
    expect(inv.args[inv.args.indexOf("--cwd") + 1]).toBe("/vault");
    expect(inv.args[inv.args.indexOf("--mode") + 1]).toBe("edit");
    expect(inv.args[inv.args.indexOf("--output-format") + 1]).toBe("json");
    expect(inv.args[inv.args.indexOf("--disallowed-tools") + 1]).toContain("Bash");
    expect(inv.args).not.toContain("--model");
    expect(inv.stdin).toBeUndefined();
  });
  it("parses the json result", () => {
    const out = '{"sessionId":"sess_1","traceId":"trace_1","response":"Rewrote the list in Notes/A.md.","eventCount":9,"projection":{"status":"idle","turnCount":1}}';
    expect(a.parseResult(out, "", 0)).toEqual({ ok: true, summary: "Rewrote the list in Notes/A.md." });
    const stream = '{"type":"init"}\n{"type":"result","result":"ok then"}';
    expect(a.parseResult(stream, "", 0)).toEqual({ ok: true, summary: "ok then" });
  });
  it("falls back to plain output and stderr", () => {
    expect(a.parseResult("Help text", "", 0)).toEqual({ ok: true, summary: "Help text" });
    expect(a.parseResult("", "No provider configured", 1)).toEqual({ ok: false, summary: "No provider configured" });
  });
});
