import { describe, expect, it } from "vitest";
import { ClineAgent } from "../../../src/agents/ClineAgent";

const req = { vaultPath: "/vault", systemPrompt: "SYS", userPrompt: "do it" };

describe("ClineAgent", () => {
  const a = new ClineAgent();
  it("builds a yolo json invocation with stdin prompt", () => {
    const inv = a.buildInvocation(req, { binary: "", model: "anthropic/claude-sonnet-4.6", allowedTools: "", extraArgs: "-P anthropic" });
    expect(inv.command).toBe("cline");
    expect(inv.args).toEqual(["--json", "-y", "--cwd", "/vault", "-m", "anthropic/claude-sonnet-4.6", "-P", "anthropic"]);
    expect(inv.args).not.toContain("-s");
    expect(inv.stdin).toBe("SYS\n\n---\n\ndo it");
  });
  it("parses NDJSON output", () => {
    const out = [
      '{"ts":"2026-10-07T04:49:40.000Z","type":"agent_event","event":{"type":"iteration_start"}}',
      '{"ts":"2026-10-07T04:49:43.041Z","type":"agent_event","event":{"type":"done","reason":"completed","text":"Hello!","iterations":1}}',
      '{"ts":"2026-10-07T04:49:43.050Z","type":"run_result","finishReason":"completed","iterations":1,"text":"Fixed the list in Notes/A.md.","durationMs":3000}',
    ].join("\n");
    expect(a.parseResult(out, "", 0)).toEqual({ ok: true, summary: "Fixed the list in Notes/A.md." });
    const aborted = '{"ts":"x","type":"run_result","finishReason":"aborted","text":""}\n{"ts":"x","type":"run_aborted","reason":"timeout","message":"Run timed out"}';
    expect(a.parseResult(aborted, "", 1)).toEqual({ ok: false, summary: "Run timed out" });
    expect(a.parseResult("", '{"type":"error","message":"Missing API key"}', 1)).toEqual({ ok: false, summary: "Missing API key" });
    expect(a.parseResult("", "command not found", 127)).toEqual({ ok: false, summary: "command not found" });
  });
});
