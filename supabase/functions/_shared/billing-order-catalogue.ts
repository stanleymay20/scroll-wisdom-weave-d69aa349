/**
 * Server-authoritative one-time billing catalogue.
 *
 * Prices are intentionally supplied through environment variables. The public
 * UI may show list prices, but Checkout never trusts a client-supplied amount.
 */
export type OneTimeBillingSku =
  | "ai_text_250k"
  | "visual_50"
  | "audio_60"
  | "single_edition"
  | "print_digital"
  | "complete_edition"
  | "assisted_launch";

export type BillingOrderKind = "usage_addon" | "publishing_service";

export interface OneTimeBillingSpec {
  sku: OneTimeBillingSku;
  kind: BillingOrderKind;
  name: string;
  amountCents: number;
  currency: "usd";
  priceEnv: string;
  grant?: {
    metric: "ai_text_words" | "visual_credits" | "audio_credits";
    units: number;
  };
  maxIsbns?: number;
}

export const ONE_TIME_BILLING_CATALOGUE: Readonly<Record<OneTimeBillingSku, OneTimeBillingSpec>> = Object.freeze({
  ai_text_250k: Object.freeze({
    sku: "ai_text_250k",
    kind: "usage_addon",
    name: "+250k AI text words",
    amountCents: 1500,
    currency: "usd",
    priceEnv: "STRIPE_PRICE_ADDON_AI_TEXT_250K",
    grant: { metric: "ai_text_words", units: 250_000 },
  }),
  visual_50: Object.freeze({
    sku: "visual_50",
    kind: "usage_addon",
    name: "+50 visual credits",
    amountCents: 2000,
    currency: "usd",
    priceEnv: "STRIPE_PRICE_ADDON_VISUAL_50",
    grant: { metric: "visual_credits", units: 50 },
  }),
  audio_60: Object.freeze({
    sku: "audio_60",
    kind: "usage_addon",
    name: "+60 audio credits",
    amountCents: 1500,
    currency: "usd",
    priceEnv: "STRIPE_PRICE_ADDON_AUDIO_60",
    grant: { metric: "audio_credits", units: 60 },
  }),
  single_edition: Object.freeze({
    sku: "single_edition",
    kind: "publishing_service",
    name: "Single Edition",
    amountCents: 4900,
    currency: "usd",
    priceEnv: "STRIPE_PRICE_PUBLISH_SINGLE_EDITION",
    maxIsbns: 1,
  }),
  print_digital: Object.freeze({
    sku: "print_digital",
    kind: "publishing_service",
    name: "Print + Digital",
    amountCents: 9900,
    currency: "usd",
    priceEnv: "STRIPE_PRICE_PUBLISH_PRINT_DIGITAL",
    maxIsbns: 2,
  }),
  complete_edition: Object.freeze({
    sku: "complete_edition",
    kind: "publishing_service",
    name: "Complete Edition",
    amountCents: 14900,
    currency: "usd",
    priceEnv: "STRIPE_PRICE_PUBLISH_COMPLETE_EDITION",
    maxIsbns: 3,
  }),
  assisted_launch: Object.freeze({
    sku: "assisted_launch",
    kind: "publishing_service",
    name: "Assisted Publishing Launch",
    amountCents: 39900,
    currency: "usd",
    priceEnv: "STRIPE_PRICE_PUBLISH_ASSISTED_LAUNCH",
    maxIsbns: 3,
  }),
});

export function isOneTimeBillingSku(value: unknown): value is OneTimeBillingSku {
  return typeof value === "string" && value in ONE_TIME_BILLING_CATALOGUE;
}

export const ONE_TIME_CATALOGUE_OVERRIDE_ENV = "STRIPE_ONE_TIME_CATALOGUE_JSON";

export function oneTimeBillingPrice(
  sku: OneTimeBillingSku,
  env: (name: string) => string | undefined = (name) => Deno.env.get(name),
): string | null {
  const spec = ONE_TIME_BILLING_CATALOGUE[sku];
  const overrideRaw = env(ONE_TIME_CATALOGUE_OVERRIDE_ENV)?.trim();

  if (overrideRaw) {
    if (/^(sk|rk)_live_/.test(env("STRIPE_SECRET_KEY") ?? "")) {
      throw new Error(ONE_TIME_CATALOGUE_OVERRIDE_ENV + " cannot be used with a live Stripe key");
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(overrideRaw);
    } catch {
      throw new Error(ONE_TIME_CATALOGUE_OVERRIDE_ENV + " is not valid JSON");
    }
    if (!parsed || typeof parsed !== "object") {
      throw new Error(ONE_TIME_CATALOGUE_OVERRIDE_ENV + " must be an object");
    }
    const value = (parsed as Record<string, unknown>)[sku];
    if (typeof value !== "string" || !value.startsWith("price_")) {
      throw new Error(ONE_TIME_CATALOGUE_OVERRIDE_ENV + " has no price for " + sku);
    }
    return value;
  }

  const value = env(spec.priceEnv)?.trim();
  if (!value) return null;
  if (!value.startsWith("price_")) throw new Error(spec.priceEnv + " must be a Stripe price id");
  return value;
}
