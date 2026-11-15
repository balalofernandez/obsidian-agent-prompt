import { describe, expect, it } from "vitest";
import { AuggieAgent } from "../../../src/agents/AuggieAgent";

const cfg = { binary: "", model: "", allowedTools: "read,edit", extraArgs: "" };
const req = { vaultPath: "/v", systemPrompt: "SYS", userPrompt: "do it" };

describe("AuggieAgent", () => {
  const a = new AuggieAgent();
  it("builds a print-mode invocation with tool allow rules", () => {
    const inv = a.buildInvocation(req, { ...cfg, model: "sonnet" });
    expect(inv.command).toBe("auggie");
    expect(inv.args).toEqual([
      "--print", "--no-session", "--append-system-prompt", "SYS",
      "--tools", "read,edit", "--permission", "read:allow", "--permission", "edit:allow",
      "--model", "sonnet", "do it",
    ]);
  });
  it("strips the Request ID line", () => {
    const out = "Added a TODO list to Notes/A.md.\n\n-- Request ID: 7f67c0dd-4c80-4167-9383-8013b18836cb\n";
    expect(a.parseResult(out, "", 0)).toEqual({ ok: true, summary: "Added a TODO list to Notes/A.md." });
    expect(a.parseResult("", "Not authenticated", 1)).toEqual({ ok: false, summary: "Not authenticated" });
  });
});
