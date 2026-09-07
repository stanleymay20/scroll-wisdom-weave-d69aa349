import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { extname, join, relative } from "node:path";

const ROOTS = ["src", "supabase/functions"];
const TEXT_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);

// Build the forbidden markers without embedding them verbatim in this test,
// otherwise the boundary checker would correctly report itself.
const FORBIDDEN_MARKERS = [
  ["Scroll", "University"].join(""),
  ["scroll", "university"].join("-"),
  ["university", ""].join("_"),
];

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

describe("ScrollLibrary product boundary", () => {
  it("contains no active ScrollUniversity application or Edge Function identifiers", () => {
    const violations: string[] = [];

    for (const root of ROOTS) {
      for (const file of walk(root)) {
        if (!TEXT_EXTENSIONS.has(extname(file))) continue;
        const content = readFileSync(file, "utf8");
        const matched = FORBIDDEN_MARKERS.filter((marker) => content.includes(marker));
        if (matched.length > 0) {
          violations.push(`${relative(process.cwd(), file)}: ${matched.join(", ")}`);
        }
      }
    }

    expect(violations, `Cross-product identifiers found:\n${violations.join("\n")}`).toEqual([]);
  });
});
