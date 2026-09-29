import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { externalPaymentWritesEnabled } from "./ga-release-flags.ts";

Deno.test("GA payment writes default closed for empty or invalid values", () => {
  for (const value of ["", "false", "0", "no", "enabled", "TRUE-ish"]) {
    assertEquals(externalPaymentWritesEnabled(value), false);
  }
});

Deno.test("GA payment writes open only for explicit affirmative values", () => {
  for (const value of ["true", "TRUE", "1", "yes", " Yes "]) {
    assertEquals(externalPaymentWritesEnabled(value), true);
  }
});
