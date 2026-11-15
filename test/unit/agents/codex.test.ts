import { describe, expect, it } from "vitest";
import { CodexAgent } from "../../../src/agents/CodexAgent";

const cfg = { binary: "", model: "", allowedTools: "", extraArgs: "" };
const req = { vaultPath: "/v", systemPrompt: 'SYS "quoted"\nline2', userPrompt: "do it" };

describe("CodexAgent", () => {
  const a = new CodexAgent();
  it("builds codex exec with sandbox, no approvals and prompt on stdin", () => {
    const inv = a.buildInvocation(req, cfg);
    expect(inv.command).toBe("codex");
    expect(inv.args[0]).toBe("exec");
    expect(inv.args).toContain("--json");
    expect(inv.args.slice(inv.args.indexOf("--sandbox"), inv.args.indexOf("--sandbox") + 2)).toEqual(["--sandbox", "workspace-write"]);
    expect(inv.args).toContain("--skip-git-repo-check");
    expect(inv.args).toContain('approval_policy="never"');
    expect(inv.args).not.toContain("danger-full-access");
    expect(inv.args[inv.args.length - 1]).toBe("-");
    expect(inv.stdin).toBe("do it");
  });
  it("passes the system prompt as a TOML string developer_instructions override", () => {
    const inv = a.buildInvocation(req, cfg);
    const dev = inv.args.find((x) => x.startsWith("developer_instructions="))!;
    expect(dev).toBe('developer_instructions="SYS \\"quoted\\"\\nline2"');
    expect(JSON.parse(dev.slice("developer_instructions=".length))).toBe(req.systemPrompt);
  });
  it("adds model and extra args before the stdin marker", () => {
    const inv = a.buildInvocation(req, { ...cfg, binary: "/opt/codex", model: "gpt-5-codex", extraArgs: "--foo bar" });
    expect(inv.command).toBe("/opt/codex");
    expect(inv.args).toEqual(expect.arrayContaining(["-m", "gpt-5-codex", "--foo", "bar"]));
    expect(inv.args[inv.args.length - 1]).toBe("-");
  });
  it("parses the JSONL event stream", () => {
    const out = [
      '{"type":"thread.started","thread_id":"0199a213-81c0-7800-8aa1-bbab2a035a53"}',
      '{"type":"turn.started"}',
      '{"type":"item.completed","item":{"id":"item_0","type":"reasoning","text":"**Editing note**"}}',
      '{"type":"item.completed","item":{"id":"item_1","type":"file_change","changes":[{"path":"Notes/A.md","kind":"update"}],"status":"completed"}}',
      '{"type":"item.completed","item":{"id":"item_3","type":"agent_message","text":"Updated Notes/A.md."}}',
      '{"type":"turn.completed","usage":{"input_tokens":24763,"cached_input_tokens":24448,"output_tokens":122}}',
    ].join("\n");
    expect(a.parseResult(out, "Reading prompt from stdin...", 0)).toEqual({ ok: true, summary: "Updated Notes/A.md." });
  });
  it("reports turn failures and stderr", () => {
    const out = '{"type":"turn.started"}\n{"type":"turn.failed","error":{"message":"stream disconnected"}}';
    expect(a.parseResult(out, "", 1)).toEqual({ ok: false, summary: "stream disconnected" });
    expect(a.parseResult("", "Not logged in", 1)).toEqual({ ok: false, summary: "Not logged in" });
    expect(a.parseResult("plain answer", "", 0)).toEqual({ ok: true, summary: "plain answer" });
  });
});
