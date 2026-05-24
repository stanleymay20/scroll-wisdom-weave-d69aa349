import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { correlationId, logFinancialEvent, logFraudSignal, evaluateSeverity } from "../_shared/observability.ts";

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
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : "";
  console.log(`[STRIPE-WEBHOOK] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const corr = correlationId(req);

  try {
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");
    if (!supabaseUrl || !supabaseServiceKey) throw new Error("Supabase configuration missing");
    if (!webhookSecret) throw new Error("STRIPE_WEBHOOK_SECRET must be configured");

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const supabase = createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } });

    const signature = req.headers.get("stripe-signature");
    const body = await req.text();

    if (!signature) {
      logStep("SECURITY ERROR: Missing stripe-signature header");
      return new Response(JSON.stringify({ error: "Missing stripe-signature header" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      logStep("Signature verification failed", { error: errorMessage });
      await logFinancialEvent(supabase, {
        event_type: "webhook_signature_invalid", severity: "critical", actor: "webhook",
        correlation_id: corr, payload: { error: errorMessage },
      });
      return new Response(JSON.stringify({ error: "Invalid webhook signature" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    logStep("Processing event", { type: event.type, id: event.id, corr });

    // ---- Idempotency: persist webhook event as source of truth ----
    // Insert; on conflict, fetch existing and bump attempts.
    const { data: existingWebhook } = await supabase
      .from("stripe_webhook_events")
      .select("status, attempts")
      .eq("stripe_event_id", event.id)
      .maybeSingle();

    if (existingWebhook?.status === "processed" || existingWebhook?.status === "replayed") {
      logStep("Duplicate webhook ignored", { id: event.id, status: existingWebhook.status });
      await logFinancialEvent(supabase, {
        event_type: "webhook_duplicate_skipped", severity: "info", actor: "webhook",
        correlation_id: corr, stripe_event_id: event.id, payload: { type: event.type },
      });
      return new Response(JSON.stringify({ received: true, deduped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200,
      });
    }

    if (existingWebhook) {
      await supabase.from("stripe_webhook_events").update({
        status: "processing",
        attempts: (existingWebhook.attempts ?? 0) + 1,
        correlation_id: corr,
        updated_at: new Date().toISOString(),
      }).eq("stripe_event_id", event.id);
    } else {
      await supabase.from("stripe_webhook_events").insert({
        stripe_event_id: event.id,
        event_type: event.type,
        payload: event as unknown as Record<string, unknown>,
        status: "processing",
        attempts: 1,
        correlation_id: corr,
      });
    }

    await logFinancialEvent(supabase, {
      event_type: "webhook_received", severity: "info", actor: "webhook",
      correlation_id: corr, stripe_event_id: event.id, payload: { type: event.type },
    });

    // ---- Plan mapping ----
    type ValidPlan = "free" | "premium" | "prophet_tier" | "student";
    const getTierFromProductId = (productId: string): ValidPlan => {
      const productMap: Record<string, ValidPlan> = {
        prod_TaQU3ILEUpbXOT: "premium",
        prod_TaQWA7MSUntiMy: "prophet_tier",
        prod_TaQSrotoUkTuPC: "student",
      };
      return productMap[productId] || "free";
    };

    // Phase 4.1 — Creator-tier product mapping (separate from generation plans).
    type CreatorTier = "free" | "creator" | "creator_pro";
    const CREATOR_PRODUCTS: Record<string, CreatorTier> = {
      prod_UZv8Eine5sKy0j: "creator",
      prod_UZv8yPrOGDBuWE: "creator_pro",
    };
    const getCreatorTierFromProductId = (productId: string | null | undefined): CreatorTier =>
      (productId && CREATOR_PRODUCTS[productId]) || "free";

    const syncCreatorEntitlement = async (
      userId: string,
      subscription: Stripe.Subscription,
    ) => {
      const productId = subscription.items.data[0]?.price?.product as string;
      const priceId = subscription.items.data[0]?.price?.id ?? null;
      const creatorTier = getCreatorTierFromProductId(productId);
      // Only sync if this is a creator-tier product OR the subscription is canceled
      // (so we downgrade entitlements on cancel of any sub the user previously had).
      if (creatorTier === "free" && subscription.status === "active") return;
      const periodEnd = subscription.current_period_end
        ? new Date(subscription.current_period_end * 1000).toISOString()
        : null;
      const { error } = await supabase.rpc("sync_creator_entitlement_from_stripe", {
        _user_id: userId,
        _tier: creatorTier,
        _stripe_subscription_id: subscription.id,
        _stripe_customer_id: subscription.customer as string,
        _stripe_price_id: priceId,
        _stripe_status: subscription.status,
        _current_period_end: periodEnd,
      });
      if (error) {
        logStep("Creator entitlement sync failed", { error: error.message, userId });
      } else {
        logStep("Creator entitlement synced", { userId, tier: creatorTier, status: subscription.status });
      }
    };

    const updateProfilePlan = async (authUserId: string, plan: ValidPlan) => {
      const { error } = await supabase.from("profiles")
        .update({ plan, updated_at: new Date().toISOString() })
        .eq("user_id", authUserId);
      if (error) logStep("Error updating profile plan", { error: error.message });
      return error;
    };

    const findUserByEmail = async (email: string) => {
      const { data: users, error } = await supabase.auth.admin.listUsers();
      if (error || !users?.users) return null;
      return users.users.find((u) => u.email === email) || null;
    };


    let processedOk = true;
    let processError: string | null = null;

    try {
      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object as Stripe.Checkout.Session;

          if (session.mode === "payment" && session.metadata?.kind === "book_purchase") {
            const listingId = session.metadata.listing_id;
            const bookId = session.metadata.book_id;
            const metaBuyerUserId = session.metadata.buyer_user_id || null;
            const email = session.customer_details?.email ?? session.customer_email ?? null;

            let buyerUserId: string | null = metaBuyerUserId || null;
            if (!buyerUserId && email) {
              const u = await findUserByEmail(email);
              buyerUserId = u?.id ?? null;
            }

            const { data: existing } = await supabase.from("book_purchases")
              .select("id, status").eq("stripe_session_id", session.id).maybeSingle();

            if (existing && (existing.status === "paid" || existing.status === "refunded")) {
              logStep("Purchase replay ignored", { sessionId: session.id });
              break;
            }

            const updatePayload = {
              status: "paid" as const,
              buyer_user_id: buyerUserId,
              buyer_email: email,
              stripe_payment_intent: session.payment_intent as string | null,
              amount_cents: session.amount_total ?? 0,
              currency: (session.currency ?? "usd").toLowerCase(),
              purchased_at: new Date().toISOString(),
              correlation_id: corr,
            };

            let purchaseId: string | null = existing?.id ?? null;
            if (existing) {
              await supabase.from("book_purchases").update(updatePayload).eq("id", existing.id);
            } else {
              const { data: upserted } = await supabase.from("book_purchases").upsert({
                ...updatePayload, listing_id: listingId, book_id: bookId, stripe_session_id: session.id,
              }, { onConflict: "stripe_session_id" }).select("id").maybeSingle();
              purchaseId = upserted?.id ?? null;
            }

            if (purchaseId) {
              const { error: ledgerErr } = await supabase.rpc("record_purchase_ledger", { _purchase_id: purchaseId });
              if (ledgerErr) {
                await logFinancialEvent(supabase, {
                  event_type: "ledger_write_failed", severity: "error", actor: "webhook",
                  correlation_id: corr, stripe_event_id: event.id, purchase_id: purchaseId,
                  payload: { error: ledgerErr.message },
                });
              } else {
                await logFinancialEvent(supabase, {
                  event_type: "ledger_written", severity: "info", actor: "webhook",
                  correlation_id: corr, stripe_event_id: event.id, purchase_id: purchaseId,
                  user_id: buyerUserId, payload: { source: "checkout_completed", amount_cents: updatePayload.amount_cents },
                });
              }
            }

            await supabase.from("storefront_events").insert([
              { listing_id: listingId, event_type: "checkout_completed", user_id: buyerUserId,
                session_id: session.metadata?.attribution_session_id || null,
                metadata: { session_id: session.id, source: "webhook", correlation_id: corr } },
              { listing_id: listingId, event_type: "full_book_unlocked", user_id: buyerUserId,
                session_id: session.metadata?.attribution_session_id || null,
                metadata: { session_id: session.id, source: "webhook", correlation_id: corr } },
            ]);

            // Phase 2.1d.1 — stitch attribution_sessions → purchase
            const attrSessionId = session.metadata?.attribution_session_id;
            if (attrSessionId && purchaseId) {
              const { error: attrErr } = await supabase.from("attribution_sessions")
                .update({
                  converted_purchase_id: purchaseId,
                  converted_at: new Date().toISOString(),
                  user_id: buyerUserId ?? undefined,
                  last_seen_at: new Date().toISOString(),
                })
                .eq("session_id", attrSessionId)
                .is("converted_purchase_id", null); // never overwrite a prior conversion
              if (attrErr) {
                await logFinancialEvent(supabase, {
                  event_type: "attribution_stitch_failed", severity: "warn", actor: "webhook",
                  correlation_id: corr, stripe_event_id: event.id, purchase_id: purchaseId,
                  payload: { session_id: attrSessionId, error: attrErr.message },
                });
              }
            }

            await logFinancialEvent(supabase, {
              event_type: "checkout_completed", severity: "info", actor: "webhook",
              correlation_id: corr, stripe_event_id: event.id, purchase_id: purchaseId,
              user_id: buyerUserId, payload: { session_id: session.id, book_id: bookId, amount_cents: updatePayload.amount_cents, attribution_source: session.metadata?.attribution_source || null },
            });
            break;
          }

          if (session.mode === "subscription" && session.subscription) {
            const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
            const productId = subscription.items.data[0]?.price?.product as string;
            const tier = getTierFromProductId(productId);
            const customerEmail = session.customer_email;
            if (customerEmail) {
              const user = await findUserByEmail(customerEmail);
              if (user) {
                await updateProfilePlan(user.id, tier);
                await syncCreatorEntitlement(user.id, subscription);
                await logFinancialEvent(supabase, {
                  event_type: "subscription_started", severity: "info", actor: "webhook",
                  correlation_id: corr, stripe_event_id: event.id, user_id: user.id, payload: { tier, product_id: productId },
                });
              }
            }
          }
          break;
        }


        case "checkout.session.expired":
        case "checkout.session.async_payment_failed": {
          const session = event.data.object as Stripe.Checkout.Session;
          if (session.metadata?.kind === "book_purchase") {
            await supabase.from("book_purchases")
              .update({ status: "failed" }).eq("stripe_session_id", session.id);
            await supabase.from("storefront_events").insert({
              listing_id: session.metadata.listing_id, event_type: "checkout_failed",
              metadata: { session_id: session.id, reason: event.type, correlation_id: corr },
            });
            await logFinancialEvent(supabase, {
              event_type: "checkout_failed", severity: "warn", actor: "webhook",
              correlation_id: corr, stripe_event_id: event.id,
              payload: { session_id: session.id, reason: event.type },
            });
          }
          break;
        }

        case "charge.refunded": {
          const charge = event.data.object as Stripe.Charge;
          if (charge.payment_intent) {
            const { data: refunded } = await supabase.from("book_purchases")
              .update({ status: "refunded" })
              .eq("stripe_payment_intent", charge.payment_intent as string)
              .select("id, buyer_user_id, amount_cents");
            for (const p of refunded ?? []) {
              const { error: ledgerErr } = await supabase.rpc("record_purchase_ledger", { _purchase_id: p.id });
              if (ledgerErr) {
                await logFinancialEvent(supabase, {
                  event_type: "ledger_write_failed", severity: "error", actor: "webhook",
                  correlation_id: corr, stripe_event_id: event.id, purchase_id: p.id, payload: { error: ledgerErr.message, kind: "refund" },
                });
              } else {
                await logFinancialEvent(supabase, {
                  event_type: "refund_issued", severity: "warn", actor: "webhook",
                  correlation_id: corr, stripe_event_id: event.id, purchase_id: p.id, user_id: p.buyer_user_id,
                  payload: { amount_cents: p.amount_cents },
                });
              }
            }
          }
          break;
        }

        case "charge.dispute.created":
        case "charge.dispute.updated":
        case "charge.dispute.closed": {
          const dispute = event.data.object as Stripe.Dispute;
          const pi = dispute.payment_intent as string | null;
          let purchaseId: string | null = null;
          let buyerUserId: string | null = null;
          if (pi) {
            const { data: pur } = await supabase.from("book_purchases")
              .select("id, buyer_user_id, buyer_email").eq("stripe_payment_intent", pi).maybeSingle();
            purchaseId = pur?.id ?? null;
            buyerUserId = pur?.buyer_user_id ?? null;
          }

          const evidenceDue = dispute.evidence_details?.due_by ? new Date(dispute.evidence_details.due_by * 1000).toISOString() : null;

          await supabase.from("chargebacks").upsert({
            stripe_dispute_id: dispute.id,
            purchase_id: purchaseId,
            amount_cents: dispute.amount ?? 0,
            currency: (dispute.currency ?? "usd").toLowerCase(),
            reason: dispute.reason ?? null,
            status: dispute.status ?? "needs_response",
            evidence_due_by: evidenceDue,
            correlation_id: corr,
            metadata: { event_type: event.type },
            updated_at: new Date().toISOString(),
          }, { onConflict: "stripe_dispute_id" });

          // Immediate fraud signal — chargeback data is too valuable to defer
          if (buyerUserId) {
            await logFraudSignal(supabase, {
              subject_type: "user", subject_value: buyerUserId,
              signal_type: "chargeback_received", score: 50,
              correlation_id: corr,
              metadata: { dispute_id: dispute.id, reason: dispute.reason, amount_cents: dispute.amount, purchase_id: purchaseId },
            });
          }

          await logFinancialEvent(supabase, {
            event_type: "chargeback_received", severity: "critical", actor: "webhook",
            correlation_id: corr, stripe_event_id: event.id, purchase_id: purchaseId, user_id: buyerUserId,
            payload: { dispute_id: dispute.id, reason: dispute.reason, amount_cents: dispute.amount, status: dispute.status },
          });

          // Phase 2.1c.2 — immediately re-score the buyer's risk tier.
          if (buyerUserId) {
            try {
              await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/evaluate-user-risk`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
                },
                body: JSON.stringify({ user_id: buyerUserId, source: "chargeback" }),
              });
            } catch (_) { /* best-effort */ }
          }
          break;
        }

        case "invoice.paid": {
          const invoice = event.data.object as Stripe.Invoice;
          if (invoice.subscription) {
            const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string);
            const productId = subscription.items.data[0]?.price?.product as string;
            const tier = getTierFromProductId(productId);
            const customer = await stripe.customers.retrieve(invoice.customer as string);
            if (customer && !customer.deleted && "email" in customer && customer.email) {
              const user = await findUserByEmail(customer.email);
              if (user) {
                await updateProfilePlan(user.id, tier);
                await syncCreatorEntitlement(user.id, subscription);
              }
            }
          }
          break;
        }

        case "customer.subscription.updated": {
          const subscription = event.data.object as Stripe.Subscription;
          const productId = subscription.items.data[0]?.price?.product as string;
          const tier = subscription.status === "active" ? getTierFromProductId(productId) : "free";
          const customer = await stripe.customers.retrieve(subscription.customer as string);
          if (customer && !customer.deleted && "email" in customer && customer.email) {
            const user = await findUserByEmail(customer.email);
            if (user) {
              await updateProfilePlan(user.id, tier);
              await syncCreatorEntitlement(user.id, subscription);
            }
          }
          break;
        }

        case "customer.subscription.deleted": {
          const subscription = event.data.object as Stripe.Subscription;
          const customer = await stripe.customers.retrieve(subscription.customer as string);
          if (customer && !customer.deleted && "email" in customer && customer.email) {
            const user = await findUserByEmail(customer.email);
            if (user) {
              await updateProfilePlan(user.id, "free");
              // Force-revoke creator entitlement (sub object reflects canceled status)
              await syncCreatorEntitlement(user.id, { ...subscription, status: "canceled" } as Stripe.Subscription);
            }
          }
          break;
        }


        case "invoice.payment_failed": {
          const invoice = event.data.object as Stripe.Invoice;
          let userId: string | null = null;
          let email: string | null = null;
          try {
            const customer = await stripe.customers.retrieve(invoice.customer as string);
            if (customer && !customer.deleted && "email" in customer && customer.email) {
              email = customer.email;
              const user = await findUserByEmail(customer.email);
              userId = user?.id ?? null;
            }
          } catch (_) { /* best-effort */ }

          // Phase 4.1 — move creator entitlement into 7-day grace period on payment failure.
          if (userId && invoice.subscription) {
            try {
              const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string);
              await syncCreatorEntitlement(userId, subscription);
            } catch (e) {
              logStep("Grace period sync failed", { error: e instanceof Error ? e.message : String(e) });
            }
          }


          // Phase 2.1d.1 — threshold-driven severity for subscription failure spikes
          const sinceIso = new Date(Date.now() - 5 * 60_000).toISOString();
          const { count: recentCount } = await supabase
            .from("financial_events")
            .select("id", { count: "exact", head: true })
            .eq("event_type", "subscription_payment_failed")
            .gte("created_at", sinceIso);
          const failuresInWindow = (recentCount ?? 0) + 1; // include current
          const severity = await evaluateSeverity(
            supabase,
            "subscription.payment_failed_count_5m",
            failuresInWindow,
          );

          await logFinancialEvent(supabase, {
            event_type: "subscription_payment_failed", severity, actor: "webhook",
            correlation_id: corr, stripe_event_id: event.id, user_id: userId,
            payload: {
              invoice_id: invoice.id,
              subscription: invoice.subscription,
              attempt_count: invoice.attempt_count,
              amount_due: invoice.amount_due,
              currency: invoice.currency,
              email_mask: maskEmail(email),
              next_attempt: invoice.next_payment_attempt,
              failures_in_window_5m: failuresInWindow,
              threshold_key: "subscription.payment_failed_count_5m",
            },
          });
          break;
        }

        default:
          logStep("Unhandled event type", { type: event.type });
      }
    } catch (innerErr) {
      processedOk = false;
      processError = innerErr instanceof Error ? innerErr.message : String(innerErr);
      logStep("Inner processing error", { error: processError });
    }

    // Finalize webhook event record. Terminal failures after >=3 attempts
    // are dead-lettered for the reliability dashboard's DLQ view.
    const isFatal = !processedOk;
    const attemptsAfter = (existingWebhook?.attempts ?? 0) + 1;
    const deadLetter = isFatal && attemptsAfter >= 3;
    await supabase.from("stripe_webhook_events").update({
      status: deadLetter ? "dead_lettered" : (processedOk ? "processed" : "failed"),
      last_error: processError,
      processed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...(deadLetter ? { dead_letter_reason: processError ?? "max_attempts_exceeded", dead_lettered_at: new Date().toISOString() } : {}),
    }).eq("stripe_event_id", event.id);

    if (!processedOk) {
      await logFinancialEvent(supabase, {
        event_type: "webhook_processing_failed", severity: "critical", actor: "webhook",
        correlation_id: corr, stripe_event_id: event.id,
        payload: { type: event.type, error: processError, attempts: attemptsAfter },
        ...(deadLetter ? { dead_letter_reason: processError ?? "max_attempts_exceeded" } : {}),
      });
    }

    return new Response(JSON.stringify({ received: true, correlation_id: corr }), {
      headers: { ...corsHeaders, "Content-Type": "application/json", "x-correlation-id": corr },
      status: processedOk ? 200 : 500,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage, corr });
    return new Response(JSON.stringify({ error: errorMessage, correlation_id: corr }), {
      headers: { ...corsHeaders, "Content-Type": "application/json", "x-correlation-id": corr },
      status: 500,
    });
  }
});
