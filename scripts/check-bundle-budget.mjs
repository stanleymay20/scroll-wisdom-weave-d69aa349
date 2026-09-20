import { readdir, stat } from "node:fs/promises";
import path from "node:path";

const assetDir = path.resolve("dist/assets");
// Ratcheted from the verified 2026-09-14 release build:
//   largest JS ~= 1,067,020 B; CSS ~= 168,310 B; total JS = 9,311,398 B.
// Keep only a small deterministic-growth allowance so this gate catches real
// regressions instead of permitting another multi-megabyte jump.
const limits = {
  javascriptFile: 1_085_000,
  stylesheetFile: 180_000,
  totalJavascript: 9_500_000,
};

const files = await readdir(assetDir);
const assets = await Promise.all(files.map(async (name) => ({ name, bytes: (await stat(path.join(assetDir, name))).size })));
const javascript = assets.filter(({ name }) => name.endsWith(".js"));
const stylesheets = assets.filter(({ name }) => name.endsWith(".css"));
const violations = [
  ...javascript.filter(({ bytes }) => bytes > limits.javascriptFile).map(({ name, bytes }) => `${name}: ${bytes} B exceeds ${limits.javascriptFile} B JS-file budget`),
  ...stylesheets.filter(({ bytes }) => bytes > limits.stylesheetFile).map(({ name, bytes }) => `${name}: ${bytes} B exceeds ${limits.stylesheetFile} B CSS-file budget`),
];
const totalJavascript = javascript.reduce((sum, asset) => sum + asset.bytes, 0);
if (totalJavascript > limits.totalJavascript) violations.push(`total JavaScript: ${totalJavascript} B exceeds ${limits.totalJavascript} B budget`);

if (violations.length) {
  console.error(`Bundle budget failed:\n${violations.map((item) => `- ${item}`).join("\n")}`);
  process.exit(1);
}
console.log(`Bundle budget passed: ${javascript.length} JS files, ${totalJavascript} B total.`);
