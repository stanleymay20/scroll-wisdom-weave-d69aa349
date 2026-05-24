// Thin client for the canonical /storefront-api/* edge endpoints.
// Uses direct fetch (GET) so CDN caching can apply. Public, no auth required.

const PROJECT_ID = import.meta.env.VITE_SUPABASE_PROJECT_ID as string;
const ANON_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
const BASE = `https://${PROJECT_ID}.supabase.co/functions/v1/storefront-api`;

export interface StoreBook {
  id: string;
  title: string;
  description: string | null;
  cover_image_url: string | null;
  category: string;
  total_chapters: number;
  author_user_id: string;
}

export interface StoreListing {
  id: string;
  slug: string;
  blurb: string | null;
  subtitle: string | null;
  amazon_description: string | null;
  price_cents: number;
  currency: string;
  sample_chapters: number;
  cover_override_url: string | null;
  license_type: string;
  seo_keywords: string[];
  series_id: string | null;
  series_order: number | null;
  updated_at: string;
  book: StoreBook | null;
  author?: { slug: string; display_name: string; avatar_url: string | null; bio?: string | null } | null;
  series?: { slug: string; title: string } | null;
  /** Optional explanation labels (from recommendation rails). */
  reasons?: string[];
}

async function getJson<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
  const url = new URL(`${BASE}/${path}`);
  Object.entries(params ?? {}).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") url.searchParams.set(k, String(v));
  });
  const res = await fetch(url.toString(), {
    method: "GET",
    headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
  });
  if (!res.ok) {
    let detail: any = null;
    try { detail = await res.json(); } catch (_) { /* noop */ }
    const err: any = new Error(detail?.error ?? `Request failed (${res.status})`);
    err.status = res.status;
    err.code = detail?.code;
    throw err;
  }
  return res.json() as Promise<T>;
}

export interface StoreCollection {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  cover_image_url: string | null;
  is_public: boolean;
  owner_user_id: string;
  updated_at: string;
  items_count: number;
  owner?: { slug: string; display_name: string; avatar_url: string | null } | null;
  items?: StoreListing[];
}

export const storefrontApi = {
  listBooks(opts: { search?: string; category?: string; sort?: "newest" | "price_asc" | "price_desc"; page?: number; pageSize?: number } = {}) {
    return getJson<{ items: StoreListing[]; page: number; pageSize: number; total: number; query?: string }>("books", opts);
  },
  getBook(slug: string) {
    return getJson<StoreListing>("book", { slug });
  },
  related(slug: string, limit = 8) {
    return getJson<{ items: StoreListing[] }>("related", { slug, limit });
  },
  trending(limit = 12) {
    return getJson<{ items: StoreListing[]; source: "trending" | "recent" }>("trending", { limit });
  },
  recommended(limit = 12) {
    return getJson<{ items: StoreListing[]; source: "recommended" | "empty" }>("recommended", { limit });
  },
  topSelling(limit = 12) {
    return getJson<{ items: StoreListing[]; source: "top_selling" | "empty" }>("top-selling", { limit });
  },
  recent(limit = 12) {
    return getJson<{ items: StoreListing[] }>("recent", { limit });
  },
  byAuthor(author: string, opts: { exclude?: string; limit?: number } = {}) {
    return getJson<{ items: StoreListing[]; author: { slug: string; display_name: string; followers_count?: number } }>("by-author", { author, ...opts });
  },
  listCollections(opts: { owner?: string; limit?: number } = {}) {
    return getJson<{ items: StoreCollection[] }>("collections", opts);
  },
  getCollection(opts: { id?: string; owner?: string; slug?: string }) {
    return getJson<StoreCollection>("collection", opts);
  },
};
