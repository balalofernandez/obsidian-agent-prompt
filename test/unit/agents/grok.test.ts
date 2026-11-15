import { describe, expect, it } from "vitest";
import { GrokAgent } from "../../../src/agents/GrokAgent";

const req = { vaultPath: "/v", systemPrompt: "SYS", userPrompt: "do it" };

describe("GrokAgent", () => {
  const a = new GrokAgent();
  const cfg = { binary: "", model: "", allowedTools: a.defaultAllowedTools, extraArgs: "" };
  it("builds headless run with rules, dontAsk, allow rules and strict sandbox", () => {
    const inv = a.buildInvocation(req, cfg);
    expect(inv.command).toBe("grok");
    const at = (f: string) => inv.args[inv.args.indexOf(f) + 1];
    expect(at("-p")).toBe("do it");
    expect(at("--rules")).toBe("SYS");
    expect(at("--output-format")).toBe("json");
    expect(at("--permission-mode")).toBe("dontAsk");
    expect(at("--sandbox")).toBe("strict");
    expect(inv.args).toContain("--no-auto-update");
    expect(inv.args).toContain("--disable-web-search");
    expect(inv.args).not.toContain("--always-approve");
    const allows = inv.args.flatMap((x, i) => (x === "--allow" ? [inv.args[i + 1]] : []));
    expect(allows).toEqual(["Read", "Grep", "Edit"]);
  });
  it("keeps patterns with commas inside parens and adds the model", () => {
    const inv = a.buildInvocation(req, { ...cfg, model: "grok-code-fast-1", allowedTools: "Read, Bash(git log, git status)" });
    const allows = inv.args.flatMap((x, i) => (x === "--allow" ? [inv.args[i + 1]] : []));
    expect(allows).toEqual(["Read", "Bash(git log, git status)"]);
    expect(inv.args).toEqual(expect.arrayContaining(["--model", "grok-code-fast-1"]));
  });
  it("parses json output defensively", () => {
    expect(a.parseResult('{"result":"Edited Notes/A.md","session_id":"x"}', "", 0)).toEqual({ ok: true, summary: "Edited Notes/A.md" });
    expect(a.parseResult('{"message":{"content":[{"type":"text","text":"Hi"}]}}', "", 0)).toEqual({ ok: true, summary: "Hi" });
    expect(a.parseResult('{"error":{"message":"rate limited"}}', "", 1)).toEqual({ ok: false, summary: "rate limited" });
    expect(a.parseResult("plain text", "", 0)).toEqual({ ok: true, summary: "plain text" });
    expect(a.parseResult("", "not logged in", 1)).toEqual({ ok: false, summary: "not logged in" });
  });
});
