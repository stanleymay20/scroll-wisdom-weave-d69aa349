import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const log = (step: string, details?: unknown) =>
  console.log(`[CREATE-BOOK-CHECKOUT] ${step}${details ? ` - ${JSON.stringify(details)}` : ""}`);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST")
    return new Response(JSON.stringify({ error: "POST only" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const body = await req.json().catch(() => ({}));
    const { listing_id, attribution } = body as {
      listing_id?: string;
      attribution?: {
        session_id?: string;
        source?: string;
        medium?: string | null;
        campaign?: string | null;
        referrer?: string | null;
        landing_path?: string | null;
      };
    };
    if (!listing_id) throw new Error("listing_id required");

    // Sanitize attribution (Stripe metadata values are <=500 chars, keys <=40)
    const trim = (v: unknown, n: number) =>
      typeof v === "string" && v.length > 0 ? v.slice(0, n) : "";
    const attrSession = trim(attribution?.session_id, 64);
    const attrSource = trim(attribution?.source, 60);
    const attrMedium = trim(attribution?.medium, 60);
    const attrCampaign = trim(attribution?.campaign, 120);
    const attrReferrer = trim(attribution?.referrer, 200);
    const attrLanding = trim(attribution?.landing_path, 200);

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY missing");

    const sb = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    // Phase 2.1c.1 — persistent velocity gate against scripted checkout attempts.
    const reqIp = (req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()) ||
                  req.headers.get("cf-connecting-ip") || "anonymous";
    const checkVelocity = async (name: string, key: string, limit: number, windowSec: number) => {
      try {
        const { data } = await sb.rpc("check_velocity", {
          _key: `${name}:${key}`, _limit: limit, _window_seconds: windowSec,
        });
        if ((data as any)?.ok === false) {
          const retry = Number((data as any)?.retry_after ?? windowSec);
          return new Response(JSON.stringify({ error: "Rate limit exceeded", code: "rate_limited", retry_after: retry }), {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": String(retry) },
          });
        }
      } catch (_e) { /* fail-open */ }
      return null;
    };
    const ipLimit = await checkVelocity("checkout:ip", reqIp, 30, 60);
    if (ipLimit) return ipLimit;


    // Resolve listing + book
    const { data: listing, error: lErr } = await sb
      .from("public_listings")
      .select("id, slug, price_cents, currency, is_public, book_id, book:books(id, title, cover_image_url, user_id)")
      .eq("id", listing_id)
      .maybeSingle();
    if (lErr) throw lErr;
    if (!listing || !listing.is_public) throw new Error("Listing not available");
    const book = listing.book as any;
    if (!book) throw new Error("Book missing");

    // Optional auth — buyer may be logged in
    let buyerUserId: string | null = null;
    let buyerEmail: string | null = null;
    const authHeader = req.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      const anon = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      );
      const { data: u } = await anon.auth.getUser(authHeader.replace("Bearer ", ""));
      if (u.user) {
        buyerUserId = u.user.id;
        buyerEmail = u.user.email ?? null;
        if (book.user_id === buyerUserId) {
          return new Response(JSON.stringify({ already_owned: true, reason: "author" }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
        // Already purchased?
        const { data: prior } = await sb
          .from("book_purchases")
          .select("id")
          .eq("buyer_user_id", buyerUserId)
          .eq("book_id", book.id)
          .eq("status", "paid")
          .maybeSingle();
        if (prior) {
          return new Response(JSON.stringify({ already_owned: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }

    const origin = req.headers.get("origin") || "https://scrolllibrary.org";
    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });

    // Phase 2.1c.2 — risk-tier gate for buyers (manual override wins via column).
    const riskCheck = async (action: "free_unlock" | "paid_checkout") => {
      if (!buyerUserId) return null;
      const { data } = await sb.from("user_risk_scores")
        .select("tier, manual_override_tier").eq("user_id", buyerUserId).maybeSingle();
      const tier = (data as any)?.manual_override_tier ?? (data as any)?.tier ?? "low";
      const blocks =
        tier === "blocked" ? true :
        tier === "high" ? action === "free_unlock" :
        false;
      if (!blocks) return null;
      return new Response(JSON.stringify({
        error: "Action blocked by risk policy", code: "risk_blocked", tier, action,
      }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    };

    // FREE listing → immediate unlock for logged-in users (no Stripe call)
    if (!listing.price_cents || listing.price_cents <= 0) {
      if (!buyerUserId) throw new Error("Sign in required to claim free books");
      const risk = await riskCheck("free_unlock");
      if (risk) return risk;
      // Free-unlock farming defence: per-user + per-IP velocity.
      const userLimit = await checkVelocity("checkout:free:user", buyerUserId, 10, 3600);
      if (userLimit) return userLimit;
      const ipFreeLimit = await checkVelocity("checkout:free:ip", reqIp, 20, 3600);
      if (ipFreeLimit) return ipFreeLimit;
      const { data: inserted, error: insErr } = await sb.from("book_purchases").insert({
        listing_id: listing.id,
        book_id: book.id,
        buyer_user_id: buyerUserId,
        buyer_email: buyerEmail,
        amount_cents: 0,
        currency: listing.currency ?? "usd",
        status: "paid",
        purchased_at: new Date().toISOString(),
        metadata: { source: "free_unlock" },
      }).select("id").maybeSingle();
      // Ignore unique violation — caller already owns it (race / replay safe)
      if (insErr && insErr.code !== "23505" && !String(insErr.message).toLowerCase().includes("duplicate")) {
        throw insErr;
      }
      if (!insErr && inserted?.id) {
        await sb.rpc("record_purchase_ledger", { _purchase_id: inserted.id });
        await sb.from("storefront_events").insert({
          listing_id: listing.id,
          event_type: "full_book_unlocked",
          user_id: buyerUserId,
          metadata: { source: "free" },
        });
      }
      return new Response(
        JSON.stringify({ free: true, redirect_url: `${origin}/store/${listing.slug}/success?free=1` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Paid path — only blocked tier is rejected; high/medium/low pass through.
    const paidRisk = await riskCheck("paid_checkout");
    if (paidRisk) return paidRisk;

    // Find or create Stripe customer
    let customerId: string | undefined;
    if (buyerEmail) {
      const customers = await stripe.customers.list({ email: buyerEmail, limit: 1 });
      if (customers.data.length > 0) customerId = customers.data[0].id;
    }


    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: customerId,
      customer_email: customerId ? undefined : buyerEmail ?? undefined,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: (listing.currency ?? "usd").toLowerCase(),
            unit_amount: listing.price_cents,
            product_data: {
              name: book.title,
              images: book.cover_image_url && /^https?:\/\//i.test(book.cover_image_url) && book.cover_image_url.length <= 2000 ? [book.cover_image_url] : undefined,
              metadata: { book_id: book.id, listing_id: listing.id },
            },
          },
        },
      ],
      success_url: `${origin}/store/${listing.slug}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/store/${listing.slug}?canceled=1`,
      metadata: {
        kind: "book_purchase",
        listing_id: listing.id,
        book_id: book.id,
        buyer_user_id: buyerUserId ?? "",
        // Phase 2.1d.1 — propagate attribution so webhook can stitch
        // attribution_sessions.converted_purchase_id without leaking PII.
        attribution_session_id: attrSession,
        attribution_source: attrSource,
        attribution_medium: attrMedium,
        attribution_campaign: attrCampaign,
        attribution_referrer: attrReferrer,
        attribution_landing_path: attrLanding,
      },
    });

    // Pending purchase row
    await sb.from("book_purchases").insert({
      listing_id: listing.id,
      book_id: book.id,
      buyer_user_id: buyerUserId,
      buyer_email: buyerEmail,
      stripe_session_id: session.id,
      amount_cents: listing.price_cents,
      currency: listing.currency ?? "usd",
      status: "pending",
      metadata: {
        source: "stripe_checkout",
        attribution_session_id: attrSession || null,
        attribution_source: attrSource || null,
      },
    });

    await sb.from("storefront_events").insert({
      listing_id: listing.id,
      event_type: "checkout_started",
      user_id: buyerUserId,
      session_id: attrSession || null,
      metadata: { session_id: session.id, amount_cents: listing.price_cents },
    });

    log("Session created", { sessionId: session.id });
    return new Response(JSON.stringify({ url: session.url, session_id: session.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log("ERROR", { msg });
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
