
-- =============================================================================
-- Author Revenue OS — M1
-- Backfill-only. book_purchases remains source of truth for books.
-- =============================================================================

-- 1) creator_assets ----------------------------------------------------------
CREATE TABLE public.creator_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  asset_type text NOT NULL,
  source_book_id uuid REFERENCES public.books(id) ON DELETE CASCADE,
  title text NOT NULL,
  slug text,
  summary text,
  cover_url text,
  category text,
  price_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'usd',
  pricing_model text NOT NULL DEFAULT 'one_time',
  stripe_price_id text,
  status text NOT NULL DEFAULT 'draft',
  display_order integer NOT NULL DEFAULT 0,
  funnel_role text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT creator_assets_asset_type_check CHECK (asset_type IN (
    'book','audiobook','workbook','template','prompt_pack','research_pack',
    'checklist','guide','course','coaching','consulting','community',
    'membership','service','bundle'
  )),
  CONSTRAINT creator_assets_status_check CHECK (status IN (
    'draft','review','live','paused','archived'
  )),
  CONSTRAINT creator_assets_pricing_model_check CHECK (pricing_model IN (
    'one_time','subscription','booking'
  )),
  CONSTRAINT creator_assets_funnel_role_check CHECK (
    funnel_role IS NULL OR funnel_role IN ('lead_magnet','core','upsell','backend')
  ),
  CONSTRAINT creator_assets_book_link_unique UNIQUE (source_book_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.creator_assets TO authenticated;
GRANT SELECT ON public.creator_assets TO anon;
GRANT ALL    ON public.creator_assets TO service_role;

CREATE INDEX idx_creator_assets_creator  ON public.creator_assets(creator_user_id);
CREATE INDEX idx_creator_assets_type     ON public.creator_assets(asset_type);
CREATE INDEX idx_creator_assets_status   ON public.creator_assets(status);
CREATE INDEX idx_creator_assets_book     ON public.creator_assets(source_book_id) WHERE source_book_id IS NOT NULL;

ALTER TABLE public.creator_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Creators manage their own assets"
  ON public.creator_assets FOR ALL
  TO authenticated
  USING (auth.uid() = creator_user_id)
  WITH CHECK (auth.uid() = creator_user_id);

CREATE POLICY "Admins read all assets"
  ON public.creator_assets FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Public discovery: only live book-assets that also have a public listing,
-- OR live non-book assets owned by a creator (storefront UI surfaces them).
CREATE POLICY "Public reads live assets"
  ON public.creator_assets FOR SELECT
  TO anon, authenticated
  USING (
    status = 'live'
    AND (
      source_book_id IS NULL
      OR public.book_has_public_listing(source_book_id)
    )
  );

CREATE TRIGGER trg_creator_assets_updated
  BEFORE UPDATE ON public.creator_assets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) creator_asset_files -----------------------------------------------------
CREATE TABLE public.creator_asset_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES public.creator_assets(id) ON DELETE CASCADE,
  creator_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  storage_bucket text,
  storage_path text,
  external_url text,
  mime_type text,
  size_bytes bigint,
  display_order integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.creator_asset_files TO authenticated;
GRANT ALL ON public.creator_asset_files TO service_role;

CREATE INDEX idx_creator_asset_files_asset   ON public.creator_asset_files(asset_id);
CREATE INDEX idx_creator_asset_files_creator ON public.creator_asset_files(creator_user_id);

ALTER TABLE public.creator_asset_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Creators manage their own asset files"
  ON public.creator_asset_files FOR ALL
  TO authenticated
  USING (auth.uid() = creator_user_id)
  WITH CHECK (auth.uid() = creator_user_id);

