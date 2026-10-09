/**
 * GA release switches for external financial writes.
 *
 * Production defaults fail closed. Disposable Stripe lifecycle tests explicitly
 * set GA_PAYMENTS_ENABLED=true so the exact payment code can still be exercised
 * before this switch is opened in a real environment.
 */
export function externalPaymentWritesEnabled(value?: string | null): boolean {
  const normalized = String(
    value === undefined ? Deno.env.get("GA_PAYMENTS_ENABLED") ?? "" : value ?? "",
  ).trim().toLowerCase();

  return normalized === "true" || normalized === "1" || normalized === "yes";
}


export function advancedAuthoringEnabled(value?: string | null): boolean {
  const normalized = String(
    value === undefined ? Deno.env.get("GA_ADVANCED_AUTHORING_ENABLED") ?? "" : value ?? "",
  ).trim().toLowerCase();

  return normalized === "true" || normalized === "1" || normalized === "yes";
}


export function specializedAuthoringEnabled(value?: string | null): boolean {
  const normalized = String(
    value === undefined ? Deno.env.get("GA_SPECIALIZED_AUTHORING_ENABLED") ?? "" : value ?? "",
  ).trim().toLowerCase();

  return normalized === "true" || normalized === "1" || normalized === "yes";
}


export function publicationMintEnabled(value?: string | null): boolean {
  const normalized = String(
    value === undefined ? Deno.env.get("GA_PUBLICATION_MINT_ENABLED") ?? "" : value ?? "",
  ).trim().toLowerCase();

  return normalized === "true" || normalized === "1" || normalized === "yes";
}


/**
 * Teams is a separate commercial promise from the individual Creator/Pro
 * plans. Keep new Teams checkout closed until pooled organization usage,
 * member plan inheritance and the advertised included seats have passed their
 * own end-to-end qualification. General payment GA must never open it by
 * accident.
 */
export function teamsSubscriptionCheckoutEnabled(value?: string | null): boolean {
  const normalized = String(
    value === undefined ? Deno.env.get("GA_TEAMS_SUBSCRIPTION_ENABLED") ?? "" : value ?? "",
  ).trim().toLowerCase();

  return normalized === "true" || normalized === "1" || normalized === "yes";
}

const ADVANCED_BOOK_TYPES = new Set([
  "academic",
  "technical",
  "reference",
  "professional",
  "bestseller",
  "workbook",
  "illustrated",
  "children",
  "comic",
  "fiction",
]);

export function qualifiedAdvancedBookTypes(value?: string | null): Set<string> {
  const raw = String(
    value === undefined ? Deno.env.get("GA_QUALIFIED_BOOK_TYPES") ?? "" : value ?? "",
  );

  return new Set(
    raw
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter((item) => ADVANCED_BOOK_TYPES.has(item)),
  );
}

export function advancedBookTypeEnabled(
  bookType: string,
  advancedValue?: string | null,
  qualifiedTypesValue?: string | null,
): boolean {
  const normalized = String(bookType || "").trim().toLowerCase();
  if (normalized === "text") return true;
  if (!ADVANCED_BOOK_TYPES.has(normalized)) return false;
  if (!specializedAuthoringEnabled(advancedValue)) return false;
  return qualifiedAdvancedBookTypes(qualifiedTypesValue).has(normalized);
}

export function qualificationBookTypeEnabled(
  bookType: string,
  value?: string | null,
): boolean {
  const normalized = String(bookType || "").trim().toLowerCase();
  if (!ADVANCED_BOOK_TYPES.has(normalized)) return false;

  const raw = String(
    value === undefined ? Deno.env.get("PROVIDER_QUALIFICATION_BOOK_TYPES") ?? "" : value ?? "",
  );

  return raw
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .some((item) => item === normalized);
}


/**
 * Separate gate for selling ScrollLibrary Press publishing services. A paid
 * service order is not an ISBN mint, but we still fail closed until the
 * publishing-service operational workflow is ready to accept orders.
 */
export function publishingServiceBillingEnabled(value?: string | null): boolean {
  const normalized = String(
    value === undefined ? Deno.env.get("GA_PUBLISHING_SERVICES_BILLING_ENABLED") ?? "" : value ?? "",
  ).trim().toLowerCase();

  return normalized === "true" || normalized === "1" || normalized === "yes";
}


/** Paid third-party storefront purchases stay closed until creator payout settlement is GA-ready. */
export function marketplacePaymentsEnabled(value?: string | null): boolean {
  const normalized = String(
    value === undefined ? Deno.env.get("GA_MARKETPLACE_PAYMENTS_ENABLED") ?? "" : value ?? "",
  ).trim().toLowerCase();

  return normalized === "true" || normalized === "1" || normalized === "yes";
}


/** Stripe transfers to verified creator Connect accounts stay separately fail-closed. */
export function marketplacePayoutsEnabled(value?: string | null): boolean {
  const normalized = String(
    value === undefined ? Deno.env.get("GA_MARKETPLACE_PAYOUTS_ENABLED") ?? "" : value ?? "",
  ).trim().toLowerCase();

  return normalized === "true" || normalized === "1" || normalized === "yes";
}


/**
 * Physical manufacturing is an independent operational promise. General
 * payment/commercial GA must never cause a book to be submitted to a printer.
 */
export function printFulfillmentEnabled(value?: string | null): boolean {
  const normalized = String(
    value === undefined ? Deno.env.get("GA_PRINT_FULFILLMENT_ENABLED") ?? "" : value ?? "",
  ).trim().toLowerCase();

  return normalized === "true" || normalized === "1" || normalized === "yes";
}


/** Public reader checkout for physical books remains closed after author-copy fulfillment opens. */
export function printReaderCheckoutEnabled(value?: string | null): boolean {
  const normalized = String(
    value === undefined ? Deno.env.get("GA_PRINT_READER_CHECKOUT_ENABLED") ?? "" : value ?? "",
  ).trim().toLowerCase();

  return normalized === "true" || normalized === "1" || normalized === "yes";
}


/** Wholesale/bookstore/library distribution is separate from direct POD fulfillment. */
export function printDistributionEnabled(value?: string | null): boolean {
  const normalized = String(
    value === undefined ? Deno.env.get("GA_PRINT_DISTRIBUTION_ENABLED") ?? "" : value ?? "",
  ).trim().toLowerCase();

  return normalized === "true" || normalized === "1" || normalized === "yes";
}
