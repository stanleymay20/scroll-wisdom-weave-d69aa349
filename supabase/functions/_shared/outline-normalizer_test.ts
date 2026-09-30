import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { normalizeGeneratedOutline } from "./outline-normalizer.ts";

Deno.test("outline normalizer trims model over-generation to exact server count", () => {
  const out = normalizeGeneratedOutline({
    bookTitle: "Exact",
    chapters: Array.from({ length: 6 }, (_, i) => ({
      chapterNumber: i + 10,
      title: `Model chapter ${i + 1}`,
      description: "Description",
      keyTopics: ["A", "B"],
    })),
  }, 1, "Fallback", "Fallback description");

  assertEquals(out.chapters.length, 1);
  assertEquals(out.chapters[0].chapterNumber, 1);
  assertEquals(out.chapters[0].title, "Model chapter 1");
});

Deno.test("outline normalizer fills model under-generation deterministically", () => {
  const out = normalizeGeneratedOutline({
    chapters: [{ chapterNumber: 99, title: "Only one", description: "D", keyTopics: [] }],
  }, 3, "Book", "Desc");

  assertEquals(out.chapters.map((c) => c.chapterNumber), [1, 2, 3]);
  assertEquals(out.chapters[0].title, "Only one");
  assertEquals(out.chapters[1].title, "Chapter 2");
  assertEquals(out.chapters[2].keyTopics.length, 3);
});

Deno.test("outline normalizer ignores duplicate and invalid model numbering", () => {
  const out = normalizeGeneratedOutline({
    chapters: [
      { chapterNumber: 1, title: "A", description: "a" },
      { chapterNumber: 1, title: "B", description: "b" },
      { chapterNumber: -5, title: "C", description: "c" },
    ],
  }, 3, "Book", "Desc");

  assertEquals(out.chapters.map((c) => c.chapterNumber), [1, 2, 3]);
  assertEquals(out.chapters.map((c) => c.title), ["A", "B", "C"]);
});

Deno.test("outline normalizer rejects impossible server counts", () => {
  assertThrows(() => normalizeGeneratedOutline({}, 0, "Book", "Desc"));
  assertThrows(() => normalizeGeneratedOutline({}, 101, "Book", "Desc"));
});
