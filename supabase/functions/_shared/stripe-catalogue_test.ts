import { assert, assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  BILLABLE_TIERS,
  clientPriceMatchesTier,
  creatorTierForProduct,
  LIVE_CATALOGUE,
  isPublicCheckoutTier,
  parseCatalogueOverride,
  planTierForProduct,
  publicCheckoutPrice,
  expectedPublicPlanAmountCents,
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


Deno.test("public checkout exposes only the single generation-plan ladder", () => {
  for (const tier of ["student", "premium", "prophet_tier"]) {
    assert(isPublicCheckoutTier(tier));
  }
  assertEquals(isPublicCheckoutTier("creator"), false);
  assertEquals(isPublicCheckoutTier("creator_pro"), false);
  assertEquals(isPublicCheckoutTier("free"), false);
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

Deno.test("legacy plan prices are reconciliation-only, not valid new-checkout descriptors", () => {
  for (const tier of ["student", "premium", "prophet_tier"] as const) {
    assertEquals(clientPriceMatchesTier(LIVE_CATALOGUE, tier, LIVE_CATALOGUE.prices[tier]), false);
    assert(clientPriceMatchesTier(LIVE_CATALOGUE, tier, undefined));
  }
  // Legacy publisher subscriptions remain reconcilable.
  assert(clientPriceMatchesTier(LIVE_CATALOGUE, "creator", LIVE_CATALOGUE.prices.creator));
  assert(clientPriceMatchesTier(LIVE_CATALOGUE, "creator_pro", LIVE_CATALOGUE.prices.creator_pro));
});

Deno.test("test override accepts only the test catalogue price for its tier", () => {
  const test = parseCatalogueOverride(TEST_OVERRIDE);
  assertEquals(clientPriceMatchesTier(test, "premium", LIVE_CATALOGUE.prices.premium), false);
  assert(clientPriceMatchesTier(test, "premium", "price_test_premium"));
  assertEquals(clientPriceMatchesTier(test, "premium", "price_test_student"), false);
});

Deno.test("production public checkout requires both new product and price configuration", () => {
  const base = {
    STRIPE_PRODUCT_PRO: "prod_new_pro",
    STRIPE_PRICE_PRO_MONTHLY: "price_new_pro_month",
    STRIPE_PRICE_PRO_ANNUAL: "price_new_pro_year",
  };
  assertEquals(publicCheckoutPrice(LIVE_CATALOGUE, "premium", "monthly", env(base)), "price_new_pro_month");
  assertEquals(publicCheckoutPrice(LIVE_CATALOGUE, "premium", "annual", env(base)), "price_new_pro_year");
  assertEquals(publicCheckoutPrice(LIVE_CATALOGUE, "premium", "monthly", env({
    STRIPE_PRICE_PRO_MONTHLY: "price_new_pro_month",
  })), null);
});

Deno.test("expected public plan amounts pin the economic catalogue", () => {
  assertEquals(expectedPublicPlanAmountCents("student", "monthly"), 1900);
  assertEquals(expectedPublicPlanAmountCents("student", "annual"), 19000);
  assertEquals(expectedPublicPlanAmountCents("premium", "monthly"), 6900);
  assertEquals(expectedPublicPlanAmountCents("premium", "annual"), 69000);
  assertEquals(expectedPublicPlanAmountCents("prophet_tier", "monthly"), 19900);
  assertEquals(expectedPublicPlanAmountCents("prophet_tier", "annual"), 199000);
});
