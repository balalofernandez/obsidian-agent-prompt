import { describe, expect, it } from "vitest";
import { KiloCodeAgent } from "../../../src/agents/KiloCodeAgent";

const req = { vaultPath: "/v", systemPrompt: "SYS", userPrompt: "do it" };

describe("KiloCodeAgent", () => {
  const a = new KiloCodeAgent();
  const cfg = { binary: "", model: "", allowedTools: a.defaultAllowedTools, extraArgs: "" };
  it("builds kilo run with stdin prompt and a deny-by-default permission config", () => {
    const inv = a.buildInvocation(req, cfg);
    expect(inv.command).toBe("kilo");
    expect(inv.args).toEqual(["run", "--format", "json", "--auto"]);
    expect(inv.stdin).toBe("SYS\n\n---\n\ndo it");
    const conf = JSON.parse(inv.env!.KILO_CONFIG_CONTENT);
    expect(Object.keys(conf.permission)[0]).toBe("*");
    expect(conf.permission).toEqual({
      "*": "deny", read: "allow", edit: "allow", glob: "allow", grep: "allow", list: "allow", external_directory: "deny",
    });
  });
  it("adds model and extra args", () => {
    const inv = a.buildInvocation(req, { ...cfg, model: "anthropic/claude-sonnet-4-6", extraArgs: "--variant high" });
    expect(inv.args).toEqual(expect.arrayContaining(["-m", "anthropic/claude-sonnet-4-6", "--variant", "high"]));
  });
  it("parses JSONL events", () => {
    const out = [
      '{"type":"step_start","timestamp":1,"sessionID":"ses_1","part":{"type":"step-start"}}',
      '{"type":"tool_use","timestamp":2,"sessionID":"ses_1","part":{"type":"tool","tool":"edit","state":{"status":"completed"}}}',
      '{"type":"text","timestamp":3,"sessionID":"ses_1","part":{"type":"text","text":"Added a table to Notes/A.md.","time":{"start":1,"end":3}}}',
      '{"type":"step_finish","timestamp":4,"sessionID":"ses_1","part":{"type":"step-finish"}}',
    ].join("\n");
    expect(a.parseResult(out, "", 0)).toEqual({ ok: true, summary: "Added a table to Notes/A.md." });
    const err = '{"type":"error","timestamp":1,"sessionID":"ses_1","error":{"name":"ProviderAuthError","data":{"message":"No API key"}}}';
    expect(a.parseResult(err, "No API key", 1)).toEqual({ ok: false, summary: "No API key" });
    expect(a.parseResult("", "You must provide a message or a command", 1).ok).toBe(false);
  });
});