CREATE POLICY "Admins read all asset files"
  ON public.creator_asset_files FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_creator_asset_files_updated
  BEFORE UPDATE ON public.creator_asset_files
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) purchases (universal) ---------------------------------------------------
CREATE TABLE public.purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  buyer_email text,
  creator_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  asset_id uuid REFERENCES public.creator_assets(id) ON DELETE SET NULL,
  asset_type_snapshot text NOT NULL,
  parent_purchase_id uuid REFERENCES public.purchases(id) ON DELETE SET NULL,
  pricing_model text NOT NULL DEFAULT 'one_time',
  amount_cents integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'usd',
  status text NOT NULL DEFAULT 'pending',
  stripe_session_id text,
  stripe_payment_intent_id text,
  stripe_subscription_id text,
  current_period_end timestamptz,
  purchased_at timestamptz,
  refunded_at timestamptz,
  source_book_purchase_id uuid REFERENCES public.book_purchases(id) ON DELETE SET NULL,
  correlation_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT purchases_status_check CHECK (status IN (
    'pending','paid','refunded','failed','canceled','expired'
  )),
  CONSTRAINT purchases_pricing_model_check CHECK (pricing_model IN (
    'one_time','subscription','booking'
  ))
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchases TO authenticated;
GRANT ALL ON public.purchases TO service_role;

CREATE UNIQUE INDEX purchases_source_book_purchase_uidx
  ON public.purchases(source_book_purchase_id)
  WHERE source_book_purchase_id IS NOT NULL;
CREATE INDEX idx_purchases_user            ON public.purchases(user_id, status);
CREATE INDEX idx_purchases_creator         ON public.purchases(creator_user_id, status);
CREATE INDEX idx_purchases_asset           ON public.purchases(asset_id);
CREATE INDEX idx_purchases_parent          ON public.purchases(parent_purchase_id) WHERE parent_purchase_id IS NOT NULL;
CREATE INDEX idx_purchases_stripe_session  ON public.purchases(stripe_session_id) WHERE stripe_session_id IS NOT NULL;
CREATE INDEX idx_purchases_stripe_sub      ON public.purchases(stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;

ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Buyers read their own purchases"
  ON public.purchases FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Creators read purchases of their assets"
  ON public.purchases FOR SELECT
  TO authenticated
  USING (auth.uid() = creator_user_id);

CREATE POLICY "Admins read all purchases"
  ON public.purchases FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER trg_purchases_updated
  BEFORE UPDATE ON public.purchases
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) creator_business_events -------------------------------------------------
CREATE TABLE public.creator_business_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  asset_id uuid REFERENCES public.creator_assets(id) ON DELETE SET NULL,
  purchase_id uuid REFERENCES public.purchases(id) ON DELETE SET NULL,
  amount_cents integer,
  currency text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.creator_business_events TO authenticated;
GRANT ALL ON public.creator_business_events TO service_role;

CREATE INDEX idx_creator_business_events_creator_time
  ON public.creator_business_events(creator_user_id, occurred_at DESC);
CREATE INDEX idx_creator_business_events_type
  ON public.creator_business_events(event_type);

ALTER TABLE public.creator_business_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Creators read their own business events"
  ON public.creator_business_events FOR SELECT
  TO authenticated
  USING (auth.uid() = creator_user_id);

CREATE POLICY "Admins read all business events"
  ON public.creator_business_events FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Writes are server-side (service_role / edge functions). No client INSERT
-- policy is created; the GRANT on INSERT is harmless without a policy.

-- 5) public_listings.asset_id ------------------------------------------------
ALTER TABLE public.public_listings
  ADD COLUMN asset_id uuid REFERENCES public.creator_assets(id) ON DELETE SET NULL;

CREATE INDEX idx_public_listings_asset_id
  ON public.public_listings(asset_id) WHERE asset_id IS NOT NULL;

