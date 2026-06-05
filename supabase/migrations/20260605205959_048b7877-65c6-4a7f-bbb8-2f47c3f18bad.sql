-- Social proof aggregation RPC — batched, single source of truth.
-- Reads only from existing tables (no new counters/materialized views).
CREATE OR REPLACE FUNCTION public.get_listing_social_proof(_listing_ids uuid[])
RETURNS TABLE(
  listing_id uuid,
  readers bigint,
  downloads bigint,
  views bigint,
  followers bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH input AS (
    SELECT DISTINCT unnest(_listing_ids) AS lid
  ),
  base AS (
    SELECT pl.id AS listing_id, pl.book_id, b.user_id AS author_user_id
    FROM public.public_listings pl
    JOIN public.books b ON b.id = pl.book_id
    WHERE pl.id IN (SELECT lid FROM input)
      AND pl.is_public = true
  ),
  buys AS (
    SELECT bp.book_id,
      COUNT(DISTINCT bp.buyer_user_id) FILTER (WHERE bp.status = 'paid')::bigint AS readers,
      COUNT(*) FILTER (WHERE bp.status = 'paid')::bigint AS downloads
    FROM public.book_purchases bp
    WHERE bp.book_id IN (SELECT book_id FROM base)
    GROUP BY bp.book_id
  ),
  vw AS (
    SELECT se.listing_id, COUNT(*)::bigint AS views
    FROM public.storefront_events se
    WHERE se.listing_id IN (SELECT listing_id FROM base)
      AND se.event_type = 'listing_view'
    GROUP BY se.listing_id
  ),
  fol AS (
    SELECT af.author_user_id, COUNT(*)::bigint AS followers
    FROM public.author_followers af
    WHERE af.author_user_id IN (SELECT author_user_id FROM base)
    GROUP BY af.author_user_id
  )
  SELECT
    base.listing_id,
    COALESCE(buys.readers, 0)   AS readers,
    COALESCE(buys.downloads, 0) AS downloads,
    COALESCE(vw.views, 0)       AS views,
    COALESCE(fol.followers, 0)  AS followers
  FROM base
  LEFT JOIN buys ON buys.book_id        = base.book_id
  LEFT JOIN vw   ON vw.listing_id       = base.listing_id
  LEFT JOIN fol  ON fol.author_user_id  = base.author_user_id;
$$;

-- Storefront is public — allow anonymous reads. No write paths exposed.
GRANT EXECUTE ON FUNCTION public.get_listing_social_proof(uuid[]) TO anon, authenticated;