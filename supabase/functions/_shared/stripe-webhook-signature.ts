import Stripe from "https://esm.sh/stripe@18.5.0";

/** Verify the raw payload with Deno's asynchronous Web Crypto implementation. */
export function verifyStripeWebhookEvent(
  stripe: Stripe,
  rawBody: string,
  signature: string,
  signingSecret: string,
): Promise<Stripe.Event> {
  return stripe.webhooks.constructEventAsync(
    rawBody,
    signature,
    signingSecret,
    undefined,
    Stripe.createSubtleCryptoProvider(),
  );
}
