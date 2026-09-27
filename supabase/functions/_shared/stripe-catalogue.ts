/**
 * Which Stripe price and product belong to which ScrollLibrary tier.
 *
 * This map used to be copied into four places — create-checkout (prices),
 * check-subscription, stripe-webhook and admin-force-stripe-resync (products)
 * — and the copies had already drifted: check-subscription knew no creator
 * products at all. It lives here once.
 *
 * The live IDs below are the defaults and are what production uses. Stripe
 * keeps test-mode objects in a separate namespace with different IDs, so the
 * only way to run checkout, webhooks and refunds end to end in test mode is
 * to point the code at test-mode products. STRIPE_CATALOGUE_JSON does that,
 * and nothing else can: it is refused outright alongside any live key,
 * so a test catalogue can never be charged against real cards.
 */

export type PlanTier = "student" | "premium" | "prophet_tier";
export type CreatorTier = "creator" | "creator_pro";
export type BillableTier = PlanTier | CreatorTier;

export const PLAN_TIERS: readonly PlanTier[] = ["student", "premium", "prophet_tier"];
export const CREATOR_TIERS: readonly CreatorTier[] = ["creator", "creator_pro"];
export const BILLABLE_TIERS: readonly BillableTier[] = [...PLAN_TIERS, ...CREATOR_TIERS];

export interface StripeCatalogue {
  /** The one price a new checkout for each tier is charged at. */
  prices: Readonly<Record<BillableTier, string>>;
  /** Every product that grants a tier, including retired ones still billing. */
  products: Readonly<Record<string, BillableTier>>;
  source: "live-default" | "override";
}

export const LIVE_CATALOGUE: StripeCatalogue = Object.freeze({
  prices: Object.freeze({
    student: "price_1SdFbTJYFIBeCvefKzHWUrcb",
    premium: "price_1SdFddJYFIBeCvefJr1ZY92E",
    prophet_tier: "price_1T2eR8JYFIBeCvefx02IXTz6",
    creator: "price_1TalITJYFIBeCvefdkr4LeL7",
    creator_pro: "price_1TalIUJYFIBeCvefHU67sm3O",
  }),
  products: Object.freeze({
    prod_TaQSrotoUkTuPC: "student",
    prod_TaQU3ILEUpbXOT: "premium",
    prod_U0fmlf14TPlMKj: "prophet_tier", // current Institutional product
    prod_TaQWA7MSUntiMy: "prophet_tier", // legacy Institutional product
    prod_UZv8Eine5sKy0j: "creator",
    prod_UZv8yPrOGDBuWE: "creator_pro",
  }),
  source: "live-default",
});

export const CATALOGUE_OVERRIDE_ENV = "STRIPE_CATALOGUE_JSON";

const isBillableTier = (value: unknown): value is BillableTier =>
  typeof value === "string" && (BILLABLE_TIERS as readonly string[]).includes(value);

/**
 * Validate an override. Throws rather than falling back: a half-applied
 * catalogue would charge some tiers at test prices and others at live ones,
 * and a silent fallback to live IDs inside a test run would hide exactly the
 * misconfiguration this exists to catch.
 */
export function parseCatalogueOverride(raw: string): StripeCatalogue {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`${CATALOGUE_OVERRIDE_ENV} is not valid JSON`);
  }
  if (!parsed || typeof parsed !== "object") throw new Error(`${CATALOGUE_OVERRIDE_ENV} must be an object`);
  const { prices, products } = parsed as { prices?: unknown; products?: unknown };
  if (!prices || typeof prices !== "object" || !products || typeof products !== "object") {
    throw new Error(`${CATALOGUE_OVERRIDE_ENV} needs both "prices" and "products"`);
  }

  const priceMap = {} as Record<BillableTier, string>;
  for (const tier of BILLABLE_TIERS) {
    const price = (prices as Record<string, unknown>)[tier];
    if (typeof price !== "string" || !price.startsWith("price_")) {
      throw new Error(`${CATALOGUE_OVERRIDE_ENV} has no price for tier "${tier}"`);
    }
    priceMap[tier] = price;
  }

  const productMap: Record<string, BillableTier> = {};
  for (const [product, tier] of Object.entries(products as Record<string, unknown>)) {
    if (!product.startsWith("prod_")) throw new Error(`${CATALOGUE_OVERRIDE_ENV} product "${product}" is not a product id`);
    if (!isBillableTier(tier)) throw new Error(`${CATALOGUE_OVERRIDE_ENV} maps "${product}" to unknown tier "${String(tier)}"`);
    productMap[product] = tier;
  }
  for (const tier of BILLABLE_TIERS) {
    if (!Object.values(productMap).includes(tier)) {
      throw new Error(`${CATALOGUE_OVERRIDE_ENV} has no product for tier "${tier}"`);
    }
  }

  return Object.freeze({
    prices: Object.freeze(priceMap),
    products: Object.freeze(productMap),
    source: "override" as const,
  });
}

type EnvReader = (name: string) => string | undefined;

export function resolveStripeCatalogue(env: EnvReader = (name) => Deno.env.get(name)): StripeCatalogue {
  const raw = env(CATALOGUE_OVERRIDE_ENV)?.trim();
  if (!raw) return LIVE_CATALOGUE;
  // Restricted keys (rk_live_) charge real cards too.
  if (/^(sk|rk)_live_/.test(env("STRIPE_SECRET_KEY") ?? "")) {
    throw new Error(`${CATALOGUE_OVERRIDE_ENV} is set alongside a live Stripe key; refusing to use a non-live catalogue`);
  }
  return parseCatalogueOverride(raw);
}

export function planTierForProduct(catalogue: StripeCatalogue, productId: string | null | undefined): PlanTier | null {
  const tier = productId ? catalogue.products[productId] : undefined;
  return tier && (PLAN_TIERS as readonly string[]).includes(tier) ? tier as PlanTier : null;
}

export function creatorTierForProduct(catalogue: StripeCatalogue, productId: string | null | undefined): CreatorTier | null {
  const tier = productId ? catalogue.products[productId] : undefined;
  return tier && (CREATOR_TIERS as readonly string[]).includes(tier) ? tier as CreatorTier : null;
}

/**
 * Whether a price a client sent is an acceptable description of a tier.
 *
 * The server always charges catalogue.prices[tier]; the client's price is
 * never used. It is only checked so a stale or tampered client fails loudly.
 * Clients carry the live catalogue, so under a test override the live price
 * for the same tier is also accepted — it names the same tier, not another.
 */
export function clientPriceMatchesTier(catalogue: StripeCatalogue, tier: BillableTier, requested: unknown): boolean {
  if (requested === undefined || requested === null || requested === "") return true;
  return requested === catalogue.prices[tier] || requested === LIVE_CATALOGUE.prices[tier];
}

export { isBillableTier };
