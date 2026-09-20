import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  applyCorrections,
  type Correction,
  planWindows,
  protectedSpans,
  summarizeByKind,
} from "./proofread.ts";

function correction(partial: Partial<Correction>): Correction {
  return { find: "", replace: "", kind: "spelling", ...partial };
}

// ---------------------------------------------------------------------------
// planWindows — completeness is the requirement. A gap here would recreate the
// truncation bug this endpoint exists to compensate for.
// ---------------------------------------------------------------------------

Deno.test("windows cover the entire chapter with no gaps", () => {
  const content = "w".repeat(20_000);
  const windows = planWindows(content, 6_000, 400);

  assertEquals(windows[0].start, 0);
  assertEquals(windows[windows.length - 1].end, content.length);

  for (let i = 1; i < windows.length; i++) {
    assert(
      windows[i].start <= windows[i - 1].end,
      `gap between window ${i - 1} and ${i}: text would go unproofread`,
    );
  }
});

Deno.test("consecutive windows overlap so boundary sentences are seen whole", () => {
  const content = "w".repeat(20_000);
  const windows = planWindows(content, 6_000, 400);
  for (let i = 1; i < windows.length; i++) {
    assert(windows[i - 1].end - windows[i].start >= 400, "overlap must be preserved");
  }
});

Deno.test("short content yields exactly one window", () => {
  const windows = planWindows("a short chapter", 6_000, 400);
  assertEquals(windows.length, 1);
  assertEquals(windows[0].text, "a short chapter");
});

Deno.test("empty content yields no windows", () => {
  assertEquals(planWindows("", 6_000, 400).length, 0);
});

Deno.test("an absurd overlap is capped, not merely survived", () => {
  const content = "w".repeat(5_000);
  const windows = planWindows(content, 1_000, 5_000);

  // Overlap is clamped to half the window, so progress is at least size/2 and
  // the count stays near 2 * length / size rather than exploding to one window
  // per character — which downstream would be one AI call per character.
  const upperBound = Math.ceil((2 * content.length) / 1_000) + 1;
  assert(
    windows.length > 0 && windows.length <= upperBound,
    `expected at most ${upperBound} windows, got ${windows.length}`,
  );
  assertEquals(windows[windows.length - 1].end, content.length, "must still cover the tail");
});

// ---------------------------------------------------------------------------
// protectedSpans
// ---------------------------------------------------------------------------

Deno.test("citations, figures, code and links are protected", () => {
  const content = [
    "As shown (Smith, 2020) the effect holds.",
    "[FIGURE 1\nTYPE: chart\nCAPTION: A chart\nDESCRIPTION: bars]",
    "Use `const x = 1` inline.",
    "See [the docs](https://example.test/docs).",
  ].join("\n\n");

  const spans = protectedSpans(content);
  assert(spans.length >= 4, `expected each construct protected, got ${spans.length}`);
});

Deno.test("ordinary prose is not protected", () => {
  assertEquals(protectedSpans("A perfectly ordinary sentence.").length, 0);
});

// ---------------------------------------------------------------------------
// applyCorrections — the safety guards
// ---------------------------------------------------------------------------

Deno.test("a valid correction is applied", () => {
  const content = "The resluts were clear.";
  const result = applyCorrections(content, [
    correction({ find: "resluts", replace: "results" }),
  ]);
  assertEquals(result.text, "The results were clear.");
  assertEquals(result.applied.length, 1);
  assertEquals(result.rejected.length, 0);
});

Deno.test("a correction the model invented is rejected, not guessed at", () => {
  const content = "The results were clear.";
  const result = applyCorrections(content, [
    correction({ find: "text that is not in the chapter", replace: "anything" }),
  ]);
  assertEquals(result.text, content, "chapter must be untouched");
  assertEquals(result.rejected[0].reason, "not_found");
});

Deno.test("an ambiguous correction is rejected rather than applied to a guess", () => {
  const content = "the cat sat. the cat sat.";
  const result = applyCorrections(content, [
    correction({ find: "the cat", replace: "the dog" }),
  ]);
  assertEquals(result.text, content);
  assertEquals(result.rejected[0].reason, "ambiguous");
});

