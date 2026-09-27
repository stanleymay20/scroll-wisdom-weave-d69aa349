import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { ensureBillingCustomer } from "../_shared/billing-customer.ts";
import {
  clientPriceMatchesTier,
  isBillableTier,
  resolveStripeCatalogue,
} from "../_shared/stripe-catalogue.ts";

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
