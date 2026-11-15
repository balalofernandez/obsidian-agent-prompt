import { describe, expect, it } from "vitest";
import { MimoCodeAgent } from "../../../src/agents/MimoCodeAgent";

const req = { vaultPath: "/v", systemPrompt: "SYS", userPrompt: "do it" };

describe("MimoCodeAgent", () => {
  const a = new MimoCodeAgent();
  const cfg = { binary: "", model: "", allowedTools: a.defaultAllowedTools, extraArgs: "" };
  it("builds `mimo run` with stdin and a permission env", () => {
    const inv = a.buildInvocation(req, cfg);
    expect(inv.command).toBe("mimo");
    expect(inv.args).toEqual(["run", "--format", "json"]);
    expect(inv.stdin).toMatch(/^SYS[\s\S]*do it$/);
    const perm = JSON.parse(inv.env!.MIMOCODE_PERMISSION);
    expect(perm.bash).toBe("deny");
    expect(perm.external_directory).toBe("deny");
    expect(perm.webfetch).toBe("deny");
    expect(perm.edit).toBe("allow");
    expect(perm.read).toBe("allow");
  });
  it("lets allowed tools override the deny list and adds model", () => {
    const inv = a.buildInvocation(req, { ...cfg, allowedTools: "read,edit,bash", model: "xiaomi/mimo-v2.5-pro" });
    expect(JSON.parse(inv.env!.MIMOCODE_PERMISSION).bash).toBe("allow");
    expect(inv.args).toEqual(["run", "--format", "json", "--model", "xiaomi/mimo-v2.5-pro"]);
  });
  it("parses JSONL events", () => {
    const out = [
      '{"type":"step_start","timestamp":1,"sessionID":"ses_1","part":{"type":"step-start"}}',
      '{"type":"tool_use","timestamp":2,"sessionID":"ses_1","part":{"type":"tool","tool":"edit","state":{"status":"completed"}}}',
      '{"type":"text","timestamp":3,"sessionID":"ses_1","part":{"type":"text","text":"Updated Notes/A.md.","time":{"start":2,"end":3}}}',
      '{"type":"step_finish","timestamp":4,"sessionID":"ses_1","part":{"type":"step-finish"}}',
    ].join("\n");
    expect(a.parseResult(out, "", 0)).toEqual({ ok: true, summary: "Updated Notes/A.md." });
    const err = '{"type":"error","timestamp":1,"sessionID":"ses_1","error":{"name":"ProviderAuthError","data":{"message":"Invalid API key"}}}';
    expect(a.parseResult(err, "", 0)).toEqual({ ok: false, summary: "Invalid API key" });
  });
  it("falls back to plain output and stderr", () => {
    expect(a.parseResult("done", "", 0)).toEqual({ ok: true, summary: "done" });
    expect(a.parseResult("", "spawn mimo ENOENT", null)).toEqual({ ok: false, summary: "spawn mimo ENOENT" });
  });
});