-- 6) Backfill: books → creator_assets ---------------------------------------
INSERT INTO public.creator_assets (
  creator_user_id, asset_type, source_book_id,
  title, slug, summary, cover_url, category,
  price_cents, currency, pricing_model, status,
  metadata, created_at, updated_at
)
SELECT
  b.user_id,
  'book',
  b.id,
  b.title,
  pl.slug,
  b.description,
  COALESCE(pl.cover_override_url, b.cover_image_url),
  b.category,
  COALESCE(pl.price_cents, 0),
  COALESCE(pl.currency, 'usd'),
  'one_time',
  CASE
    WHEN pl.is_public = true THEN 'live'
    WHEN b.is_published = true THEN 'review'
    ELSE 'draft'
  END,
  jsonb_build_object('backfilled_from', 'books', 'listing_id', pl.id),
  b.created_at,
  b.updated_at
FROM public.books b
LEFT JOIN public.public_listings pl ON pl.book_id = b.id
ON CONFLICT (source_book_id) DO NOTHING;

-- Link listings to their new asset rows
UPDATE public.public_listings pl
SET asset_id = ca.id
FROM public.creator_assets ca
WHERE ca.source_book_id = pl.book_id
  AND pl.asset_id IS NULL;

-- 7) Backfill: book_purchases → purchases (snapshot only) -------------------
INSERT INTO public.purchases (
  user_id, buyer_email, creator_user_id, asset_id, asset_type_snapshot,
  pricing_model, amount_cents, currency, status,
  stripe_session_id, stripe_payment_intent_id,
  purchased_at, source_book_purchase_id,
  correlation_id, metadata, created_at, updated_at
)
SELECT
  bp.buyer_user_id,
  bp.buyer_email,
  b.user_id,
  ca.id,
  'book',
  'one_time',
  bp.amount_cents,
  bp.currency,
  bp.status,
  bp.stripe_session_id,
  bp.stripe_payment_intent,
  bp.purchased_at,
  bp.id,
  bp.correlation_id,
  jsonb_build_object('backfilled_from', 'book_purchases') || COALESCE(bp.metadata, '{}'::jsonb),
  bp.created_at,
  bp.updated_at
FROM public.book_purchases bp
JOIN public.books b ON b.id = bp.book_id
LEFT JOIN public.creator_assets ca ON ca.source_book_id = bp.book_id
ON CONFLICT (source_book_purchase_id) WHERE source_book_purchase_id IS NOT NULL DO NOTHING;

-- 8) get_user_asset_entitlements --------------------------------------------
CREATE OR REPLACE FUNCTION public.get_user_asset_entitlements(_user_id uuid)
RETURNS TABLE (
  asset_id uuid,
  asset_type text,
  source text,
  expires_at timestamptz,
  purchase_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Source: creator owns the asset
  SELECT ca.id, ca.asset_type, 'creator_owned'::text, NULL::timestamptz, NULL::uuid
  FROM public.creator_assets ca
  WHERE ca.creator_user_id = _user_id

  UNION ALL

  -- Source: paid one-time / booking purchase via universal table
  SELECT p.asset_id, p.asset_type_snapshot, 'purchase'::text, NULL::timestamptz, p.id
  FROM public.purchases p
  WHERE p.user_id = _user_id
    AND p.status = 'paid'
    AND p.asset_id IS NOT NULL
    AND p.pricing_model IN ('one_time','booking')

  UNION ALL

  -- Source: active subscription
  SELECT p.asset_id, p.asset_type_snapshot, 'subscription'::text, p.current_period_end, p.id
  FROM public.purchases p
  WHERE p.user_id = _user_id
    AND p.status = 'paid'
    AND p.pricing_model = 'subscription'
    AND p.asset_id IS NOT NULL
    AND (p.current_period_end IS NULL OR p.current_period_end > now())

  UNION ALL

  -- Legacy source (books only): existing book_purchases mapped via asset_id
  SELECT ca.id, ca.asset_type, 'book_purchase'::text, NULL::timestamptz, bp.id
  FROM public.book_purchases bp
  JOIN public.creator_assets ca ON ca.source_book_id = bp.book_id
  WHERE bp.buyer_user_id = _user_id
    AND bp.status = 'paid'
$$;

REVOKE EXECUTE ON FUNCTION public.get_user_asset_entitlements(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_user_asset_entitlements(uuid) TO authenticated, service_role;
