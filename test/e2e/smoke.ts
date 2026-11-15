/**
 * Smoke test for agent runners against the real CLIs installed on this machine.
 *   npm run smoke                 # every installed agent
 *   npm run smoke -- codex gemini # only these ids
 * For each agent: fresh temp vault, "move the selection to a new note" task,
 * then checks that the new note exists and the original links to it.
 * It calls the real agents, so it uses your accounts/credits.
 */
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { AGENTS } from "../../src/agents/registry";
import { buildUserPrompt } from "../../src/context";
import { buildSystemPrompt } from "../../src/prompt";
import { findBinary } from "../../src/detect";
import { runProcess } from "../../src/runProcess";

const only = process.argv.slice(2);
const SEL = "Los pulpos tienen tres corazones y sangre azul.";

async function main() {
  const rows: string[] = [];
  for (const a of AGENTS) {
    if (only.length && !only.includes(a.id)) continue;
    if (!findBinary(a.defaultBinary)) {
      if (only.length) rows.push(`${a.id}\tnot installed`);
      continue;
    }
    const vault = fs.mkdtempSync(path.join(os.tmpdir(), `ap-${a.id}-`));
    fs.writeFileSync(path.join(vault, "Mar.md"), `# Mar\n\nIntro.\n\n${SEL}\n\nFin.\n`);
    const inv = a.buildInvocation(
      {
        vaultPath: vault,
        systemPrompt: buildSystemPrompt(""),
        userPrompt: buildUserPrompt("Redacta esto en una nueva página llamada Pulpos, con un párrafo.", {
          notePath: "Mar.md", noteTitle: "Mar", selection: SEL,
          from: { line: 4, ch: 0 }, to: { line: 4, ch: SEL.length }, cursor: { line: 4, ch: SEL.length }, cursorLine: SEL,
        }),
      },
      { binary: a.defaultBinary, model: "", allowedTools: a.defaultAllowedTools, extraArgs: "" },
    );
    const t0 = Date.now();
    const r = await runProcess({ ...inv, cwd: vault, timeoutMs: 300_000 }).promise;
    const res = a.parseResult(r.stdout, r.stderr, r.exitCode);
    const created = fs.existsSync(path.join(vault, "Pulpos.md"));
    const linked = /\[\[Pulpos/.test(fs.readFileSync(path.join(vault, "Mar.md"), "utf8"));
    const pass = res.ok && created && linked;
    rows.push(`${a.id}\t${pass ? "PASS" : "FAIL"}\t${Math.round((Date.now() - t0) / 1000)}s\tok=${res.ok} created=${created} linked=${linked}\t${res.summary.replace(/\s+/g, " ").slice(0, 120)}`);
    console.log(rows[rows.length - 1]);
  }
  if (!rows.length) console.log("No supported agent CLI found on PATH.");
}
main();
