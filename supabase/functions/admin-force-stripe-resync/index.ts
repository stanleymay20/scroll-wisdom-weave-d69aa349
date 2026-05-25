// Admin-only: force a Stripe -> creator_entitlements resync for one creator.
// This closes the ops loop for cases where a creator paid but the entitlement
// gate still appears locked due to delayed/missed webhook processing.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";

import {
  preflight,
  json,
  badRequest,
  forbidden,
  serverError,
  requireUser,
  validateBody,
  z,
  serviceClient,
} from "../_shared/http.ts";
import { correlationId } from "../_shared/observability.ts";

const Body = z.object({
  user_id: z.string().uuid(),
});

type CreatorTier = "free" | "creator" | "creator_pro";

const CREATOR_PRODUCTS: Record<string, CreatorTier> = {
  prod_UZv8Eine5sKy0j: "creator",
  prod_UZv8yPrOGDBuWE: "creator_pro",
};

function creatorTierFromSubscription(subscription: Stripe.Subscription | null): CreatorTier {
  if (!subscription) return "free";
  const productId = subscription.items.data[0]?.price?.product as string | undefined;
  return (productId && CREATOR_PRODUCTS[productId]) || "free";
}

function periodEndIso(subscription: Stripe.Subscription | null): string | null {
  if (!subscription?.current_period_end) return null;
  return new Date(subscription.current_period_end * 1000).toISOString();
}

function pickBestSubscription(subscriptions: Stripe.Subscription[]): Stripe.Subscription | null {
  if (!subscriptions.length) return null;

  const priority = ["active", "trialing", "past_due", "unpaid", "incomplete", "canceled"];
  return subscriptions.sort((a, b) => {
    const pa = priority.indexOf(a.status);
    const pb = priority.indexOf(b.status);
    const ra = pa === -1 ? 99 : pa;
    const rb = pb === -1 ? 99 : pb;
    if (ra !== rb) return ra - rb;
    return (b.created ?? 0) - (a.created ?? 0);
  })[0] ?? null;
}

serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "POST") return badRequest("POST only");

  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;

  const sc = serviceClient();
  const corr = correlationId(req);

  try {
    const { data: roleData } = await sc
      .from("user_roles")
      .select("role")
      .eq("user_id", auth.userId)
      .maybeSingle();

    if (!roleData || roleData.role !== "admin") return forbidden("Admin required");

    const parsed = await validateBody(req, Body);
    if (parsed instanceof Response) return parsed;

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    const { data: entitlement } = await sc
      .from("creator_entitlements")
      .select("user_id, stripe_customer_id, stripe_subscription_id, stripe_price_id, tier, payment_status")
      .eq("user_id", parsed.user_id)
      .maybeSingle();

    let stripeCustomerId = entitlement?.stripe_customer_id as string | null | undefined;
    let subscription: Stripe.Subscription | null = null;

    if (entitlement?.stripe_subscription_id) {
      try {
        subscription = await stripe.subscriptions.retrieve(entitlement.stripe_subscription_id as string);
        stripeCustomerId = subscription.customer as string;
      } catch (_e) {
        // Fall through to customer lookup below. Subscription may have been deleted.
      }
    }

    if (!subscription && stripeCustomerId) {
      const subs = await stripe.subscriptions.list({
        customer: stripeCustomerId,
        status: "all",
        limit: 20,
      });
      subscription = pickBestSubscription(subs.data);
    }

    // If the DB has no Stripe customer yet, try to resolve by Supabase auth email.
    if (!subscription && !stripeCustomerId) {
      const { data: userData } = await sc.auth.admin.getUserById(parsed.user_id);
      const email = userData?.user?.email;
      if (email) {
        const customers = await stripe.customers.list({ email, limit: 5 });
        const customer = customers.data[0];
        if (customer) {
          stripeCustomerId = customer.id;
          const subs = await stripe.subscriptions.list({ customer: customer.id, status: "all", limit: 20 });
          subscription = pickBestSubscription(subs.data);
        }
      }
    }

    const tier = creatorTierFromSubscription(subscription);
    const priceId = subscription?.items.data[0]?.price?.id ?? null;
    const status = subscription?.status ?? "canceled";
    const subscriptionId = subscription?.id ?? null;
    const currentPeriodEnd = periodEndIso(subscription);
    const customerId = (subscription?.customer as string | undefined) ?? stripeCustomerId ?? null;

    const { data: syncResult, error: syncError } = await sc.rpc("sync_creator_entitlement_from_stripe", {
      _user_id: parsed.user_id,
      _tier: tier,
      _stripe_subscription_id: subscriptionId,
      _stripe_customer_id: customerId,
      _stripe_price_id: priceId,
      _stripe_status: status,
      _current_period_end: currentPeriodEnd,
    });

    if (syncError) throw new Error(syncError.message);

    let snapshotId: string | null = null;
    const { data: snapshotData } = await sc.rpc("snapshot_creator_entitlement", {
      _user_id: parsed.user_id,
      _context_type: "stripe_resync",
      _context_id: subscriptionId ?? customerId ?? parsed.user_id,
      _metadata: {
        admin_user_id: auth.userId,
        stripe_subscription_id: subscriptionId,
        stripe_customer_id: customerId,
        stripe_price_id: priceId,
        stripe_status: status,
        correlation_id: corr,
      },
    });
    snapshotId = (snapshotData as string | null) ?? null;

    await sc.from("publishing_audit_log").insert({
      user_id: parsed.user_id,
      platform: "stripe",
      event_type: "entitlement_resynced",
      severity: "info",
      message: "Admin forced Stripe entitlement resync",
      metadata: {
        admin_user_id: auth.userId,
        tier,
        stripe_status: status,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
        stripe_price_id: priceId,
        snapshot_id: snapshotId,
        correlation_id: corr,
      },
    });

    return json({
      ok: true,
      user_id: parsed.user_id,
      tier,
      stripe_status: status,
      stripe_customer_id: customerId,
      stripe_subscription_id: subscriptionId,
      stripe_price_id: priceId,
      current_period_end: currentPeriodEnd,
      snapshot_id: snapshotId,
      sync_result: syncResult,
      correlation_id: corr,
    });
  } catch (e) {
    return serverError(e);
  }
});
