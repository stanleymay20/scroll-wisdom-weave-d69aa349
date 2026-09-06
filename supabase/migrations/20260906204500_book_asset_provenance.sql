-- Server-owned provenance ledger for publication assets that are not represented
-- by scrollvision_assets (most importantly book covers).
--
-- Rights certification must never infer permission from a URL or storage host.
-- Every certifiable cover needs an explicit provenance row for the exact asset URL.

CREATE TABLE IF NOT EXISTS public.book_asset_provenance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  asset_role text NOT NULL CHECK (asset_role IN ('cover', 'chapter_media', 'other')),
  asset_url text NOT NULL,
  source_type text NOT NULL CHECK (source_type IN ('ai_generated', 'user_upload', 'external_licensed')),
  rights_basis text NOT NULL,
  license text,
  attribution text,
  source_url text,
  provider text,
  model text,
  user_attested boolean NOT NULL DEFAULT false,
  attested_by uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (book_id, asset_role, asset_url)
);

CREATE INDEX IF NOT EXISTS idx_book_asset_provenance_book_role
  ON public.book_asset_provenance(book_id, asset_role);

ALTER TABLE public.book_asset_provenance ENABLE ROW LEVEL SECURITY;

-- This is a trust record. Browser roles may not insert/update/delete provenance.
-- All writes must come from reviewed server functions after ownership and evidence
-- checks. service_role bypasses RLS and remains the only write authority.
REVOKE ALL ON TABLE public.book_asset_provenance FROM anon, authenticated;

DROP TRIGGER IF EXISTS book_asset_provenance_updated_at ON public.book_asset_provenance;
CREATE TRIGGER book_asset_provenance_updated_at
  BEFORE UPDATE ON public.book_asset_provenance
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
