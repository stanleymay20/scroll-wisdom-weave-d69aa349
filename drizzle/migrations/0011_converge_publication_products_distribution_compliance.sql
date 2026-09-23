-- Lovable Test convergence Phase 6: Scroll product identity, distribution
-- metadata, and Germany publication-compliance declarations.
--
-- Forward-only/idempotent final-state definitions. Existing Scroll IDs are
-- preserved; only NULL legacy identities receive generated IDs.

ALTER TABLE public.works
  ADD COLUMN IF NOT EXISTS scroll_work_id text;

ALTER TABLE public.publications
  ADD COLUMN IF NOT EXISTS scroll_edition_id text;

UPDATE public.works
SET scroll_work_id = 'SLW-' || pg_catalog.upper(pg_catalog.replace(gen_random_uuid()::text, '-', ''))
WHERE scroll_work_id IS NULL;

UPDATE public.publications
SET scroll_edition_id = 'SLE-' || pg_catalog.upper(pg_catalog.replace(gen_random_uuid()::text, '-', ''))
WHERE scroll_edition_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS works_scroll_work_id_unique
  ON public.works(scroll_work_id);
CREATE UNIQUE INDEX IF NOT EXISTS publications_scroll_edition_id_unique
  ON public.publications(scroll_edition_id);

ALTER TABLE public.works
  ALTER COLUMN scroll_work_id
    SET DEFAULT ('SLW-' || pg_catalog.upper(pg_catalog.replace(gen_random_uuid()::text, '-', ''))),
  ALTER COLUMN scroll_work_id SET NOT NULL;

ALTER TABLE public.publications
  ALTER COLUMN scroll_edition_id
    SET DEFAULT ('SLE-' || pg_catalog.upper(pg_catalog.replace(gen_random_uuid()::text, '-', ''))),
  ALTER COLUMN scroll_edition_id SET NOT NULL;

CREATE OR REPLACE FUNCTION public.tg_protect_scroll_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS '
BEGIN
  IF TG_TABLE_NAME = ''works'' THEN
    IF NEW.scroll_work_id IS DISTINCT FROM OLD.scroll_work_id THEN
      RAISE EXCEPTION ''SCROLL_WORK_ID_IMMUTABLE'' USING ERRCODE = ''22023'';
    END IF;
  ELSIF TG_TABLE_NAME = ''publications'' THEN
    IF NEW.scroll_edition_id IS DISTINCT FROM OLD.scroll_edition_id THEN
      RAISE EXCEPTION ''SCROLL_EDITION_ID_IMMUTABLE'' USING ERRCODE = ''22023'';
    END IF;
  ELSE
    RAISE EXCEPTION ''SCROLL_IDENTITY_TRIGGER_UNEXPECTED_TABLE:%'', TG_TABLE_NAME
      USING ERRCODE = ''22023'';
  END IF;

  RETURN NEW;
END;
';

REVOKE ALL ON FUNCTION public.tg_protect_scroll_identity()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_works_scroll_identity_immutable ON public.works;
CREATE TRIGGER trg_works_scroll_identity_immutable
BEFORE UPDATE ON public.works
FOR EACH ROW EXECUTE FUNCTION public.tg_protect_scroll_identity();

DROP TRIGGER IF EXISTS trg_publications_scroll_identity_immutable
  ON public.publications;
CREATE TRIGGER trg_publications_scroll_identity_immutable
BEFORE UPDATE ON public.publications
FOR EACH ROW EXECUTE FUNCTION public.tg_protect_scroll_identity();

CREATE TABLE IF NOT EXISTS public.publication_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_id uuid NOT NULL REFERENCES public.publications(id) ON DELETE RESTRICT,
  work_id uuid NOT NULL REFERENCES public.works(id) ON DELETE RESTRICT,
  book_id uuid REFERENCES public.books(id) ON DELETE SET NULL,
  product_form text NOT NULL
    CHECK (product_form IN ('paperback','hardcover','epub','pdf','audiobook')),
  scroll_product_id text NOT NULL
    DEFAULT ('SLP-' || pg_catalog.upper(pg_catalog.replace(gen_random_uuid()::text, '-', ''))),
  isbn_assignment_id uuid
    REFERENCES public.book_isbn_assignments(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT publication_products_publication_form_unique
    UNIQUE (publication_id, product_form),
  CONSTRAINT publication_products_scroll_product_id_unique
    UNIQUE (scroll_product_id),
  CONSTRAINT publication_products_isbn_assignment_unique
    UNIQUE (isbn_assignment_id)
);

CREATE INDEX IF NOT EXISTS publication_products_work_idx
  ON public.publication_products(work_id);
CREATE INDEX IF NOT EXISTS publication_products_book_idx
  ON public.publication_products(book_id);

