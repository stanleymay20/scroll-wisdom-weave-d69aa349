import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { verifyStripeWebhookEvent } from "./stripe-webhook-signature.ts";

const stripe = new Stripe("unit-test-client", { apiVersion: "2025-08-27.basil" });
const signingKey = "unit-test-webhook-key";
const body = JSON.stringify({ id: "evt_unit", type: "checkout.session.completed", data: { object: {} } });

// Sign independently with native Web Crypto, rather than the SDK under test.
async function signature(payload: string, timestamp = Math.floor(Date.now() / 1000)): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(signingKey), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const signed = await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${payload}`));
  const hex = [...new Uint8Array(signed)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `t=${timestamp},v1=${hex}`;
}

Deno.test("Stripe webhook accepts a valid raw-payload signature with Web Crypto", async () => {
  const event = await verifyStripeWebhookEvent(stripe, body, await signature(body), signingKey);
  assertEquals(event.id, "evt_unit");
  assertEquals(event.type, "checkout.session.completed");
});

Deno.test("Stripe webhook rejects a payload changed after signing", async () => {
  const signatureHeader = await signature(body);
  await assertRejects(() => verifyStripeWebhookEvent(stripe, `${body} `, signatureHeader, signingKey));
});

Deno.test("Stripe webhook rejects stale signatures despite a valid HMAC", async () => {
  const stale = await signature(body, 1);
  await assertRejects(() => verifyStripeWebhookEvent(stripe, body, stale, signingKey));
});
