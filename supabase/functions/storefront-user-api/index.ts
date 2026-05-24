// Authenticated, per-user recommendation API.
// NEVER CDN-cacheable — responses are user-specific.
// Routes (GET):
//   /storefront-user-api/recommended-for-user
//   /storefront-user-api/continue-series
//   /storefront-user-api/from-followed-authors
//
// All routes require a valid Bearer JWT. Returns public-safe listing data
// plus a `reasons` array on each item explaining why it was recommended.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders, preflight, json, serviceClient, requireUser, enforceRateLimit } from "../_shared/http.ts";

const NO_CACHE = {
  "Cache-Control": "private, no-store, max-age=0",
  Vary: "Authorization",
};

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...NO_CACHE },
  });
}

const LISTING_FIELDS =
  "id, slug, blurb, subtitle, amazon_description, price_cents, currency, sample_chapters, cover_override_url, license_type, seo_keywords, series_id, series_order, created_at, updated_at";
const BOOK_FIELDS = "id, title, description, cover_image_url, category, total_chapters, user_id";

function shapeListing(row: any, reasons: string[]) {
  const b = row.book;
  return {
    id: row.id,
    slug: row.slug,
    blurb: row.blurb,
    subtitle: row.subtitle,
    price_cents: row.price_cents,
    currency: row.currency,
    sample_chapters: row.sample_chapters,
    cover_override_url: row.cover_override_url,
    license_type: row.license_type,
    seo_keywords: row.seo_keywords ?? [],
    series_id: row.series_id,
    series_order: row.series_order,
    updated_at: row.updated_at,
    book: b ? {
      id: b.id, title: b.title, description: b.description,
      cover_image_url: b.cover_image_url, category: b.category,
      total_chapters: b.total_chapters ?? 0, author_user_id: b.user_id,
    } : null,
    reasons,
  };
}

function capPerAuthor<T extends { book?: { author_user_id?: string } | null }>(rows: T[], max = 2): T[] {
  const seen = new Map<string, number>();
  const out: T[] = [];
  for (const r of rows) {
    const a = r.book?.author_user_id ?? "_";
    const n = seen.get(a) ?? 0;
    if (n >= max) continue;
    seen.set(a, n + 1);
    out.push(r);
  }
  return out;
}

async function ownedBookIds(sc: any, userId: string): Promise<Set<string>> {
  const { data } = await sc.from("book_purchases")
    .select("book_id").eq("buyer_user_id", userId).eq("status", "paid").limit(500);
  return new Set((data ?? []).map((r: any) => r.book_id));
}

