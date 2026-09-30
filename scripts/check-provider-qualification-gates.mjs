import { readFileSync } from "node:fs";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

function requireText(source, needle, label) {
  if (!source.includes(needle)) {
    throw new Error(`Provider qualification gate missing: ${label} (${needle})`);
  }
}

const flags = read("supabase/functions/_shared/ga-release-flags.ts");
const generateBook = read("supabase/functions/generate-book/index.ts");
const generateChapter = read("supabase/functions/generate-chapter/index.ts");
const clientRelease = read("src/lib/bookTypeRelease.ts");
const selector = read("src/components/generate/BookTypeSelector.tsx");
const generatePage = read("src/pages/Generate.tsx");
const config = read("src/lib/config.ts");
const collector = read("scripts/collect-provider-qualification.ts");

for (const [needle, label] of [
  ["GA_QUALIFIED_BOOK_TYPES", "server public qualification allow-list"],
  ["PROVIDER_QUALIFICATION_BOOK_TYPES", "controlled qualification allow-list"],
  ["advancedBookTypeEnabled", "server public per-type helper"],
  ["qualificationBookTypeEnabled", "server qualification-only helper"],
]) {
  requireText(flags, needle, label);
}

for (const [source, label] of [
  [generateBook, "generate-book"],
  [generateChapter, "generate-chapter"],
]) {
  requireText(source, "advancedBookTypeEnabled", `${label} public release enforcement`);
  requireText(source, "qualificationBookTypeEnabled", `${label} controlled qualification enforcement`);
  requireText(source, "GA_BOOK_TYPE_NOT_QUALIFIED", `${label} fail-closed error`);
}

requireText(clientRelease, "VITE_QUALIFIED_BOOK_TYPES", "client qualification allow-list");
requireText(config, "VITE_SPECIALIZED_AUTHORING_ENABLED", "independent client specialized-authoring switch");
requireText(selector, "isBookTypeReleasedForClient", "book type selector release filter");
requireText(selector, "enableSpecializedAuthoring", "selector specialized-authoring switch");
requireText(generatePage, "enableSpecializedAuthoring", "generation page specialized-authoring switch");
if (generatePage.includes("FEATURES.enableAdvancedAuthoring")) {
  throw new Error("Generate page must not couple specialized book release to the broad advanced-authoring flag");
}
requireText(collector, "qualificationTelemetry", "collector reliability telemetry");
requireText(collector, "validateContract6Content", "collector canonical specialized contract");
requireText(collector, "COMIC_PANEL_IMAGE_COVERAGE", "collector comic visual coverage");
requireText(collector, "CHILDREN_VISUAL_DENSITY", "collector children visual coverage");
requireText(collector, "ILLUSTRATED_VISUAL_DENSITY", "collector illustrated visual coverage");

console.log("Provider qualification release wiring: PASS");
