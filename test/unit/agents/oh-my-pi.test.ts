import { describe, expect, it } from "vitest";
import { OhMyPiAgent } from "../../../src/agents/OhMyPiAgent";

const cfg = { binary: "", model: "", allowedTools: "read,edit", extraArgs: "" };
const req = { vaultPath: "/v", systemPrompt: "SYS", userPrompt: "do it" };

describe("OhMyPiAgent", () => {
  const a = new OhMyPiAgent();
  it("builds a print-mode invocation with prompt on stdin", () => {
    const inv = a.buildInvocation(req, { ...cfg, model: "sonnet" });
    expect(inv.command).toBe("omp");
    expect(inv.args).toEqual(["-p", "--no-session", "--auto-approve", "--append-system-prompt", "SYS", "--tools", "read,edit", "--model", "sonnet"]);
    expect(inv.stdin).toBe("do it");
  });
  it("parses plain text output", () => {
    expect(a.parseResult("Rewrote the selection in Notes/A.md.\n", "", 0)).toEqual({ ok: true, summary: "Rewrote the selection in Notes/A.md." });
    expect(a.parseResult("", "Error: no model configured", 1)).toEqual({ ok: false, summary: "Error: no model configured" });
  });
});