ALTER TABLE public.publication_products ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.publication_products
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.publication_products TO anon, authenticated;
GRANT ALL ON TABLE public.publication_products TO service_role;

DROP POLICY IF EXISTS publication_products_public_read
  ON public.publication_products;
CREATE POLICY publication_products_public_read
ON public.publication_products
FOR SELECT TO anon, authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.publications p
    WHERE p.id = publication_products.publication_id
      AND p.status = 'published'
  )
  OR EXISTS (
    SELECT 1
    FROM public.works w
    WHERE w.id = publication_products.work_id
      AND w.created_by = (SELECT auth.uid())
  )
);

CREATE TABLE IF NOT EXISTS public.publication_external_identifiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL
    REFERENCES public.publication_products(id) ON DELETE RESTRICT,
  scheme text NOT NULL,
  value text NOT NULL,
  authority text,
  source text,
  authoritative boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT publication_external_identifier_value_unique
    UNIQUE (scheme, value),
  CONSTRAINT publication_external_identifier_product_unique
    UNIQUE (product_id, scheme, value),
  CONSTRAINT publication_external_identifier_scheme_check
    CHECK (scheme ~ '^[A-Z0-9][A-Z0-9._:-]{1,31}$')
);

CREATE INDEX IF NOT EXISTS publication_external_identifiers_product_idx
  ON public.publication_external_identifiers(product_id);

ALTER TABLE public.publication_external_identifiers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.publication_external_identifiers
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.publication_external_identifiers
  TO anon, authenticated;
GRANT ALL ON TABLE public.publication_external_identifiers TO service_role;

DROP POLICY IF EXISTS publication_external_identifiers_public_read
  ON public.publication_external_identifiers;
CREATE POLICY publication_external_identifiers_public_read
ON public.publication_external_identifiers
FOR SELECT TO anon, authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.publication_products pp
    JOIN public.publications p ON p.id = pp.publication_id
    WHERE pp.id = publication_external_identifiers.product_id
      AND p.status = 'published'
  )
  OR EXISTS (
    SELECT 1
    FROM public.publication_products pp
    JOIN public.works w ON w.id = pp.work_id
    WHERE pp.id = publication_external_identifiers.product_id
      AND w.created_by = (SELECT auth.uid())
  )
);

CREATE OR REPLACE FUNCTION public.materialize_scroll_publication_identity(
  p_publication_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_publication public.publications%ROWTYPE;
  v_snapshot jsonb;
  v_identifier jsonb;
  v_form text;
  v_product_id uuid;
  v_assignment_id uuid;
  v_products jsonb := '[]'::jsonb;
BEGIN
  SELECT *
  INTO v_publication
  FROM public.publications
  WHERE id = p_publication_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PUBLICATION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF v_publication.status NOT IN ('approved','published') THEN
    RAISE EXCEPTION 'PUBLICATION_NOT_MATERIALIZABLE' USING ERRCODE = '22023';
  END IF;

  v_snapshot := COALESCE(v_publication.snapshot, '{}'::jsonb);

  FOR v_identifier IN
    SELECT value
    FROM pg_catalog.jsonb_array_elements(
      COALESCE(v_snapshot->'identifiers', '[]'::jsonb)
    )
  LOOP
    IF v_identifier->>'scheme' = 'ISBN-13' THEN
      v_form := v_identifier->>'product_form';
      IF v_form IS NULL
         OR v_form NOT IN ('paperback','hardcover','epub','pdf','audiobook') THEN
        CONTINUE;
      END IF;

      SELECT id
      INTO v_assignment_id
      FROM public.book_isbn_assignments
      WHERE book_id = v_publication.book_id
        AND locked_publication_id = v_publication.id
        AND product_form = v_form
      ORDER BY assigned_at DESC, id DESC
      LIMIT 1;

      INSERT INTO public.publication_products(
        publication_id,
        work_id,
        book_id,
        product_form,
        isbn_assignment_id
      )
      VALUES(
        v_publication.id,
        v_publication.work_id,
        v_publication.book_id,
        v_form,
        v_assignment_id
      )
      ON CONFLICT (publication_id, product_form)
      DO UPDATE
      SET isbn_assignment_id = COALESCE(
        public.publication_products.isbn_assignment_id,
        EXCLUDED.isbn_assignment_id
      )
      RETURNING id INTO v_product_id;

      INSERT INTO public.publication_external_identifiers(
        product_id,
        scheme,
        value,
        authority,
        source,
        authoritative
      )
      VALUES(
        v_product_id,
        'ISBN-13',
        pg_catalog.regexp_replace(
          v_identifier->>'value',
          '[^0-9]',
          '',
          'g'
        ),
        'International ISBN system',
        v_identifier->>'source',
        true
      )
      ON CONFLICT (scheme, value) DO NOTHING;
    END IF;
  END LOOP;

  IF v_snapshot->>'print_identifier_strategy' = 'kdp_free' THEN
    INSERT INTO public.publication_products(
      publication_id, work_id, book_id, product_form
    )
    VALUES(
      v_publication.id,
      v_publication.work_id,
      v_publication.book_id,
      'paperback'
    )
    ON CONFLICT (publication_id, product_form) DO NOTHING;
  END IF;

  SELECT COALESCE(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'scroll_product_id', pp.scroll_product_id,
        'product_form', pp.product_form,
        'isbn', pei.value
      )
      ORDER BY pp.product_form
    ),
    '[]'::jsonb
  )
  INTO v_products
  FROM public.publication_products pp
  LEFT JOIN public.publication_external_identifiers pei
    ON pei.product_id = pp.id
   AND pei.scheme = 'ISBN-13'
  WHERE pp.publication_id = v_publication.id;

  RETURN pg_catalog.jsonb_build_object(
    'scroll_work_id',
      (SELECT scroll_work_id
       FROM public.works
       WHERE id = v_publication.work_id),
    'scroll_edition_id', v_publication.scroll_edition_id,
    'products', v_products
  );
