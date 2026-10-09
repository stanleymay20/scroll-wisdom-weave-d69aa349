import type { PrintBinding, PrintOrderKind } from "./print-fulfillment.ts";

export type PrintProviderKind =
  | "api_pod"
  | "regional_bulk"
  | "premium_specialty"
  | "distribution";

export type PrintProviderQualification = "qualified" | "probation" | "suspended";

export type PrintCapability =
  | "black_white"
  | "standard_color"
  | "premium_color"
  | "case_laminate"
  | "dust_jacket"
  | "foil"
  | "ribbon"
  | "printed_endpapers";

export interface PrintProviderProfile {
  id: string;
  kind: PrintProviderKind;
  qualification: PrintProviderQualification;
  enabled: boolean;
  bindings: readonly PrintBinding[];
  destinationCountries: readonly string[] | "*";
  minQuantity: number;
  maxQuantity?: number | null;
  capabilities: readonly PrintCapability[];
  liveQuote: boolean;
  blindShip: boolean;
  tracking: boolean;
  reliabilityBps: number;
  priority?: number;
}

export type PrintRouteIntent = PrintOrderKind | "bulk_order" | "distribution";

export interface PrintRouteRequest {
  intent: PrintRouteIntent;
  binding: PrintBinding;
  quantity: number;
  destinationCountry: string;
  requiredCapabilities?: readonly PrintCapability[];
  bulkThreshold?: number;
}

export interface PrintRouteCandidate {
  providerId: string;
  providerKind: PrintProviderKind;
  quoteMode: "live" | "manual";
  reliabilityBps: number;
  priority: number;
}

function normalizeCountry(value: string): string {
  const country = String(value ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(country)) throw new Error("PRINT_DESTINATION_COUNTRY_INVALID");
  return country;
}

function assertQuantity(quantity: number): void {
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 100_000) {
    throw new Error("PRINT_QUANTITY_INVALID");
  }
}

function coversCountry(profile: PrintProviderProfile, country: string): boolean {
  return profile.destinationCountries === "*" ||
    profile.destinationCountries.some((value) => String(value).trim().toUpperCase() === country);
}

function coversCapabilities(profile: PrintProviderProfile, required: readonly PrintCapability[]): boolean {
  const available = new Set(profile.capabilities);
  return required.every((capability) => available.has(capability));
}

function kindRank(profile: PrintProviderProfile, request: PrintRouteRequest): number {
  if (request.intent === "distribution") {
    return profile.kind === "distribution" ? 0 : 100;
  }

  const required = request.requiredCapabilities ?? [];
  const premiumRequested = required.some((capability) =>
    capability === "foil" || capability === "ribbon" || capability === "printed_endpapers" || capability === "dust_jacket"
  );
  if (premiumRequested) {
    if (profile.kind === "premium_specialty") return 0;
    if (profile.kind === "regional_bulk") return 1;
    if (profile.kind === "api_pod") return 2;
    return 100;
  }

  const threshold = request.bulkThreshold ?? 50;
  const isBulk = request.intent === "bulk_order" || request.quantity >= threshold;
  if (isBulk) {
    if (profile.kind === "regional_bulk") return 0;
    if (profile.kind === "api_pod") return 1;
    if (profile.kind === "premium_specialty") return 2;
    return 100;
  }

  if (profile.kind === "api_pod") return 0;
  if (profile.kind === "premium_specialty") return 1;
  if (profile.kind === "regional_bulk") return 2;
  return 100;
}

export function shortlistPrintProviders(
  profiles: readonly PrintProviderProfile[],
  request: PrintRouteRequest,
): PrintRouteCandidate[] {
  assertQuantity(request.quantity);
  const country = normalizeCountry(request.destinationCountry);
  const required = request.requiredCapabilities ?? [];

  const candidates = profiles.filter((profile) => {
    if (!profile.enabled || profile.qualification !== "qualified") return false;
    if (!profile.bindings.includes(request.binding)) return false;
    if (!coversCountry(profile, country)) return false;
    if (request.quantity < profile.minQuantity) return false;
    if (profile.maxQuantity != null && request.quantity > profile.maxQuantity) return false;
    if (!coversCapabilities(profile, required)) return false;

    if (request.intent === "distribution") return profile.kind === "distribution";
    if (profile.kind === "distribution") return false;

    // Public reader checkout must be fully automatable and observable. A manual
    // regional quote is useful for bulk author orders but cannot back a live
    // storefront promise.
    if (request.intent === "reader_purchase") {
      return profile.liveQuote && profile.blindShip && profile.tracking;
    }

    return true;
  });

  return candidates
    .map((profile) => ({
      providerId: profile.id,
      providerKind: profile.kind,
      quoteMode: profile.liveQuote ? "live" as const : "manual" as const,
      reliabilityBps: profile.reliabilityBps,
      priority: profile.priority ?? 0,
    }))
    .sort((a, b) => {
      const profileA = profiles.find((profile) => profile.id === a.providerId)!;
      const profileB = profiles.find((profile) => profile.id === b.providerId)!;
      const kindDelta = kindRank(profileA, request) - kindRank(profileB, request);
      if (kindDelta !== 0) return kindDelta;
      if (a.priority !== b.priority) return b.priority - a.priority;
      if (a.reliabilityBps !== b.reliabilityBps) return b.reliabilityBps - a.reliabilityBps;
      return a.providerId.localeCompare(b.providerId);
    });
}

