/**
 * Stripe catalogue and reconciliation policy.
 *
 * Historical live products/prices remain mapped so existing subscriptions keep
 * reconciling correctly. New public checkout NEVER falls back to those legacy
 * prices. The new sustainable Creator/Pro/Teams prices must be supplied through
 * dedicated environment variables (or STRIPE_CATALOGUE_JSON in test mode).
 */

export type PlanTier = "student" | "premium" | "prophet_tier";
export type CreatorTier = "creator" | "creator_pro";
export type BillableTier = PlanTier | CreatorTier;
export type BillingInterval = "monthly" | "annual";

export const PLAN_TIERS: readonly PlanTier[] = ["student", "premium", "prophet_tier"];
export const CREATOR_TIERS: readonly CreatorTier[] = ["creator", "creator_pro"];
export const BILLABLE_TIERS: readonly BillableTier[] = [...PLAN_TIERS, ...CREATOR_TIERS];

export interface StripeCatalogue {
  /** Legacy/default monthly prices used for historical reconciliation and test overrides. */
  prices: Readonly<Record<BillableTier, string>>;
  /** Optional annual plan prices, used primarily by test-mode catalogue overrides. */
  annualPrices?: Readonly<Partial<Record<PlanTier, string>>>;
  /** Every product that grants a tier, including retired products still billing. */
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
    prod_U0fmlf14TPlMKj: "prophet_tier",
    prod_TaQWA7MSUntiMy: "prophet_tier",
    prod_UZv8Eine5sKy0j: "creator",
    prod_UZv8yPrOGDBuWE: "creator_pro",
  }),
  source: "live-default",
});

export const CATALOGUE_OVERRIDE_ENV = "STRIPE_CATALOGUE_JSON";

const PUBLIC_PRICE_ENV: Readonly<Record<PlanTier, Readonly<Record<BillingInterval, string>>>> = {
  student: {
    monthly: "STRIPE_PRICE_CREATOR_MONTHLY",
    annual: "STRIPE_PRICE_CREATOR_ANNUAL",
  },
  premium: {
    monthly: "STRIPE_PRICE_PRO_MONTHLY",
    annual: "STRIPE_PRICE_PRO_ANNUAL",
  },
  prophet_tier: {
    monthly: "STRIPE_PRICE_TEAMS_MONTHLY",
    annual: "STRIPE_PRICE_TEAMS_ANNUAL",
  },
};

const PUBLIC_PRODUCT_ENV: Readonly<Record<PlanTier, string>> = {
  student: "STRIPE_PRODUCT_CREATOR",
  premium: "STRIPE_PRODUCT_PRO",
  prophet_tier: "STRIPE_PRODUCT_TEAMS",
};

export const isPlanTier = (value: unknown): value is PlanTier =>
  typeof value === "string" && (PLAN_TIERS as readonly string[]).includes(value);

export const isCreatorTier = (value: unknown): value is CreatorTier =>
  typeof value === "string" && (CREATOR_TIERS as readonly string[]).includes(value);

export const isBillingInterval = (value: unknown): value is BillingInterval =>
  value === "monthly" || value === "annual";

export const PUBLIC_CHECKOUT_TIERS: readonly PlanTier[] = PLAN_TIERS;
export const isPublicCheckoutTier = isPlanTier;

const isBillableTier = (value: unknown): value is BillableTier =>
  isPlanTier(value) || isCreatorTier(value);

export function parseCatalogueOverride(raw: string): StripeCatalogue {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`${CATALOGUE_OVERRIDE_ENV} is not valid JSON`);
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error(`${CATALOGUE_OVERRIDE_ENV} must be an object`);
  }

  const { prices, annualPrices, products } = parsed as {
    prices?: unknown;
    annualPrices?: unknown;
    products?: unknown;
  };
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

  const annualMap: Partial<Record<PlanTier, string>> = {};
  if (annualPrices !== undefined) {
    if (!annualPrices || typeof annualPrices !== "object") {
      throw new Error(`${CATALOGUE_OVERRIDE_ENV}.annualPrices must be an object`);
    }
    for (const tier of PLAN_TIERS) {
      const price = (annualPrices as Record<string, unknown>)[tier];
      if (typeof price !== "string" || !price.startsWith("price_")) {
        throw new Error(`${CATALOGUE_OVERRIDE_ENV} has no annual price for tier "${tier}"`);
      }
      annualMap[tier] = price;
    }
  }

  const productMap: Record<string, BillableTier> = {};
  for (const [product, tier] of Object.entries(products as Record<string, unknown>)) {
    if (!product.startsWith("prod_")) {
      throw new Error(`${CATALOGUE_OVERRIDE_ENV} product "${product}" is not a product id`);
    }
    if (!isBillableTier(tier)) {
      throw new Error(`${CATALOGUE_OVERRIDE_ENV} maps "${product}" to unknown tier "${String(tier)}"`);
    }
    productMap[product] = tier;
  }
  for (const tier of BILLABLE_TIERS) {
    if (!Object.values(productMap).includes(tier)) {
      throw new Error(`${CATALOGUE_OVERRIDE_ENV} has no product for tier "${tier}"`);
    }
  }

  return Object.freeze({
    prices: Object.freeze(priceMap),
    annualPrices: Object.freeze(annualMap),
    products: Object.freeze(productMap),
    source: "override" as const,
  });
}