Deno.test("a rewrite disguised as a correction is rejected", () => {
  const content = "Short sentence here.";
  const result = applyCorrections(content, [
    correction({
      find: "Short",
      replace: "An extraordinarily elaborate and considerably longer reformulation ".repeat(4),
    }),
  ]);
  assertEquals(result.text, content);
  assertEquals(result.rejected[0].reason, "rewrite_not_copyedit");
});

Deno.test("citations cannot be edited", () => {
  const content = "The effect holds (Smith, 2020) across samples.";
  const result = applyCorrections(content, [
    correction({ find: "(Smith, 2020)", replace: "(Smith, 2021)" }),
  ]);
  assertEquals(result.text, content, "a verified citation must survive proofreading");
  assertEquals(result.rejected[0].reason, "protected_region");
});

Deno.test("figure markers cannot be edited", () => {
  const content = "Intro.\n\n[FIGURE 1\nTYPE: chart\nCAPTION: Growth\nDESCRIPTION: bars]\n\nOutro.";
  const result = applyCorrections(content, [
    correction({ find: "CAPTION: Growth", replace: "CAPTION: Growth rate" }),
  ]);
  assertEquals(result.text, content);
  assertEquals(result.rejected[0].reason, "protected_region");
});

Deno.test("no-ops and empty finds are rejected", () => {
  const result = applyCorrections("Some content here.", [
    correction({ find: "Some", replace: "Some" }),
    correction({ find: "", replace: "x" }),
  ]);
  assertEquals(result.applied.length, 0);
  assertEquals(result.rejected.map((r) => r.reason).sort(), ["empty_find", "no_op"]);
});

Deno.test("an unrecognised kind is rejected", () => {
  const result = applyCorrections("Some content here.", [
    { find: "Some", replace: "Any", kind: "restructure" } as unknown as Correction,
  ]);
  assertEquals(result.rejected[0].reason, "unknown_kind");
});

Deno.test("an oversized find is rejected as out of scope for a copyedit", () => {
  const content = "q".repeat(2_000);
  const result = applyCorrections(content, [
    correction({ find: "q".repeat(500), replace: "r".repeat(500) }),
  ]);
  assertEquals(result.rejected[0].reason, "oversized_find");
});

Deno.test("cumulative change is capped so a batch cannot become a rewrite", () => {
  // 200 single-character corrections against a small chapter exceeds the ratio.
  const content = Array.from({ length: 200 }, (_, i) => `sentance${i}`).join(" ");
  const corrections = Array.from({ length: 200 }, (_, i) =>
    correction({ find: `sentance${i}`, replace: `sentence${i}` }));

  const result = applyCorrections(content, corrections, { maxChangeRatio: 0.02 });

  assert(result.rejected.some((r) => r.reason === "change_budget_exceeded"));
  assert(result.applied.length < corrections.length, "must stop before rewriting the chapter");
});

Deno.test("corrections apply against the evolving text, in order", () => {
  const content = "aaa bbb ccc";
  const result = applyCorrections(content, [
    correction({ find: "aaa", replace: "xxx" }),
    correction({ find: "xxx bbb", replace: "xxx yyy" }),
  ]);
  assertEquals(result.text, "xxx yyy ccc");
  assertEquals(result.applied.length, 2);
});

Deno.test("a duplicate proposed by two overlapping windows collapses to one edit", () => {
  const content = "The resluts were clear.";
  const dup = correction({ find: "resluts", replace: "results" });
  const result = applyCorrections(content, [dup, { ...dup }]);
  assertEquals(result.text, "The results were clear.");
  assertEquals(result.applied.length, 1);
  assertEquals(result.rejected[0].reason, "not_found", "second pass no longer matches");
});

Deno.test("summarizeByKind counts what was actually applied", () => {
  const summary = summarizeByKind([
    correction({ find: "a", replace: "b", kind: "spelling" }),
    correction({ find: "c", replace: "d", kind: "spelling" }),
    correction({ find: "e", replace: "f", kind: "grammar" }),
  ]);
  assertEquals(summary, { spelling: 2, grammar: 1 });
});

Deno.test("an empty correction list leaves the chapter byte-identical", () => {
  const content = "Nothing to fix here.";
  const result = applyCorrections(content, []);
  assertEquals(result.text, content);
  assertEquals(result.changedChars, 0);
});
