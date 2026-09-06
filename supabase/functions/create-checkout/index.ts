import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CREATE-CHECKOUT] ${step}${detailsStr}`);
};

type BillableTier = "student" | "premium" | "prophet_tier" | "creator" | "creator_pro";

// The server, not the browser, is the authority for which Stripe price belongs
// to each entitlement tier. Keep these in sync with the Stripe catalogue.
const PRICE_BY_TIER: Record<BillableTier, string> = {
  student: "price_1SdFbTJYFIBeCvefKzHWUrcb",
  premium: "price_1SdFddJYFIBeCvefJr1ZY92E",
  prophet_tier: "price_1T2eR8JYFIBeCvefx02IXTz6",
  creator: "price_1TalITJYFIBeCvefdkr4LeL7",
  creator_pro: "price_1TalIUJYFIBeCvefHU67sm3O",
};

const isBillableTier = (value: unknown): value is BillableTier =>
  typeof value === "string" && Object.prototype.hasOwnProperty.call(PRICE_BY_TIER, value);

const getReturnOrigin = (req: Request): string => {
  const configured = (Deno.env.get("APP_URL") || "https://scrolllibrary.app").replace(/\/+$/, "");
  const requestOrigin = req.headers.get("origin")?.replace(/\/+$/, "");

  const allowed = new Set([
    configured,
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

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_ANON_KEY") ?? ""
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

    const priceId = PRICE_BY_TIER[tier];
    // Older clients still send priceId. Reject any mismatch instead of trusting it.
    if (requestedPriceId && requestedPriceId !== priceId) {
      logStep("Rejected price/tier mismatch", { tier });
      return new Response(JSON.stringify({ error: "Invalid price for subscription tier" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }
    logStep("Request validated", { tier });

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

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
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    const customerId = customers.data[0]?.id;

    const origin = getReturnOrigin(req);
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      customer_email: customerId ? undefined : user.email,
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: "subscription",
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