END;
$$;

REVOKE ALL ON FUNCTION public.materialize_scroll_publication_identity(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.materialize_scroll_publication_identity(uuid)
  TO service_role;

CREATE TABLE IF NOT EXISTS public.book_distribution_metadata (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_form text NOT NULL
    CHECK (product_form IN ('paperback','hardcover','epub')),
  language text NOT NULL DEFAULT 'en',
  edition_label text NOT NULL DEFAULT 'First edition',
  publication_date date,
  warengruppe_code text
    CHECK (warengruppe_code IS NULL OR warengruppe_code ~ '^[0-9]{4}$'),
  product_availability text
    CHECK (
      product_availability IS NULL
      OR product_availability ~ '^[0-9]{2}$'
    ),
  publishing_status text
    CHECK (publishing_status IS NULL OR publishing_status ~ '^[0-9]{2}$'),
  price_type text
    CHECK (price_type IS NULL OR price_type IN ('02','04','12','14')),
  price_cents integer CHECK (price_cents IS NULL OR price_cents >= 0),
  currency text NOT NULL DEFAULT 'EUR' CHECK (currency ~ '^[A-Z]{3}$'),
  price_country text NOT NULL DEFAULT 'DE' CHECK (price_country ~ '^[A-Z]{2}$'),
  tax_rate_code text CHECK (tax_rate_code IS NULL OR tax_rate_code IN ('R','S')),
  tax_rate_percent numeric(6,3)
    CHECK (
      tax_rate_percent IS NULL
      OR (tax_rate_percent >= 0 AND tax_rate_percent <= 100)
    ),
  unpriced_item_type text
    CHECK (unpriced_item_type IS NULL OR unpriced_item_type IN ('01','02')),
  thema_codes text[] NOT NULL DEFAULT ARRAY[]::text[],
  keywords text[] NOT NULL DEFAULT ARRAY[]::text[],
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT book_distribution_metadata_identity_uq
    UNIQUE(book_id, product_form, language, edition_label),
  CONSTRAINT book_distribution_metadata_price_shape
    CHECK (
      (price_cents IS NULL AND price_type IS NULL)
      OR (price_cents IS NOT NULL AND price_type IS NOT NULL)
    ),
  CONSTRAINT book_distribution_metadata_priced_or_unpriced
    CHECK (NOT(price_cents IS NOT NULL AND unpriced_item_type IS NOT NULL))
);

ALTER TABLE public.book_distribution_metadata ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.book_distribution_metadata
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.book_distribution_metadata TO authenticated;
GRANT ALL ON TABLE public.book_distribution_metadata TO service_role;

DROP POLICY IF EXISTS book_distribution_metadata_read
  ON public.book_distribution_metadata;
CREATE POLICY book_distribution_metadata_read
ON public.book_distribution_metadata
FOR SELECT TO authenticated
USING (
  owner_user_id = (SELECT auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.books b
    WHERE b.id = book_distribution_metadata.book_id
      AND (
        b.user_id = (SELECT auth.uid())
        OR b.creator_id = (SELECT auth.uid())
      )
  )
);

DROP TRIGGER IF EXISTS trg_book_distribution_metadata_updated_at
  ON public.book_distribution_metadata;
CREATE TRIGGER trg_book_distribution_metadata_updated_at
BEFORE UPDATE ON public.book_distribution_metadata
FOR EACH ROW EXECUTE FUNCTION public.touch_publishing_identity_updated_at();

CREATE TABLE IF NOT EXISTS public.publication_compliance_declarations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  jurisdiction text NOT NULL DEFAULT 'DE'
    CHECK (jurisdiction ~ '^[A-Z]{2}$'),
  product_form text NOT NULL
    CHECK (product_form IN ('paperback','hardcover','epub')),
  language text NOT NULL DEFAULT 'en',
  edition_label text NOT NULL DEFAULT 'First edition',
  german_market_intended boolean NOT NULL DEFAULT true,
  commercial_release boolean NOT NULL DEFAULT true,
  publisher_state_code text
    CHECK (
      publisher_state_code IS NULL
      OR publisher_state_code ~ '^[A-Z]{2}$'
    ),
  publisher_operating_basis_confirmed boolean NOT NULL DEFAULT false,
  imprint_notice_confirmed boolean NOT NULL DEFAULT false,
  dnb_deposit_plan_confirmed boolean NOT NULL DEFAULT false,
  state_deposit_plan_confirmed boolean NOT NULL DEFAULT false,
  distribution_started_at timestamptz,
  dnb_deposit_completed_at timestamptz,
  state_deposit_completed_at timestamptz,
  deposit_evidence_reference text
    CHECK (
      deposit_evidence_reference IS NULL
      OR pg_catalog.length(deposit_evidence_reference) <= 1000
    ),
  direct_sales_enabled boolean NOT NULL DEFAULT false,
  direct_sales_legal_notice_confirmed boolean NOT NULL DEFAULT false,
  packaging_responsibility text NOT NULL DEFAULT 'not_applicable'
    CHECK (
      packaging_responsibility IN (
        'not_applicable','third_party_confirmed','publisher_responsible'
      )
    ),
  lucid_status text NOT NULL DEFAULT 'not_applicable'
    CHECK (
      lucid_status IN ('not_applicable','registered','required_missing')
    ),
  notes text
    CHECK (notes IS NULL OR pg_catalog.length(notes) <= 4000),
  acknowledged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT publication_compliance_identity_uq
    UNIQUE(book_id, jurisdiction, product_form, language, edition_label),
  CONSTRAINT publication_compliance_lucid_shape
    CHECK (
      (
        packaging_responsibility = 'publisher_responsible'
        AND lucid_status IN ('registered','required_missing')
      )
      OR (
        packaging_responsibility <> 'publisher_responsible'
        AND lucid_status = 'not_applicable'
      )
    ),
  CONSTRAINT publication_compliance_direct_sales_shape
    CHECK (
      direct_sales_enabled
      OR direct_sales_legal_notice_confirmed = false
    )
);

