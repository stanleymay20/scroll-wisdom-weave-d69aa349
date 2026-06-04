import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@18.5.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version, x-idempotency-key",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const noStoreHeaders = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Authorization, Origin",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_PRICE_CENTS = 99_999_00; // $99,999.00 hard safety rail
const SUPPORTED_CURRENCIES = new Set(["usd", "eur", "gbp", "cad", "aud"]);

function log(step: string, details?: unknown) {
  console.log(`[CREATE-BOOK-CHECKOUT] ${step}${details ? ` - ${JSON.stringify(details)}` : ""}`);
}

function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, ...noStoreHeaders, "Content-Type": "application/json", ...extraHeaders },
  });
}

function publicError(message: string, code: string, status = 400, retryAfter?: number) {
  return json(
    { error: message, code, ...(retryAfter ? { retry_after: retryAfter } : {}) },
    status,
    retryAfter ? { "Retry-After": String(retryAfter) } : {},
  );
}

function cleanText(value: unknown, max: number) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim().slice(0, max) : "";
}

function safeOrigin(req: Request) {
  const fallback = Deno.env.get("PUBLIC_SITE_URL") || "https://scrolllibrary.org";
  const origin = req.headers.get("origin") || fallback;
  const allowList = new Set(
    [fallback, Deno.env.get("APP_ORIGIN"), ...(Deno.env.get("SELLING_ALLOWED_ORIGINS") || "").split(",")]
      .filter(Boolean)
      .map((x) => String(x).replace(/\/$/, "")),
  );
  const normalized = origin.replace(/\/$/, "");
  return allowList.has(normalized) || normalized.endsWith(".lovable.app") ? normalized : fallback.replace(/\/$/, "");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return publicError("POST only", "method_not_allowed", 405);

  const correlationId = crypto.randomUUID();

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

    if (!listing_id || !UUID_RE.test(listing_id)) {
      return publicError("Valid listing_id required", "invalid_listing_id", 400);
    }

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    if (!stripeKey || !supabaseUrl || !serviceRoleKey || !anonKey) {
      log("Configuration missing", { correlationId, stripe: !!stripeKey, supabaseUrl: !!supabaseUrl, serviceRole: !!serviceRoleKey, anon: !!anonKey });
      return publicError("Checkout is temporarily unavailable", "service_unavailable", 503);
    }

    const sb = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });

    // Persistent velocity gate against scripted checkout attempts.
    const reqIp = (req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()) ||
      req.headers.get("cf-connecting-ip") ||
      req.headers.get("x-real-ip") ||
      "anonymous";
    const checkVelocity = async (name: string, key: string, limit: number, windowSec: number) => {
      try {
        const { data } = await sb.rpc("check_velocity", {
          _key: `${name}:${key}`,
          _limit: limit,
          _window_seconds: windowSec,
        });
        if ((data as any)?.ok === false) {
          const retry = Number((data as any)?.retry_after ?? windowSec);
          return publicError("Rate limit exceeded", "rate_limited", 429, retry);
        }
      } catch (_e) {
        // Fail open to avoid false payment outages if the velocity table is temporarily unavailable.
      }
      return null;
    };

    const ipLimit = await checkVelocity("checkout:ip", reqIp, 30, 60);
    if (ipLimit) return ipLimit;

    // Resolve listing and author-owned book from server-side source of truth.
    const { data: listing, error: listingError } = await sb
      .from("public_listings")
      .select("id, slug, price_cents, currency, is_public, book_id, book:books(id, title, cover_image_url, user_id)")
      .eq("id", listing_id)
      .maybeSingle();
    if (listingError) throw listingError;
    if (!listing || !listing.is_public) return publicError("Listing not available", "listing_unavailable", 404);

    const book = listing.book as any;
    if (!book?.id || !book?.user_id) return publicError("Listing is not purchasable", "listing_invalid", 422);

    const priceCents = Number(listing.price_cents ?? 0);
    const currency = String(listing.currency ?? "usd").toLowerCase();
    if (!Number.isInteger(priceCents) || priceCents < 0 || priceCents > MAX_PRICE_CENTS) {
      log("Invalid listing price", { correlationId, listing_id, priceCents });
      return publicError("Listing price is invalid", "invalid_price", 422);
    }
    if (!SUPPORTED_CURRENCIES.has(currency)) {
      log("Unsupported listing currency", { correlationId, listing_id, currency });
      return publicError("Listing currency is not supported", "unsupported_currency", 422);
    }

    // Enterprise access rule: all unlocks require a signed-in account.
    // Without this, a guest could pay and then fail the full-reader buyer_user_id check.
    const authHeader = req.headers.get("Authorization") || req.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return publicError("Please sign in before checkout", "auth_required", 401);
    }
    const anon = createClient(supabaseUrl, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData, error: authError } = await anon.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !authData.user?.id) return publicError("Please sign in before checkout", "auth_required", 401);

    const buyerUserId = authData.user.id;
    const buyerEmail = authData.user.email ?? null;
    if (!buyerEmail) return publicError("Your account needs a verified email before checkout", "email_required", 403);

    if (book.user_id === buyerUserId) {
      return json({ already_owned: true, reason: "author" });
    }

    const userLimit = await checkVelocity("checkout:user", buyerUserId, 20, 60);
    if (userLimit) return userLimit;

    const { data: prior } = await sb
      .from("book_purchases")
      .select("id")
      .eq("buyer_user_id", buyerUserId)
      .eq("book_id", book.id)
      .eq("status", "paid")
      .maybeSingle();
    if (prior) return json({ already_owned: true });

    // Risk-tier gate for buyers.
    const riskCheck = async (action: "free_unlock" | "paid_checkout") => {
      const { data } = await sb.from("user_risk_scores")
        .select("tier, manual_override_tier")
        .eq("user_id", buyerUserId)
        .maybeSingle();
      const tier = (data as any)?.manual_override_tier ?? (data as any)?.tier ?? "low";
      const blocks = tier === "blocked" ? true : tier === "high" ? action === "free_unlock" : false;
      if (!blocks) return null;
      return publicError("Action blocked by risk policy", "risk_blocked", 403);
    };

    const attrSession = cleanText(attribution?.session_id, 64);
    const attrSource = cleanText(attribution?.source, 60);
    const attrMedium = cleanText(attribution?.medium, 60);
    const attrCampaign = cleanText(attribution?.campaign, 120);
    const attrReferrer = cleanText(attribution?.referrer, 200);
    const attrLanding = cleanText(attribution?.landing_path, 200);

    const origin = safeOrigin(req);

    // Free listing → immediate unlock for logged-in users.
    if (priceCents <= 0) {
      const risk = await riskCheck("free_unlock");
      if (risk) return risk;
      const freeUserLimit = await checkVelocity("checkout:free:user", buyerUserId, 10, 3600);
      if (freeUserLimit) return freeUserLimit;
      const ipFreeLimit = await checkVelocity("checkout:free:ip", reqIp, 20, 3600);
      if (ipFreeLimit) return ipFreeLimit;

      const { data: inserted, error: insertError } = await sb.from("book_purchases").insert({
        listing_id: listing.id,
        book_id: book.id,
        buyer_user_id: buyerUserId,
        buyer_email: buyerEmail,
        amount_cents: 0,
        currency,
        status: "paid",
        purchased_at: new Date().toISOString(),
        metadata: { source: "free_unlock", correlation_id: correlationId },
      }).select("id").maybeSingle();

      if (insertError && insertError.code !== "23505" && !String(insertError.message).toLowerCase().includes("duplicate")) {
        throw insertError;
      }
      if (!insertError && inserted?.id) {
        await sb.rpc("record_purchase_ledger", { _purchase_id: inserted.id });
        await sb.from("storefront_events").insert({
          listing_id: listing.id,
          event_type: "full_book_unlocked",
          user_id: buyerUserId,
          session_id: attrSession || null,
          metadata: { source: "free", correlation_id: correlationId },
        });
      }

      return json({ free: true, redirect_url: `${origin}/store/${listing.slug}/success?free=1` });
    }

    const paidRisk = await riskCheck("paid_checkout");
    if (paidRisk) return paidRisk;

    const stripe = new Stripe(stripeKey, { apiVersion: "2025-08-27.basil" });
    const customers = await stripe.customers.list({ email: buyerEmail, limit: 1 });
    const customerId = customers.data[0]?.id;

    const clientIdempotencyKey = cleanText(req.headers.get("x-idempotency-key"), 80);
    const stripeIdempotencyKey = clientIdempotencyKey
      ? `book_checkout:${listing.id}:${buyerUserId}:${clientIdempotencyKey}`.slice(0, 255)
      : undefined;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer: customerId,
      customer_email: customerId ? undefined : buyerEmail,
      client_reference_id: `${listing.id}:${buyerUserId}`.slice(0, 200),
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency,
            unit_amount: priceCents,
            product_data: {
              name: String(book.title || "ScrollLibrary Book").slice(0, 250),
              images: book.cover_image_url && /^https?:\/\//i.test(book.cover_image_url) && book.cover_image_url.length <= 2000
                ? [book.cover_image_url]
                : undefined,
              metadata: { book_id: book.id, listing_id: listing.id, seller_user_id: book.user_id },
            },
          },
        },
      ],
      success_url: `${origin}/store/${listing.slug}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/store/${listing.slug}?canceled=1`,
      metadata: {
        kind: "book_purchase",
        checkout_version: "enterprise_v1",
        listing_id: listing.id,
        book_id: book.id,
        seller_user_id: book.user_id,
        buyer_user_id: buyerUserId,
        expected_amount_cents: String(priceCents),
        expected_currency: currency,
        correlation_id: correlationId,
        attribution_session_id: attrSession,
        attribution_source: attrSource,
        attribution_medium: attrMedium,
        attribution_campaign: attrCampaign,
        attribution_referrer: attrReferrer,
        attribution_landing_path: attrLanding,
      },
    }, stripeIdempotencyKey ? { idempotencyKey: stripeIdempotencyKey } : undefined);

    const { error: pendingError } = await sb.from("book_purchases").insert({
      listing_id: listing.id,
      book_id: book.id,
      buyer_user_id: buyerUserId,
      buyer_email: buyerEmail,
      stripe_session_id: session.id,
      amount_cents: priceCents,
      currency,
      status: "pending",
      metadata: {
        source: "stripe_checkout",
        checkout_version: "enterprise_v1",
        correlation_id: correlationId,
        expected_amount_cents: priceCents,
        expected_currency: currency,
        attribution_session_id: attrSession || null,
        attribution_source: attrSource || null,
      },
    });
    if (pendingError && pendingError.code !== "23505") throw pendingError;

    await sb.from("storefront_events").insert({
      listing_id: listing.id,
      event_type: "checkout_started",
      user_id: buyerUserId,
      session_id: attrSession || null,
      metadata: { session_id: session.id, amount_cents: priceCents, currency, correlation_id: correlationId },
    });

    log("Session created", { correlationId, sessionId: session.id, listingId: listing.id, buyerUserId });
    return json({ url: session.url, session_id: session.id, correlation_id: correlationId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log("ERROR", { correlationId, msg });
    return json({ error: "Could not start checkout", code: "checkout_failed", correlation_id: correlationId }, 500);
  }
});
