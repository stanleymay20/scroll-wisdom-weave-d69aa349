// Canonical public storefront read API. Cached via CDN.
// Routes:
//   GET /storefront-api/books?search=&category=&sort=&page=&pageSize=
//   GET /storefront-api/book?slug=...
//   GET /storefront-api/related?slug=...&limit=8
//   GET /storefront-api/trending?limit=12
//
// Public-safe fields only. No buyer, no full chapters, no creator finances.
// CDN cache: public, s-maxage=60, stale-while-revalidate=300.

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { corsHeaders, preflight, json, serviceClient } from "../_shared/http.ts";

const CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300",
  Vary: "Accept-Encoding",
};

function cached(body: unknown, status = 200, etag?: string) {
  const headers: Record<string, string> = {
    ...corsHeaders,
    "Content-Type": "application/json",
    ...CACHE_HEADERS,
  };
  if (etag) headers["ETag"] = etag;
  return new Response(JSON.stringify(body), { status, headers });
}

function notFound(msg = "Not found") {
  return new Response(JSON.stringify({ error: msg, code: "not_found" }), {
    status: 404,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "public, s-maxage=30" },
  });
}

function badRequest(msg: string) {
  return new Response(JSON.stringify({ error: msg, code: "bad_request" }), {
    status: 400,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Public-safe projections
const BOOK_FIELDS = "id, title, description, cover_image_url, category, total_chapters, user_id";
const LISTING_FIELDS =
  "id, slug, blurb, subtitle, amazon_description, price_cents, currency, sample_chapters, cover_override_url, license_type, seo_keywords, series_id, series_order, created_at, updated_at";

function shapeListing(row: any) {
  const b = row.book;
  return {
    id: row.id,
    slug: row.slug,
    blurb: row.blurb,
    subtitle: row.subtitle,
    amazon_description: row.amazon_description,
    price_cents: row.price_cents,
    currency: row.currency,
    sample_chapters: row.sample_chapters,
    cover_override_url: row.cover_override_url,
    license_type: row.license_type,
    seo_keywords: row.seo_keywords ?? [],
    series_id: row.series_id,
    series_order: row.series_order,
    updated_at: row.updated_at,
    book: b
      ? {
          id: b.id,
          title: b.title,
          description: b.description,
          cover_image_url: b.cover_image_url,
          category: b.category,
          total_chapters: b.total_chapters ?? 0,
          author_user_id: b.user_id,
        }
      : null,
  };
}

async function attachAuthors(sc: any, listings: any[]) {
  const ids = Array.from(new Set(listings.map((l) => l.book?.author_user_id).filter(Boolean)));
  if (ids.length === 0) return new Map();
  const { data } = await sc.from("author_profiles").select("user_id, slug, display_name, avatar_url").in("user_id", ids);
  const map = new Map<string, any>();
  (data ?? []).forEach((a: any) => map.set(a.user_id, a));
  return map;
}

async function logLatency(sc: any, route: string, ms: number, status: number) {
  try {
    await sc.from("financial_events").insert({
      event_type: "storefront_api_request",
      severity: status >= 500 ? "warn" : "info",
      actor: "system",
      payload: { route, duration_ms: ms, status },
    });
  } catch (_) { /* swallow */ }
}

// Weighted search: title (highest), blurb/subtitle (medium), author name (medium),
// category/keywords (lower). Computed in-process from a candidate pool to keep CDN-cacheable.
async function rankSearchResults(sc: any, rows: any[], qRaw: string) {
  const q = qRaw.toLowerCase();
  if (!q) return rows;
  const tokens = q.split(/\s+/).filter(Boolean);
  const authors = await attachAuthors(sc, rows);
  const scored = rows.map((r: any) => {
    const title = (r.book?.title ?? "").toLowerCase();
    const blurb = (r.blurb ?? "").toLowerCase();
    const subtitle = (r.subtitle ?? "").toLowerCase();
    const category = (r.book?.category ?? "").toLowerCase();
    const kws = (r.seo_keywords ?? []).map((k: string) => k.toLowerCase()).join(" ");
    const author = r.book?.author_user_id ? authors.get(r.book.author_user_id) : null;
    const authorName = (author?.display_name ?? "").toLowerCase();
    let s = 0;
    if (title === q) s += 120;
    if (title.startsWith(q)) s += 60;
    for (const t of tokens) {
      if (title.includes(t)) s += 30;
      if (subtitle.includes(t)) s += 12;
      if (blurb.includes(t)) s += 8;
      if (authorName.includes(t)) s += 20;
      if (category.includes(t)) s += 6;
      if (kws.includes(t)) s += 4;
    }
    if (author) r.author = { slug: author.slug, display_name: author.display_name, avatar_url: author.avatar_url };
    return { r, s };
  });
  return scored.filter((x) => x.s > 0).sort((a, b) => b.s - a.s).map((x) => x.r);
}

async function handleBooks(sc: any, url: URL): Promise<Response> {
  const search = (url.searchParams.get("search") ?? url.searchParams.get("q") ?? "").trim().slice(0, 120);
  const category = (url.searchParams.get("category") ?? "").trim().slice(0, 60);
  const sort = url.searchParams.get("sort") ?? "newest";
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1") || 1);
  const pageSize = Math.min(60, Math.max(1, parseInt(url.searchParams.get("pageSize") ?? "24") || 24));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  if (search) {
    const like = `%${search.replace(/[%_]/g, "")}%`;

    // Embedded foreign-table filters can't go inside top-level .or(), so split
    // into two passes: (a) listing-text match, (b) book.title match via FK.
    const [a, b] = await Promise.all([
      (() => {
        let q = sc.from("public_listings")
          .select(`${LISTING_FIELDS}, book:books!inner(${BOOK_FIELDS})`)
          .eq("is_public", true)
          .or(`blurb.ilike.${like},subtitle.ilike.${like}`)
          .limit(120);
        if (category) q = q.eq("book.category", category);
        return q;
      })(),
      (() => {
        let q = sc.from("public_listings")
          .select(`${LISTING_FIELDS}, book:books!inner(${BOOK_FIELDS})`)
          .eq("is_public", true)
          .ilike("book.title", like)
          .limit(120);
        if (category) q = q.eq("book.category", category);
        return q;
      })(),
    ]);

    if (a.error) return cached({ error: a.error.message, code: "query_failed" }, 500);
    if (b.error) return cached({ error: b.error.message, code: "query_failed" }, 500);

    const seen = new Set<string>();
    const merged: any[] = [];
    for (const row of [...(a.data ?? []), ...(b.data ?? [])]) {
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      merged.push(row);
    }
    const shaped = merged.map(shapeListing);
    const ranked = await rankSearchResults(sc, shaped, search);
    const total = ranked.length;
    const slice = ranked.slice(from, from + pageSize);
    return cached({ items: slice, page, pageSize, total, query: search });
  }

  let q = sc.from("public_listings")
    .select(`${LISTING_FIELDS}, book:books!inner(${BOOK_FIELDS})`, { count: "exact" })
    .eq("is_public", true);

  if (category) q = q.eq("book.category", category);
  if (sort === "price_asc") q = q.order("price_cents", { ascending: true });
  else if (sort === "price_desc") q = q.order("price_cents", { ascending: false });
  else q = q.order("created_at", { ascending: false });

  const { data, error, count } = await q.range(from, to);
  if (error) return cached({ error: error.message, code: "query_failed" }, 500);

  const shaped = (data ?? []).map(shapeListing);
  const authors = await attachAuthors(sc, shaped);
  shaped.forEach((l: any) => {
    const a = l.book?.author_user_id ? authors.get(l.book.author_user_id) : null;
    if (a) l.author = { slug: a.slug, display_name: a.display_name, avatar_url: a.avatar_url };
  });

  return cached({ items: shaped, page, pageSize, total: count ?? shaped.length });
}

async function handleBook(sc: any, url: URL): Promise<Response> {
  const slug = (url.searchParams.get("slug") ?? "").trim();
  if (!slug) return badRequest("slug required");

  const { data, error } = await sc.from("public_listings")
    .select(`${LISTING_FIELDS}, book:books!inner(${BOOK_FIELDS})`)
    .eq("slug", slug).eq("is_public", true).maybeSingle();
  if (error) return cached({ error: error.message, code: "query_failed" }, 500);
  if (!data) return notFound();

  const shaped: any = shapeListing(data);

  // Attach author + series in parallel
  const [authorRes, seriesRes] = await Promise.all([
    shaped.book?.author_user_id
      ? sc.from("author_profiles").select("slug, display_name, avatar_url, bio").eq("user_id", shaped.book.author_user_id).maybeSingle()
      : Promise.resolve({ data: null }),
    shaped.series_id
      ? sc.from("book_series").select("slug, title").eq("id", shaped.series_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  if (authorRes?.data) shaped.author = authorRes.data;
  if (seriesRes?.data) shaped.series = seriesRes.data;

  const etag = `"${shaped.id}-${new Date(shaped.updated_at ?? 0).getTime()}"`;
  return cached(shaped, 200, etag);
}

async function handleRelated(sc: any, url: URL): Promise<Response> {
  const slug = (url.searchParams.get("slug") ?? "").trim();
  const limit = Math.min(12, Math.max(1, parseInt(url.searchParams.get("limit") ?? "8") || 8));
  if (!slug) return badRequest("slug required");

  const { data: base } = await sc.from("public_listings")
    .select(`id, series_id, book:books!inner(category, user_id)`)
    .eq("slug", slug).eq("is_public", true).maybeSingle();
  if (!base) return notFound();

  const category = base.book?.category;
  const authorId = base.book?.user_id;

  // Pull a candidate pool then rank (same series > same author > same category)
  const candidates = await sc.from("public_listings")
    .select(`${LISTING_FIELDS}, book:books!inner(${BOOK_FIELDS})`)
    .eq("is_public", true).neq("id", base.id).limit(60);
  const rows = (candidates.data ?? []).map(shapeListing);

  const scored = rows.map((r: any) => {
    let score = 0;
    if (base.series_id && r.series_id === base.series_id) score += 100;
    if (authorId && r.book?.author_user_id === authorId) score += 30;
    if (category && r.book?.category === category) score += 10;
    return { r, score };
  })
    .filter((x: any) => x.score > 0)
    .sort((a: any, b: any) => b.score - a.score)
    .slice(0, limit)
    .map((x: any) => x.r);

  return cached({ items: scored });
}

async function loadWeights(sc: any) {
  const defaults = {
    w_view: 1, w_sample: 3, w_cta: 5, w_checkout: 8, w_purchase: 25,
    w_refund_penalty: 25, w_fraud_penalty: 50,
    w_freshness_days: 14, w_freshness_boost: 8,
  };
  try {
    const { data } = await sc.from("discovery_weights").select("key, value");
    (data ?? []).forEach((r: any) => { if (r.key in defaults) (defaults as any)[r.key] = Number(r.value); });
  } catch (_) { /* keep defaults */ }
  return defaults;
}

// Diversity cap helper — no more than N books per author per rail.
function capPerAuthor<T extends { book?: { author_user_id?: string } | null }>(
  rows: T[], maxPerAuthor = 2,
): T[] {
  const seen = new Map<string, number>();
  const out: T[] = [];
  for (const r of rows) {
    const a = r.book?.author_user_id ?? "_";
    const n = seen.get(a) ?? 0;
    if (n >= maxPerAuthor) continue;
    seen.set(a, n + 1);
    out.push(r);
  }
  return out;
}

// Derive a one-line reason from discovery-score components.
function explainScore(c: { engagement: number; conversion: number; freshness: number; purchases: number; samples: number; views: number }): string {
  if (c.conversion > Math.max(c.engagement, 20) && c.purchases > 0) return "Top seller this week";
  if (c.freshness > 4 && c.views < 5) return "Fresh release";
  if (c.samples > 3 && c.engagement > c.conversion) return "Readers are sampling";
  if (c.engagement > 20) return "Popular right now";
  return "Trending";
}

// Score row shape returned by compute_discovery_scores RPC.
interface ScoreRow {
  listing_id: string;
  book_id: string;
  author_user_id: string | null;
  category: string | null;
  score: number;
  engagement: number;
  conversion: number;
  freshness: number;
  penalty: number;
  views: number;
  samples: number;
  ctas: number;
  checkouts: number;
  purchases: number;
}

async function loadScored(sc: any, windowDays: number, poolLimit: number): Promise<ScoreRow[]> {
  const { data, error } = await sc.rpc("compute_discovery_scores", { _window_days: windowDays, _limit: poolLimit });
  if (error) throw error;
  return (data ?? []) as ScoreRow[];
}

async function handleTrending(sc: any, url: URL): Promise<Response> {
  const limit = Math.min(24, Math.max(1, parseInt(url.searchParams.get("limit") ?? "12") || 12));
  const scored = (await loadScored(sc, 7, 120)).filter((s) => s.score > 0);
  if (scored.length === 0) {
    const { data } = await sc.from("public_listings")
      .select(`${LISTING_FIELDS}, book:books!inner(${BOOK_FIELDS})`)
      .eq("is_public", true).order("created_at", { ascending: false }).limit(limit);
    return cached({ items: (data ?? []).map(shapeListing), source: "recent" });
  }
  const ids = scored.slice(0, limit * 3).map((s) => s.listing_id);
  const { data } = await sc.from("public_listings")
    .select(`${LISTING_FIELDS}, book:books!inner(${BOOK_FIELDS})`)
    .in("id", ids).eq("is_public", true);
  const shapedById = new Map<string, any>();
  (data ?? []).forEach((r: any) => shapedById.set(r.id, shapeListing(r)));
  const ordered = scored
    .map((s) => {
      const item = shapedById.get(s.listing_id);
      if (!item) return null;
      item.reasons = ["Trending"];
      return item;
    })
    .filter(Boolean);
  const diverse = capPerAuthor(ordered, 2).slice(0, limit);
  return cached({ items: diverse, source: "trending" });
}

async function handleRecommended(sc: any, url: URL): Promise<Response> {
  const limit = Math.min(24, Math.max(1, parseInt(url.searchParams.get("limit") ?? "12") || 12));
  const scored = (await loadScored(sc, 14, 150)).filter((s) => s.score > 0);
  if (scored.length === 0) return cached({ items: [], source: "empty" });
  const ids = scored.slice(0, limit * 4).map((s) => s.listing_id);
  const { data } = await sc.from("public_listings")
    .select(`${LISTING_FIELDS}, book:books!inner(${BOOK_FIELDS})`)
    .in("id", ids).eq("is_public", true);
  const shapedById = new Map<string, any>();
  (data ?? []).forEach((r: any) => shapedById.set(r.id, shapeListing(r)));
  const ordered = scored
    .map((s) => {
      const item = shapedById.get(s.listing_id);
      if (!item) return null;
      item.reasons = [explainScore(s)];
      return item;
    })
    .filter(Boolean);
  // Authors for ribbon labels
  const authors = await attachAuthors(sc, ordered);
  ordered.forEach((l: any) => {
    const a = l.book?.author_user_id ? authors.get(l.book.author_user_id) : null;
    if (a) l.author = { slug: a.slug, display_name: a.display_name, avatar_url: a.avatar_url };
  });
  const diverse = capPerAuthor(ordered, 2).slice(0, limit);
  return cached({ items: diverse, source: "recommended" });
}

async function handleTopSelling(sc: any, url: URL): Promise<Response> {
  const limit = Math.min(24, Math.max(1, parseInt(url.searchParams.get("limit") ?? "12") || 12));
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: purchases } = await sc.from("book_purchases")
    .select("book_id, listing_id, status").eq("status", "paid").gte("created_at", since).limit(5000);

  const byListing = new Map<string, number>();
  const byBook = new Map<string, number>();
  (purchases ?? []).forEach((p: any) => {
    if (p.listing_id) byListing.set(p.listing_id, (byListing.get(p.listing_id) ?? 0) + 1);
    if (p.book_id) byBook.set(p.book_id, (byBook.get(p.book_id) ?? 0) + 1);
  });

  const topIds = Array.from(byListing.entries()).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([id]) => id);
  if (topIds.length === 0) {
    return cached({ items: [], source: "empty" });
  }
  const { data } = await sc.from("public_listings")
    .select(`${LISTING_FIELDS}, book:books!inner(${BOOK_FIELDS})`)
    .in("id", topIds).eq("is_public", true);
  const shaped = (data ?? []).map(shapeListing);
  shaped.sort((a: any, b: any) => (byListing.get(b.id) ?? 0) - (byListing.get(a.id) ?? 0));
  return cached({ items: shaped, source: "top_selling" });
}

async function handleRecent(sc: any, url: URL): Promise<Response> {
  const limit = Math.min(24, Math.max(1, parseInt(url.searchParams.get("limit") ?? "12") || 12));
  const { data } = await sc.from("public_listings")
    .select(`${LISTING_FIELDS}, book:books!inner(${BOOK_FIELDS})`)
    .eq("is_public", true).order("created_at", { ascending: false }).limit(limit);
  const shaped = (data ?? []).map(shapeListing);
  const authors = await attachAuthors(sc, shaped);
  shaped.forEach((l: any) => {
    const a = l.book?.author_user_id ? authors.get(l.book.author_user_id) : null;
    if (a) l.author = { slug: a.slug, display_name: a.display_name, avatar_url: a.avatar_url };
  });
  return cached({ items: shaped });
}

async function handleAuthorBooks(sc: any, url: URL): Promise<Response> {
  const slug = (url.searchParams.get("author") ?? "").trim();
  const excludeSlug = (url.searchParams.get("exclude") ?? "").trim();
  const limit = Math.min(24, Math.max(1, parseInt(url.searchParams.get("limit") ?? "8") || 8));
  if (!slug) return badRequest("author required");
  const { data: ap } = await sc.from("author_profiles").select("user_id, slug, display_name, avatar_url").eq("slug", slug).maybeSingle();
  if (!ap) return notFound();
  let q = sc.from("public_listings")
    .select(`${LISTING_FIELDS}, book:books!inner(${BOOK_FIELDS})`)
    .eq("is_public", true).eq("book.user_id", ap.user_id).limit(limit);
  if (excludeSlug) q = q.neq("slug", excludeSlug);
  const { data } = await q;
  const shaped = (data ?? []).map(shapeListing);
  shaped.forEach((l: any) => { l.author = { slug: ap.slug, display_name: ap.display_name, avatar_url: ap.avatar_url }; });

  let followers = 0;
  try {
    const { count } = await sc.from("author_followers")
      .select("id", { head: true, count: "exact" })
      .eq("author_user_id", ap.user_id);
    followers = count ?? 0;
  } catch (_) { /* swallow */ }

  return cached({ items: shaped, author: { slug: ap.slug, display_name: ap.display_name, followers_count: followers } });
}

// ===== Phase 2.1b.2a: Collections (public-safe) =====

async function shapeCollection(sc: any, row: any, opts: { withItems?: boolean; itemLimit?: number } = {}) {
  const out: any = {
    id: row.id, slug: row.slug, title: row.title, description: row.description,
    cover_image_url: row.cover_image_url, is_public: row.is_public,
    owner_user_id: row.owner_user_id, updated_at: row.updated_at,
  };
  const { data: ap } = await sc.from("author_profiles")
    .select("slug, display_name, avatar_url")
    .eq("user_id", row.owner_user_id).maybeSingle();
  if (ap) out.owner = ap;

  if (opts.withItems) {
    const { data: items } = await sc.from("book_collection_items")
      .select("book_id, sort_index")
      .eq("collection_id", row.id)
      .order("sort_index", { ascending: true })
      .limit(opts.itemLimit ?? 60);
    const bookIds = (items ?? []).map((i: any) => i.book_id);
    if (bookIds.length > 0) {
      const { data: listings } = await sc.from("public_listings")
        .select(`${LISTING_FIELDS}, book:books!inner(${BOOK_FIELDS})`)
        .in("book_id", bookIds).eq("is_public", true);
      const shaped = (listings ?? []).map(shapeListing);
      const byBook = new Map(shaped.map((l: any) => [l.book?.id, l]));
      out.items = bookIds.map((bid: string) => byBook.get(bid)).filter(Boolean);
      out.items_count = out.items.length;
    } else {
      out.items = []; out.items_count = 0;
    }
  } else {
    const { count } = await sc.from("book_collection_items")
      .select("id", { head: true, count: "exact" }).eq("collection_id", row.id);
    out.items_count = count ?? 0;
  }
  return out;
}

async function handleCollections(sc: any, url: URL): Promise<Response> {
  const owner = (url.searchParams.get("owner") ?? "").trim();
  const limit = Math.min(30, Math.max(1, parseInt(url.searchParams.get("limit") ?? "12") || 12));
  let q = sc.from("book_collections").select("*").eq("is_public", true)
    .order("sort_index").order("updated_at", { ascending: false }).limit(limit);
  if (owner) {
    const { data: ap } = await sc.from("author_profiles").select("user_id").eq("slug", owner).maybeSingle();
    if (!ap) return cached({ items: [] });
    q = q.eq("owner_user_id", ap.user_id);
  }
  const { data, error } = await q;
  if (error) return cached({ error: error.message, code: "query_failed" }, 500);
  const items = await Promise.all((data ?? []).map((r: any) => shapeCollection(sc, r, { withItems: false })));
  return cached({ items });
}

async function handleCollection(sc: any, url: URL): Promise<Response> {
  const id = (url.searchParams.get("id") ?? "").trim();
  const ownerSlug = (url.searchParams.get("owner") ?? "").trim();
  const slug = (url.searchParams.get("slug") ?? "").trim();
  let row: any = null;
  if (id) {
    const { data } = await sc.from("book_collections").select("*").eq("id", id).eq("is_public", true).maybeSingle();
    row = data;
  } else if (ownerSlug && slug) {
    const { data: ap } = await sc.from("author_profiles").select("user_id").eq("slug", ownerSlug).maybeSingle();
    if (!ap) return notFound();
    const { data } = await sc.from("book_collections")
      .select("*").eq("owner_user_id", ap.user_id).eq("slug", slug).eq("is_public", true).maybeSingle();
    row = data;
  } else {
    return badRequest("id or (owner+slug) required");
  }
  if (!row) return notFound();
  const shaped = await shapeCollection(sc, row, { withItems: true, itemLimit: 60 });
  const etag = `"col-${row.id}-${new Date(row.updated_at ?? 0).getTime()}"`;
  return cached(shaped, 200, etag);
}

serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;
  if (req.method !== "GET") {
    return new Response(JSON.stringify({ error: "GET only", code: "method_not_allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const start = Date.now();
  const url = new URL(req.url);
  const parts = url.pathname.split("/").filter(Boolean);
  const route = parts[parts.length - 1] || "books";

  let sc;
  try { sc = serviceClient(); } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message, code: "service_unavailable" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let res: Response;
  try {
    switch (route) {
      case "books":        res = await handleBooks(sc, url); break;
      case "book":         res = await handleBook(sc, url); break;
      case "related":      res = await handleRelated(sc, url); break;
      case "trending":     res = await handleTrending(sc, url); break;
      case "recommended":  res = await handleRecommended(sc, url); break;
      case "top-selling":  res = await handleTopSelling(sc, url); break;
      case "recent":       res = await handleRecent(sc, url); break;
      case "by-author":    res = await handleAuthorBooks(sc, url); break;
      case "collections":  res = await handleCollections(sc, url); break;
      case "collection":   res = await handleCollection(sc, url); break;
      default:             res = notFound("Unknown route");
    }
  } catch (e) {
    res = new Response(JSON.stringify({ error: (e as Error).message, code: "internal_error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  logLatency(sc, route, Date.now() - start, res.status).catch(() => {});
  return res;
});
