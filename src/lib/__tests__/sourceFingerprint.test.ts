import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { computeSourceFingerprint } from "../../../scripts/source-fingerprint.mjs";

const dirs: string[] = [];

function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(tmpdir(), "source-fingerprint-"));
  dirs.push(root);
  for (const [name, body] of Object.entries(files)) {
    const target = path.join(root, name);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, body);
  }
  return root;
}

afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("computeSourceFingerprint", () => {
  it("is deterministic regardless of directory creation order", () => {
    const one = fixture({
      "src/b.ts": "export const b = 2;\n",
      "src/a.ts": "export const a = 1;\n",
      "package.json": "{}\n",
    });
    const two = fixture({
      "package.json": "{}\n",
      "src/a.ts": "export const a = 1;\n",
      "src/b.ts": "export const b = 2;\n",
    });

    expect(computeSourceFingerprint(one, ["src", "package.json"]).value)
      .toBe(computeSourceFingerprint(two, ["src", "package.json"]).value);
  });

  it("changes when production source changes", () => {
    const root = fixture({ "src/app.ts": "one\n" });
    const before = computeSourceFingerprint(root, ["src"]).value;
    writeFileSync(path.join(root, "src/app.ts"), "two\n");
    expect(computeSourceFingerprint(root, ["src"]).value).not.toBe(before);
  });

  it("ignores build and tool scratch directories", () => {
    const root = fixture({
      "src/app.ts": "stable\n",
      "src/.temp/generated.txt": "first\n",
    });
    const before = computeSourceFingerprint(root, ["src"]).value;
    writeFileSync(path.join(root, "src/.temp/generated.txt"), "second\n");
    expect(computeSourceFingerprint(root, ["src"]).value).toBe(before);
  });

  it("records the number of hashed files", () => {
    const root = fixture({
      "src/app.ts": "a\n",
      "src/lib.ts": "b\n",
      "package.json": "{}\n",
    });
    expect(computeSourceFingerprint(root, ["src", "package.json"]).files).toBe(3);
  });
});