export interface ComparablePrintQuote {
  providerId: string;
  quoteId: string;
  currency: string;
  landedTotalMinor: number;
  estimatedDeliveryDays: number;
  reliabilityBps: number;
  expiresAt: string | Date;
}

export interface PrintQuoteSelectionPolicy {
  minimumReliabilityBps?: number;
  maximumDeliveryDays?: number | null;
}

function quoteExpired(quote: ComparablePrintQuote, now: Date): boolean {
  const expiresAt = quote.expiresAt instanceof Date ? quote.expiresAt : new Date(quote.expiresAt);
  return !Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= now.getTime();
}

export function chooseBestPrintQuote(
  quotes: readonly ComparablePrintQuote[],
  policy: PrintQuoteSelectionPolicy = {},
  now = new Date(),
): ComparablePrintQuote | null {
  const minimumReliabilityBps = policy.minimumReliabilityBps ?? 9_500;
  const maximumDeliveryDays = policy.maximumDeliveryDays ?? null;

  const valid = quotes.filter((quote) => {
    if (!quote.providerId || !quote.quoteId) return false;
    if (!/^[A-Z]{3}$/.test(quote.currency)) return false;
    if (!Number.isSafeInteger(quote.landedTotalMinor) || quote.landedTotalMinor < 0) return false;
    if (!Number.isSafeInteger(quote.estimatedDeliveryDays) || quote.estimatedDeliveryDays < 0) return false;
    if (!Number.isInteger(quote.reliabilityBps) || quote.reliabilityBps < minimumReliabilityBps || quote.reliabilityBps > 10_000) return false;
    if (maximumDeliveryDays != null && quote.estimatedDeliveryDays > maximumDeliveryDays) return false;
    return !quoteExpired(quote, now);
  });

  if (valid.length === 0) return null;

  const currencies = new Set(valid.map((quote) => quote.currency));
  if (currencies.size !== 1) {
    throw new Error("PRINT_QUOTE_CURRENCY_MISMATCH");
  }

  return valid.slice().sort((a, b) => {
    if (a.landedTotalMinor !== b.landedTotalMinor) return a.landedTotalMinor - b.landedTotalMinor;
    if (a.estimatedDeliveryDays !== b.estimatedDeliveryDays) return a.estimatedDeliveryDays - b.estimatedDeliveryDays;
    if (a.reliabilityBps !== b.reliabilityBps) return b.reliabilityBps - a.reliabilityBps;
    return a.providerId.localeCompare(b.providerId);
  })[0];
}

export interface PrintPartnerQualificationEvidence {
  sampleApproved: boolean;
  filePreflightValidated: boolean;
  packagingApproved: boolean;
  reprintPolicyConfirmed: boolean;
  privacyTermsConfirmed: boolean;
  piiLogRedactionConfirmed: boolean;
  turnaroundSlaConfirmed: boolean;
  trackingConfirmed: boolean;
  blindShipConfirmed: boolean;
}

export function assessPrintPartnerQualification(
  evidence: PrintPartnerQualificationEvidence,
): { qualified: boolean; blockers: string[] } {
  const blockers: string[] = [];
  const checks: Array<[keyof PrintPartnerQualificationEvidence, string]> = [
    ["sampleApproved", "physical_sample_not_approved"],
    ["filePreflightValidated", "file_preflight_not_validated"],
    ["packagingApproved", "packaging_not_approved"],
    ["reprintPolicyConfirmed", "reprint_policy_not_confirmed"],
    ["privacyTermsConfirmed", "privacy_terms_not_confirmed"],
    ["piiLogRedactionConfirmed", "pii_log_redaction_not_confirmed"],
    ["turnaroundSlaConfirmed", "turnaround_sla_not_confirmed"],
    ["trackingConfirmed", "tracking_not_confirmed"],
    ["blindShipConfirmed", "blind_ship_not_confirmed"],
  ];
  for (const [field, blocker] of checks) {
    if (!evidence[field]) blockers.push(blocker);
  }
  return { qualified: blockers.length === 0, blockers };
}
