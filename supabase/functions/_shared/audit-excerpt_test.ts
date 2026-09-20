import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  AUDIT_MAX_PER_CHAPTER,
  AUDIT_MIN_PER_CHAPTER,
  chapterExcerptBudget,
  excerptForAudit,
} from "./audit-excerpt.ts";

Deno.test("small books audit every chapter at the per-chapter ceiling", () => {
  assertEquals(chapterExcerptBudget(5), AUDIT_MAX_PER_CHAPTER);
  assertEquals(chapterExcerptBudget(12), AUDIT_MAX_PER_CHAPTER);
});

Deno.test("large books divide the total budget but never below the floor", () => {
  const fifty = chapterExcerptBudget(50);
  assert(fifty < AUDIT_MAX_PER_CHAPTER, "50 chapters should be below the ceiling");
  assert(fifty >= AUDIT_MIN_PER_CHAPTER, "must not fall below the floor");
  assertEquals(chapterExcerptBudget(100), AUDIT_MIN_PER_CHAPTER);
});

Deno.test("degenerate chapter counts fall back to the ceiling", () => {
  assertEquals(chapterExcerptBudget(0), AUDIT_MAX_PER_CHAPTER);
  assertEquals(chapterExcerptBudget(-3), AUDIT_MAX_PER_CHAPTER);
  assertEquals(chapterExcerptBudget(Number.NaN), AUDIT_MAX_PER_CHAPTER);
});

Deno.test("a chapter within budget is passed through untouched", () => {
  const content = "word ".repeat(200).trim();
  const excerpt = excerptForAudit(content, 5_000);
  assertEquals(excerpt.text, content);
  assertEquals(excerpt.elidedChars, 0);
  assertEquals(excerpt.complete, true);
});

Deno.test("a typical chapter fits entirely in a typical book's budget", () => {
  // ~2200 words, the top of the generator's stated target range.
  const chapter = "concept ".repeat(2200).trim();
  const excerpt = excerptForAudit(chapter, chapterExcerptBudget(12));
  assertEquals(excerpt.complete, true, "a 2200-word chapter should not be elided in a 12-chapter book");
});

Deno.test("an over-budget chapter keeps its ENDING, which the old truncation dropped", () => {
  const opening = "OPENING_MARKER ";
  const middle = "filler ".repeat(4000);
  const closing = " CLOSING_MARKER";
  const content = opening + middle + closing;

  const excerpt = excerptForAudit(content, 4_000);

  assert(!excerpt.complete, "should report itself as excerpted");
  assert(excerpt.text.includes("OPENING_MARKER"), "opening must survive");
  assert(
    excerpt.text.includes("CLOSING_MARKER"),
    "closing must survive — this is the defect the old slice(0, N) had",
  );
  assert(excerpt.elidedChars > 0, "must report how much was removed");
});

Deno.test("the elision is declared to the model rather than hidden", () => {
  const content = "x ".repeat(10_000);
  const excerpt = excerptForAudit(content, 2_000);
  assert(
    /elided from the middle of this chapter/.test(excerpt.text),
    "the model must be told the text is not contiguous",
  );
});

Deno.test("excerpt stays close to budget, allowing for the marker", () => {
  const content = "y ".repeat(50_000);
  const budget = 6_000;
  const excerpt = excerptForAudit(content, budget);
  assert(
    excerpt.text.length < budget + 300,
    `excerpt ${excerpt.text.length} should not greatly exceed budget ${budget}`,
  );
});

Deno.test("elidedChars accounts for everything dropped", () => {
  const content = "z ".repeat(20_000);
  const excerpt = excerptForAudit(content, 3_000);
  // Head + tail + elided should reconstruct the original length, modulo the
  // whitespace trimmed at each cut.
  const kept = content.length - excerpt.elidedChars;
  assert(kept > 0 && kept <= content.length, "kept length must be sane");
  assert(excerpt.elidedChars < content.length, "cannot elide the whole chapter");
});

Deno.test("empty, tiny and zero-budget content is returned whole", () => {
  assertEquals(excerptForAudit("", 5_000).text, "");
  assertEquals(excerptForAudit("", 5_000).complete, true);
  // Too small to split usefully: returning it whole beats emitting a fragment.
  assertEquals(excerptForAudit("hi", 1).text, "hi");
  assertEquals(excerptForAudit("hi", 1).complete, true);
  // A zero budget means "unbudgeted", not "return nothing".
  assertEquals(excerptForAudit("hello world", 0).text, "hello world");
  assertEquals(excerptForAudit("hello world", 0).complete, true);
});

Deno.test("content with no whitespace still splits without throwing", () => {
  const content = "a".repeat(20_000);
  const excerpt = excerptForAudit(content, 2_000);
  assert(excerpt.text.length > 0);
  assert(excerpt.text.startsWith("a"));
  assert(excerpt.text.endsWith("a"), "the tail must still be present");
});
