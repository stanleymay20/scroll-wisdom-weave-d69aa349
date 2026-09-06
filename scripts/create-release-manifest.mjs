import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

const dist = path.resolve("dist");
const walk = async (dir) => (await Promise.all((await readdir(dir, { withFileTypes: true })).map(async (entry) => {
  const target = path.join(dir, entry.name);
  return entry.isDirectory() ? walk(target) : target;
}))).flat();

const files = (await walk(dist)).filter((file) => !file.endsWith("release.json")).sort();
const artifacts = {};
for (const file of files) {
  const body = await readFile(file);
  artifacts[path.relative(dist, file)] = {
    bytes: (await stat(file)).size,
    sha256: createHash("sha256").update(body).digest("hex"),
  };
}

const commit = process.env.GITHUB_SHA ?? process.env.VITE_BUILD_ID ?? "local-uncommitted";
const manifest = {
  schemaVersion: 1,
  commit,
  buildTime: process.env.BUILD_TIME ?? new Date().toISOString(),
  artifacts,
};
await writeFile(path.join(dist, "release.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Created release manifest for ${commit} with ${files.length} artifacts.`);
