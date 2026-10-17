export type PrintBinding = "paperback" | "hardcover";
export type PrintOrderKind = "proof" | "author_copy" | "reader_purchase";

export type PrintOrderStatus =
  | "draft"
  | "quoted"
  | "payment_pending"
  | "paid"
  | "submission_pending"
  | "submitted"
  | "accepted_by_provider"
  | "in_production"
  | "shipped"
  | "delivered"
  | "cancel_pending"
  | "cancelled"
  | "refund_pending"
  | "refunded"
  | "provider_rejected"
  | "needs_review";

const TRANSITIONS: Readonly<Record<PrintOrderStatus, readonly PrintOrderStatus[]>> = {
  draft: ["quoted", "cancelled"],
  quoted: ["payment_pending", "cancelled"],
  payment_pending: ["paid", "cancelled", "needs_review"],
  paid: ["submission_pending", "refund_pending", "needs_review"],
  submission_pending: ["submitted", "provider_rejected", "refund_pending", "needs_review"],
  submitted: ["accepted_by_provider", "provider_rejected", "cancel_pending", "needs_review"],
  accepted_by_provider: ["in_production", "cancel_pending", "needs_review"],
  in_production: ["shipped", "needs_review"],
  shipped: ["delivered", "needs_review"],
  delivered: ["needs_review"],
  cancel_pending: ["cancelled", "in_production", "needs_review"],
  cancelled: ["refund_pending", "refunded", "needs_review"],
  refund_pending: ["refunded", "needs_review"],
  refunded: ["needs_review"],
  provider_rejected: ["refund_pending", "refunded", "needs_review"],
  needs_review: [
    "payment_pending",
    "paid",
    "submission_pending",
    "submitted",
    "accepted_by_provider",
    "in_production",
    "shipped",
    "delivered",
    "cancel_pending",
    "cancelled",
    "refund_pending",
    "refunded",
    "provider_rejected",
  ],
};

export class InvalidPrintOrderTransitionError extends Error {
  readonly code = "INVALID_PRINT_ORDER_TRANSITION";
  readonly from: PrintOrderStatus;
  readonly to: PrintOrderStatus;

  constructor(from: PrintOrderStatus, to: PrintOrderStatus) {
    super(`Invalid print-order transition: ${from} -> ${to}`);
    this.name = "InvalidPrintOrderTransitionError";
    this.from = from;
    this.to = to;
  }
}

export function canTransitionPrintOrder(from: PrintOrderStatus, to: PrintOrderStatus): boolean {
  if (from === to) return true; // idempotent replay/readback
  return TRANSITIONS[from].includes(to);
}

export function assertPrintOrderTransition(from: PrintOrderStatus, to: PrintOrderStatus): void {
  if (!canTransitionPrintOrder(from, to)) {
    throw new InvalidPrintOrderTransitionError(from, to);
  }
}

export function isPrintOrderTerminal(status: PrintOrderStatus): boolean {
  return status === "delivered" || status === "refunded";
}

export interface PrintArtifactIdentity {
  publicationEditionId: string;
  interiorSha256: string;
  coverSha256: string;
}

export class StalePrintArtifactError extends Error {
  readonly code = "STALE_PRINT_ARTIFACT";

  constructor(message = "Print quote/order artifact no longer matches the publication edition") {
    super(message);
    this.name = "StalePrintArtifactError";
  }
}

function normalizeHash(value: string): string {
  return String(value ?? "").trim().toLowerCase();
}

export function assertPrintArtifactIdentity(
  quoted: PrintArtifactIdentity,
  current: PrintArtifactIdentity,
): void {
  const sameEdition = quoted.publicationEditionId === current.publicationEditionId;
  const sameInterior = normalizeHash(quoted.interiorSha256) === normalizeHash(current.interiorSha256);
  const sameCover = normalizeHash(quoted.coverSha256) === normalizeHash(current.coverSha256);

  if (!sameEdition || !sameInterior || !sameCover) {
    throw new StalePrintArtifactError();
  }
}

export interface PrintQuoteWindow {
  expiresAt: string | Date;
}

export class ExpiredPrintQuoteError extends Error {
  readonly code = "PRINT_QUOTE_EXPIRED";

  constructor() {
    super("Print quote has expired and must be refreshed before checkout");
    this.name = "ExpiredPrintQuoteError";
  }
}

export function isPrintQuoteExpired(quote: PrintQuoteWindow, now = new Date()): boolean {
  const expiresAt = quote.expiresAt instanceof Date ? quote.expiresAt : new Date(quote.expiresAt);
  if (!Number.isFinite(expiresAt.getTime())) return true; // fail closed on malformed provider timestamps
  return expiresAt.getTime() <= now.getTime();
}

export function assertPrintQuoteFresh(quote: PrintQuoteWindow, now = new Date()): void {
  if (isPrintQuoteExpired(quote, now)) throw new ExpiredPrintQuoteError();
}

export function requirePrintIdempotencyKey(value: unknown): string {
  const key = typeof value === "string" ? value.trim() : "";
  // Long enough to avoid accidental collisions, bounded to keep logs/indexes sane.
  if (key.length < 16 || key.length > 160 || !/^[A-Za-z0-9._:-]+$/.test(key)) {
    throw new Error("PRINT_IDEMPOTENCY_KEY_REQUIRED");
  }
  return key;
}