CREATE INDEX IF NOT EXISTS publication_compliance_book_idx
  ON public.publication_compliance_declarations(
    book_id, product_form, jurisdiction
  );

ALTER TABLE public.publication_compliance_declarations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.publication_compliance_declarations
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.publication_compliance_declarations
  TO authenticated;
GRANT ALL ON TABLE public.publication_compliance_declarations TO service_role;

DROP POLICY IF EXISTS publication_compliance_owner_read
  ON public.publication_compliance_declarations;
CREATE POLICY publication_compliance_owner_read
ON public.publication_compliance_declarations
FOR SELECT TO authenticated
USING (
  owner_user_id = (SELECT auth.uid())
  AND EXISTS (
    SELECT 1
    FROM public.books b
    WHERE b.id = publication_compliance_declarations.book_id
      AND (
        b.user_id = (SELECT auth.uid())
        OR b.creator_id = (SELECT auth.uid())
      )
  )
);

DROP TRIGGER IF EXISTS trg_publication_compliance_updated_at
  ON public.publication_compliance_declarations;
CREATE TRIGGER trg_publication_compliance_updated_at
BEFORE UPDATE ON public.publication_compliance_declarations
FOR EACH ROW EXECUTE FUNCTION public.touch_publishing_identity_updated_at();

CREATE OR REPLACE FUNCTION public.preserve_publication_compliance_audit_facts()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.distribution_started_at IS NOT NULL
     AND NEW.distribution_started_at IS NULL THEN
    NEW.distribution_started_at := OLD.distribution_started_at;
  END IF;

  IF OLD.dnb_deposit_completed_at IS NOT NULL
     AND NEW.dnb_deposit_completed_at IS NULL THEN
    NEW.dnb_deposit_completed_at := OLD.dnb_deposit_completed_at;
  END IF;

  IF OLD.state_deposit_completed_at IS NOT NULL
     AND NEW.state_deposit_completed_at IS NULL THEN
    NEW.state_deposit_completed_at := OLD.state_deposit_completed_at;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.preserve_publication_compliance_audit_facts()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_preserve_publication_compliance_audit_facts
  ON public.publication_compliance_declarations;
CREATE TRIGGER trg_preserve_publication_compliance_audit_facts
BEFORE UPDATE ON public.publication_compliance_declarations
FOR EACH ROW EXECUTE FUNCTION public.preserve_publication_compliance_audit_facts();

REVOKE INSERT, UPDATE, DELETE
ON TABLE public.publication_compliance_declarations
FROM PUBLIC, anon, authenticated;
