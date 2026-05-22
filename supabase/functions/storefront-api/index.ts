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
    let q = sc.from("public_listings")
      .select(`${LISTING_FIELDS}, book:books!inner(${BOOK_FIELDS})`)
      .eq("is_public", true)
      .or(`blurb.ilike.${like},subtitle.ilike.${like},book.title.ilike.${like}`)
      .limit(200);
    if (category) q = q.eq("book.category", category);
    const { data, error } = await q;
    if (error) return cached({ error: error.message, code: "query_failed" }, 500);
    const shaped = (data ?? []).map(shapeListing);
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

async function handleTrending(sc: any, url: URL): Promise<Response> {
  const limit = Math.min(24, Math.max(1, parseInt(url.searchParams.get("limit") ?? "12") || 12));
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const w = await loadWeights(sc);

  const { data: events } = await sc.from("storefront_events")
    .select("listing_id, event_type, created_at")
    .gte("created_at", since).limit(8000);

  const scoreMap = new Map<string, number>();
  const eventWeights: Record<string, number> = {
    listing_view: w.w_view, sample_open: w.w_sample, cta_click: w.w_cta,
    checkout_started: w.w_checkout, purchase_completed: w.w_purchase,
  };
  (events ?? []).forEach((e: any) => {
    if (!e.listing_id) return;
    const ew = eventWeights[e.event_type] ?? 0;
    if (ew === 0) return;
    scoreMap.set(e.listing_id, (scoreMap.get(e.listing_id) ?? 0) + ew);
  });

  // Apply refund + fraud penalties on book_id, then map back via listings.
  const candidateIds = Array.from(scoreMap.keys());
  if (candidateIds.length > 0) {
    const { data: listingRows } = await sc.from("public_listings")
      .select("id, book_id, created_at").in("id", candidateIds);
    const idToBook = new Map<string, string>();
    const idToCreated = new Map<string, string>();
    (listingRows ?? []).forEach((r: any) => {
      idToBook.set(r.id, r.book_id);
      idToCreated.set(r.id, r.created_at);
    });

    const bookIds = Array.from(new Set(Array.from(idToBook.values())));
    const [refunds, fraud] = await Promise.all([
      sc.from("book_purchases").select("book_id").in("book_id", bookIds).eq("status", "refunded"),
      sc.from("fraud_signals").select("metadata").gte("created_at", since).limit(2000)
        .then((r: any) => r).catch(() => ({ data: [] })),
    ]);
    const refundByBook = new Map<string, number>();
    (refunds.data ?? []).forEach((p: any) => refundByBook.set(p.book_id, (refundByBook.get(p.book_id) ?? 0) + 1));

    // fraud_signals may reference book_id inside metadata; tolerant lookup.
    const fraudByBook = new Map<string, number>();
    (fraud.data ?? []).forEach((s: any) => {
      const bid = s?.metadata?.book_id;
      if (bid) fraudByBook.set(bid, (fraudByBook.get(bid) ?? 0) + 1);
    });

    const now = Date.now();
    for (const lid of candidateIds) {
      const bookId = idToBook.get(lid);
      let score = scoreMap.get(lid) ?? 0;
      if (bookId) {
        score -= (refundByBook.get(bookId) ?? 0) * w.w_refund_penalty;
        score -= (fraudByBook.get(bookId) ?? 0) * w.w_fraud_penalty;
      }
      const createdAt = idToCreated.get(lid);
      if (createdAt) {
        const ageDays = (now - new Date(createdAt).getTime()) / 86_400_000;
        if (ageDays < w.w_freshness_days) {
          score += w.w_freshness_boost * (1 - ageDays / w.w_freshness_days);
        }
      }
      scoreMap.set(lid, score);
    }
  }

  const topIds = Array.from(scoreMap.entries())
    .filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1])
    .slice(0, limit).map(([id]) => id);

  if (topIds.length === 0) {
    const { data } = await sc.from("public_listings")
      .select(`${LISTING_FIELDS}, book:books!inner(${BOOK_FIELDS})`)
      .eq("is_public", true).order("created_at", { ascending: false }).limit(limit);
    return cached({ items: (data ?? []).map(shapeListing), source: "recent" });
  }

  const { data } = await sc.from("public_listings")
    .select(`${LISTING_FIELDS}, book:books!inner(${BOOK_FIELDS})`)
    .in("id", topIds).eq("is_public", true);
  const shaped = (data ?? []).map(shapeListing);
  shaped.sort((a: any, b: any) => (scoreMap.get(b.id) ?? 0) - (scoreMap.get(a.id) ?? 0));
  return cached({ items: shaped, source: "trending" });
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
  return cached({ items: shaped, author: { slug: ap.slug, display_name: ap.display_name } });
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
      case "top-selling":  res = await handleTopSelling(sc, url); break;
      case "recent":       res = await handleRecent(sc, url); break;
      case "by-author":    res = await handleAuthorBooks(sc, url); break;
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
