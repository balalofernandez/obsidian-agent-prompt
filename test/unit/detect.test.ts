import { describe, expect, it } from "vitest";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { findBinary } from "../../src/detect";

describe("findBinary", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ap-"));
  const exe = path.join(dir, "fake-agent");
  fs.writeFileSync(exe, "#!/bin/sh\n");
  fs.chmodSync(exe, 0o755);
  fs.writeFileSync(path.join(dir, "not-exec"), "x");
  it("finds executables on PATH", () => expect(findBinary("fake-agent", dir)).toBe(exe));
  it("ignores non-executables and missing ones", () => {
    expect(findBinary("not-exec", dir)).toBeNull();
    expect(findBinary("nope", dir)).toBeNull();
  });
  it("accepts absolute paths", () => expect(findBinary(exe, "")).toBe(exe));
});
