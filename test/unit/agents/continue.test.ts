import { describe, expect, it } from "vitest";
import { ContinueAgent } from "../../../src/agents/ContinueAgent";

const req = { vaultPath: "/v", systemPrompt: "SYS prompt", userPrompt: "do it" };

describe("ContinueAgent", () => {
  const a = new ContinueAgent();
  it("builds a headless invocation allowing file tools and excluding the shell", () => {
    const inv = a.buildInvocation(req, { binary: "", model: "anthropic/claude-sonnet-4", allowedTools: "Read,Edit,Write", extraArgs: "" });
    expect(inv.command).toBe("cn");
    expect(inv.args).toEqual([
      "-p", "--silent", "--rule", "SYS prompt",
      "--allow", "Read", "--allow", "Edit", "--allow", "Write",
      "--exclude", "Bash", "--exclude", "Fetch",
      "--model", "anthropic/claude-sonnet-4",
    ]);
    expect(inv.stdin).toBe("do it");
  });
  it("does not exclude Bash when the user allows it", () => {
    const inv = a.buildInvocation(req, { binary: "", model: "", allowedTools: "Edit,Bash", extraArgs: "" });
    expect(inv.args.filter((x, i) => inv.args[i - 1] === "--exclude")).toEqual(["Fetch"]);
  });
  it("parses plain text output", () => {
    expect(a.parseResult("Added a summary section to Notes/A.md.\n", "", 0)).toEqual({ ok: true, summary: "Added a summary section to Notes/A.md." });
    expect(a.parseResult('{"response":"Done it."}', "", 0)).toEqual({ ok: true, summary: "Done it." });
    expect(a.parseResult("", "Error: A prompt is required", 1)).toEqual({ ok: false, summary: "Error: A prompt is required" });
  });
});
