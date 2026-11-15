import { describe, expect, it } from "vitest";
import { DevinAgent } from "../../../src/agents/DevinAgent";

const cfg = { binary: "", model: "", allowedTools: "", extraArgs: "" };
const req = { vaultPath: "/v", systemPrompt: "SYS", userPrompt: "-do it" };

describe("DevinAgent", () => {
  const a = new DevinAgent();
  it("builds a local print-mode invocation with the prompt after --", () => {
    const inv = a.buildInvocation(req, { ...cfg, model: "opus", extraArgs: "--sandbox" });
    expect(inv.command).toBe("devin");
    expect(inv.args).toEqual([
      "--permission-mode", "accept-edits", "--respect-workspace-trust", "false",
      "--model", "opus", "--sandbox", "-p", "--", "SYS\n\n---\n\n-do it",
    ]);
    expect(inv.args).not.toContain("--cloud");
    expect(inv.stdin).toBeUndefined();
  });
  it("parses plain output", () => {
    expect(a.parseResult("Done: wrote Notes/B.md\n", "", 0)).toEqual({ ok: true, summary: "Done: wrote Notes/B.md" });
    expect(a.parseResult("", "Error: not logged in", 1)).toEqual({ ok: false, summary: "Error: not logged in" });
  });
});
