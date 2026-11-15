#!/usr/bin/env node
/**
 * End-to-end test: launches a real Obsidian (isolated config + throwaway vault),
 * installs the built plugin, drives the UI over the Chrome DevTools Protocol
 * and checks the files the agent produced on disk.
 *
 * Usage:  npm run build && OBSIDIAN_BIN=/path/to/obsidian.AppImage npm run e2e
 * Needs: a display (or xvfb-run), a working `claude` CLI. Costs a few agent calls.
 */
import { chromium } from "playwright-core";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const runDir = path.join(here, ".run");
const vault = path.join(runDir, "vault");
const configHome = path.join(runDir, "config");
const shots = path.join(runDir, "screenshots");
const bin = process.env.OBSIDIAN_BIN || path.join(process.env.HOME, "AppImages/obsidian.appimage");
const port = Number(process.env.CDP_PORT || 9333);
const AGENT_TIMEOUT = 240_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log("[e2e]", ...a);
let failures = 0;
function check(cond, msg) {
  console.log(cond ? "  ✅" : "  ❌", msg);
  if (!cond) failures++;
}

// ---------- 1. fresh vault + isolated Obsidian config ----------
fs.rmSync(runDir, { recursive: true, force: true });
const pluginDir = path.join(vault, ".obsidian/plugins/agent-prompt");
fs.mkdirSync(pluginDir, { recursive: true });
fs.mkdirSync(shots, { recursive: true });
for (const f of ["main.js", "manifest.json", "styles.css"]) fs.copyFileSync(path.join(root, f), path.join(pluginDir, f));
fs.writeFileSync(path.join(vault, ".obsidian/community-plugins.json"), JSON.stringify(["agent-prompt"]));
fs.writeFileSync(path.join(vault, ".obsidian/app.json"), JSON.stringify({ promptDelete: false }));
const SELECTED =
  "Las abejas polinizan alrededor del 75% de los cultivos alimentarios del mundo y su declive amenaza la seguridad alimentaria.";
fs.writeFileSync(
  path.join(vault, "Test.md"),
  `# Notas sobre ecología\n\nIntroducción breve.\n\n${SELECTED}\n\nOtra línea que no debe cambiar.\n`,
);
fs.writeFileSync(path.join(vault, "Borrador.md"), `# Borrador\n\nhola esto es un borrador con faltas de hortografia y mal escrito\n`);

const obsidianDir = path.join(configHome, "obsidian");
fs.mkdirSync(obsidianDir, { recursive: true });
fs.writeFileSync(
  path.join(obsidianDir, "obsidian.json"),
  JSON.stringify({ vaults: { e2etestvault0001: { path: vault, ts: Date.now(), open: true } } }),
);

// ---------- 2. launch Obsidian with CDP ----------
log("launching", bin);
const app = spawn(bin, ["--no-sandbox", `--remote-debugging-port=${port}`], {
  env: { ...process.env, XDG_CONFIG_HOME: configHome },
  stdio: "ignore",
  detached: true,
});
const killApp = () => {
  try { process.kill(-app.pid, "SIGTERM"); } catch { /* already gone */ }
};
process.on("exit", killApp);

