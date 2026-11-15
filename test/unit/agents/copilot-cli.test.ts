import { describe, expect, it } from "vitest";
import { CopilotCliAgent } from "../../../src/agents/CopilotCliAgent";

const req = { vaultPath: "/v", systemPrompt: "SYS", userPrompt: "do it" };

describe("CopilotCliAgent", () => {
  const a = new CopilotCliAgent();
  const cfg = { binary: "", model: "", allowedTools: a.defaultAllowedTools, extraArgs: "" };
  it("pipes system prompt + task on stdin, allows file tools, denies shell/url", () => {
    const inv = a.buildInvocation(req, cfg);
    expect(inv.command).toBe("copilot");
    expect(inv.args).toEqual(expect.arrayContaining(["-s", "--no-ask-user", "--allow-tool=read,write", "--deny-tool=shell,url,memory"]));
    expect(inv.args.some((x) => x.startsWith("--allow-all") || x === "--yolo")).toBe(false);
    expect(inv.stdin).toBe("SYS\n\n---\n\ndo it");
  });
  it("does not deny kinds the user allowed and passes the model", () => {
    const inv = a.buildInvocation(req, { ...cfg, model: "claude-sonnet-4.5", allowedTools: "read, write, shell(git:*)" });
    expect(inv.args).toContain("--allow-tool=read,write,shell(git:*)");
    expect(inv.args).toContain("--deny-tool=url,memory");
    expect(inv.args).toContain("--model=claude-sonnet-4.5");
  });
  it("parses plain and JSONL output", () => {
    expect(a.parseResult("I created Notes/B.md with the outline.\n", "", 0)).toEqual({ ok: true, summary: "I created Notes/B.md with the outline." });
    const jsonl = '{"type":"session.start","data":{}}\n{"type":"assistant.message","data":{"content":"Done editing A.md"}}';
    expect(a.parseResult(jsonl, "", 0)).toEqual({ ok: true, summary: "Done editing A.md" });
    expect(a.parseResult("", "Error: not authenticated", 1)).toEqual({ ok: false, summary: "Error: not authenticated" });
  });
});
