import { describe, expect, it } from "vitest";
import { HermesAgent } from "../../../src/agents/HermesAgent";

const cfg = { binary: "", model: "", allowedTools: "file", extraArgs: "" };
const req = { vaultPath: "/v", systemPrompt: "SYS", userPrompt: "do it" };

describe("HermesAgent", () => {
  const a = new HermesAgent();
  it("builds a one-shot invocation reading the query from stdin", () => {
    const inv = a.buildInvocation(req, { ...cfg, model: "anthropic/claude-sonnet-4" });
    expect(inv.command).toBe("hermes");
    expect(inv.args).toEqual(["chat", "--oneshot", "-Q", "--query-file", "-", "--toolsets", "file", "-m", "anthropic/claude-sonnet-4"]);
    expect(inv.stdin).toBe("SYS\n\n---\n\ndo it");
  });
  it("omits toolsets when empty", () => {
    expect(a.buildInvocation(req, { ...cfg, allowedTools: "" }).args).not.toContain("--toolsets");
  });
  it("parses plain output and exit codes", () => {
    expect(a.parseResult("I added a summary section to Notes/A.md.\n", "", 0)).toEqual({ ok: true, summary: "I added a summary section to Notes/A.md." });
    expect(a.parseResult("", "", 1)).toEqual({ ok: true, summary: "Done." });
    expect(a.parseResult("", "provider error: 401", 2)).toEqual({ ok: false, summary: "provider error: 401" });
  });
});
