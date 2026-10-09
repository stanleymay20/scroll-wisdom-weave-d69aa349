import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { advancedAuthoringEnabled, advancedBookTypeEnabled, externalPaymentWritesEnabled, marketplacePaymentsEnabled, marketplacePayoutsEnabled, printDistributionEnabled, printFulfillmentEnabled, printReaderCheckoutEnabled, publicationMintEnabled, publishingServiceBillingEnabled, qualificationBookTypeEnabled, qualifiedAdvancedBookTypes, specializedAuthoringEnabled, teamsSubscriptionCheckoutEnabled } from "./ga-release-flags.ts";

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

Deno.test("Teams subscription checkout defaults closed independently of general payment GA", () => {
  for (const value of ["", "false", "0", "no", "enabled", "TRUE-ish"]) {
    assertEquals(teamsSubscriptionCheckoutEnabled(value), false);
  }
});

Deno.test("Teams subscription checkout opens only for explicit affirmative values", () => {
  for (const value of ["true", "TRUE", "1", "yes", " Yes "]) {
    assertEquals(teamsSubscriptionCheckoutEnabled(value), true);
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

Deno.test("GA marketplace payments default closed independently of general payments", () => {
  for (const value of ["", "false", "0", "no", "enabled", "TRUE-ish"]) {
    assertEquals(marketplacePaymentsEnabled(value), false);
  }
});

Deno.test("GA marketplace payments open only for explicit affirmative values", () => {
  for (const value of ["true", "TRUE", "1", "yes", " Yes "]) {
    assertEquals(marketplacePaymentsEnabled(value), true);
  }
});

Deno.test("GA marketplace payouts default closed independently of marketplace sales", () => {
  for (const value of ["", "false", "0", "no", "enabled", "TRUE-ish"]) {
    assertEquals(marketplacePayoutsEnabled(value), false);
  }
});

Deno.test("GA marketplace payouts open only for explicit affirmative values", () => {
  for (const value of ["true", "TRUE", "1", "yes", " Yes "]) {
    assertEquals(marketplacePayoutsEnabled(value), true);
  }
});

Deno.test("print fulfillment defaults closed independently of payment GA", () => {
  for (const value of ["", "false", "0", "no", "enabled", "TRUE-ish"]) {
    assertEquals(printFulfillmentEnabled(value), false);
  }
  assertEquals(externalPaymentWritesEnabled("true"), true);
  assertEquals(printFulfillmentEnabled("false"), false);
});

Deno.test("print reader checkout is separately fail-closed from author fulfillment", () => {
  assertEquals(printFulfillmentEnabled("true"), true);
  for (const value of ["", "false", "0", "no", "enabled"]) {
    assertEquals(printReaderCheckoutEnabled(value), false);
  }
  for (const value of ["true", "TRUE", "1", "yes", " Yes "]) {
    assertEquals(printReaderCheckoutEnabled(value), true);
  }
});

Deno.test("print distribution is separately fail-closed from direct fulfillment", () => {
  assertEquals(printFulfillmentEnabled("true"), true);
  assertEquals(printReaderCheckoutEnabled("true"), true);
  for (const value of ["", "false", "0", "no", "enabled"]) {
    assertEquals(printDistributionEnabled(value), false);
  }
  for (const value of ["true", "TRUE", "1", "yes", " Yes "]) {
    assertEquals(printDistributionEnabled(value), true);
  }
});