type EnvReader = (name: string) => string | undefined;

function addConfiguredPublicProducts(
  base: StripeCatalogue,
  env: EnvReader,
): StripeCatalogue {
  const products: Record<string, BillableTier> = { ...base.products };
  for (const tier of PLAN_TIERS) {
    const productId = env(PUBLIC_PRODUCT_ENV[tier])?.trim();
    if (!productId) continue;
    if (!productId.startsWith("prod_")) {
      throw new Error(`${PUBLIC_PRODUCT_ENV[tier]} must be a Stripe product id`);
    }
    products[productId] = tier;
  }
  return Object.freeze({
    ...base,
    products: Object.freeze(products),
  });
}

export function resolveStripeCatalogue(env: EnvReader = (name) => Deno.env.get(name)): StripeCatalogue {
  const raw = env(CATALOGUE_OVERRIDE_ENV)?.trim();
  if (raw) {
    if (/^(sk|rk)_live_/.test(env("STRIPE_SECRET_KEY") ?? "")) {
      throw new Error(`${CATALOGUE_OVERRIDE_ENV} is set alongside a live Stripe key; refusing a test catalogue`);
    }
    return parseCatalogueOverride(raw);
  }
  return addConfiguredPublicProducts(LIVE_CATALOGUE, env);
}

/**
 * Resolve the price that may be used for NEW public checkout.
 *
 * Production intentionally fails closed when the new sustainable catalogue has
 * not been provisioned. Historical $9/$19/$79 price IDs are reconciliation-only
 * and are never a fallback for new checkout.
 */
export function publicCheckoutPrice(
  catalogue: StripeCatalogue,
  tier: PlanTier,
  interval: BillingInterval,
  env: EnvReader = (name) => Deno.env.get(name),
): string | null {
  if (catalogue.source === "override") {
    const candidate = interval === "annual"
      ? catalogue.annualPrices?.[tier] ?? null
      : catalogue.prices[tier];
    return candidate && candidate.startsWith("price_") ? candidate : null;
  }

  const candidate = env(PUBLIC_PRICE_ENV[tier][interval])?.trim();
  if (!candidate) return null;
  if (!candidate.startsWith("price_")) {
    throw new Error(`${PUBLIC_PRICE_ENV[tier][interval]} must be a Stripe price id`);
  }
  return candidate;
}

export function planTierForProduct(
  catalogue: StripeCatalogue,
  productId: string | null | undefined,
): PlanTier | null {
  const tier = productId ? catalogue.products[productId] : undefined;
  return tier && (PLAN_TIERS as readonly string[]).includes(tier) ? tier as PlanTier : null;
}

export function creatorTierForProduct(
  catalogue: StripeCatalogue,
  productId: string | null | undefined,
): CreatorTier | null {
  const tier = productId ? catalogue.products[productId] : undefined;
  return tier && (CREATOR_TIERS as readonly string[]).includes(tier) ? tier as CreatorTier : null;
}

// Compatibility helper for older clients/tests. New public clients no longer send
// a priceId; they send tier + billingInterval and the server selects the price.
export function clientPriceMatchesTier(
  catalogue: StripeCatalogue,
  tier: BillableTier,
  requested: unknown,
): boolean {
  if (requested === undefined || requested === null || requested === "") return true;
  if (catalogue.source === "override") return requested === catalogue.prices[tier];
  return isCreatorTier(tier) && requested === LIVE_CATALOGUE.prices[tier];
}

export { isBillableTier };
