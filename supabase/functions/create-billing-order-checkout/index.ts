import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { ensureBillingCustomer } from "../_shared/billing-customer.ts";
import {
  ONE_TIME_BILLING_CATALOGUE,
  isOneTimeBillingSku,
  oneTimeBillingPrice,
} from "../_shared/billing-order-catalogue.ts";
import {
  externalPaymentWritesEnabled,
  publishingServiceBillingEnabled,
} from "../_shared/ga-release-flags.ts";
import { subscriptionStatusGrantsAccess } from "../_shared/stripe-fields.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const getReturnOrigin = (req: Request): string => {
  const configured = (Deno.env.get("APP_URL") || "https://scrolllibrary.org").replace(/\/+$/, "");
  const requestOrigin = req.headers.get("origin")?.replace(/\/+$/, "");
  const allowed = new Set([
    configured,
    "https://scrolllibrary.org",
    "https://www.scrolllibrary.org",
    "https://scroll-wisdom-weave.lovable.app",
    "http://localhost:8080",
    "http://127.0.0.1:8080",
  ]);
  return requestOrigin && allowed.has(requestOrigin) ? requestOrigin : configured;
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  if (!externalPaymentWritesEnabled()) {
    return new Response(JSON.stringify({
      error: "Paid purchases are temporarily unavailable while payment validation is completing.",
      code: "ga_payments_disabled",
    }), {
      status: 503,
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const stripeKey = Deno.env.get("STRIPE_SECRET_KEY") ?? "";

  if (!supabaseUrl || !anonKey || !serviceRoleKey || !stripeKey) {
    return new Response(JSON.stringify({ error: "Billing service configuration is incomplete" }), {
      status: 503,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Authentication required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.slice("Bearer ".length).trim();
    const { data: userData, error: authError } = await userClient.auth.getUser(token);
    const user = userData.user;
    if (authError || !user?.email) {
      return new Response(JSON.stringify({ error: "Authentication required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { sku } = await req.json();
    if (!isOneTimeBillingSku(sku)) {
      return new Response(JSON.stringify({
        error: "Unknown billing item.",
        code: "invalid_billing_sku",
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const spec = ONE_TIME_BILLING_CATALOGUE[sku];

    if (spec.kind === "publishing_service" && !publishingServiceBillingEnabled()) {
      return new Response(JSON.stringify({
        error: "Publishing-service purchases are not open yet.",
        code: "publishing_service_billing_disabled",
      }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Usage packs are supplements to a paid subscription, not a way to turn the
    // Free plan into an unbounded compute plan.
    if (spec.kind === "usage_addon") {
      const { data: localSubscription, error: subscriptionError } = await admin
        .from("subscriptions")
        .select("tier,status,current_period_end")
        .eq("user_id", user.id)
        .maybeSingle();
      if (subscriptionError) throw subscriptionError;

      const active = !!localSubscription
        && subscriptionStatusGrantsAccess(localSubscription.status as Stripe.Subscription.Status)
        && (!localSubscription.current_period_end
          || new Date(localSubscription.current_period_end).getTime() > Date.now());

      if (!active || localSubscription?.tier === "free") {
        return new Response(JSON.stringify({
          error: "Usage packs require an active Creator, Pro, or Teams plan.",
          code: "paid_plan_required",
        }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const priceId = oneTimeBillingPrice(sku);
    if (!priceId) {
      return new Response(JSON.stringify({
        error: "This billing item is not provisioned for checkout yet.",
        code: "billing_catalogue_not_provisioned",
      }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    }

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const stripePrice = await stripe.prices.retrieve(priceId);
    if (!stripePrice.active
        || stripePrice.type !== "one_time"
        || stripePrice.unit_amount !== spec.amountCents
        || String(stripePrice.currency).toLowerCase() !== spec.currency) {
      return new Response(JSON.stringify({
        error: "Billing catalogue verification failed.",
        code: "billing_catalogue_mismatch",
      }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    }

    const customerId = await ensureBillingCustomer(
      admin,
      stripe,
      { id: user.id, email: user.email },
      "billing_order_checkout",
    );

    // Reuse an already-open Checkout Session for this SKU/customer.
    const openSessions = await stripe.checkout.sessions.list({
      customer: customerId,
      status: "open",
      limit: 100,
    });
    const reusable = openSessions.data.find((candidate: Stripe.Checkout.Session) =>
      candidate.mode === "payment"
      && candidate.metadata?.kind === "billing_order"
      && candidate.metadata?.userId === user.id
      && candidate.metadata?.sku === sku
      && typeof candidate.url === "string"
      && candidate.url.length > 0
    );
    if (reusable?.url) {
      return new Response(JSON.stringify({ url: reusable.url, reused: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
      });
    }

    const benefitMonth = new Date().toISOString().slice(0, 7);
    const { data: order, error: orderError } = await admin
      .from("billing_orders")
      .insert({
        user_id: user.id,
        kind: spec.kind,
        sku,
        status: "pending",
        benefit_month: benefitMonth,
        expected_amount_cents: spec.amountCents,
        currency: spec.currency,
        stripe_customer_id: customerId,
        metadata: {
          catalogue_version: "economic-v1",
          max_isbns: spec.maxIsbns ?? null,
        },
      })
      .select("id")
      .single();

    if (orderError || !order?.id) {
      throw new Error(orderError?.message || "Unable to create billing order");
    }

    const origin = getReturnOrigin(req);
    const metadata = {
      kind: "billing_order",
      orderId: order.id,
      userId: user.id,
      sku,
      orderKind: spec.kind,
      benefitMonth,
      catalogueVersion: "economic-v1",
    };

    let session: Stripe.Checkout.Session;
    try {
      session = await stripe.checkout.sessions.create({
        customer: customerId,
        line_items: [{ price: priceId, quantity: 1 }],
        mode: "payment",
        client_reference_id: user.id,
        payment_intent_data: { metadata },
        automatic_tax: { enabled: true },
        tax_id_collection: { enabled: true, required: "never" },
        billing_address_collection: "auto",
        customer_update: { address: "auto", name: "auto" },
        success_url: origin + "/pricing?order_success=true",
        cancel_url: origin + "/pricing?order_canceled=true",
        metadata,
      });
    } catch (error) {
      await admin.from("billing_orders")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", order.id);
      throw error;
    }

    if (!session.url) throw new Error("Stripe did not return a Checkout URL");

    const { error: sessionWriteError } = await admin
      .from("billing_orders")
      .update({
        stripe_session_id: session.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id);

    if (sessionWriteError) {
      throw new Error("Unable to persist Checkout session identity");
    }

    return new Response(JSON.stringify({ url: session.url, order_id: order.id }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("[CREATE-BILLING-ORDER-CHECKOUT]", error);
    return new Response(JSON.stringify({ error: "Unable to start purchase" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
