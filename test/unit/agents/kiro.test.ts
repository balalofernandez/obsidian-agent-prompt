import { describe, expect, it } from "vitest";
import { KiroAgent } from "../../../src/agents/KiroAgent";

const req = { vaultPath: "/v", systemPrompt: "SYS", userPrompt: "do it" };

describe("KiroAgent", () => {
  const a = new KiroAgent();
  const cfg = { binary: "", model: "", allowedTools: a.defaultAllowedTools, extraArgs: "" };
  it("builds a no-interactive chat with trusted file tools and stdin prompt", () => {
    const inv = a.buildInvocation(req, cfg);
    expect(inv.command).toBe("kiro-cli");
    expect(inv.args).toEqual(["chat", "--no-interactive", "--wrap", "never", "--trust-tools=read,write,glob,grep"]);
    expect(inv.args).not.toContain("--trust-all-tools");
    expect(inv.stdin).toBe("SYS\n\n---\n\ndo it");
  });
  it("omits --trust-tools when empty and adds model", () => {
    const inv = a.buildInvocation(req, { ...cfg, allowedTools: "", model: "claude-sonnet-4.5", extraArgs: "--v3" });
    expect(inv.args.some((x) => x.startsWith("--trust-tools"))).toBe(false);
    expect(inv.args).toEqual(expect.arrayContaining(["--model", "claude-sonnet-4.5", "--v3"]));
  });
  it("parses plain output, stripping ANSI codes", () => {
    const out = "\x1b[38;5;141m> \x1b[0mI updated Notes/A.md with a summary.\r\n";
    expect(a.parseResult(out, "", 0)).toEqual({ ok: true, summary: "> I updated Notes/A.md with a summary." });
    expect(a.parseResult("", "error: KIRO_API_KEY is not set", 1)).toEqual({ ok: false, summary: "error: KIRO_API_KEY is not set" });
    expect(a.parseResult("", "", 4).summary).toContain("agent is not available");
  });
});
