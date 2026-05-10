
-- ScrollVision: evidence-grounded media retrieval cache
CREATE TABLE IF NOT EXISTS public.scrollvision_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,                  -- 'wikimedia' | 'met_museum' | 'loc' | 'nasa' | 'europeana'
  source_id text,                        -- upstream id if any
  source_url text NOT NULL,              -- canonical page url for attribution
  image_url text NOT NULL,               -- direct image url
  thumbnail_url text,
  title text,
  description text,
  license text,                          -- e.g. 'CC-BY-SA-4.0', 'Public Domain', 'CC0'
  attribution text,                      -- human-readable credit line
  entity text,                           -- detected entity this image represents
  query text,                            -- the search query used
  content_hash text UNIQUE,              -- dedupe key: sha256(source|source_id|image_url)
  width int,
  height int,
  relevance_score numeric DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sv_assets_entity ON public.scrollvision_assets(entity);
CREATE INDEX IF NOT EXISTS idx_sv_assets_source ON public.scrollvision_assets(source);
CREATE INDEX IF NOT EXISTS idx_sv_assets_query ON public.scrollvision_assets(query);

ALTER TABLE public.scrollvision_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sv_assets_authenticated_read"
  ON public.scrollvision_assets FOR SELECT
  TO authenticated USING (true);

-- writes restricted to service role implicitly (no insert/update/delete policy)

CREATE TRIGGER sv_assets_updated_at
  BEFORE UPDATE ON public.scrollvision_assets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Chapter ↔ asset linkage with placement
CREATE TABLE IF NOT EXISTS public.scrollvision_chapter_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid NOT NULL,
  chapter_id uuid NOT NULL,
  asset_id uuid NOT NULL REFERENCES public.scrollvision_assets(id) ON DELETE CASCADE,
  placement_order int NOT NULL DEFAULT 0,
  caption text,
  entity text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (chapter_id, asset_id)
);

CREATE INDEX IF NOT EXISTS idx_sv_ca_chapter ON public.scrollvision_chapter_assets(chapter_id);
CREATE INDEX IF NOT EXISTS idx_sv_ca_book ON public.scrollvision_chapter_assets(book_id);

ALTER TABLE public.scrollvision_chapter_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sv_ca_authenticated_read"
  ON public.scrollvision_chapter_assets FOR SELECT
  TO authenticated USING (true);

CREATE TRIGGER sv_ca_updated_at
  BEFORE UPDATE ON public.scrollvision_chapter_assets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
