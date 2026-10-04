import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  ONE_TIME_BILLING_CATALOGUE,
  isOneTimeBillingSku,
  oneTimeBillingPrice,
} from "./billing-order-catalogue.ts";

const env = (values: Record<string, string>) => (name: string) => values[name];

Deno.test("one-time billing catalogue pins economic list prices", () => {
  assertEquals(ONE_TIME_BILLING_CATALOGUE.ai_text_250k.amountCents, 1500);
  assertEquals(ONE_TIME_BILLING_CATALOGUE.visual_50.amountCents, 2000);
  assertEquals(ONE_TIME_BILLING_CATALOGUE.audio_60.amountCents, 1500);
  assertEquals(ONE_TIME_BILLING_CATALOGUE.single_edition.amountCents, 4900);
  assertEquals(ONE_TIME_BILLING_CATALOGUE.print_digital.amountCents, 8900);
  assertEquals(ONE_TIME_BILLING_CATALOGUE.complete_edition.amountCents, 12900);
  assertEquals(ONE_TIME_BILLING_CATALOGUE.assisted_launch.amountCents, 39900);
});

Deno.test("publishing bundles cost less than equivalent Single Edition purchases", () => {
  const single = ONE_TIME_BILLING_CATALOGUE.single_edition.amountCents;
  if (!(ONE_TIME_BILLING_CATALOGUE.print_digital.amountCents < single * 2)) {
    throw new Error("Print + Digital must provide a real bundle saving");
  }
  if (!(ONE_TIME_BILLING_CATALOGUE.complete_edition.amountCents < single * 3)) {
    throw new Error("Complete Edition must provide a real bundle saving");
  }
});

Deno.test("usage product names expose understandable customer units", () => {
  assertEquals(ONE_TIME_BILLING_CATALOGUE.visual_50.name, "+50 AI-generated visuals");
  assertEquals(ONE_TIME_BILLING_CATALOGUE.audio_60.name, "+60 narration minutes");
});

Deno.test("one-time SKU allow-list rejects unknown items and Teams seats", () => {
  assertEquals(isOneTimeBillingSku("ai_text_250k"), true);
  assertEquals(isOneTimeBillingSku("single_edition"), true);
  assertEquals(isOneTimeBillingSku("team_seat"), false);
  assertEquals(isOneTimeBillingSku("attacker_sku"), false);
});

Deno.test("one-time checkout price is environment-owned and fails closed", () => {
  assertEquals(oneTimeBillingPrice("visual_50", env({})), null);
  assertEquals(
    oneTimeBillingPrice("visual_50", env({ STRIPE_PRICE_ADDON_VISUAL_50: "price_visual_test" })),
    "price_visual_test",
  );
  assertThrows(
    () => oneTimeBillingPrice("visual_50", env({ STRIPE_PRICE_ADDON_VISUAL_50: "not_a_price" })),
    Error,
    "Stripe price id",
  );
});

Deno.test("one-time test override is accepted only with a test key", () => {
  const override = JSON.stringify({ visual_50: "price_test_visual" });
  assertEquals(
    oneTimeBillingPrice("visual_50", env({
      STRIPE_ONE_TIME_CATALOGUE_JSON: override,
      STRIPE_SECRET_KEY: "sk_test_x",
    })),
    "price_test_visual",
  );
  assertThrows(
    () => oneTimeBillingPrice("visual_50", env({
      STRIPE_ONE_TIME_CATALOGUE_JSON: override,
      STRIPE_SECRET_KEY: "sk_live_x",
    })),
    Error,
    "live Stripe key",
  );
});
