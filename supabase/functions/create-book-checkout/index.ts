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
    const { listing_id } = await req.json();
    if (!listing_id) throw new Error("listing_id required");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY missing");

    const sb = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

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
          throw new Error("You already own this book");
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

    // FREE listing → immediate unlock for logged-in users (no Stripe call)
    if (!listing.price_cents || listing.price_cents <= 0) {
      if (!buyerUserId) throw new Error("Sign in required to claim free books");
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
              images: book.cover_image_url ? [book.cover_image_url] : undefined,
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
      metadata: { source: "stripe_checkout" },
    });

    await sb.from("storefront_events").insert({
      listing_id: listing.id,
      event_type: "checkout_started",
      user_id: buyerUserId,
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
