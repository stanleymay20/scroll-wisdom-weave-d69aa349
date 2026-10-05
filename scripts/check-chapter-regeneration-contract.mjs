import { readFileSync } from "node:fs";

const ui = readFileSync("src/pages/BookDetail.tsx", "utf8");
const edge = readFileSync("supabase/functions/generate-chapter/index.ts", "utf8");

const failures = [];

function requireText(source, needle, label) {
  if (!source.includes(needle)) failures.push(label + " is missing");
}

function forbidText(source, needle, label) {
  if (source.includes(needle)) failures.push(label + " must not be present");
}

function forbidWithin(source, startMarker, endMarker, needle, label) {
  const start = source.indexOf(startMarker);
  const end = source.indexOf(endMarker, start + startMarker.length);
  if (start < 0 || end < 0) {
    failures.push(label + " section markers are missing");
    return;
  }
  if (source.slice(start, end).includes(needle)) failures.push(label + " contains forbidden model routing");
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
  "await saveGeneratedChapter(updateData)",
  "standard chapter fenced write",
);
requireText(edge, 'rpc("save_generated_chapter_fenced"', "transactional chapter writer");

// Paid-generation commercial truthfulness: manuscript-mutating calls must never
// silently fall below the server-owned plan/edit-route floor.
requireText(
  edge,
  "const generationModel = routeFloorModel(userPlan, generationRoute);",
  "server-owned generation route floor",
);
requireText(
  edge,
  "const modelChain = floorSafeModelChain(userPlan, generationRoute);",
  "floor-safe transient retry chain",
);
requireText(
  edge,
  "Rate limited (429); retrying the same qualified route floor",
  "same-floor 429 retry behavior",
);
requireText(
  edge,
  "await refundTextReservation();\n      const terminalStatus = lastStatus === 429 ? 429 : 503;",
  "fail-closed retry exhaustion refund",
);
requireText(
  edge,
  "generation_outline: mergeGenerationOutline(existingGenerationOutline, materialModelProvenance)",
  "material-model provenance persistence",
);
requireText(
  edge,
  "materialModelProvenance,\n      academicMode,",
  "material-model provenance response",
);
forbidText(edge, "currentModelIdx++", "quality-floor downgrade index");
forbidText(edge, "FALLBACK_MODELS", "generic lower-quality fallback chain");
forbidText(edge, "falling back to next model in chain", "silent model downgrade log path");
forbidWithin(
  edge,
  "// PHASE 3.5: INTELLECTUAL STRESS-TEST PASS",
  "// PHASE 4: LIGHTWEIGHT COMPRESSION SECOND PASS",
  'model: "google/gemini-2.5-flash-lite"',
  "Intellectual Stress-Test",
);
forbidWithin(
  edge,
  "// PHASE 4: LIGHTWEIGHT COMPRESSION SECOND PASS",
  "// POST-GENERATION CODE QUALITY FIXER",
  'model: "google/gemini-2.5-flash-lite"',
  "Compression pass",
);

if (failures.length) {
  console.error("Chapter regeneration contract failed:");
  for (const failure of failures) console.error("  - " + failure);
  process.exit(1);
}

console.log("Chapter regeneration edit-intent/persistence/model-floor contract: PASS");
