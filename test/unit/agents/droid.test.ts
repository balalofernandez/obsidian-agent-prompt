import { describe, expect, it } from "vitest";
import { DroidAgent } from "../../../src/agents/DroidAgent";

const cfg = { binary: "", model: "", allowedTools: "", extraArgs: "" };
const req = { vaultPath: "/v", systemPrompt: "SYS", userPrompt: "do it" };

describe("DroidAgent", () => {
  const a = new DroidAgent();
  it("builds droid exec with stdin prompt, auto low and no shell by default", () => {
    const inv = a.buildInvocation(req, cfg);
    expect(inv.command).toBe("droid");
    expect(inv.args.slice(0, 3)).toEqual(["exec", "--auto", "low"]);
    expect(inv.args).toEqual(expect.arrayContaining(["-o", "json"]));
    expect(inv.args[inv.args.indexOf("--append-system-prompt") + 1]).toBe("SYS");
    expect(inv.args.slice(inv.args.indexOf("--remove-tools"), inv.args.indexOf("--remove-tools") + 2)).toEqual(["--remove-tools", "Execute"]);
    expect(inv.args).not.toContain("--only-tools");
    expect(inv.stdin).toBe("do it");
    expect(inv.args).not.toContain("do it");
  });
  it("uses --only-tools, model and extra args when set", () => {
    const inv = a.buildInvocation(req, { binary: "/opt/droid", model: "claude-opus-5-5", allowedTools: "Read, Grep", extraArgs: "-r high" });
    expect(inv.command).toBe("/opt/droid");
    expect(inv.args.slice(inv.args.indexOf("--only-tools"), inv.args.indexOf("--only-tools") + 2)).toEqual(["--only-tools", "Read,Grep"]);
    expect(inv.args).not.toContain("--remove-tools");
    expect(inv.args).toEqual(expect.arrayContaining(["-m", "claude-opus-5-5", "-r", "high"]));
  });
  it("parses the documented json result", () => {
    const out = JSON.stringify({
      type: "result", subtype: "success", is_error: false, duration_ms: 5657, num_turns: 1,
      result: "Added a summary section to Notes/A.md.", session_id: "8af22e0a", usage: { input_tokens: 4 },
    });
    expect(a.parseResult(out, "", 0)).toEqual({ ok: true, summary: "Added a summary section to Notes/A.md." });
    expect(a.parseResult('{"type":"result","subtype":"error","is_error":true}', "", 1).ok).toBe(false);
    expect(a.parseResult("plain text", "", 0)).toEqual({ ok: true, summary: "plain text" });
    expect(a.parseResult("", "Unknown tool: Foo", 1)).toEqual({ ok: false, summary: "Unknown tool: Foo" });
  });
});
