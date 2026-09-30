import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { ensureBillingCustomer } from "../_shared/billing-customer.ts";
import { externalPaymentWritesEnabled } from "../_shared/ga-release-flags.ts";
import {
  expectedPublicPlanAmountCents,
  isBillingInterval,
  isPublicCheckoutTier,
  planTierForProduct,
  publicCheckoutPrice,
  resolveStripeCatalogue,
} from "../_shared/stripe-catalogue.ts";
import { subscriptionStatusBlocksNewCheckout } from "../_shared/stripe-fields.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[CREATE-CHECKOUT] ${step}${detailsStr}`);
};

const getReturnOrigin = (req: Request): string => {
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
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Keep live financial writes fail-closed until the exact-head Stripe lifecycle
  // for the new catalogue passes. Defining the catalogue must not open checkout.
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
    const body = await req.json();
    const tier = body?.tier;
    const billingInterval = body?.billingInterval ?? "monthly";

    if (!isPublicCheckoutTier(tier)) {
      return new Response(JSON.stringify({
        error: "This subscription is not available for new checkout.",
        code: "tier_not_publicly_sold",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }
    if (!isBillingInterval(billingInterval)) {
      return new Response(JSON.stringify({
        error: "Invalid billing interval.",
        code: "invalid_billing_interval",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const catalogue = resolveStripeCatalogue();
    const priceId = publicCheckoutPrice(catalogue, tier, billingInterval);
    if (!priceId) {
      logStep("New catalogue not provisioned", { tier, billingInterval });
      return new Response(JSON.stringify({
        error: "This plan is not provisioned for checkout yet.",
        code: "billing_catalogue_not_provisioned",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
        status: 503,
      });
    }

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

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Configuration is not trusted merely because it looks like a price ID.
    // Resolve the object and prove product, amount, currency and interval before
    // a Checkout Session can ever be created.
    const stripePrice = await stripe.prices.retrieve(priceId);
    const priceProductId = typeof stripePrice.product === "string"
      ? stripePrice.product
      : stripePrice.product?.id ?? "";
    const expectedInterval = billingInterval === "annual" ? "year" : "month";
    const expectedAmount = expectedPublicPlanAmountCents(tier, billingInterval);
    const configuredTier = planTierForProduct(catalogue, priceProductId);

    if (!stripePrice.active
        || stripePrice.type !== "recurring"
        || stripePrice.unit_amount !== expectedAmount
        || String(stripePrice.currency).toLowerCase() !== "usd"
        || stripePrice.recurring?.interval !== expectedInterval
        || stripePrice.recurring?.interval_count !== 1
        || configuredTier !== tier) {
      logStep("Stripe catalogue verification failed", {
        tier,
        billingInterval,
        priceId,
        priceProductId,
        configuredTier,
      });
      return new Response(JSON.stringify({
        error: "Billing catalogue verification failed.",
        code: "billing_catalogue_mismatch",
      }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    }

    const customerId = await ensureBillingCustomer(
      serviceClient,
      stripe,
      { id: user.id, email: user.email },
      "subscription_checkout",
    );

    // One account may hold at most one active generation-plan subscription.
    // Historical publisher-tier subscriptions remain a separate reconciliation
    // domain and do not authorize creation of duplicate public plan charges.
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
          ? "You already have this ScrollLibrary plan. Manage the existing subscription instead."
          : "You already have a ScrollLibrary plan. Use billing management to change it.",
        code: sameTier ? "existing_plan_subscription" : "plan_change_required",
        existing_tier: existingTier,
        requested_tier: tier,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
        status: 409,
      });
    }

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
      && candidate.metadata?.billingInterval === billingInterval
      && typeof candidate.url === "string"
      && candidate.url.length > 0
    );
    if (reusableSession?.url) {
      return new Response(JSON.stringify({ url: reusableSession.url, reused: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
        status: 200,
      });
    }

    if (publicOpenSessions.length > 0) {
      const otherOpenPlan = publicOpenSessions[0];
      return new Response(JSON.stringify({
        error: "Another ScrollLibrary plan checkout is already in progress.",
        code: "checkout_in_progress",
        existing_tier: otherOpenPlan.metadata?.tier ?? null,
        requested_tier: tier,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
        status: 409,
      });
    }

    const origin = getReturnOrigin(req);
    const metadata = {
      userId: user.id,
      tier,
      billingInterval,
      catalogueVersion: "economic-v1",
    };

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "subscription",
      client_reference_id: user.id,
      subscription_data: { metadata },
      success_url: `${origin}/pricing?success=true`,
      cancel_url: `${origin}/pricing?canceled=true`,
      metadata,
    });

    if (!session.url) throw new Error("Stripe did not return a checkout URL");
    logStep("Checkout session created", { sessionId: session.id, tier, billingInterval });

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    logStep("ERROR in create-checkout", {
      message: error instanceof Error ? error.message : String(error),
    });
    return new Response(JSON.stringify({ error: "Unable to create checkout session" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
