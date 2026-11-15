import { describe, expect, it } from "vitest";
import { MuseCodeAgent } from "../../../src/agents/MuseCodeAgent";

const cfg = { binary: "", model: "", allowedTools: "", extraArgs: "" };
const req = { vaultPath: "/vault", systemPrompt: "SYS", userPrompt: "do it" };

describe("MuseCodeAgent", () => {
  const a = new MuseCodeAgent();
  it("builds `muse exec` with the sandbox kept on", () => {
    const inv = a.buildInvocation(req, cfg);
    expect(inv.command).toBe("muse");
    expect(inv.args[0]).toBe("exec");
    expect(inv.args).toContain("--disable-approval");
    expect(inv.args).not.toContain("--yolo");
    expect(inv.args).not.toContain("--disable-sandbox");
    expect(inv.args[inv.args.indexOf("--sandbox-network") + 1]).toBe("restricted");
    expect(inv.args[inv.args.indexOf("--workspace") + 1]).toBe("/vault");
    expect(inv.args[inv.args.length - 1]).toMatch(/^SYS[\s\S]*do it$/);
  });
  it("adds model and extra args before the prompt", () => {
    const inv = a.buildInvocation(req, { ...cfg, model: "muse-spark-1.2", extraArgs: "--max-model-steps 40" });
    const i = inv.args.indexOf("--model");
    expect(inv.args.slice(i, i + 4)).toEqual(["--model", "muse-spark-1.2", "--max-model-steps", "40"]);
    expect(inv.args[inv.args.length - 1]).toContain("do it");
  });
  it("parses plain text output", () => {
    expect(a.parseResult("I added a summary section to Notes/A.md.\n", "", 0)).toEqual({
      ok: true,
      summary: "I added a summary section to Notes/A.md.",
    });
    expect(a.parseResult("partial", "error: run cancelled", 1)).toEqual({ ok: false, summary: "error: run cancelled" });
    expect(a.parseResult("", "", 2)).toEqual({ ok: false, summary: "Exited with code 2" });
  });
});
