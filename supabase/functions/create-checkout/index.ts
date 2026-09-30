import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { ensureBillingCustomer } from "../_shared/billing-customer.ts";
import { externalPaymentWritesEnabled, publisherSubscriptionsEnabled } from "../_shared/ga-release-flags.ts";
import {
  billingDomainForProduct,
  billingDomainForTier,
  clientPriceMatchesTier,
  isBillableTier,
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
    if (!isBillableTier(tier)) {
      return new Response(JSON.stringify({ error: "Invalid subscription tier" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    const catalogue = resolveStripeCatalogue();
    const billingDomain = billingDomainForTier(tier);
    if (billingDomain === "publisher" && !publisherSubscriptionsEnabled()) {
      return new Response(JSON.stringify({
        error: "Publisher subscriptions are not available in the current GA scope.",
        code: "publisher_subscriptions_disabled",
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
        status: 503,
      });
    }
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

    // Never create a second live subscription in the same authority domain.
    // Users with an existing generation plan or publisher add-on must manage
    // that subscription rather than stacking another recurring charge.
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 100,
    });
    const existing = subscriptions.data.find((subscription) => {
      const productId = String(subscription.items.data[0]?.price?.product ?? "");
      return billingDomainForProduct(catalogue, productId) === billingDomain
        && subscriptionStatusBlocksNewCheckout(subscription.status);
    });
    if (existing) {
      logStep("Blocked duplicate subscription checkout", {
        userId: user.id,
        billingDomain,
        existingStatus: existing.status,
      });
      return new Response(JSON.stringify({
        error: "A subscription in this billing category already exists. Manage the existing subscription before starting another.",
        code: "subscription_already_exists",
        billing_domain: billingDomain,
        subscription_status: existing.status,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
        status: 409,
      });
    }

    // Serialize unfinished hosted Checkout sessions. Two tabs must not be able
    // to create two payable subscriptions before either one has produced a
    // Stripe Subscription object.
    const openSessions = await stripe.checkout.sessions.list({
      customer: customerId,
      status: "open",
      limit: 100,
    });
    const sameDomainSessions = openSessions.data.filter((candidate) => {
      if (candidate.mode !== "subscription" || candidate.metadata?.userId !== user.id) return false;
      const candidateTier = candidate.metadata?.tier;
      return isBillableTier(candidateTier) && billingDomainForTier(candidateTier) === billingDomain;
    });
    const exactSession = sameDomainSessions.find((candidate) => candidate.metadata?.tier === tier && candidate.url);
    if (exactSession?.url) {
      logStep("Reusing open Checkout session", { sessionId: exactSession.id, tier, billingDomain });
      return new Response(JSON.stringify({ url: exactSession.url, reused: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
        status: 200,
      });
    }
    if (sameDomainSessions.length > 0) {
      return new Response(JSON.stringify({
        error: "Another subscription checkout is already in progress in this billing category.",
        code: "checkout_in_progress",
        billing_domain: billingDomain,
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
      success_url: `${origin}/pricing?success=true`,
      cancel_url: `${origin}/pricing?canceled=true`,
      metadata: {
        userId: user.id,
        tier,
        billingDomain,
      },
      subscription_data: {
        metadata: {
          userId: user.id,
          tier,
          billingDomain,
        },
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
