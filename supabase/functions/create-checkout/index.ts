import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { ensureBillingCustomer } from "../_shared/billing-customer.ts";
import { externalPaymentWritesEnabled } from "../_shared/ga-release-flags.ts";
import {
  clientPriceMatchesTier,
  isPublicCheckoutTier,
  planTierForProduct,
  resolveStripeCatalogue,
} from "../_shared/stripe-catalogue.ts";
import { subscriptionStatusBlocksNewCheckout } from "../_shared/stripe-fields.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CREATE-CHECKOUT] ${step}${detailsStr}`);
};

// The server, not the browser, is the authority for which Stripe price belongs
// to each entitlement tier. The catalogue lives in _shared/stripe-catalogue.ts.

const getReturnOrigin = (req: Request): string => {
  // scrolllibrary.org is the site. This used to default to, and only allow,
  // scrolllibrary.app — so unless APP_URL was set, a subscriber who paid on
  // .org was sent back to a different domain.
  const configured = (Deno.env.get("APP_URL") || "https://scrolllibrary.org").replace(/\/+$/, "");
  const requestOrigin = req.headers.get("origin")?.replace(/\/+$/, "");

  const allowed = new Set([
    configured,
    "https://scrolllibrary.org",
    "https://www.scrolllibrary.org",
    "https://scrolllibrary.app",
    "https://www.scrolllibrary.app",
    "https://scroll-wisdom-weave.lovable.app",
    "http://localhost:8080",
    "http://127.0.0.1:8080",
  ]);

  return requestOrigin && allowed.has(requestOrigin) ? requestOrigin : configured;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (!externalPaymentWritesEnabled()) {
    return new Response(JSON.stringify({
      error: "Paid upgrades are temporarily unavailable while payment validation is completing.",
      code: "ga_payments_disabled",
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
      status: 503,
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  const supabaseClient = createClient(supabaseUrl, anonKey);
  const serviceClient = createClient(
    supabaseUrl,
    serviceRoleKey,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  try {
    logStep("Function started");

    const { priceId: requestedPriceId, tier } = await req.json();
    if (!isPublicCheckoutTier(tier)) {
      return new Response(JSON.stringify({
        error: "This subscription is not available for new checkout.",
        code: "tier_not_publicly_sold",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const catalogue = resolveStripeCatalogue();
    const priceId = catalogue.prices[tier];
    // Older clients still send priceId. It is never charged; a mismatch is
    // rejected rather than trusted.
    if (!clientPriceMatchesTier(catalogue, tier, requestedPriceId)) {
      logStep("Rejected price/tier mismatch", { tier });
      return new Response(JSON.stringify({ error: "Invalid price for subscription tier" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }
    logStep("Request validated", { tier });

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey || !supabaseUrl || !anonKey || !serviceRoleKey) {
      throw new Error("Billing service configuration is incomplete");
    }

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Authentication required" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    const token = authHeader.slice("Bearer ".length).trim();
    const { data, error: authError } = await supabaseClient.auth.getUser(token);
    const user = data.user;
    if (authError || !user?.email) {
      return new Response(JSON.stringify({ error: "Authentication required" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }
    logStep("User authenticated", { userId: user.id });

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const customerId = await ensureBillingCustomer(
      serviceClient,
      stripe,
      { id: user.id, email: user.email },
      "subscription_checkout",
    );

    // One user may hold at most one live generation-plan subscription.
    // Legacy publishing subscriptions are a separate reconciliation domain and
    // do not block this check. This prevents repeat clicks or tier changes from
    // silently creating a second recurring charge.
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 100,
    });
    const existingPlanSubscription = subscriptions.data.find((subscription: Stripe.Subscription) => {
      if (!subscriptionStatusBlocksNewCheckout(subscription.status)) return false;
      const productId = String(subscription.items.data[0]?.price?.product ?? "");
      return planTierForProduct(catalogue, productId) !== null;
    });

    if (existingPlanSubscription) {
      const productId = String(existingPlanSubscription.items.data[0]?.price?.product ?? "");
      const existingTier = planTierForProduct(catalogue, productId);
      const sameTier = existingTier === tier;
      return new Response(JSON.stringify({
        error: sameTier
          ? "You already have this ScrollLibrary plan. Manage the existing subscription instead of starting another."
          : "You already have a ScrollLibrary plan. Manage or cancel it before starting a different plan.",
        code: sameTier ? "existing_plan_subscription" : "plan_change_required",
        existing_tier: existingTier,
        requested_tier: tier,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
        status: 409,
      });
    }

    // Reuse an unfinished Checkout Session for the same customer and tier.
    // This closes the double-click / retry window before a subscription exists.
    const openSessions = await stripe.checkout.sessions.list({
      customer: customerId,
      status: "open",
      limit: 100,
    });
    const publicOpenSessions = openSessions.data.filter((candidate: Stripe.Checkout.Session) =>
      candidate.mode === "subscription"
      && candidate.metadata?.userId === user.id
      && isPublicCheckoutTier(candidate.metadata?.tier)
    );
    const reusableSession = publicOpenSessions.find((candidate: Stripe.Checkout.Session) =>
      candidate.metadata?.tier === tier
      && typeof candidate.url === "string"
      && candidate.url.length > 0
    );
    if (reusableSession?.url) {
      logStep("Reusing open checkout session", { sessionId: reusableSession.id, tier });
      return new Response(JSON.stringify({ url: reusableSession.url, reused: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
        status: 200,
      });
    }

    const otherOpenPlan = publicOpenSessions[0];
    if (otherOpenPlan) {
      return new Response(JSON.stringify({
        error: "Another ScrollLibrary plan checkout is already in progress. Finish or let that checkout expire before choosing a different plan.",
        code: "checkout_in_progress",
        existing_tier: otherOpenPlan.metadata?.tier ?? null,
        requested_tier: tier,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
        status: 409,
      });
    }

    const origin = getReturnOrigin(req);
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: "subscription",
      client_reference_id: user.id,
      subscription_data: {
        metadata: {
          userId: user.id,
          tier,
        },
      },
      success_url: `${origin}/pricing?success=true`,
      cancel_url: `${origin}/pricing?canceled=true`,
      metadata: {
        userId: user.id,
        tier,
      },
    });

    if (!session.url) throw new Error("Stripe did not return a checkout URL");
    logStep("Checkout session created", { sessionId: session.id, tier });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR in create-checkout", { message: errorMessage });
    return new Response(JSON.stringify({ error: "Unable to create checkout session" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
