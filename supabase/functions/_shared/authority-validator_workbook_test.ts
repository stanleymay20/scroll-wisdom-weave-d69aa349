import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { validateWorkbookStructure } from "./authority-validator.ts";

Deno.test("workbook contract blocks prose-only output", () => {
  const result = validateWorkbookStructure(
    "## Purpose\nUnderstand the topic.\n\n## Key Concepts\nA concept.\n\n"
    + "## Prompts\nThink about it.\n\n## Reflection\nReflect.\n\n## Action Steps\nDo something.",
  );

  assertEquals(result.valid, false);
  assertEquals(result.blocked, true);
  assertEquals(result.errors.some((error) => error.code === "NO_INTERACTIVE_ELEMENTS"), true);
});

Deno.test("workbook contract accepts structured interactive output", () => {
  const result = validateWorkbookStructure(
    "## Purpose\nPractice the skill.\n\n"
    + "## Key Concepts\n- Concept A\n\n"
    + "## Exercises\n1. Write your answer: __________\n2. [ ] Complete the exercise\n\n"
    + "## Reflection\nWhat changed? __________\n\n"
    + "## Action Steps\n[ ] Apply the method tomorrow.",
  );

  assertEquals(result.valid, true);
  assertEquals(result.errors.length, 0);
});
