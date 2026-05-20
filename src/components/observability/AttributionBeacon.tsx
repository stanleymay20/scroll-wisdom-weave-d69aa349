// Phase 2.1d.1 — Attribution beacon.
// Mount inside the router tree. Fires attribution-tag once per
// session/path combination and pings on listing/book changes so we can
// stitch a visitor → checkout funnel without breaking first-touch.

import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { tagAttribution } from "@/lib/attribution";

interface Props {
  listingId?: string | null;
  bookId?: string | null;
}

export function AttributionBeacon({ listingId = null, bookId = null }: Props) {
  const { pathname } = useLocation();
  useEffect(() => {
    // Defer slightly so it never competes with first render.
    const t = setTimeout(() => { void tagAttribution({ listing_id: listingId, book_id: bookId }); }, 50);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, listingId, bookId]);
  return null;
}

/**
 * Router-aware default beacon: mount once at the app shell to cover
 * /store, /store/:slug, /store/:slug/success, /store/:slug/read, /store/:slug/read-full.
 * Per-page mounts can still pass listing_id/book_id for richer context.
 */
export function GlobalAttributionBeacon() {
  const { pathname } = useLocation();
  const isStoreOrReader =
    pathname === "/store" ||
    pathname.startsWith("/store/") ||
    pathname.startsWith("/book/") ||
    pathname.startsWith("/read");
  useEffect(() => {
    if (!isStoreOrReader) return;
    const t = setTimeout(() => { void tagAttribution(); }, 50);
    return () => clearTimeout(t);
  }, [pathname, isStoreOrReader]);
  return null;
}
