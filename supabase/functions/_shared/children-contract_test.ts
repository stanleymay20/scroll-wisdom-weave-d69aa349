import { assert, assertEquals, assertFalse, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildChildrenSystemPrompt } from "./children-contract.ts";

Deno.test("children constitution is isolated from adult authoring mechanics", () => {
  const prompt = buildChildrenSystemPrompt("English");

  assertStringIncludes(prompt, "CHILDREN'S PICTURE-BOOK PIPELINE");
  assertStringIncludes(prompt, "exactly 4-5 [FIGURE X: description] markers");
  assertStringIncludes(prompt, "Ages 4-10");
  assertStringIncludes(prompt, "Write EXCLUSIVELY in English");

  const forbiddenPositiveInstructions = [
    "MUST INCLUDE: • Mental models",
    "NAMED FRAMEWORK",
    "EXECUTIVE ACTIONS",
    "MANDATORY CODE DENSITY",
    "Learning Objectives (3-5",
    "same depth and quality as a text-only bestseller",
  ];

  for (const phrase of forbiddenPositiveInstructions) {
    assertFalse(prompt.includes(phrase), "children prompt leaked adult instruction: " + phrase);
  }

  const figures = prompt.match(/4-5 \[FIGURE X: description\]/g) || [];
  assertEquals(figures.length, 1);
  assert(prompt.length > 500);
});