async function handleRecommendedForUser(sc: any, userId: string, url: URL): Promise<Response> {
  const limit = Math.min(24, Math.max(1, parseInt(url.searchParams.get("limit") ?? "12") || 12));

  // 1) Sampled / clicked listings — pull categories & books for "because you sampled".
  const { data: feedback } = await sc.from("recommendation_feedback")
    .select("book_id, listing_id, action, created_at")
    .eq("user_id", userId)
    .in("action", ["sampled", "clicked"])
    .order("created_at", { ascending: false })
    .limit(200);

  const sampledBookIds = Array.from(new Set((feedback ?? []).map((r: any) => r.book_id).filter(Boolean)));
  let sampledTitlesByCategory = new Map<string, string>();
  if (sampledBookIds.length > 0) {
    const { data: bks } = await sc.from("books").select("id, title, category").in("id", sampledBookIds);
    (bks ?? []).forEach((b: any) => {
      if (b.category && !sampledTitlesByCategory.has(b.category)) {
        sampledTitlesByCategory.set(b.category, b.title);
      }
    });
  }

  // 1b) Suppression: explicit hides in the last 30 days.
  const { data: hides } = await sc.from("recommendation_feedback")
    .select("book_id")
    .eq("user_id", userId)
    .eq("action", "hidden")
    .gte("created_at", new Date(Date.now() - 30 * 86400_000).toISOString())
    .limit(500);
  const hiddenBookIds = new Set((hides ?? []).map((r: any) => r.book_id).filter(Boolean));
  const authorHidePenalty = new Map<string, number>();
  if (hiddenBookIds.size > 0) {
    const { data: hbBooks } = await sc.from("books")
      .select("id, user_id").in("id", Array.from(hiddenBookIds));
    (hbBooks ?? []).forEach((b: any) => {
      if (!b.user_id) return;
      authorHidePenalty.set(b.user_id, Math.min(60, (authorHidePenalty.get(b.user_id) ?? 0) + 20));
    });
  }

  // 2) Followed authors.
  const { data: follows } = await sc.from("author_followers")
    .select("author_user_id").eq("follower_user_id", userId).limit(200);
  const followedSet = new Set((follows ?? []).map((f: any) => f.author_user_id));

  // 3) Global discovery pool.
  const { data: scored } = await sc.rpc("compute_discovery_scores", { _window_days: 21, _limit: 200 });
  const pool = (scored ?? []) as any[];
  if (pool.length === 0) return reply({ items: [], source: "empty" });

  // 4) Owned filter.
  const owned = await ownedBookIds(sc, userId);

  // 5) Score with personalization boosts.
  const FOLLOW_BOOST = 30;
  const CATEGORY_BOOST = 15;
  const personalized = pool
    .filter((p) => !owned.has(p.book_id))
    .map((p) => {
      const reasons: string[] = [];
      let boost = 0;
      if (p.author_user_id && followedSet.has(p.author_user_id)) {
        boost += FOLLOW_BOOST;
        reasons.push("From an author you follow");
      }
      if (p.category && sampledTitlesByCategory.has(p.category)) {
        boost += CATEGORY_BOOST;
        reasons.push(`Because you sampled ${sampledTitlesByCategory.get(p.category)}`);
      }
      if (reasons.length === 0) reasons.push("Popular right now");
      return { ...p, _final: Number(p.score) + boost, _reasons: reasons };
    })
    .sort((a, b) => b._final - a._final);

  const topIds = personalized.slice(0, limit * 4).map((p) => p.listing_id);
  if (topIds.length === 0) return reply({ items: [], source: "empty" });

  const { data: listings } = await sc.from("public_listings")
    .select(`${LISTING_FIELDS}, book:books!inner(${BOOK_FIELDS})`)
    .in("id", topIds).eq("is_public", true);
  const byId = new Map<string, any>();
  (listings ?? []).forEach((r: any) => byId.set(r.id, r));
  const reasonsById = new Map<string, string[]>();
  personalized.forEach((p) => reasonsById.set(p.listing_id, p._reasons));

  const ordered = personalized
    .map((p) => byId.get(p.listing_id))
    .filter(Boolean)
    .map((r) => shapeListing(r, reasonsById.get(r.id) ?? []));
  const diverse = capPerAuthor(ordered, 2).slice(0, limit);
  return reply({ items: diverse, source: "recommended_for_user" });
}

