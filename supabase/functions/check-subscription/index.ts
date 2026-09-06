import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

type PlanTier = "free" | "student" | "premium" | "prophet_tier";

const PRODUCT_TO_TIER: Record<string, PlanTier> = {
  prod_TaQU3ILEUpbXOT: "premium",
  prod_U0fmlf14TPlMKj: "prophet_tier",
  prod_TaQWA7MSUntiMy: "prophet_tier", // legacy institutional product
  prod_TaQSrotoUkTuPC: "student",
};

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
    const userEmail = typeof claims?.email === "string" ? claims.email : null;

    if (claimsError || !userId || !userEmail) {
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
      const customers = await stripe.customers.list({ email: userEmail, limit: 1 });
      const customerId = customers.data[0]?.id ?? null;

      if (customerId) {
        const subscriptions = await stripe.subscriptions.list({
          customer: customerId,
          status: "active",
          limit: 1,
        });

        const subscription = subscriptions.data[0];
        if (subscription) {
          const productId = String(subscription.items.data[0]?.price?.product ?? "");
          const tier = PRODUCT_TO_TIER[productId] ?? "free";
          const subscriptionEnd = new Date(subscription.current_period_end * 1000).toISOString();
          await syncProfilePlan(tier);
          return response({
            subscribed: true,
            product_id: productId || null,
            subscription_end: subscriptionEnd,
            tier,
          });
        }
      }
    } else {
      logStep("Stripe unavailable; checking server-owned local state");
    }

    // Manual/admin grants are a deliberate fallback. A missing or broken local
    // row must never grant entitlement and must never leak a database error.
    const { data: localSub, error: localError } = await supabaseClient
      .from("subscriptions")
      .select("tier,status,current_period_end")
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle();

    if (localError) {
      logStep("Local subscription lookup failed", { userId });
      await syncProfilePlan("free");
      return response({ subscribed: false, tier: "free" });
    }

    if (localSub?.tier && localSub.tier !== "free") {
      const endDate = localSub.current_period_end;
      const isValid = !endDate || new Date(endDate).getTime() > Date.now();
      if (isValid) {
        const tier = (localSub.tier in { student: true, premium: true, prophet_tier: true }
          ? localSub.tier
          : "free") as PlanTier;
        if (tier !== "free") {
          await syncProfilePlan(tier);
          return response({
            subscribed: true,
            product_id: null,
            subscription_end: endDate,
            tier,
          });
        }
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
