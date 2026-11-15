import { describe, expect, it } from "vitest";
import { MistralVibeAgent } from "../../../src/agents/MistralVibeAgent";

const req = { vaultPath: "/v", systemPrompt: "SYS", userPrompt: "do it" };

describe("MistralVibeAgent", () => {
  const a = new MistralVibeAgent();
  it("builds a programmatic invocation with stdin prompt and file tools only", () => {
    const inv = a.buildInvocation(req, { binary: "", model: "devstral", allowedTools: a.defaultAllowedTools, extraArgs: "" });
    expect(inv.command).toBe("vibe");
    expect(inv.args).toEqual([
      "--output", "json", "--agent", "accept-edits",
      "--enabled-tools", "read_file", "--enabled-tools", "write_file",
      "--enabled-tools", "edit", "--enabled-tools", "grep",
      "--model", "devstral", "-p",
    ]);
    expect(inv.args).not.toContain("--auto-approve");
    expect(inv.stdin).toBe("SYS\n\n---\n\ndo it");
  });
  it("parses the JSON message array", () => {
    const out = JSON.stringify([
      { role: "system", content: "..." },
      { role: "user", content: "do it" },
      { type: "message", role: "assistant", content: [{ type: "text", text: "Reading the note." }] },
      { role: "tool", content: "file contents" },
      { type: "message", role: "assistant", content: [{ type: "text", text: "Added a summary to Notes/A.md." }] },
    ]);
    expect(a.parseResult(out, "", 0)).toEqual({ ok: true, summary: "Added a summary to Notes/A.md." });
    expect(a.parseResult('[{"role":"assistant","content":"Done editing."}]', "", 0).summary).toBe("Done editing.");
  });
  it("reports failures", () => {
    expect(a.parseResult("", "Invalid API key", 2)).toEqual({ ok: false, summary: "Invalid API key" });
    const r = a.parseResult('[{"role":"assistant","content":"partial"}]', "", 3);
    expect(r.ok).toBe(false);
    expect(r.summary).toContain("stopped before finishing");
    expect(a.parseResult("plain answer", "", 0)).toEqual({ ok: true, summary: "plain answer" });
  });
});
