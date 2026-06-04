// Input validation + sanitisation for direct-publish requests.
//
// Upstream APIs (Gumroad, Shopify) accept what we send. Bad inputs surface as
// useless 422s, brittle product listings, or — worst case — XSS in product
// descriptions that get rendered on third-party storefronts. We normalise here
// so each platform-specific function can trust the result.

export interface NormalisedListing {
  title: string;
  description: string;
  priceCents: number;
  currency: string;
  tags: string[];
  coverImageUrl: string | null;
}

export interface ValidationFailure {
  ok: false;
  code: string;
  message: string;
}
export interface ValidationSuccess {
  ok: true;
  value: NormalisedListing;
}
export type ValidationResult = ValidationSuccess | ValidationFailure;

/** Strip ASCII control chars (incl. NUL) and collapse runs of whitespace. */
export function sanitiseText(input: unknown, maxLen: number): string {
  if (typeof input !== "string") return "";
  // Remove control characters except \n and \t.
  // deno-lint-ignore no-control-regex
  const stripped = input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
  return stripped.replace(/[ \t]+/g, " ").trim().slice(0, maxLen);
}

/** Returns the cover URL only if it parses as http/https and is ≤2000 chars. */
export function sanitiseHttpUrl(input: unknown): string | null {
  if (typeof input !== "string" || input.length === 0 || input.length > 2000) return null;
  try {
    const u = new URL(input);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.toString();
  } catch {
    return null;
  }
}

const MAX_PRICE_CENTS = 1_000_000; // $10,000 — anything above is almost certainly a unit error.
const MIN_PRICE_CENTS_PAID = 99;   // Most upstream platforms reject sub-$1 paid products.
const SUPPORTED_CURRENCIES = new Set(["usd", "eur", "gbp", "cad", "aud", "jpy", "nzd", "chf", "sek", "dkk", "nok"]);

export interface NormaliseOptions {
  /** When true, allow $0 (free) listings. Most direct-publish flows want false. */
  allowFree?: boolean;
  /** Soft cap on tags forwarded upstream. Defaults to 10. */
  maxTags?: number;
  /** Max title length (platform-specific). Gumroad ~200, Shopify ~250. */
  maxTitle?: number;
  /** Max description length (platform-specific). */
  maxDescription?: number;
}

export function normaliseListing(
  listing: {
    price_cents?: number | null;
    currency?: string | null;
    amazon_description?: string | null;
    blurb?: string | null;
    seo_keywords?: unknown;
  } | null,
  book: { title?: string | null; cover_image_url?: string | null; category?: string | null } | null,
  opts: NormaliseOptions = {},
): ValidationResult {
  if (!listing || !book) {
    return { ok: false, code: "missing_input", message: "Listing or book not loaded" };
  }
  const allowFree = !!opts.allowFree;
  const maxTags = opts.maxTags ?? 10;
  const maxTitle = opts.maxTitle ?? 200;
  const maxDescription = opts.maxDescription ?? 5000;

  const title = sanitiseText(book.title ?? "Untitled", maxTitle);
  if (!title) {
    return { ok: false, code: "invalid_title", message: "Book title is required" };
  }

  const priceCentsRaw = Number(listing.price_cents ?? 0);
  if (!Number.isFinite(priceCentsRaw) || !Number.isInteger(priceCentsRaw)) {
    return { ok: false, code: "invalid_price", message: "Price must be an integer number of cents" };
  }
  const priceCents = Math.max(0, priceCentsRaw);
  if (priceCents > MAX_PRICE_CENTS) {
    return { ok: false, code: "price_too_high", message: "Price exceeds the $10,000 sanity limit" };
  }
  if (!allowFree && priceCents > 0 && priceCents < MIN_PRICE_CENTS_PAID) {
    return { ok: false, code: "price_too_low", message: "Paid listings must be at least $0.99" };
  }

  const currency = (listing.currency ?? "usd").toLowerCase().trim();
  if (!SUPPORTED_CURRENCIES.has(currency)) {
    return { ok: false, code: "unsupported_currency", message: `Currency ${currency} is not supported` };
  }

  const description = sanitiseText(
    listing.amazon_description || listing.blurb || `${title} — published via ScrollLibrary.`,
    maxDescription,
  );

  let tags: string[] = [];
  if (Array.isArray(listing.seo_keywords)) {
    tags = (listing.seo_keywords as unknown[])
      .map((t) => sanitiseText(t, 60))
      .filter((t) => t.length > 0)
      .slice(0, maxTags);
  }
  if (book.category) {
    const cat = sanitiseText(book.category, 60);
    if (cat && !tags.includes(cat)) tags.push(cat);
  }

  return {
    ok: true,
    value: {
      title,
      description,
      priceCents,
      currency,
      tags,
      coverImageUrl: sanitiseHttpUrl(book.cover_image_url),
    },
  };
}

/** Mask anything that looks like a long opaque token in error strings. */
export function sanitiseError(e: unknown, max = 400): string {
  const msg = String((e as Error)?.message ?? e ?? "unknown");
  return msg.replace(/[A-Za-z0-9_-]{30,}/g, "[redacted]").slice(0, max);
}
