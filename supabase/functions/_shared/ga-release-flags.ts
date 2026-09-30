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

/**
 * Publisher add-on subscriptions are a separate paid surface from generation
 * plans and stay fail-closed until their advertised capabilities are qualified.
 */
export function publisherSubscriptionsEnabled(value?: string | null): boolean {
  const normalized = String(
    value === undefined ? Deno.env.get("GA_PUBLISHER_SUBSCRIPTIONS_ENABLED") ?? "" : value ?? "",
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
