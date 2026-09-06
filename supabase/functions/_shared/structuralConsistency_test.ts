import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildConsistencyDigest,
  deterministicConsistencyIssues,
  parseSemanticConsistencyReview,
  type ConsistencyChapter,
} from "./structuralConsistency.ts";

function chapter(number: number, title: string, body: string): ConsistencyChapter {
  return {
    chapter_number: number,
    title,
    content: `${body}\n\n${Array.from({ length: 340 }, (_, i) => `distinct${number}_${i}`).join(" ")}`,
    is_generated: true,
  };
}

Deno.test("deterministic consistency passes distinct contiguous chapters", () => {
  const chapters = [
    chapter(1, "Foundations", "Money is a social technology. ## Origins"),
    chapter(2, "Institutions", "Banks allocate credit. ## Balance Sheets"),
    chapter(3, "Ownership", "Equity represents residual ownership. ## Assets"),
  ];

  const issues = deterministicConsistencyIssues(chapters);
  assertEquals(issues.filter((issue) => issue.severity === "blocker").length, 0);
});

Deno.test("deterministic consistency blocks duplicate numbering and titles", () => {
  const chapters = [
    chapter(1, "Foundations", "Alpha material."),
    chapter(1, "Foundations", "Beta material."),
  ];
  const issues = deterministicConsistencyIssues(chapters);
  const codes = new Set(issues.map((issue) => issue.code));
  assert(codes.has("duplicate_chapter_numbers"));
  assert(codes.has("duplicate_chapter_titles"));
});

Deno.test("deterministic consistency blocks near-duplicate chapter bodies", () => {
  const common = Array.from({ length: 900 }, (_, i) => `word${i % 80}`).join(" ");
  const chapters: ConsistencyChapter[] = [
    { chapter_number: 1, title: "One", content: common, is_generated: true },
    { chapter_number: 2, title: "Two", content: `${common} small variation`, is_generated: true },
  ];
  const issues = deterministicConsistencyIssues(chapters);
  assert(issues.some((issue) =>
    issue.code === "near_duplicate_chapter_content" || issue.code === "duplicate_chapter_content"
  ));
});

Deno.test("consistency digest preserves every chapter under normal bounds", () => {
  const chapters = [
    chapter(1, "One", "Inflation means a sustained rise in the general price level."),
    chapter(2, "Two", "In 2025 the example value is 10%."),
  ];
  const digest = buildConsistencyDigest(chapters);
  const parsed = JSON.parse(digest);
  assertEquals(parsed.length, 2);
  assertEquals(parsed[0].chapterNumber, 1);
  assertEquals(parsed[1].chapterNumber, 2);
});

Deno.test("semantic parser accepts strict completed PASS JSON", () => {
  const parsed = parseSemanticConsistencyReview(`\n\`\`\`json\n{
    "analysisComplete": true,
    "status": "passed",
    "blockers": [],
    "warnings": [{"code":"term_drift","message":"Minor wording drift","chapters":[1,3]}]
  }\n\`\`\``);
  assert(parsed);
  assertEquals(parsed.analysisComplete, true);
  assertEquals(parsed.status, "passed");
  assertEquals(parsed.warnings.length, 1);
});

Deno.test("semantic parser rejects incomplete or malformed verdicts", () => {
  assertEquals(parseSemanticConsistencyReview('{"status":"passed","blockers":[],"warnings":[]}'), null);
  assertEquals(parseSemanticConsistencyReview("not json"), null);
});
