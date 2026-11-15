import { describe, expect, it } from "vitest";
import { RovoDevAgent } from "../../../src/agents/RovoDevAgent";

const cfg = { binary: "", model: "", allowedTools: "", extraArgs: "" };
const req = { vaultPath: "/v", systemPrompt: "SYS", userPrompt: "do it" };

describe("RovoDevAgent", () => {
  const a = new RovoDevAgent();
  it("builds acli rovodev run with the prompt as the last argument", () => {
    const inv = a.buildInvocation(req, { ...cfg, extraArgs: "--foo bar" });
    expect(inv.command).toBe("acli");
    expect(inv.args).toEqual(["rovodev", "run", "--yolo", "--foo", "bar", "SYS\n\n---\n\ndo it"]);
    expect(inv.stdin).toBeUndefined();
  });
  it("parses plain output", () => {
    const out = "\x1b[1mRovo Dev\x1b[0m\nCreated Notes/B.md and linked it from Notes/A.md.\n";
    expect(a.parseResult(out, "", 0)).toEqual({ ok: true, summary: "Rovo Dev\nCreated Notes/B.md and linked it from Notes/A.md." });
    expect(a.parseResult("", "Not logged in. Run acli rovodev auth login", 1)).toEqual({
      ok: false, summary: "Not logged in. Run acli rovodev auth login",
    });
    expect(a.parseResult("", "", null).summary).toBe("Exited with code null");
  });
});
