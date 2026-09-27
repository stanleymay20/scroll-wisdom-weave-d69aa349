import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { resolveBuildCommit } from "./build-commit.mjs";

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

// Same resolution as the Vite build, so the identity written there and the
// full manifest written here can never name different commits.
const { commit, source: commitSource } = resolveBuildCommit();
let buildTime = process.env.BUILD_TIME;
if (!buildTime) {
  // Keep the time the Vite build stamped rather than the time of this step.
  try {
    buildTime = JSON.parse(await readFile(path.join(dist, "release.json"), "utf8")).buildTime;
  } catch {
    buildTime = undefined;
  }
}
const manifest = {
  schemaVersion: 1,
  commit,
  commitSource,
  buildTime: buildTime ?? new Date().toISOString(),
  artifacts,
};
await writeFile(path.join(dist, "release.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Created release manifest for ${commit ?? "an unidentified commit"} with ${files.length} artifacts.`);
