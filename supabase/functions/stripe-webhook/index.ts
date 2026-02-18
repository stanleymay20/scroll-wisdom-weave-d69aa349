import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

const maskEmail = (email: string | null): string => {
  if (!email) return "none";
  const [local, domain] = email.split("@");
  if (!local || !domain) return "invalid";
  return `${local[0]}***@${domain}`;
};

const logStep = (step: string, details?: Record<string, unknown>) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[STRIPE-WEBHOOK] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Webhook received");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");
    if (!supabaseUrl || !supabaseServiceKey) throw new Error("Supabase configuration missing");
    
    if (!webhookSecret) {
      logStep("SECURITY ERROR: STRIPE_WEBHOOK_SECRET is not configured");
      throw new Error("STRIPE_WEBHOOK_SECRET must be configured. Unsigned webhooks are not accepted.");
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    const signature = req.headers.get("stripe-signature");
    const body = await req.text();

    if (!signature) {
      logStep("SECURITY ERROR: Missing stripe-signature header");
      return new Response(JSON.stringify({ error: "Missing stripe-signature header" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
      logStep("Webhook signature verified successfully");
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      logStep("SECURITY ERROR: Webhook signature verification failed", { error: errorMessage });
      return new Response(JSON.stringify({ error: "Invalid webhook signature" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    logStep("Processing event", { type: event.type, id: event.id });

    // Map Stripe product IDs to tier names - must match src/lib/subscription.ts
    type ValidPlan = 'free' | 'premium' | 'prophet_tier' | 'student';
    const getTierFromProductId = (productId: string): ValidPlan => {
      const productMap: Record<string, ValidPlan> = {
        'prod_TaQU3ILEUpbXOT': 'premium',
        'prod_TaQWA7MSUntiMy': 'prophet_tier',
        'prod_TaQSrotoUkTuPC': 'student',
      };
      return productMap[productId] || 'free';
    };

    // ===========================================
    // FIXED: Use user_id column (not id) for profile updates
    // The profiles table has: id (auto UUID), user_id (auth.users FK)
    // We must match on user_id to update the correct row
    // ===========================================
    const updateProfilePlan = async (authUserId: string, plan: ValidPlan) => {
      const { error } = await supabase
        .from("profiles")
        .update({ 
          plan,
          updated_at: new Date().toISOString() 
        })
        .eq("user_id", authUserId);

      if (error) {
        logStep("Error updating profile plan", { error: error.message, userId: authUserId.slice(0, 8) });
      } else {
        logStep("Profile plan updated successfully", { plan, userId: authUserId.slice(0, 8) });
      }
      return error;
    };

    // Find Supabase user by email
    const findUserByEmail = async (email: string) => {
      const { data: users, error } = await supabase.auth.admin.listUsers();
      if (error || !users?.users) return null;
      return users.users.find(u => u.email === email) || null;
    };

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        logStep("Checkout session completed", { sessionId: session.id, email: maskEmail(session.customer_email) });

        if (session.mode === "subscription" && session.subscription) {
          const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
          const productId = subscription.items.data[0]?.price?.product as string;
          const tier = getTierFromProductId(productId);
          
          logStep("Subscription created", { tier, productId });

          const customerEmail = session.customer_email;
          if (customerEmail) {
            const user = await findUserByEmail(customerEmail);
            if (user) {
              await updateProfilePlan(user.id, tier);
            } else {
              logStep("No Supabase user found for email", { email: maskEmail(customerEmail) });
            }
          }
        }
        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        logStep("Invoice paid", { invoiceId: invoice.id });

        if (invoice.subscription) {
          const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string);
          const productId = subscription.items.data[0]?.price?.product as string;
          const tier = getTierFromProductId(productId);
          
          const customer = await stripe.customers.retrieve(invoice.customer as string);
          if (customer && !customer.deleted && "email" in customer && customer.email) {
            const user = await findUserByEmail(customer.email);
            if (user) {
              await updateProfilePlan(user.id, tier);
              logStep("Subscription renewed", { tier });
            }
          }
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        logStep("Subscription updated", { status: subscription.status });

        const productId = subscription.items.data[0]?.price?.product as string;
        const tier = subscription.status === "active" ? getTierFromProductId(productId) : "free";

        const customer = await stripe.customers.retrieve(subscription.customer as string);
        if (customer && !customer.deleted && "email" in customer && customer.email) {
          const user = await findUserByEmail(customer.email);
          if (user) {
            await updateProfilePlan(user.id, tier);
          }
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        logStep("Subscription deleted/cancelled");

        const customer = await stripe.customers.retrieve(subscription.customer as string);
        if (customer && !customer.deleted && "email" in customer && customer.email) {
          const user = await findUserByEmail(customer.email);
          if (user) {
            await updateProfilePlan(user.id, "free");
            logStep("User downgraded to free");
          }
        }
        break;
      }

      default:
        logStep("Unhandled event type", { type: event.type });
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
