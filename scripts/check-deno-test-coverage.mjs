import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

/**
 * Every Deno test file must be run by some workflow.
 *
 * CI runs Edge Function tests one named file at a time, so a new test file is
 * silently skipped until someone remembers to list it. Nine were: among them
 * the 22 canonical PDF/DOCX/EPUB renderer tests, which had not run since the
 * day they were written while the renderers kept changing. A test that never
 * runs is worse than none, because it reads as coverage.
 *
 * A file counts as run when a workflow line invoking `deno test` names it, or
 * names a directory containing it.
 */

const root = process.cwd();
const functionsRoot = join(root, "supabase/functions");
const workflowsRoot = join(root, ".github/workflows");
const TEST_FILE = /(?:_test|\.test)\.(?:ts|tsx|js|mjs)$/;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules") continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (TEST_FILE.test(name)) out.push(relative(root, path).split(sep).join("/"));
  }
  return out;
}

const testFiles = walk(functionsRoot).sort();

// Every argument of every `deno test` line, across all workflows.
const targets = [];
for (const name of readdirSync(workflowsRoot)) {
  if (!/\.ya?ml$/.test(name)) continue;
  const lines = readFileSync(join(workflowsRoot, name), "utf8").split("\n");
  lines.forEach((line, index) => {
    const at = line.indexOf("deno test");
    if (at === -1 || line.trimStart().startsWith("#")) return;
    for (const arg of line.slice(at + "deno test".length).trim().split(/\s+/)) {
      if (!arg || arg.startsWith("-")) continue;
      targets.push({ arg: arg.replace(/^\.\//, ""), where: `${name}:${index + 1}` });
    }
  });
}

function runBy(file) {
  return targets.find(({ arg }) =>
    arg === file || (arg.endsWith("/") ? file.startsWith(arg) : file.startsWith(arg + "/")),
  );
}

const unrun = [];
for (const file of testFiles) {
  const hit = runBy(file);
  if (hit) console.log(`  PASS ${file}: ${hit.where}`);
  else unrun.push(file);
}

if (unrun.length) {
  console.error("\nDeno test files that no workflow runs:");
  for (const file of unrun) console.error(`  - ${file}`);
  console.error(
    "\nAdd each to a `deno test` step in .github/workflows (ci.yml's edge-functions job), or delete it.",
  );
  process.exit(1);
}

console.log(`\nDeno test coverage gate passed: all ${testFiles.length} test files are run by a workflow.`);
