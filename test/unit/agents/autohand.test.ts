import { describe, expect, it } from "vitest";
import { AutohandAgent } from "../../../src/agents/AutohandAgent";

const cfg = { binary: "", model: "", allowedTools: "read_file,apply_patch", extraArgs: "" };
const req = { vaultPath: "/v", systemPrompt: "SYS", userPrompt: "do it" };

describe("AutohandAgent", () => {
  const a = new AutohandAgent();
  it("builds a headless invocation with -p last and prompt on stdin", () => {
    const inv = a.buildInvocation(req, { ...cfg, model: "grok-4.7" });
    expect(inv.command).toBe("autohand");
    expect(inv.args).toEqual([
      "--json", "local", "--yes", "--append-system-prompt", "SYS",
      "--allowed-tools", "read_file,apply_patch", "--model", "grok-4.7", "-p",
    ]);
    expect(inv.stdin).toBe("do it");
  });
  it("parses result and error objects", () => {
    expect(a.parseResult('{"type":"result","content":"Updated Notes/A.md"}', "progress...", 0)).toEqual({ ok: true, summary: "Updated Notes/A.md" });
    expect(a.parseResult('{"type":"error","message":"Command did not complete successfully."}', "", 1)).toEqual({ ok: false, summary: "Command did not complete successfully." });
    expect(a.parseResult("", "budget exceeded", 1)).toEqual({ ok: false, summary: "budget exceeded" });
  });
});
