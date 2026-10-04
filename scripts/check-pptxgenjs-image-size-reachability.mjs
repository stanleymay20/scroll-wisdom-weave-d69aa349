import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const packagePath = join(ROOT, "node_modules", "pptxgenjs", "package.json");

if (!existsSync(packagePath)) {
  throw new Error("pptxgenjs is not installed; cannot prove image-size reachability boundary");
}

const pptxPackage = JSON.parse(readFileSync(packagePath, "utf8"));
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

if (!existsSync(distDir)) {
  throw new Error("pptxgenjs/dist is missing; cannot prove distributed bundle reachability");
}

for (const entry of readdirSync(distDir)) {
  const full = join(distDir, entry);
  if (!statSync(full).isFile() || !/\.(?:c?js|mjs)$/.test(entry)) continue;
  const text = readFileSync(full, "utf8");
  if (forbiddenRuntimeImport.test(text)) {
    throw new Error(`PptxGenJS distributed bundle ${entry} now imports image-size; fail closed.`);
  }
}

const sourceRoots = ["src", "supabase/functions", "scripts"];
const allowedImport = "src/lib/exportLearningDeck.ts";
const pptxImport = /(?:from\s*["']pptxgenjs["']|require\(\s*["']pptxgenjs["']\s*\)|import\(\s*["']pptxgenjs["']\s*\))/;
const importers = [];

function walk(dir) {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      walk(full);
      continue;
    }
    if (!/\.(?:[cm]?[jt]sx?)$/.test(entry)) continue;
    const text = readFileSync(full, "utf8");
    if (pptxImport.test(text)) importers.push(relative(ROOT, full).replaceAll("\\", "/"));
  }
}

for (const root of sourceRoots) walk(join(ROOT, root));

const unexpected = importers.filter((path) => path !== allowedImport);
if (unexpected.length > 0 || !importers.includes(allowedImport)) {
  throw new Error(
    `PptxGenJS runtime boundary changed. Expected only ${allowedImport}; found: ${importers.join(", ") || "none"}`,
  );
}

console.log(
  `PptxGenJS ${pptxPackage.version} image-size ${declaredImageSize} reachability guard passed: ` +
    "browser-disabled, absent from distributed JS imports, and used only by the browser learning-deck exporter.",
);
