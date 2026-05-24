-- Expand allowed bundle types
ALTER TABLE public.export_jobs DROP CONSTRAINT IF EXISTS export_jobs_bundle_type_check;
ALTER TABLE public.export_jobs ADD CONSTRAINT export_jobs_bundle_type_check
  CHECK (bundle_type = ANY (ARRAY['kdp'::text, 'gumroad'::text, 'substack'::text, 'patreon'::text, 'etsy'::text]));

-- ============================================================
-- external_publications — immutable ledger of where a book was
-- published externally (KDP, Gumroad, Substack, Patreon, Etsy…).
-- Authors mark this themselves after uploading the bundle.
-- ============================================================
CREATE TABLE IF NOT EXISTS public.external_publications (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL,
  book_id          uuid NOT NULL,
  platform         text NOT NULL,
  external_url     text,
  external_id      text,
  status           text NOT NULL DEFAULT 'live',
  notes            text,
  published_at     timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT external_publications_platform_check
    CHECK (platform = ANY (ARRAY['kdp','gumroad','substack','patreon','etsy','other'])),
  CONSTRAINT external_publications_status_check
    CHECK (status = ANY (ARRAY['live','draft','removed']))
);

CREATE INDEX IF NOT EXISTS idx_external_publications_user
  ON public.external_publications (user_id, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_external_publications_book
  ON public.external_publications (book_id, published_at DESC);

ALTER TABLE public.external_publications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own external publications"
  ON public.external_publications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own external publications"
  ON public.external_publications FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own external publications status"
  ON public.external_publications FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins view all external publications"
  ON public.external_publications FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));