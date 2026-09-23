import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const src = join(root, "src");

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) walk(path, out);
    else if (/\.(?:ts|tsx|js|jsx)$/.test(name)) out.push(path);
  }
  return out;
}

const failures = [];
for (const file of walk(src)) {
  const body = readFileSync(file, "utf8");

  // Browser code may set visibility false for archive/withdrawal, but it must
  // never create the published state. Publication is minted by server-owned
  // publish-work / database publication authority.
  const suspicious = [
    /\.from\(\s*["']books["']\s*\)[\s\S]{0,500}?\.update\(\s*\{[\s\S]{0,250}?is_published\s*:\s*true\b/g,
    /is_published\s*:\s*newPublishState\b/g,
  ];

  for (const pattern of suspicious) {
    if (pattern.test(body)) {
      failures.push(relative(root, file));
      break;
    }
  }
}

if (failures.length) {
  console.error("Browser publication authority audit failed:");
  for (const path of failures) {
    console.error("  - " + path + " can create books.is_published=true");
  }
  console.error("Route publication through the canonical server-owned publishing workspace/API.");
  process.exit(1);
}

const ownerControls = readFileSync(
  join(src, "components/books/BookOwnerControls.tsx"),
  "utf8",
);
if (!ownerControls.includes('/publish')) {
  console.error("Book owner controls no longer route publication to the canonical publishing workspace");
  process.exit(1);
}

console.log("Browser publication authority audit: PASS");
