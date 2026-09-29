import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

export const PRODUCTION_SOURCE_ENTRIES = [
  "src",
  "public",
  "supabase",
  "scripts",
  "index.html",
  "package.json",
  "bun.lock",
  "vite.config.ts",
  "tsconfig.json",
  "tsconfig.app.json",
  "tsconfig.node.json",
  "tailwind.config.ts",
  "postcss.config.js",
  "components.json",
];

const IGNORED_NAMES = new Set([
  ".DS_Store",
  ".git",
  ".temp",
  ".branches",
  "node_modules",
  "dist",
  "coverage",
  "playwright-report",
  "test-results",
]);

function collectFiles(root, entry, output) {
  const absolute = path.resolve(root, entry);
  let metadata;
  try {
    metadata = statSync(absolute);
  } catch {
    return;
  }

  if (metadata.isDirectory()) {
    for (const name of readdirSync(absolute).sort()) {
      if (IGNORED_NAMES.has(name)) continue;
      collectFiles(root, path.join(entry, name), output);
    }
    return;
  }

  if (metadata.isFile()) output.push(entry.split(path.sep).join("/"));
}

/**
 * Deterministically identifies the production-affecting repository contents.
 *
 * Hosted Lovable builds intentionally may not contain .git or expose a commit
 * environment variable. A source fingerprint lets CI and a hosted rebuild
 * prove they were built from identical production inputs without inventing a
 * commit SHA. The commit remains the primary identity when it is available.
 */
export function computeSourceFingerprint(
  root = process.cwd(),
  entries = PRODUCTION_SOURCE_ENTRIES,
) {
  const files = [];
  for (const entry of entries) collectFiles(root, entry, files);
  files.sort();

  const hash = createHash("sha256");
  hash.update("scrolllibrary-source-fingerprint-v1\0");

  for (const relative of files) {
    const body = readFileSync(path.resolve(root, relative));
    const pathBytes = Buffer.from(relative, "utf8");
    const length = Buffer.allocUnsafe(8);
    length.writeBigUInt64BE(BigInt(body.length));

    hash.update(pathBytes);
    hash.update("\0");
    hash.update(length);
    hash.update(body);
  }

  return {
    algorithm: "sha256",
    version: 1,
    value: `sha256:${hash.digest("hex")}`,
    files: files.length,
  };
}
