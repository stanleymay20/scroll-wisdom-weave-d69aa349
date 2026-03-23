import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CHECK-SUBSCRIPTION] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    logStep("Function started");

    // Validate JWT manually since verify_jwt=false
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      logStep("No valid authorization header");
      return new Response(JSON.stringify({ subscribed: false, tier: 'free' }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseClient.auth.getClaims(token);
    
    if (claimsError || !claimsData?.claims) {
      logStep("Invalid JWT, returning free tier", { error: claimsError?.message });
      return new Response(JSON.stringify({ subscribed: false, tier: 'free' }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const userId = claimsData.claims.sub;
    const userEmail = claimsData.claims.email as string;
    logStep("User authenticated via claims", { userId, email: userEmail });

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      logStep("No Stripe key, returning free tier");
      return new Response(JSON.stringify({ subscribed: false, tier: 'free' }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }
    logStep("Stripe key verified");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const customers = await stripe.customers.list({ email: userEmail, limit: 1 });
    
    if (customers.data.length === 0) {
      logStep("No customer found, returning free tier");
      return new Response(JSON.stringify({ subscribed: false, tier: 'free' }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const customerId = customers.data[0].id;
    logStep("Found Stripe customer", { customerId });

    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: "active",
      limit: 1,
    });
    const hasActiveSub = subscriptions.data.length > 0;
    let productId = null;
    let subscriptionEnd = null;

    if (hasActiveSub) {
      const subscription = subscriptions.data[0];
      subscriptionEnd = new Date(subscription.current_period_end * 1000).toISOString();
      logStep("Active subscription found", { subscriptionId: subscription.id, endDate: subscriptionEnd });
      productId = subscription.items.data[0].price.product;
      logStep("Determined subscription tier", { productId });

      // Sync plan to profile (fire-and-forget)
      const tier = productId === 'prod_TaQU3ILEUpbXOT' ? 'premium'
        : productId === 'prod_U0fmlf14TPlMKj' ? 'prophet_tier'
        : productId === 'prod_TaQWA7MSUntiMy' ? 'prophet_tier' // legacy prophet product
        : productId === 'prod_TaQSrotoUkTuPC' ? 'student'
        : 'free';
      supabaseClient.from("profiles").update({ plan: tier }).eq("user_id", userId).then(() => {});
    } else {
      logStep("No active Stripe subscription, checking local subscriptions table");
      
      // Fall back to subscriptions table (supports manual/admin grants)
      const { data: localSub } = await supabaseClient
        .from('subscriptions')
        .select('tier, status, current_period_end')
        .eq('user_id', userId)
        .eq('status', 'active')
        .maybeSingle();

      if (localSub && localSub.tier && localSub.tier !== 'free') {
        const endDate = localSub.current_period_end;
        const isValid = !endDate || new Date(endDate) > new Date();
        
        if (isValid) {
          logStep("Found active local subscription", { tier: localSub.tier });
          // Sync to profile
          supabaseClient.from("profiles").update({ plan: localSub.tier }).eq("user_id", userId).then(() => {});
          
          return new Response(JSON.stringify({
            subscribed: true,
            product_id: null,
            subscription_end: endDate,
            tier: localSub.tier,
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            status: 200,
          });
        }
      }

      logStep("No active subscription found anywhere");
      // CRITICAL: Sync downgrade to profile so edge functions see correct plan
      supabaseClient.from("profiles").update({ plan: 'free' }).eq("user_id", userId).then(() => {
        logStep("Profile synced to free tier");
      });
    }

    return new Response(JSON.stringify({
      subscribed: hasActiveSub,
      product_id: productId,
      subscription_end: subscriptionEnd
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR in check-subscription", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage, subscribed: false }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200, // Return 200 with subscribed: false to avoid breaking the frontend
    });
  }
});