let browser;
for (let i = 0; i < 60 && !browser; i++) {
  try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`); } catch { await sleep(500); }
}
if (!browser) throw new Error("Could not connect to Obsidian over CDP");

async function findWorkspacePage() {
  for (let i = 0; i < 60; i++) {
    for (const ctx of browser.contexts())
      for (const p of ctx.pages()) {
        const ok = await p.evaluate(() => !!(window.app && window.app.workspace)).catch(() => false);
        if (ok) return p;
      }
    await sleep(500);
  }
  throw new Error("Obsidian workspace window not found");
}
const page = await findWorkspacePage();
log("connected to", await page.title());

// Trust dialog for community plugins (shown on first open of a vault with plugins).
await sleep(2000);
const trust = page.getByRole("button", { name: /Trust author and enable plugins/i });
if (await trust.count()) { log("accepting trust dialog"); await trust.first().click(); await sleep(1500); }
await page.evaluate(async () => {
  const p = window.app.plugins;
  if (!p.isEnabled?.() && p.setEnable) await p.setEnable(true);
  if (!p.plugins["agent-prompt"]) await p.enablePluginAndSave("agent-prompt");
});
await page.keyboard.press("Escape");
const loaded = await page.evaluate(() => !!window.app.plugins.plugins["agent-prompt"]);
check(loaded, "plugin loaded in Obsidian");
const hotkey = await page.evaluate(() => JSON.stringify(window.app.commands.commands["agent-prompt:run"]?.hotkeys));
check(hotkey?.includes('"j"'), `default hotkey registered (${hotkey})`);

const chosen = await page.evaluate(() => {
  const s = window.app.plugins.plugins["agent-prompt"].settings;
  return { agentChosen: s.agentChosen, agentId: s.agentId };
});
check(chosen.agentChosen && chosen.agentId === "claude-code", `first run picked an installed agent (${JSON.stringify(chosen)})`);
const notice = await page.locator(".notice").allInnerTexts();
check(notice.some((t) => t.includes("using Claude Code")), `first-run notice shown: ${notice.join(" | ").slice(0, 160)}`);

async function openNote(file) {
  await page.evaluate(async (f) => {
    const leaf = window.app.workspace.getLeaf(false);
    await leaf.openFile(window.app.vault.getAbstractFileByPath(f));
    window.app.workspace.setActiveLeaf(leaf, { focus: true });
  }, file);
  await sleep(800);
  await page.locator(".cm-content").first().click();
}

async function promptAgent(text, shotName) {
  await page.keyboard.press("Control+j");
  const modal = page.locator(".agent-prompt-modal");
  await modal.waitFor({ state: "visible", timeout: 5000 });
  await modal.locator("textarea").fill(text);
  await page.screenshot({ path: path.join(shots, `${shotName}-modal.png`) });
  await modal.locator("textarea").press("Enter");
  await modal.waitFor({ state: "detached", timeout: 5000 });
  // wait until the plugin is idle again
  await page.waitForFunction(() => !window.app.plugins.plugins["agent-prompt"].running, null, {
    timeout: AGENT_TIMEOUT, polling: 1000,
  });
  await sleep(1500);
  await page.screenshot({ path: path.join(shots, `${shotName}-result.png`) });
}

// ---------- 3. Case A: selection -> new page + link ----------
log("case A: selection → new page");
await openNote("Test.md");
await page.evaluate((sel) => {
  const ed = window.app.workspace.activeEditor.editor;
  const text = ed.getValue();
  const start = text.indexOf(sel);
  ed.setSelection(ed.offsetToPos(start), ed.offsetToPos(start + sel.length));
}, SELECTED);
const t0 = Date.now();
await promptAgent("Redáctame esto en una nueva página llamada Abejas, desarrollándolo en 2-3 párrafos.", "A");
log(`case A took ${((Date.now() - t0) / 1000).toFixed(0)}s`);
const testMd = fs.readFileSync(path.join(vault, "Test.md"), "utf8");
const newFile = path.join(vault, "Abejas.md");
check(fs.existsSync(newFile), "Abejas.md created");
if (fs.existsSync(newFile)) check(fs.readFileSync(newFile, "utf8").length > 200, "Abejas.md has developed content");
check(/\[\[Abejas(\|[^\]]*)?\]\]/.test(testMd), "Test.md links to [[Abejas]]");
check(testMd.includes("Otra línea que no debe cambiar.") && testMd.includes("Introducción breve."), "rest of Test.md untouched (minimal edit)");
check(!fs.existsSync(path.join(vault, ".obsidian/plugins/agent-prompt/data.json")) ||
  !fs.readFileSync(path.join(vault, ".obsidian/plugins/agent-prompt/data.json"), "utf8").includes("Abejas"), ".obsidian untouched by agent");
const editorShows = await page.evaluate(() => window.app.workspace.activeEditor.editor.getValue());
check(editorShows.includes("[[Abejas"), "open editor reloaded with the change");
console.log("\n--- Test.md ---\n" + testMd);

// ---------- 4. Case B: no selection -> improve whole note ----------
log("case B: no selection → improve note");
const before = fs.readFileSync(path.join(vault, "Borrador.md"), "utf8");
await openNote("Borrador.md");
await page.evaluate(() => {
  const ed = window.app.workspace.activeEditor.editor;
  ed.setCursor(ed.lastLine(), 0);
});
await promptAgent("Mejora la redacción y corrige la ortografía de esta nota.", "B");
const after = fs.readFileSync(path.join(vault, "Borrador.md"), "utf8");
check(after !== before, "Borrador.md was modified");
check(!/hortografia/.test(after), "spelling fixed");
console.log("\n--- Borrador.md ---\n" + after);

console.log(`\nScreenshots: ${shots}`);
await browser.close().catch(() => {});
killApp();
console.log(failures ? `\n${failures} check(s) FAILED` : "\nALL E2E CHECKS PASSED");
process.exit(failures ? 1 : 0);
