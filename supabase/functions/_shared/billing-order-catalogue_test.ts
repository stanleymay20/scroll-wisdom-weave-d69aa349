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
  assertEquals(ONE_TIME_BILLING_CATALOGUE.print_digital.amountCents, 9900);
  assertEquals(ONE_TIME_BILLING_CATALOGUE.complete_edition.amountCents, 14900);
  assertEquals(ONE_TIME_BILLING_CATALOGUE.assisted_launch.amountCents, 39900);
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
