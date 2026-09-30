/**
 * Reading Stripe objects across the 2025-03-31.basil shape change.
 *
 * The functions pin apiVersion "2025-08-27.basil". Since basil:
 *   - Subscription has no current_period_start/end; each subscription item
 *     carries its own.
 *   - Invoice has no top-level `subscription`; it is
 *     invoice.parent.subscription_details.subscription.
 * (Both confirmed against stripe@18.5.0's own type definitions.)
 *
 * The code read the old fields, so every subscription fetched through the SDK
 * was stored with no period end — which check-subscription treats as "valid
 * indefinitely" — and invoice events rendered in the basil shape were skipped.
 *
 * Webhook payloads are rendered in the *endpoint's* API version, not the
 * SDK's, so either shape can still arrive. These read the new location first
 * and fall back to the old one.
 */

type Unix = number | null | undefined;

interface ItemLike {
  current_period_start?: Unix;
  current_period_end?: Unix;
}

export interface SubscriptionLike {
  current_period_start?: Unix;
  current_period_end?: Unix;
  items?: { data?: ItemLike[] | null } | null;
}

const toIso = (seconds: Unix): string | null =>
  typeof seconds === "number" && Number.isFinite(seconds) ? new Date(seconds * 1000).toISOString() : null;

/**
 * The subscription's billing period. With several items (not how
 * ScrollLibrary sells, but possible) the period is the span covering all of
 * them: earliest start, latest end — access lasts as long as anything is paid.
 */
export function subscriptionPeriod(subscription: SubscriptionLike | null | undefined): {
  start: string | null;
  end: string | null;
} {
  if (!subscription) return { start: null, end: null };
  const items = subscription.items?.data ?? [];
  const starts = items.map((i) => i.current_period_start).filter((v): v is number => typeof v === "number");
  const ends = items.map((i) => i.current_period_end).filter((v): v is number => typeof v === "number");
  return {
    start: toIso(starts.length ? Math.min(...starts) : subscription.current_period_start),
    end: toIso(ends.length ? Math.max(...ends) : subscription.current_period_end),
  };
}

export interface InvoiceLike {
  subscription?: string | { id: string } | null;
  parent?: {
    subscription_details?: { subscription?: string | { id: string } | null } | null;
  } | null;
}

/** The subscription an invoice bills, or null for a one-off invoice. */
export function invoiceSubscriptionId(invoice: InvoiceLike | null | undefined): string | null {
  const ref = invoice?.parent?.subscription_details?.subscription ?? invoice?.subscription ?? null;
  if (!ref) return null;
  return typeof ref === "string" ? ref : ref.id ?? null;
}


/**
 * Generation-plan access is granted only when Stripe reports a subscription
 * as active or explicitly trialing. Pending, delinquent, paused and terminal
 * states never unlock metered generation features.
 */
export function subscriptionStatusGrantsAccess(status: string | null | undefined): boolean {
  return status === "active" || status === "trialing";
}

/**
 * Only terminal subscriptions allow a replacement Checkout subscription in
 * the same billing domain. Unknown states fail closed to prevent double billing.
 */
export function subscriptionStatusBlocksNewCheckout(status: string | null | undefined): boolean {
  return status !== "canceled" && status !== "incomplete_expired";
}