async function handleContinueSeries(sc: any, userId: string, url: URL): Promise<Response> {
  const limit = Math.min(24, Math.max(1, parseInt(url.searchParams.get("limit") ?? "8") || 8));

  // Find books the user has progress on that belong to a series.
  const { data: progress } = await sc.from("reading_progress")
    .select("book_id, percent, last_read_at")
    .eq("user_id", userId).order("last_read_at", { ascending: false }).limit(50);
  if (!progress || progress.length === 0) return reply({ items: [] });

  const bookIds = progress.map((p: any) => p.book_id);
  const { data: progListings } = await sc.from("public_listings")
    .select("id, book_id, series_id, series_order").in("book_id", bookIds);
  const seriesProgress = new Map<string, { order: number; bookId: string }>();
  (progListings ?? []).forEach((l: any) => {
    if (!l.series_id || l.series_order == null) return;
    const cur = seriesProgress.get(l.series_id);
    if (!cur || l.series_order > cur.order) {
      seriesProgress.set(l.series_id, { order: l.series_order, bookId: l.book_id });
    }
  });
  if (seriesProgress.size === 0) return reply({ items: [] });

  const owned = await ownedBookIds(sc, userId);

  const seriesIds = Array.from(seriesProgress.keys());
  const { data: candidates } = await sc.from("public_listings")
    .select(`${LISTING_FIELDS}, book:books!inner(${BOOK_FIELDS})`)
    .in("series_id", seriesIds).eq("is_public", true);

  const next: any[] = [];
  (candidates ?? []).forEach((r: any) => {
    const sp = seriesProgress.get(r.series_id);
    if (!sp) return;
    if (r.series_order == null || r.series_order <= sp.order) return;
    if (owned.has(r.book_id)) return;
    next.push({ row: r, gap: r.series_order - sp.order });
  });
  next.sort((a, b) => a.gap - b.gap);
  const out = next.slice(0, limit).map((n) => shapeListing(n.row, ["Continue this series"]));
  return reply({ items: out, source: "continue_series" });
}

async function handleFromFollowedAuthors(sc: any, userId: string, url: URL): Promise<Response> {
  const limit = Math.min(24, Math.max(1, parseInt(url.searchParams.get("limit") ?? "12") || 12));

  const { data: follows } = await sc.from("author_followers")
    .select("author_user_id").eq("follower_user_id", userId).limit(200);
  const authorIds = (follows ?? []).map((f: any) => f.author_user_id);
  if (authorIds.length === 0) return reply({ items: [] });

  const owned = await ownedBookIds(sc, userId);
  const { data: listings } = await sc.from("public_listings")
    .select(`${LISTING_FIELDS}, book:books!inner(${BOOK_FIELDS})`)
    .eq("is_public", true).in("book.user_id", authorIds)
    .order("created_at", { ascending: false }).limit(limit * 4);

  // Lookup author display names for reason labels.
  const { data: profiles } = await sc.from("author_profiles")
    .select("user_id, display_name, slug, avatar_url").in("user_id", authorIds);
  const apMap = new Map<string, any>();
  (profiles ?? []).forEach((p: any) => apMap.set(p.user_id, p));

  const shaped = (listings ?? [])
    .filter((l: any) => !owned.has(l.book?.id ?? l.book_id))
    .map((l: any) => {
      const ap = apMap.get(l.book?.user_id);
      const name = ap?.display_name ?? "an author you follow";
      const s = shapeListing(l, [`New from ${name}`]);
      if (ap) (s as any).author = { slug: ap.slug, display_name: ap.display_name, avatar_url: ap.avatar_url };
      return s;
    });

  const diverse = capPerAuthor(shaped, 2).slice(0, limit);
  return reply({ items: diverse, source: "from_followed_authors" });
}

serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "GET") return reply({ error: "GET only", code: "method_not_allowed" }, 405);

  const authed = await requireUser(req);
  if (authed instanceof Response) return authed;

  const rl = enforceRateLimit({ name: "storefront-user-api", key: authed.userId, limit: 120, windowSec: 60 });
  if (rl) return rl;

  const url = new URL(req.url);
  const route = url.pathname.split("/").filter(Boolean).pop() ?? "";

  let sc;
  try { sc = serviceClient(); } catch (e) {
    return reply({ error: (e as Error).message, code: "service_unavailable" }, 500);
  }

  try {
    switch (route) {
      case "recommended-for-user":   return await handleRecommendedForUser(sc, authed.userId, url);
      case "continue-series":        return await handleContinueSeries(sc, authed.userId, url);
      case "from-followed-authors":  return await handleFromFollowedAuthors(sc, authed.userId, url);
      default:                       return reply({ error: "Unknown route", code: "not_found" }, 404);
    }
  } catch (e) {
    return reply({ error: (e as Error).message, code: "internal_error" }, 500);
  }
});
