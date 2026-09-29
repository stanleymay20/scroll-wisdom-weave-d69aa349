import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildFictionContinuityContext, sanitizeFictionContract } from "./fiction-context.ts";

Deno.test("fiction contract sanitizes genre, POV and character limits", () => {
  const result = sanitizeFictionContract({
    genre: "fantasy",
    pov: "first",
    tone: "lyrical",
    characters: [
      { id: "a", name: "Ama", role: "protagonist", description: "Scholar", motivation: "Find the archive", arc: "Learns trust" },
      { id: "b", name: "", role: "antagonist", description: "discard me" },
    ],
  });

  assertEquals(result.genre, "fantasy");
  assertEquals(result.pov, "first");
  assertEquals(result.characters.length, 1);
  assertEquals(result.characters[0].name, "Ama");
});

Deno.test("fiction memory contains every prior chapter plus recent scene tail", () => {
  const context = buildFictionContinuityContext(
    {
      genre: "mystery",
      pov: "third_limited",
      setting: "Berlin, winter.",
      characters: [{ name: "Nia", role: "protagonist", description: "Archivist", motivation: "Solve the disappearance", arc: "Trusts her instincts" }],
      plotPoints: [{ label: "Midpoint", description: "Nia learns the archive was altered." }],
    },
    [
      { chapter_number: 1, title: "The Letter", content: "Nia receives a sealed letter. ".repeat(40) + "She hides it beneath the floorboard." },
      { chapter_number: 2, title: "The Archive", content: "Nia enters the archive. ".repeat(40) + "She discovers a missing ledger." },
      { chapter_number: 3, title: "The Key", content: "Nia follows a clue. ".repeat(40) + "The brass key is now in her coat pocket." },
    ],
  );

  assertStringIncludes(context, 'Ch.1 "The Letter"');
  assertStringIncludes(context, 'Ch.2 "The Archive"');
  assertStringIncludes(context, 'Ch.3 "The Key"');
  assertStringIncludes(context, "The brass key is now in her coat pocket.");
  assertStringIncludes(context, "POV: third_limited");
  assertStringIncludes(context, "Nia [protagonist]");
});
