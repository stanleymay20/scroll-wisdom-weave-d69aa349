import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { advancedAuthoringEnabled, externalPaymentWritesEnabled, publicationMintEnabled } from "./ga-release-flags.ts";

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


Deno.test("GA advanced authoring defaults closed for empty or invalid values", () => {
  for (const value of ["", "false", "0", "no", "enabled"]) {
    assertEquals(advancedAuthoringEnabled(value), false);
  }
});

Deno.test("GA advanced authoring opens only for explicit affirmative values", () => {
  for (const value of ["true", "TRUE", "1", "yes"]) {
    assertEquals(advancedAuthoringEnabled(value), true);
  }
});


Deno.test("GA publication mint defaults closed for empty or invalid values", () => {
  for (const value of ["", "false", "0", "no", "enabled"]) {
    assertEquals(publicationMintEnabled(value), false);
  }
});

Deno.test("GA publication mint opens only for explicit affirmative values", () => {
  for (const value of ["true", "TRUE", "1", "yes"]) {
    assertEquals(publicationMintEnabled(value), true);
  }
});
