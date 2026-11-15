export interface Pos { line: number; ch: number; }

export interface EditorContext {
  /** Vault-relative path of the active note, e.g. "Projects/Idea.md". */
  notePath: string;
  noteTitle: string;
  selection: string;
  /** Selection range (0-based lines). Equal to cursor when nothing is selected. */
  from: Pos;
  to: Pos;
  cursor: Pos;
  /** Text of the line where the cursor is (helps locate the spot). */
  cursorLine: string;
}

/** Builds the task sent to the agent (stdin). Pure, so it is unit tested. */
export function buildUserPrompt(userInstruction: string, ctx: EditorContext): string {
  const lines: string[] = [];
  lines.push("# Task");
  lines.push(userInstruction.trim());
  lines.push("");
  lines.push("# Editor context");
  lines.push(`- Active note: \`${ctx.notePath}\` (title: "${ctx.noteTitle}")`);
  if (ctx.selection.length > 0) {
    lines.push(
      `- The user selected text from line ${ctx.from.line + 1}, column ${ctx.from.ch + 1} ` +
        `to line ${ctx.to.line + 1}, column ${ctx.to.ch + 1} (1-based).`,
    );
    lines.push("- \"this\"/\"esto\"/\"it\" in the task refers to the selected text. Selected text (verbatim):");
    lines.push("<selection>");
    lines.push(ctx.selection);
    lines.push("</selection>");
  } else {
    lines.push("- No text is selected. The task applies to the active note as a whole,");
    lines.push("  with emphasis on the content right before the cursor.");
    lines.push(`- Cursor at line ${ctx.cursor.line + 1}, column ${ctx.cursor.ch + 1} (1-based). Line content:`);
    lines.push("<cursor-line>");
    lines.push(ctx.cursorLine);
    lines.push("</cursor-line>");
  }
  lines.push("");
  lines.push("Read the active note from disk before editing it. When done, reply with a one or two sentence summary of the changes.");
  return lines.join("\n");
}
