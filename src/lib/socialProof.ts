/**
 * socialProof — batched social-proof counters for marketplace listings.
 *
 * Single source of truth: the SECURITY DEFINER RPC `get_listing_social_proof`,
 * which reads only from existing tables (book_purchases, storefront_events,
 * author_followers, public_listings, books). No mock data, no client-side
 * fabrication, no parallel counter systems.
 *
 * - Batches all listing IDs requested within a 30ms window into ONE RPC call,
 *   eliminating N+1 patterns when rails render side-by-side.
 * - In-memory TTL cache (60s) absorbs repeat lookups on the same page.
 */
import { supabase } from "@/integrations/supabase/client";

export interface SocialProof {
  listing_id: string;
  readers: number;
  downloads: number;
  views: number;
  followers: number;
  /** Reserved for Reviews & Ratings — extends the same RPC additively. */
  rating_avg?: number;
  rating_count?: number;
}

const CACHE_TTL_MS = 60_000;
const BATCH_WINDOW_MS = 30;

const cache = new Map<string, { value: SocialProof; expires: number }>();
let pendingIds = new Set<string>();
let pendingResolvers: ((map: Map<string, SocialProof>) => void)[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

async function flush() {
  flushTimer = null;
  const ids = Array.from(pendingIds);
  const resolvers = pendingResolvers;
  pendingIds = new Set();
  pendingResolvers = [];
  if (ids.length === 0) {
    resolvers.forEach((r) => r(new Map()));
    return;
  }

  const map = new Map<string, SocialProof>();
  try {
    const { data, error } = await supabase.rpc("get_listing_social_proof" as never, {
      _listing_ids: ids,
    } as never);
    if (error) throw error;
    const rows = (data ?? []) as Array<{
      listing_id: string;
      readers: number | string;
      downloads: number | string;
      views: number | string;
      followers: number | string;
    }>;
    const now = Date.now();
    for (const r of rows) {
      const entry: SocialProof = {
        listing_id: r.listing_id,
        readers: Number(r.readers ?? 0),
        downloads: Number(r.downloads ?? 0),
        views: Number(r.views ?? 0),
        followers: Number(r.followers ?? 0),
      };
      map.set(entry.listing_id, entry);
      cache.set(entry.listing_id, { value: entry, expires: now + CACHE_TTL_MS });
    }
  } catch {
    // Fail closed — no fabricated values. Callers render nothing.
  }
  resolvers.forEach((r) => r(map));
}

/** Fetch social proof for one or many listings, batched + cached. */
export async function fetchSocialProof(listingIds: string[]): Promise<Map<string, SocialProof>> {
  const out = new Map<string, SocialProof>();
  const now = Date.now();
  const need: string[] = [];
  for (const id of listingIds) {
    if (!id) continue;
    const hit = cache.get(id);
    if (hit && hit.expires > now) {
      out.set(id, hit.value);
    } else {
      need.push(id);
    }
  }
  if (need.length === 0) return out;

  const result = await new Promise<Map<string, SocialProof>>((resolve) => {
    need.forEach((id) => pendingIds.add(id));
    pendingResolvers.push(resolve);
    if (!flushTimer) flushTimer = setTimeout(flush, BATCH_WINDOW_MS);
  });
  result.forEach((v, k) => out.set(k, v));
  return out;
}

/** Convenience: single-listing variant. */
export async function fetchSocialProofOne(listingId: string): Promise<SocialProof | null> {
  const m = await fetchSocialProof([listingId]);
  return m.get(listingId) ?? null;
}

/** Format counts compactly: 12 → "12", 1245 → "1.2K", 89000 → "89K". */
export function formatCount(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "0";
  if (n < 1000) return n.toLocaleString();
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, "")}K`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}
