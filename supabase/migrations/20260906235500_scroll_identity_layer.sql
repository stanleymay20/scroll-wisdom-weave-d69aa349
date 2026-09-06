-- Scroll identity layer: a richer canonical identity above external identifiers.
--
-- IMPORTANT: SLW/SLE/SLP identifiers are ScrollLibrary identifiers. They are NOT
-- ISBNs and must never be represented as ISBNs. ISBN remains an external product
-- identifier governed by ISO 2108 / the ISBN registration system.

ALTER TABLE public.works
  ADD COLUMN IF NOT EXISTS scroll_work_id text;

ALTER TABLE public.publications
  ADD COLUMN IF NOT EXISTS scroll_edition_id text;

UPDATE public.works
SET scroll_work_id = 'SLW-' || upper(replace(gen_random_uuid()::text, '-', ''))
WHERE scroll_work_id IS NULL;

UPDATE public.publications
SET scroll_edition_id = 'SLE-' || upper(replace(gen_random_uuid()::text, '-', ''))
WHERE scroll_edition_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS works_scroll_work_id_unique
  ON public.works(scroll_work_id);
CREATE UNIQUE INDEX IF NOT EXISTS publications_scroll_edition_id_unique
  ON public.publications(scroll_edition_id);

ALTER TABLE public.works
  ALTER COLUMN scroll_work_id SET DEFAULT ('SLW-' || upper(replace(gen_random_uuid()::text, '-', ''))),
  ALTER COLUMN scroll_work_id SET NOT NULL;

ALTER TABLE public.publications
  ALTER COLUMN scroll_edition_id SET DEFAULT ('SLE-' || upper(replace(gen_random_uuid()::text, '-', ''))),
  ALTER COLUMN scroll_edition_id SET NOT NULL;

CREATE OR REPLACE FUNCTION public.tg_protect_scroll_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_TABLE_NAME = 'works' AND NEW.scroll_work_id IS DISTINCT FROM OLD.scroll_work_id THEN
    RAISE EXCEPTION 'SCROLL_WORK_ID_IMMUTABLE' USING ERRCODE = '22023';
  END IF;
  IF TG_TABLE_NAME = 'publications' AND NEW.scroll_edition_id IS DISTINCT FROM OLD.scroll_edition_id THEN
    RAISE EXCEPTION 'SCROLL_EDITION_ID_IMMUTABLE' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_works_scroll_identity_immutable ON public.works;
CREATE TRIGGER trg_works_scroll_identity_immutable
BEFORE UPDATE ON public.works
FOR EACH ROW EXECUTE FUNCTION public.tg_protect_scroll_identity();

DROP TRIGGER IF EXISTS trg_publications_scroll_identity_immutable ON public.publications;
CREATE TRIGGER trg_publications_scroll_identity_immutable
BEFORE UPDATE ON public.publications
FOR EACH ROW EXECUTE FUNCTION public.tg_protect_scroll_identity();

REVOKE ALL ON FUNCTION public.tg_protect_scroll_identity() FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.publication_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_id uuid NOT NULL REFERENCES public.publications(id) ON DELETE RESTRICT,
  work_id uuid NOT NULL REFERENCES public.works(id) ON DELETE RESTRICT,
  book_id uuid REFERENCES public.books(id) ON DELETE SET NULL,
  product_form text NOT NULL CHECK (product_form IN ('paperback','hardcover','epub','pdf','audiobook')),
  scroll_product_id text NOT NULL DEFAULT ('SLP-' || upper(replace(gen_random_uuid()::text, '-', ''))),
  isbn_assignment_id uuid REFERENCES public.book_isbn_assignments(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT publication_products_publication_form_unique UNIQUE (publication_id, product_form),
  CONSTRAINT publication_products_scroll_product_id_unique UNIQUE (scroll_product_id),
  CONSTRAINT publication_products_isbn_assignment_unique UNIQUE (isbn_assignment_id)
);

CREATE INDEX IF NOT EXISTS publication_products_work_idx
  ON public.publication_products(work_id);
CREATE INDEX IF NOT EXISTS publication_products_book_idx
  ON public.publication_products(book_id);

ALTER TABLE public.publication_products ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.publication_products FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.publication_products TO anon, authenticated;
GRANT ALL ON public.publication_products TO service_role;

DROP POLICY IF EXISTS publication_products_public_read ON public.publication_products;
CREATE POLICY publication_products_public_read
ON public.publication_products FOR SELECT
TO anon, authenticated
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
      AND w.created_by = auth.uid()
  )
);

CREATE TABLE IF NOT EXISTS public.publication_external_identifiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.publication_products(id) ON DELETE RESTRICT,
  scheme text NOT NULL,
  value text NOT NULL,
  authority text,
  source text,
  authoritative boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT publication_external_identifier_value_unique UNIQUE (scheme, value),
  CONSTRAINT publication_external_identifier_product_unique UNIQUE (product_id, scheme, value),
  CONSTRAINT publication_external_identifier_scheme_check CHECK (scheme ~ '^[A-Z0-9][A-Z0-9._:-]{1,31}$')
);

