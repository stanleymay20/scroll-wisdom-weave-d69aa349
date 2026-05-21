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

async function handleBooks(sc: any, url: URL): Promise<Response> {
  const search = (url.searchParams.get("search") ?? "").trim().slice(0, 120);
  const category = (url.searchParams.get("category") ?? "").trim().slice(0, 60);
  const sort = url.searchParams.get("sort") ?? "newest";
  const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1") || 1);
  const pageSize = Math.min(60, Math.max(1, parseInt(url.searchParams.get("pageSize") ?? "24") || 24));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let q = sc.from("public_listings")
    .select(`${LISTING_FIELDS}, book:books!inner(${BOOK_FIELDS})`, { count: "exact" })
    .eq("is_public", true);

  if (category) q = q.eq("book.category", category);
  if (search) {
    // server-side ILIKE across title/blurb
    q = q.or(`blurb.ilike.%${search}%,subtitle.ilike.%${search}%`);
  }

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

async function handleTrending(sc: any, url: URL): Promise<Response> {
  const limit = Math.min(24, Math.max(1, parseInt(url.searchParams.get("limit") ?? "12") || 12));
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Aggregate storefront events into a lightweight score
  const { data: events } = await sc.from("storefront_events")
    .select("listing_id, event_type")
    .gte("created_at", since)
    .limit(5000);

  const scoreMap = new Map<string, number>();
  const weights: Record<string, number> = {
    listing_view: 1,
    sample_open: 3,
    cta_click: 5,
    checkout_started: 8,
    purchase_completed: 25,
  };
  (events ?? []).forEach((e: any) => {
    if (!e.listing_id) return;
    const w = weights[e.event_type] ?? 0;
    if (w === 0) return;
    scoreMap.set(e.listing_id, (scoreMap.get(e.listing_id) ?? 0) + w);
  });

  const topIds = Array.from(scoreMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id]) => id);

  if (topIds.length === 0) {
    // Fallback: most recent
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
  // Path looks like /storefront-api/<route>
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
      case "books":    res = await handleBooks(sc, url); break;
      case "book":     res = await handleBook(sc, url); break;
      case "related":  res = await handleRelated(sc, url); break;
      case "trending": res = await handleTrending(sc, url); break;
      default:         res = notFound("Unknown route");
    }
  } catch (e) {
    res = new Response(JSON.stringify({ error: (e as Error).message, code: "internal_error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Fire-and-forget latency telemetry
  logLatency(sc, route, Date.now() - start, res.status).catch(() => {});
  return res;
});
