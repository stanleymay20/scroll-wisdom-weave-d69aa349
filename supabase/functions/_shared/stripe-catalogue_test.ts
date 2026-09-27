import { assert, assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  BILLABLE_TIERS,
  clientPriceMatchesTier,
  creatorTierForProduct,
  LIVE_CATALOGUE,
  parseCatalogueOverride,
  planTierForProduct,
  resolveStripeCatalogue,
} from "./stripe-catalogue.ts";

const TEST_OVERRIDE = JSON.stringify({
  prices: {
    student: "price_test_student", premium: "price_test_premium", prophet_tier: "price_test_prophet",
    creator: "price_test_creator", creator_pro: "price_test_creator_pro",
  },
  products: {
    prod_test_student: "student", prod_test_premium: "premium", prod_test_prophet: "prophet_tier",
    prod_test_creator: "creator", prod_test_creator_pro: "creator_pro",
  },
});

const env = (values: Record<string, string>) => (name: string) => values[name];

Deno.test("live catalogue is exactly the mapping production has been using", () => {
  // Pinned so that centralising the map cannot silently change who gets what.
  assertEquals({ ...LIVE_CATALOGUE.prices }, {
    student: "price_1SdFbTJYFIBeCvefKzHWUrcb",
    premium: "price_1SdFddJYFIBeCvefJr1ZY92E",
    prophet_tier: "price_1T2eR8JYFIBeCvefx02IXTz6",
    creator: "price_1TalITJYFIBeCvefdkr4LeL7",
    creator_pro: "price_1TalIUJYFIBeCvefHU67sm3O",
  });
  assertEquals({ ...LIVE_CATALOGUE.products }, {
    prod_TaQSrotoUkTuPC: "student",
    prod_TaQU3ILEUpbXOT: "premium",
    prod_U0fmlf14TPlMKj: "prophet_tier",
    prod_TaQWA7MSUntiMy: "prophet_tier",
    prod_UZv8Eine5sKy0j: "creator",
    prod_UZv8yPrOGDBuWE: "creator_pro",
  });
});

Deno.test("no override means the live catalogue", () => {
  assertEquals(resolveStripeCatalogue(env({})), LIVE_CATALOGUE);
  assertEquals(resolveStripeCatalogue(env({ STRIPE_CATALOGUE_JSON: "  " })), LIVE_CATALOGUE);
});

Deno.test("a test override replaces the catalogue under a test key", () => {
  const catalogue = resolveStripeCatalogue(env({ STRIPE_CATALOGUE_JSON: TEST_OVERRIDE, STRIPE_SECRET_KEY: "sk_test_x" }));
  assertEquals(catalogue.source, "override");
  assertEquals(catalogue.prices.premium, "price_test_premium");
  assertEquals(planTierForProduct(catalogue, "prod_test_premium"), "premium");
  // The live products mean nothing in test mode.
  assertEquals(planTierForProduct(catalogue, "prod_TaQU3ILEUpbXOT"), null);
});

Deno.test("an override is refused alongside any live key, secret or restricted", () => {
  for (const key of ["sk_live_x", "rk_live_x"]) {
    assertThrows(
      () => resolveStripeCatalogue(env({ STRIPE_CATALOGUE_JSON: TEST_OVERRIDE, STRIPE_SECRET_KEY: key })),
      Error,
      "live Stripe key",
    );
  }
  // Restricted test keys are fine.
  assertEquals(resolveStripeCatalogue(env({ STRIPE_CATALOGUE_JSON: TEST_OVERRIDE, STRIPE_SECRET_KEY: "rk_test_x" })).source, "override");
});

Deno.test("an incomplete or malformed override fails loudly instead of half-applying", () => {
  assertThrows(() => parseCatalogueOverride("{"), Error, "not valid JSON");
  const missingPrice = JSON.parse(TEST_OVERRIDE);
  delete missingPrice.prices.creator_pro;
  assertThrows(() => parseCatalogueOverride(JSON.stringify(missingPrice)), Error, 'no price for tier "creator_pro"');
  const missingProduct = JSON.parse(TEST_OVERRIDE);
  delete missingProduct.products.prod_test_student;
  assertThrows(() => parseCatalogueOverride(JSON.stringify(missingProduct)), Error, 'no product for tier "student"');
  const badTier = JSON.parse(TEST_OVERRIDE);
  badTier.products.prod_x = "admin";
  assertThrows(() => parseCatalogueOverride(JSON.stringify(badTier)), Error, 'unknown tier "admin"');
});

Deno.test("plan and creator products are kept in separate authority domains", () => {
  assertEquals(planTierForProduct(LIVE_CATALOGUE, "prod_TaQWA7MSUntiMy"), "prophet_tier");
  assertEquals(creatorTierForProduct(LIVE_CATALOGUE, "prod_TaQWA7MSUntiMy"), null);
  assertEquals(creatorTierForProduct(LIVE_CATALOGUE, "prod_UZv8yPrOGDBuWE"), "creator_pro");
  assertEquals(planTierForProduct(LIVE_CATALOGUE, "prod_UZv8yPrOGDBuWE"), null);
  assertEquals(planTierForProduct(LIVE_CATALOGUE, null), null);
  assertEquals(planTierForProduct(LIVE_CATALOGUE, "prod_unknown"), null);
});

Deno.test("a client price must name the tier it claims", () => {
  for (const tier of BILLABLE_TIERS) {
    assert(clientPriceMatchesTier(LIVE_CATALOGUE, tier, LIVE_CATALOGUE.prices[tier]));
    assert(clientPriceMatchesTier(LIVE_CATALOGUE, tier, undefined));
  }
  // Cheaper tier's price under a dearer tier's name.
  assertEquals(clientPriceMatchesTier(LIVE_CATALOGUE, "premium", LIVE_CATALOGUE.prices.student), false);
  assertEquals(clientPriceMatchesTier(LIVE_CATALOGUE, "premium", "price_attacker"), false);
});

Deno.test("under a test override the live client still names its tier, and only its tier", () => {
  const test = parseCatalogueOverride(TEST_OVERRIDE);
  assert(clientPriceMatchesTier(test, "premium", LIVE_CATALOGUE.prices.premium));
  assert(clientPriceMatchesTier(test, "premium", "price_test_premium"));
  assertEquals(clientPriceMatchesTier(test, "premium", LIVE_CATALOGUE.prices.student), false);
  assertEquals(clientPriceMatchesTier(test, "premium", "price_test_student"), false);
});