CREATE INDEX IF NOT EXISTS publication_external_identifiers_product_idx
  ON public.publication_external_identifiers(product_id);

ALTER TABLE public.publication_external_identifiers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.publication_external_identifiers FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.publication_external_identifiers TO anon, authenticated;
GRANT ALL ON public.publication_external_identifiers TO service_role;

DROP POLICY IF EXISTS publication_external_identifiers_public_read ON public.publication_external_identifiers;
CREATE POLICY publication_external_identifiers_public_read
ON public.publication_external_identifiers FOR SELECT
TO anon, authenticated
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
      AND w.created_by = auth.uid()
  )
);

CREATE OR REPLACE FUNCTION public.materialize_scroll_publication_identity(p_publication_id uuid)
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
  SELECT * INTO v_publication
  FROM public.publications
  WHERE id = p_publication_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'PUBLICATION_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  IF v_publication.status NOT IN ('approved', 'published') THEN
    RAISE EXCEPTION 'PUBLICATION_NOT_MATERIALIZABLE' USING ERRCODE = '22023';
  END IF;

  v_snapshot := COALESCE(v_publication.snapshot, '{}'::jsonb);

  FOR v_identifier IN
    SELECT value
    FROM jsonb_array_elements(COALESCE(v_snapshot->'identifiers', '[]'::jsonb))
  LOOP
    IF v_identifier->>'scheme' = 'ISBN-13' THEN
      v_form := v_identifier->>'product_form';
      IF v_form IS NULL OR v_form NOT IN ('paperback','hardcover','epub','pdf','audiobook') THEN
        CONTINUE;
      END IF;

      SELECT id INTO v_assignment_id
      FROM public.book_isbn_assignments
      WHERE book_id = v_publication.book_id
        AND locked_publication_id = v_publication.id
        AND product_form = v_form
      ORDER BY assigned_at DESC, id DESC
      LIMIT 1;

      INSERT INTO public.publication_products(
        publication_id, work_id, book_id, product_form, isbn_assignment_id
      ) VALUES (
        v_publication.id, v_publication.work_id, v_publication.book_id, v_form, v_assignment_id
      )
      ON CONFLICT (publication_id, product_form)
      DO UPDATE SET isbn_assignment_id = COALESCE(public.publication_products.isbn_assignment_id, EXCLUDED.isbn_assignment_id)
      RETURNING id INTO v_product_id;

      INSERT INTO public.publication_external_identifiers(
        product_id, scheme, value, authority, source, authoritative
      ) VALUES (
        v_product_id,
        'ISBN-13',
        regexp_replace(v_identifier->>'value', '[^0-9]', '', 'g'),
        'International ISBN system',
        v_identifier->>'source',
        true
      )
      ON CONFLICT (scheme, value) DO NOTHING;
    END IF;
  END LOOP;

  IF v_snapshot->>'print_identifier_strategy' = 'kdp_free' THEN
    INSERT INTO public.publication_products(publication_id, work_id, book_id, product_form)
    VALUES (v_publication.id, v_publication.work_id, v_publication.book_id, 'paperback')
    ON CONFLICT (publication_id, product_form) DO NOTHING;
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'scroll_product_id', pp.scroll_product_id,
    'product_form', pp.product_form,
    'isbn', pei.value
  ) ORDER BY pp.product_form), '[]'::jsonb)
  INTO v_products
  FROM public.publication_products pp
  LEFT JOIN public.publication_external_identifiers pei
    ON pei.product_id = pp.id AND pei.scheme = 'ISBN-13'
  WHERE pp.publication_id = v_publication.id;

  RETURN jsonb_build_object(
    'scroll_work_id', (SELECT scroll_work_id FROM public.works WHERE id = v_publication.work_id),
    'scroll_edition_id', v_publication.scroll_edition_id,
    'products', v_products
  );
END;
$$;

REVOKE ALL ON FUNCTION public.materialize_scroll_publication_identity(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.materialize_scroll_publication_identity(uuid)
  TO service_role;

COMMENT ON COLUMN public.works.scroll_work_id IS
  'ScrollLibrary Work ID (SLW). Proprietary canonical work identifier; not an ISBN.';
COMMENT ON COLUMN public.publications.scroll_edition_id IS
  'ScrollLibrary Edition ID (SLE). Proprietary canonical published-edition identifier; not an ISBN.';
COMMENT ON COLUMN public.publication_products.scroll_product_id IS
  'ScrollLibrary Product ID (SLP) for a specific publication manifestation; external identifiers such as ISBN map to this record.';
COMMENT ON TABLE public.publication_external_identifiers IS
  'External identifier mappings for ScrollLibrary products. Scheme authority remains external (e.g. ISBN is governed by the ISBN system).';
