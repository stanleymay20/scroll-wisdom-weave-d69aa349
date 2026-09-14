import path from "node:path";
import process from "node:process";
import ts from "typescript";

const targets = process.argv.slice(2);
if (targets.length === 0) {
  console.error("Usage: bun scripts/check-strict-null.mjs <directory> [directory ...]");
  process.exit(2);
}

const repoRoot = process.cwd();
const configPath = ts.findConfigFile(repoRoot, ts.sys.fileExists, "tsconfig.app.json");
if (!configPath) {
  console.error("Could not find tsconfig.app.json");
  process.exit(2);
}

const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
if (configFile.error) {
  console.error(ts.formatDiagnostic(configFile.error, formatHost));
  process.exit(2);
}

const parsed = ts.parseJsonConfigFileContent(
  configFile.config,
  ts.sys,
  path.dirname(configPath),
  {
    noEmit: true,
    strictNullChecks: true,
  },
  configPath,
);

if (parsed.errors.length > 0) {
  console.error(ts.formatDiagnosticsWithColorAndContext(parsed.errors, formatHost));
  process.exit(2);
}

const program = ts.createProgram({
  rootNames: parsed.fileNames,
  options: parsed.options,
  projectReferences: parsed.projectReferences,
});

const normalizedTargets = targets.map((target) => {
  const absolute = path.resolve(repoRoot, target);
  return absolute.endsWith(path.sep) ? absolute : `${absolute}${path.sep}`;
});

const diagnostics = ts.getPreEmitDiagnostics(program).filter((diagnostic) => {
  if (!diagnostic.file) return false;
  const filename = path.resolve(diagnostic.file.fileName);
  return normalizedTargets.some((target) => filename.startsWith(target));
});

if (diagnostics.length > 0) {
  console.error(
    `strictNullChecks found ${diagnostics.length} diagnostic(s) in ${targets.join(", ")}:`,
  );
  console.error(ts.formatDiagnosticsWithColorAndContext(diagnostics, formatHost));
  process.exit(1);
}

console.log(`strictNullChecks passed for ${targets.join(", ")}`);

function formatHost() {
  return {
    getCanonicalFileName: (fileName) => fileName,
    getCurrentDirectory: () => repoRoot,
    getNewLine: () => ts.sys.newLine,
  };
}
