import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { validateContract6Content } from "./contract6-governance.ts";

Deno.test("Contract 6 blocks reader-visible figure prompts for every type", () => {
  const result = validateContract6Content(
    "Figure: A consulting-style diagram showing the operating model.",
    "text",
  );
  assertEquals(result.valid, false);
  assert(result.violations.some((v) => v.code === "READER_VISIBLE_AUTHORING_DIRECTIVE"));
});

Deno.test("Contract 6 blocks stale fixed deadlines before content is committed", () => {
  const result = validateContract6Content(
    "Action plan. Deadline: End of Q4 2024. Complete the audit.",
    "professional",
  );
  assertEquals(result.valid, false);
  assert(result.violations.some((v) => v.code === "STALE_ACTION_DEADLINE"));
});

Deno.test("Contract 6 does not reject relative action timing", () => {
  const result = validateContract6Content(
    "Action plan. Complete the first review within 30 days of incorporation.",
    "professional",
  );
  assert(!result.violations.some((v) => v.code === "STALE_ACTION_DEADLINE"));
});
