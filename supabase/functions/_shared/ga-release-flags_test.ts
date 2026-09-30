import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { advancedAuthoringEnabled, advancedBookTypeEnabled, externalPaymentWritesEnabled, publicationMintEnabled, publishingServiceBillingEnabled, qualificationBookTypeEnabled, qualifiedAdvancedBookTypes, specializedAuthoringEnabled } from "./ga-release-flags.ts";

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


Deno.test("GA specialized authoring defaults closed for empty or invalid values", () => {
  for (const value of ["", "false", "0", "no", "enabled"]) {
    assertEquals(specializedAuthoringEnabled(value), false);
  }
});

Deno.test("GA specialized authoring opens only for explicit affirmative values", () => {
  for (const value of ["true", "TRUE", "1", "yes"]) {
    assertEquals(specializedAuthoringEnabled(value), true);
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


Deno.test("qualified advanced book types accept only the controlled allow-list", () => {
  assertEquals(
    [...qualifiedAdvancedBookTypes("academic, technical,unknown,FICTION")].sort(),
    ["academic", "fiction", "technical"],
  );
});

Deno.test("advanced types stay closed when the specialized switch is closed", () => {
  assertEquals(advancedBookTypeEnabled("academic", "false", "academic"), false);
  assertEquals(advancedBookTypeEnabled("fiction", "", "fiction"), false);
});

Deno.test("specialized authoring does not unlock unqualified modes", () => {
  assertEquals(advancedBookTypeEnabled("academic", "true", "technical"), false);
  assertEquals(advancedBookTypeEnabled("comic", "true", "academic,technical"), false);
});

Deno.test("only explicitly qualified advanced modes open", () => {
  assertEquals(advancedBookTypeEnabled("academic", "true", "academic,technical"), true);
  assertEquals(advancedBookTypeEnabled("technical", "true", "academic,technical"), true);
  assertEquals(advancedBookTypeEnabled("fiction", "true", "academic,technical"), false);
  assertEquals(advancedBookTypeEnabled("text", "false", ""), true);
});


Deno.test("qualification access is independent from public release allow-list", () => {
  assertEquals(qualificationBookTypeEnabled("academic", "academic,technical"), true);
  assertEquals(qualificationBookTypeEnabled("fiction", "academic,technical"), false);
  assertEquals(qualificationBookTypeEnabled("text", "text,academic"), false);
});


Deno.test("publishing-service billing defaults closed independently of payment writes", () => {
  for (const value of ["", "false", "0", "no", "enabled"]) {
    assertEquals(publishingServiceBillingEnabled(value), false);
  }
});

Deno.test("publishing-service billing opens only for explicit affirmative values", () => {
  for (const value of ["true", "TRUE", "1", "yes", " Yes "]) {
    assertEquals(publishingServiceBillingEnabled(value), true);
  }
});
