import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { getBillingCustomerId } from "../_shared/billing-customer.ts";
import { planTierForProduct, resolveStripeCatalogue } from "../_shared/stripe-catalogue.ts";
import { subscriptionPeriod } from "../_shared/stripe-fields.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type PlanTier = "free" | "student" | "premium" | "prophet_tier";

const logStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[CHECK-SUBSCRIPTION] ${step}${detailsStr}`);
};

const response = (body: Record<string, unknown>) => new Response(JSON.stringify(body), {
  headers: { ...corsHeaders, "Content-Type": "application/json" },
  status: 200,
});

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return response({ subscribed: false, tier: "free" });
    }

    const token = authHeader.slice("Bearer ".length).trim();
    const { data: claimsData, error: claimsError } = await supabaseClient.auth.getClaims(token);
    const claims = claimsData?.claims;
    const userId = typeof claims?.sub === "string" ? claims.sub : null;
    if (claimsError || !userId) {
      logStep("JWT validation failed");
      return response({ subscribed: false, tier: "free" });
    }

    logStep("User authenticated", { userId });

    const syncProfilePlan = async (tier: PlanTier) => {
      const { error } = await supabaseClient
        .from("profiles")
        .update({ plan: tier, updated_at: new Date().toISOString() })
        .eq("user_id", userId);
      if (error) logStep("Profile plan sync failed", { userId });
    };

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (stripeKey) {
      const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
      const customerId = await getBillingCustomerId(supabaseClient, userId);

      if (customerId) {
        // A creator may also hold a generation-plan subscription. Never let an
        // unrelated creator product masquerade as a free generation plan merely
        // because Stripe returned it first.
        const subscriptions = await stripe.subscriptions.list({
          customer: customerId,
          status: "all",
          limit: 100,
        });

        const accessSubscriptions = subscriptions.data.filter((subscription) =>
          subscription.status === "active" || subscription.status === "trialing"
        );

        for (const subscription of accessSubscriptions) {
          const productId = String(subscription.items.data[0]?.price?.product ?? "");
          const tier = planTierForProduct(resolveStripeCatalogue(), productId);
          if (!tier) continue;

          // Under the pinned basil API the period lives on the subscription
          // item. Reading subscription.current_period_end gave undefined, and
          // new Date(NaN).toISOString() threw — so every Stripe subscriber was
          // answered "subscribed: false" and never saw "Subscription activated".
          const subscriptionEnd = subscriptionPeriod(subscription).end;
          await syncProfilePlan(tier);
          return response({
            subscribed: true,
            product_id: productId,
            subscription_end: subscriptionEnd,
            tier,
          });
        }
      }
    } else {
      logStep("Stripe unavailable; checking server-owned local state");
    }

    // Manual/admin grants and webhook-synchronized plan state are a deliberate
    // fallback. Creator entitlement rows live in their own authority domain.
    const { data: localSub, error: localError } = await supabaseClient
      .from("subscriptions")
      .select("tier,status,current_period_end")
      .eq("user_id", userId)
      .in("status", ["active", "trialing"])
      .maybeSingle();

    if (localError) {
      logStep("Local subscription lookup failed", { userId });
      await syncProfilePlan("free");
      return response({ subscribed: false, tier: "free" });
    }

    const allowedLocalTiers = new Set<PlanTier>(["student", "premium", "prophet_tier"]);
    if (typeof localSub?.tier === "string" && allowedLocalTiers.has(localSub.tier as PlanTier)) {
      const endDate = localSub.current_period_end;
      const isValid = !endDate || new Date(endDate).getTime() > Date.now();
      if (isValid) {
        const tier = localSub.tier as PlanTier;
        await syncProfilePlan(tier);
        return response({
          subscribed: true,
          product_id: null,
          subscription_end: endDate,
          tier,
        });
      }
    }

    await syncProfilePlan("free");
    return response({ subscribed: false, tier: "free" });
  } catch (error) {
    logStep("Subscription check failed", {
      kind: error instanceof Error ? error.name : "unknown",
    });
    return response({ error: "SUBSCRIPTION_CHECK_FAILED", subscribed: false, tier: "free" });
  }
});
