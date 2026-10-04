import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const packagePath = join(ROOT, "node_modules", "pptxgenjs", "package.json");

function readRequiredText(path, label) {
  try {
    return readFileSync(path, "utf8");
  } catch (error) {
    throw new Error(`${label} could not be read at ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function readRequiredDir(path, label) {
  try {
    return readdirSync(path, { withFileTypes: true });
  } catch (error) {
    throw new Error(`${label} could not be read at ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const rootPackage = JSON.parse(readRequiredText(join(ROOT, "package.json"), "root package manifest"));
if (rootPackage.dependencies?.["image-size"]) {
  throw new Error("image-size became a direct production dependency; the reviewed PptxGenJS-only exception is invalid.");
}
if (!rootPackage.dependencies?.pptxgenjs) {
  throw new Error("pptxgenjs is no longer a production dependency; review and remove the image-size exception instead of retaining it blindly.");
}

const pptxPackage = JSON.parse(readRequiredText(packagePath, "pptxgenjs package manifest"));
const declaredImageSize = pptxPackage.dependencies?.["image-size"];

// Once upstream removes the dead declaration, there is no exceptional path left.
if (!declaredImageSize) {
  console.log(`PptxGenJS ${pptxPackage.version}: image-size is no longer a declared runtime dependency.`);
  process.exit(0);
}

if (pptxPackage.browser?.["image-size"] !== false) {
  throw new Error(
    `PptxGenJS ${pptxPackage.version} declares image-size ${declaredImageSize} without browser:false; ` +
      "the reviewed reachability assumption is no longer valid.",
  );
}

const forbiddenRuntimeImport = /(?:from\s*["']image-size["']|require\(\s*["']image-size["']\s*\)|import\(\s*["']image-size["']\s*\))/;
const distDir = join(ROOT, "node_modules", "pptxgenjs", "dist");
let scannedDistFiles = 0;

function scanDistributedJs(dir) {
  for (const entry of readRequiredDir(dir, "pptxgenjs distributed bundle directory")) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      scanDistributedJs(full);
      continue;
    }
    if (entry.isSymbolicLink()) {
      throw new Error(`PptxGenJS dist contains symlink ${relative(distDir, full)}; cannot prove bundle reachability safely.`);
    }
    if (!entry.isFile() || !/\.(?:c?js|mjs)$/.test(entry.name)) continue;
    scannedDistFiles += 1;
    const text = readRequiredText(full, `pptxgenjs distributed bundle ${relative(distDir, full)}`);
    if (forbiddenRuntimeImport.test(text)) {
      throw new Error(`PptxGenJS distributed bundle ${relative(distDir, full)} now imports image-size; fail closed.`);
    }
  }
}

scanDistributedJs(distDir);
if (scannedDistFiles === 0) {
  throw new Error("No JavaScript files were found under pptxgenjs/dist; cannot prove distributed bundle reachability.");
}

const sourceRoots = ["src", "supabase/functions", "scripts"];
const allowedImport = "src/lib/exportLearningDeck.ts";
const pptxImport = /(?:from\s*["']pptxgenjs["']|require\(\s*["']pptxgenjs["']\s*\)|import\(\s*["']pptxgenjs["']\s*\))/;
const importers = [];

function scanRepoSources(dir) {
  for (const entry of readRequiredDir(dir, `source tree ${relative(ROOT, dir) || "."}`)) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      scanRepoSources(full);
      continue;
    }
    if (entry.isSymbolicLink()) {
      throw new Error(`Source scan encountered symlink ${relative(ROOT, full)}; fail closed.`);
    }
    if (!entry.isFile() || !/\.(?:[cm]?[jt]sx?)$/.test(entry.name)) continue;
    const text = readRequiredText(full, `source file ${relative(ROOT, full)}`);
    if (pptxImport.test(text)) importers.push(relative(ROOT, full).replaceAll("\\", "/"));
  }
}

for (const root of sourceRoots) scanRepoSources(join(ROOT, root));

const unexpected = importers.filter((path) => path !== allowedImport);
if (unexpected.length > 0 || !importers.includes(allowedImport)) {
  throw new Error(
    `PptxGenJS runtime boundary changed. Expected only ${allowedImport}; found: ${importers.join(", ") || "none"}`,
  );
}

console.log(
  `PptxGenJS ${pptxPackage.version} image-size ${declaredImageSize} reachability guard passed: ` +
    `browser-disabled, absent from ${scannedDistFiles} recursively scanned distributed JS files, and used only by the browser learning-deck exporter.`,
);
