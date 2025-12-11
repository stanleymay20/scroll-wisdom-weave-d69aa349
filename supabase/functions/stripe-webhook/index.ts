import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
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

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false },
    });

    const signature = req.headers.get("stripe-signature");
    const body = await req.text();

    let event: Stripe.Event;

    // Verify webhook signature if secret is configured
    if (webhookSecret && signature) {
      try {
        event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
        logStep("Webhook signature verified");
      } catch (err) {
        logStep("Webhook signature verification failed", { error: err instanceof Error ? err.message : "Unknown" });
        return new Response(JSON.stringify({ error: "Invalid signature" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } else {
      // Parse event without verification (for testing)
      event = JSON.parse(body);
      logStep("Webhook parsed without signature verification (testing mode)");
    }

    logStep("Processing event", { type: event.type, id: event.id });

    // Map Stripe product IDs to tier names
    const getTierFromProductId = (productId: string): string => {
      // These should match your SUBSCRIPTION_TIERS in subscription.ts
      const productMap: Record<string, string> = {
        'prod_premium_placeholder': 'premium',
        'prod_prophet_placeholder': 'prophet_tier',
        'prod_student_placeholder': 'student',
      };
      return productMap[productId] || 'free';
    };

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        logStep("Checkout session completed", { sessionId: session.id, customerEmail: session.customer_email });

        if (session.mode === "subscription" && session.subscription) {
          const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
          const productId = subscription.items.data[0]?.price?.product as string;
          const tier = getTierFromProductId(productId);
          
          logStep("Subscription created", { subscriptionId: subscription.id, productId, tier });

          // Find user by email and update their profile
          const customerEmail = session.customer_email;
          if (customerEmail) {
            const { data: users, error: userError } = await supabase.auth.admin.listUsers();
            
            if (!userError && users?.users) {
              const user = users.users.find(u => u.email === customerEmail);
              if (user) {
                const { error: updateError } = await supabase
                  .from("profiles")
                  .upsert({
                    id: user.id,
                    plan: tier as "free" | "premium" | "prophet_tier",
                    updated_at: new Date().toISOString(),
                  }, { onConflict: "id" });

                if (updateError) {
                  logStep("Error updating profile", { error: updateError.message });
                } else {
                  logStep("Profile updated successfully", { userId: user.id, tier });
                }
              }
            }
          }
        }
        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        logStep("Invoice paid", { invoiceId: invoice.id, customerId: invoice.customer });

        // Subscription renewed successfully
        if (invoice.subscription) {
          const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string);
          const productId = subscription.items.data[0]?.price?.product as string;
          const tier = getTierFromProductId(productId);
          
          const customer = await stripe.customers.retrieve(invoice.customer as string);
          if (customer && !customer.deleted && "email" in customer) {
            const customerEmail = customer.email;
            if (customerEmail) {
              const { data: users } = await supabase.auth.admin.listUsers();
              const user = users?.users?.find(u => u.email === customerEmail);
              
              if (user) {
                await supabase
                  .from("profiles")
                  .update({ 
                    plan: tier as "free" | "premium" | "prophet_tier",
                    updated_at: new Date().toISOString() 
                  })
                  .eq("id", user.id);
                
                logStep("Subscription renewed", { userId: user.id, tier });
              }
            }
          }
        }
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        logStep("Subscription updated", { subscriptionId: subscription.id, status: subscription.status });

        const productId = subscription.items.data[0]?.price?.product as string;
        const tier = subscription.status === "active" ? getTierFromProductId(productId) : "free";

        const customer = await stripe.customers.retrieve(subscription.customer as string);
        if (customer && !customer.deleted && "email" in customer) {
          const customerEmail = customer.email;
          if (customerEmail) {
            const { data: users } = await supabase.auth.admin.listUsers();
            const user = users?.users?.find(u => u.email === customerEmail);
            
            if (user) {
              await supabase
                .from("profiles")
                .update({ 
                  plan: tier as "free" | "premium" | "prophet_tier",
                  updated_at: new Date().toISOString() 
                })
                .eq("id", user.id);
              
              logStep("Profile tier updated", { userId: user.id, tier, status: subscription.status });
            }
          }
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        logStep("Subscription deleted/cancelled", { subscriptionId: subscription.id });

        // Downgrade user to free tier
        const customer = await stripe.customers.retrieve(subscription.customer as string);
        if (customer && !customer.deleted && "email" in customer) {
          const customerEmail = customer.email;
          if (customerEmail) {
            const { data: users } = await supabase.auth.admin.listUsers();
            const user = users?.users?.find(u => u.email === customerEmail);
            
            if (user) {
              await supabase
                .from("profiles")
                .update({ 
                  plan: "free" as const,
                  updated_at: new Date().toISOString() 
                })
                .eq("id", user.id);
              
              logStep("User downgraded to free", { userId: user.id });
            }
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
    logStep("ERROR in stripe-webhook", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
