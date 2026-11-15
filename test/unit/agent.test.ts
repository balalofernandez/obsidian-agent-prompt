import { describe, expect, it } from "vitest";
import { ClaudeCodeAgent } from "../../src/agents/ClaudeCodeAgent";
import { splitArgs } from "../../src/agents/AgentRunner";
import { buildUserPrompt, EditorContext } from "../../src/context";

const cfg = { binary: "claude", model: "", allowedTools: "Read,Edit", extraArgs: "" };
const req = { vaultPath: "/v", systemPrompt: "SYS", userPrompt: "do it" };

describe("ClaudeCodeAgent", () => {
  const a = new ClaudeCodeAgent();
  it("builds a headless invocation with prompt on stdin", () => {
    const inv = a.buildInvocation(req, cfg);
    expect(inv.command).toBe("claude");
    expect(inv.args).toContain("-p");
    const t = inv.args.indexOf("--tools");
    expect(inv.args.slice(t, t + 3)).toEqual(["--tools", "Read", "Edit"]);
    const a2 = inv.args.indexOf("--allowedTools");
    expect(inv.args.slice(a2, a2 + 3)).toEqual(["--allowedTools", "Read(./**)", "Edit(./**)"]);
    expect(inv.args).not.toContain("--permission-mode");
    expect(inv.args[inv.args.indexOf("--append-system-prompt") + 1]).toBe("SYS");
    expect(inv.stdin).toBe("do it");
    expect(inv.args).not.toContain("do it");
  });
  it("adds model and extra args, falls back to default binary", () => {
    const inv = a.buildInvocation(req, { ...cfg, binary: " ", model: "opus", extraArgs: '--foo "a b"' });
    expect(inv.command).toBe("claude");
    expect(inv.args).toEqual(expect.arrayContaining(["--model", "opus", "--foo", "a b"]));
  });
  it("parses json results", () => {
    expect(a.parseResult('{"type":"result","is_error":false,"result":"Created X.md"}', "", 0)).toEqual({ ok: true, summary: "Created X.md" });
    expect(a.parseResult('{"is_error":true,"subtype":"error_max_turns"}', "", 1).ok).toBe(false);
    expect(a.parseResult("", "command not found", 127)).toEqual({ ok: false, summary: "command not found" });
  });
});

describe("splitArgs", () => {
  it("honours quotes", () => expect(splitArgs(`a "b c" 'd e' f`)).toEqual(["a", "b c", "d e", "f"]));
});

describe("buildUserPrompt", () => {
  const base: EditorContext = {
    notePath: "Notes/A.md", noteTitle: "A", selection: "",
    from: { line: 2, ch: 0 }, to: { line: 2, ch: 0 }, cursor: { line: 2, ch: 0 }, cursorLine: "hello",
  };
  it("includes selection verbatim", () => {
    const p = buildUserPrompt("write a page", { ...base, selection: "some text", to: { line: 2, ch: 9 } });
    expect(p).toContain("<selection>\nsome text\n</selection>");
    expect(p).toContain("Notes/A.md");
  });
  it("describes cursor when no selection", () => {
    const p = buildUserPrompt("improve", base);
    expect(p).toContain("No text is selected");
    expect(p).toContain("line 3");
  });
});
