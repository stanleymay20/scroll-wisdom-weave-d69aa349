import { readFileSync } from "node:fs";

const ui = readFileSync("src/pages/BookDetail.tsx", "utf8");
const edge = readFileSync("supabase/functions/generate-chapter/index.ts", "utf8");

const failures = [];

function requireText(source, needle, label) {
  if (!source.includes(needle)) failures.push(label + " is missing");
}

requireText(
  ui,
  "Regenerate chapter (revision)",
  "chapter revision dialog",
);
requireText(
  ui,
  "if (!intent)",
  "blank edit-intent UI guard",
);
requireText(
  ui,
  "regenerate: true",
  "chapter revision request marker",
);
requireText(
  ui,
  "isRegeneration: true",
  "server regeneration contract marker",
);
requireText(
  ui,
  "originalContent: chapter.content",
  "original chapter content binding",
);
requireText(
  ui,
  "editIntent: editIntentText",
  "explicit edit-intent payload",
);

requireText(
  edge,
  "if (isRegeneration && !editIntent)",
  "server-side regeneration edit-intent guard",
);
requireText(
  edge,
  'code: "EDIT_INTENT_REQUIRED"',
  "server fail-closed edit-intent error code",
);
requireText(
  edge,
  "content: finalContent",
  "regenerated chapter content persistence",
);
requireText(
  edge,
  '.from("chapters")',
  "chapter persistence table",
);
requireText(
  edge,
  ".update(updateData)",
  "standard chapter update write",
);

if (failures.length) {
  console.error("Chapter regeneration contract failed:");
  for (const failure of failures) console.error("  - " + failure);
  process.exit(1);
}

console.log("Chapter regeneration edit-intent/persistence contract: PASS");
