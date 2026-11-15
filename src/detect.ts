import * as fs from "fs";
import * as path from "path";
import { augmentedPath } from "./runProcess";

/** Absolute path of `binary` if it is executable on the (augmented) PATH, else null. */
export function findBinary(binary: string, pathEnv = augmentedPath()): string | null {
  if (!binary) return null;
  const exts = process.platform === "win32" ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT").split(";") : [""];
  const candidates = path.isAbsolute(binary)
    ? [binary]
    : pathEnv.split(path.delimiter).filter(Boolean).map((dir) => path.join(dir, binary));
  for (const base of candidates) {
    for (const ext of exts) {
      const full = base + ext;
      try {
        fs.accessSync(full, fs.constants.X_OK);
        if (fs.statSync(full).isFile()) return full;
      } catch {
        /* not here */
      }
    }
  }
  return null;
}
