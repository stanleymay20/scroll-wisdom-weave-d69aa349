
-- 1. book_reviews
CREATE TABLE public.book_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  listing_id uuid REFERENCES public.public_listings(id) ON DELETE SET NULL,
  user_id uuid NOT NULL,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body text,
  helpful_count integer NOT NULL DEFAULT 0,
  edited_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (book_id, user_id)
);

CREATE INDEX idx_book_reviews_book ON public.book_reviews(book_id);
CREATE INDEX idx_book_reviews_listing ON public.book_reviews(listing_id);
CREATE INDEX idx_book_reviews_user ON public.book_reviews(user_id);

GRANT SELECT ON public.book_reviews TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.book_reviews TO authenticated;
GRANT ALL ON public.book_reviews TO service_role;

ALTER TABLE public.book_reviews ENABLE ROW LEVEL SECURITY;

-- Entitlement helper: must own a paid purchase OR a library entry, and not be the author.
CREATE OR REPLACE FUNCTION public.user_can_review_book(_user_id uuid, _book_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _user_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.books b
      WHERE b.id = _book_id AND b.user_id = _user_id
    )
    AND (
      EXISTS (
        SELECT 1 FROM public.book_purchases bp
        WHERE bp.book_id = _book_id
          AND bp.buyer_user_id = _user_id
          AND bp.status = 'paid'
      )
      OR EXISTS (
        SELECT 1 FROM public.user_library ul
        WHERE ul.book_id = _book_id AND ul.user_id = _user_id
      )
    );
$$;

GRANT EXECUTE ON FUNCTION public.user_can_review_book(uuid, uuid) TO authenticated, anon;

-- RLS policies
CREATE POLICY "Reviews are publicly readable for public listings"
ON public.book_reviews FOR SELECT
USING (
  listing_id IS NULL
  OR EXISTS (
    SELECT 1 FROM public.public_listings pl
    WHERE pl.id = book_reviews.listing_id AND pl.is_public = true
  )
  OR auth.uid() = user_id
);

CREATE POLICY "Entitled non-authors can insert their own review"
ON public.book_reviews FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND public.user_can_review_book(auth.uid(), book_id)
);

CREATE POLICY "Users can update their own review"
ON public.book_reviews FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own review"
ON public.book_reviews FOR DELETE
TO authenticated
USING (user_id = auth.uid());

-- Bump edited_at + updated_at on edits
CREATE OR REPLACE FUNCTION public.book_reviews_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  IF TG_OP = 'UPDATE' AND (NEW.rating IS DISTINCT FROM OLD.rating OR NEW.body IS DISTINCT FROM OLD.body) THEN
    NEW.edited_at := now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER book_reviews_touch_trg
BEFORE UPDATE ON public.book_reviews
FOR EACH ROW EXECUTE FUNCTION public.book_reviews_touch();

-- 2. Extend get_listing_social_proof with rating_avg + rating_count.
DROP FUNCTION IF EXISTS public.get_listing_social_proof(uuid[]);
CREATE OR REPLACE FUNCTION public.get_listing_social_proof(_listing_ids uuid[])
RETURNS TABLE(
  listing_id uuid,
  readers bigint,
  downloads bigint,
  views bigint,
  followers bigint,
  rating_avg numeric,
  rating_count bigint
)
LANGUAGE sql
STABLE SECURITY DEFINER
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
  ),
  rv AS (
    SELECT br.book_id,
      ROUND(AVG(br.rating)::numeric, 2) AS rating_avg,
      COUNT(*)::bigint AS rating_count
    FROM public.book_reviews br
    WHERE br.book_id IN (SELECT book_id FROM base)
    GROUP BY br.book_id
  )
  SELECT
    base.listing_id,
    COALESCE(buys.readers, 0)   AS readers,
    COALESCE(buys.downloads, 0) AS downloads,
    COALESCE(vw.views, 0)       AS views,
    COALESCE(fol.followers, 0)  AS followers,
    rv.rating_avg,
    COALESCE(rv.rating_count, 0) AS rating_count
  FROM base
  LEFT JOIN buys ON buys.book_id        = base.book_id
  LEFT JOIN vw   ON vw.listing_id       = base.listing_id
  LEFT JOIN fol  ON fol.author_user_id  = base.author_user_id
  LEFT JOIN rv   ON rv.book_id          = base.book_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_listing_social_proof(uuid[]) TO anon, authenticated, service_role;
