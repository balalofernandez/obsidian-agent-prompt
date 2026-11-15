import { describe, expect, it } from "vitest";
import { AiderAgent } from "../../../src/agents/AiderAgent";

const userPrompt = "# Task\nfix typos\n\n# Editor context\n- Active note: `Notes/A b.md` (title: \"A b\")";
const req = { vaultPath: "/v", systemPrompt: "SYS", userPrompt };

describe("AiderAgent", () => {
  const a = new AiderAgent();
  it("builds a scripting invocation without git or shell", () => {
    const inv = a.buildInvocation(req, { binary: "", model: "sonnet", allowedTools: "", extraArgs: "--foo" });
    expect(inv.command).toBe("aider");
    expect(inv.args[0]).toBe("--message");
    expect(inv.args[1]).toBe(`SYS\n\n---\n\n${userPrompt}`);
    for (const f of ["--yes-always", "--no-git", "--no-auto-commits", "--no-suggest-shell-commands", "--no-pretty"]) {
      expect(inv.args).toContain(f);
    }
    expect(inv.args.slice(inv.args.indexOf("--model"), inv.args.indexOf("--model") + 2)).toEqual(["--model", "sonnet"]);
    expect(inv.args.slice(inv.args.indexOf("--file"), inv.args.indexOf("--file") + 2)).toEqual(["--file", "Notes/A b.md"]);
    expect(inv.args[inv.args.length - 1]).toBe("--foo");
    expect(inv.stdin).toBeUndefined();
  });
  it("omits --file when no note is named", () => {
    expect(a.buildInvocation({ ...req, userPrompt: "x" }, { binary: "", model: "", allowedTools: "", extraArgs: "" }).args).not.toContain("--file");
  });
  it("parses plain output", () => {
    const out = [
      "Aider v0.86.1",
      "Model: anthropic/claude-sonnet-4 with diff edit format",
      "Added Notes/A b.md to the chat.",
      "",
      "I fixed the typos in the note.",
      "",
      "Notes/A b.md",
      "<<<<<<< SEARCH",
      "teh",
      "=======",
      "the",
      ">>>>>>> REPLACE",
      "",
      "Applied edit to Notes/A b.md",
    ].join("\n");
    expect(a.parseResult(out, "", 0)).toEqual({ ok: true, summary: "Applied edit to Notes/A b.md" });
    expect(a.parseResult("litellm.AuthenticationError: bad key", "", 0).ok).toBe(false);
    expect(a.parseResult("", "aider: error: unrecognized arguments", 2)).toEqual({ ok: false, summary: "aider: error: unrecognized arguments" });
  });
});
