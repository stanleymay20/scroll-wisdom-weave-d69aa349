-- Controlled commercial/distribution metadata for ONIX/VLB and other channels.
--
-- Bibliographic identity (publisher, imprint, ISBN, edition, language, product form)
-- remains in the immutable Publication snapshot / ISBN registry. Price,
-- availability and other commercial data intentionally live here so they may be
-- updated without reusing or changing an ISBN.

CREATE TABLE IF NOT EXISTS public.book_distribution_metadata (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_form text NOT NULL CHECK (product_form IN ('paperback', 'hardcover', 'epub')),
  language text NOT NULL DEFAULT 'en',
  edition_label text NOT NULL DEFAULT 'First edition',

  -- VLB mandatory commercial fields. They may be NULL while the creator is
  -- preparing a record; export-onix fails closed until the required set exists.
  publication_date date,
  warengruppe_code text CHECK (warengruppe_code IS NULL OR warengruppe_code ~ '^[0-9]{4}$'),
  product_availability text CHECK (product_availability IS NULL OR product_availability ~ '^[0-9]{2}$'),
  publishing_status text CHECK (publishing_status IS NULL OR publishing_status ~ '^[0-9]{2}$'),

  -- Do not infer German price binding. The operator must explicitly choose a
  -- price type. 02 = UVP/unbound, 04 = fixed retail price in VLB/ONIX usage.
  price_type text CHECK (price_type IS NULL OR price_type IN ('02', '04', '12', '14')),
  price_cents integer CHECK (price_cents IS NULL OR price_cents >= 0),
  currency text NOT NULL DEFAULT 'EUR' CHECK (currency ~ '^[A-Z]{3}$'),
  price_country text NOT NULL DEFAULT 'DE' CHECK (price_country ~ '^[A-Z]{2}$'),
  tax_rate_code text CHECK (tax_rate_code IS NULL OR tax_rate_code IN ('R', 'S')),
  tax_rate_percent numeric(6,3) CHECK (tax_rate_percent IS NULL OR (tax_rate_percent >= 0 AND tax_rate_percent <= 100)),
  unpriced_item_type text CHECK (unpriced_item_type IS NULL OR unpriced_item_type IN ('01', '02')),

  thema_codes text[] NOT NULL DEFAULT ARRAY[]::text[],
  keywords text[] NOT NULL DEFAULT ARRAY[]::text[],
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT book_distribution_metadata_identity_uq
    UNIQUE (book_id, product_form, language, edition_label),
  CONSTRAINT book_distribution_metadata_price_shape CHECK (
    (price_cents IS NULL AND price_type IS NULL)
    OR (price_cents IS NOT NULL AND price_type IS NOT NULL)
  ),
  CONSTRAINT book_distribution_metadata_priced_or_unpriced CHECK (
    NOT (price_cents IS NOT NULL AND unpriced_item_type IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS book_distribution_metadata_book_idx
  ON public.book_distribution_metadata(book_id, product_form);

ALTER TABLE public.book_distribution_metadata ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.book_distribution_metadata FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.book_distribution_metadata TO authenticated;
GRANT ALL ON TABLE public.book_distribution_metadata TO service_role;

DO $$ BEGIN
  CREATE POLICY "Owners can read distribution metadata"
    ON public.book_distribution_metadata
    FOR SELECT TO authenticated
    USING (
      owner_user_id = (SELECT auth.uid())
      AND EXISTS (
        SELECT 1
        FROM public.books b
        WHERE b.id = book_distribution_metadata.book_id
          AND (b.user_id = (SELECT auth.uid()) OR b.creator_id = (SELECT auth.uid()))
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_book_distribution_metadata_updated_at
  BEFORE UPDATE ON public.book_distribution_metadata
  FOR EACH ROW EXECUTE FUNCTION public.touch_publishing_identity_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Explicitly prevent browser-side commercial metadata mutation. All writes run
-- through the authenticated distribution-metadata Edge Function, which verifies
-- book ownership and uses the service role.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.book_distribution_metadata
  FROM PUBLIC, anon, authenticated;
