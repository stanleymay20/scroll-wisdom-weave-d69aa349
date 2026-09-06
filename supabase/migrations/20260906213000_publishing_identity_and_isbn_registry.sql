-- Canonical publisher/imprint + ISBN registry.
--
-- Goals:
--   * never manufacture an ISBN;
--   * never reuse one ISBN across separately sold product forms/languages/editions;
--   * keep publisher/imprint identity server-owned and freeze it at publication time;
--   * support author-owned ISBNs, a verified platform ISBN pool, and KDP-only free ISBN mode.

CREATE OR REPLACE FUNCTION public.normalize_isbn13(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = ''
AS $$
  SELECT pg_catalog.regexp_replace(p_value, '[^0-9]', '', 'g');
$$;

CREATE OR REPLACE FUNCTION public.is_valid_isbn13(p_value text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = ''
AS $$
DECLARE
  v text := public.normalize_isbn13(p_value);
  total integer := 0;
  i integer;
  expected integer;
BEGIN
  IF pg_catalog.length(v) <> 13 OR pg_catalog.substr(v, 1, 3) NOT IN ('978', '979') THEN
    RETURN false;
  END IF;

  FOR i IN 1..12 LOOP
    total := total + (pg_catalog.substr(v, i, 1)::integer * CASE WHEN i % 2 = 1 THEN 1 ELSE 3 END);
  END LOOP;
  expected := (10 - (total % 10)) % 10;
  RETURN expected = pg_catalog.substr(v, 13, 1)::integer;
EXCEPTION WHEN others THEN
  RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.normalize_isbn13(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.normalize_isbn13(text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.is_valid_isbn13(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_valid_isbn13(text) TO authenticated, service_role;

CREATE TABLE IF NOT EXISTS public.publishing_imprints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  scope text NOT NULL CHECK (scope IN ('user', 'platform')),
  publisher_name text NOT NULL CHECK (pg_catalog.length(pg_catalog.btrim(publisher_name)) BETWEEN 1 AND 200),
  imprint_name text NOT NULL CHECK (pg_catalog.length(pg_catalog.btrim(imprint_name)) BETWEEN 1 AND 100),
  country_code text CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$'),
  isbn_agency_name text,
  registrant_name text,
  agency_record_attested boolean NOT NULL DEFAULT false,
  agency_record_attested_at timestamptz,
  agency_record_attested_by uuid REFERENCES auth.users(id),
  verified boolean NOT NULL DEFAULT false,
  verified_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT publishing_imprints_scope_owner CHECK (
    (scope = 'user' AND owner_user_id IS NOT NULL)
    OR (scope = 'platform' AND owner_user_id IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS publishing_imprints_user_identity_uq
  ON public.publishing_imprints(owner_user_id, pg_catalog.lower(publisher_name), pg_catalog.lower(imprint_name))
  WHERE scope = 'user';
CREATE UNIQUE INDEX IF NOT EXISTS publishing_imprints_platform_identity_uq
  ON public.publishing_imprints(pg_catalog.lower(publisher_name), pg_catalog.lower(imprint_name))
  WHERE scope = 'platform';

ALTER TABLE public.publishing_imprints ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.publishing_imprints FROM anon, authenticated;
GRANT SELECT ON TABLE public.publishing_imprints TO authenticated;
GRANT ALL ON TABLE public.publishing_imprints TO service_role;

DO $$ BEGIN
  CREATE POLICY "Users can read own or verified platform imprints"
    ON public.publishing_imprints FOR SELECT TO authenticated
    USING (owner_user_id = (SELECT auth.uid()) OR (scope = 'platform' AND verified = true));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.book_publishing_profiles (
  book_id uuid PRIMARY KEY REFERENCES public.books(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  imprint_id uuid REFERENCES public.publishing_imprints(id) ON DELETE RESTRICT,
  publisher_mode text NOT NULL DEFAULT 'own_imprint'
    CHECK (publisher_mode IN ('own_imprint', 'platform_imprint', 'kdp_independent')),
  edition_label text NOT NULL DEFAULT 'First edition',
  publication_language text NOT NULL DEFAULT 'en',
  print_identifier_strategy text NOT NULL DEFAULT 'unassigned'
    CHECK (print_identifier_strategy IN ('own_isbn', 'platform_isbn', 'kdp_free', 'unassigned')),
  ebook_identifier_strategy text NOT NULL DEFAULT 'unassigned'
    CHECK (ebook_identifier_strategy IN ('own_isbn', 'platform_isbn', 'unassigned')),
  distribution_scope text NOT NULL DEFAULT 'global'
    CHECK (distribution_scope IN ('global', 'kdp_only', 'direct_only')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT book_publishing_profiles_mode CHECK (
    (publisher_mode = 'kdp_independent' AND imprint_id IS NULL AND print_identifier_strategy = 'kdp_free' AND distribution_scope = 'kdp_only')
    OR (publisher_mode IN ('own_imprint', 'platform_imprint') AND imprint_id IS NOT NULL)
  )
);

ALTER TABLE public.book_publishing_profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.book_publishing_profiles FROM anon, authenticated;
GRANT SELECT ON TABLE public.book_publishing_profiles TO authenticated;
GRANT ALL ON TABLE public.book_publishing_profiles TO service_role;
DO $$ BEGIN
  CREATE POLICY "Owners can read publishing profile"
    ON public.book_publishing_profiles FOR SELECT TO authenticated
    USING (owner_user_id = (SELECT auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.isbn_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  imprint_id uuid NOT NULL REFERENCES public.publishing_imprints(id) ON DELETE RESTRICT,
  isbn13 text NOT NULL UNIQUE,
  source text NOT NULL CHECK (source IN ('publisher_owned', 'platform_pool')),
  status text NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'assigned', 'retired')),
  added_by uuid REFERENCES auth.users(id),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT isbn_inventory_valid_isbn CHECK (public.is_valid_isbn13(isbn13))
);
CREATE INDEX IF NOT EXISTS isbn_inventory_available_idx
  ON public.isbn_inventory(imprint_id, status, created_at)
  WHERE status = 'available';

ALTER TABLE public.isbn_inventory ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.isbn_inventory FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.isbn_inventory TO service_role;

CREATE TABLE IF NOT EXISTS public.book_isbn_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  isbn_id uuid NOT NULL UNIQUE REFERENCES public.isbn_inventory(id) ON DELETE RESTRICT,
  product_form text NOT NULL
    CHECK (product_form IN ('paperback', 'hardcover', 'epub', 'pdf', 'audiobook')),
  language text NOT NULL DEFAULT 'en',
  edition_label text NOT NULL DEFAULT 'First edition',
  assigned_by uuid REFERENCES auth.users(id),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  locked_publication_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT book_isbn_assignment_form_uq UNIQUE (book_id, product_form, language, edition_label)
);
CREATE INDEX IF NOT EXISTS book_isbn_assignments_book_idx ON public.book_isbn_assignments(book_id);

ALTER TABLE public.book_isbn_assignments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.book_isbn_assignments FROM anon, authenticated;
GRANT SELECT ON TABLE public.book_isbn_assignments TO authenticated;
GRANT ALL ON TABLE public.book_isbn_assignments TO service_role;
DO $$ BEGIN
  CREATE POLICY "Owners can read ISBN assignments"
    ON public.book_isbn_assignments FOR SELECT TO authenticated
    USING (EXISTS (
      SELECT 1 FROM public.books b
      WHERE b.id = book_isbn_assignments.book_id
        AND (b.user_id = (SELECT auth.uid()) OR b.creator_id = (SELECT auth.uid()))
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Compatibility fields for legacy screens/export code. These are mirrors only;
-- the canonical source is book_publishing_profiles + book_isbn_assignments.
ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS publisher_imprint_id uuid REFERENCES public.publishing_imprints(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS publisher_mode text,
  ADD COLUMN IF NOT EXISTS edition_label text,
  ADD COLUMN IF NOT EXISTS isbn text;

CREATE OR REPLACE FUNCTION public.touch_publishing_identity_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DO $$ BEGIN
  CREATE TRIGGER trg_publishing_imprints_updated_at
  BEFORE UPDATE ON public.publishing_imprints
  FOR EACH ROW EXECUTE FUNCTION public.touch_publishing_identity_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_book_publishing_profiles_updated_at
  BEFORE UPDATE ON public.book_publishing_profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_publishing_identity_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_isbn_inventory_updated_at
  BEFORE UPDATE ON public.isbn_inventory
  FOR EACH ROW EXECUTE FUNCTION public.touch_publishing_identity_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.prevent_imprint_identity_drift()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF (NEW.publisher_name IS DISTINCT FROM OLD.publisher_name OR NEW.imprint_name IS DISTINCT FROM OLD.imprint_name)
     AND EXISTS (SELECT 1 FROM public.isbn_inventory i WHERE i.imprint_id = OLD.id)
  THEN
    RAISE EXCEPTION 'IMPRINT_IDENTITY_LOCKED: publisher/imprint cannot change after ISBN inventory is attached'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
DO $$ BEGIN
  CREATE TRIGGER trg_prevent_imprint_identity_drift
  BEFORE UPDATE ON public.publishing_imprints
  FOR EACH ROW EXECUTE FUNCTION public.prevent_imprint_identity_drift();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.assign_owned_isbn(
  p_user_id uuid,
  p_book_id uuid,
  p_isbn text,
  p_product_form text,
  p_language text DEFAULT 'en',
  p_edition_label text DEFAULT 'First edition'
)
RETURNS TABLE(assignment_id uuid, isbn13 text, product_form text, language text, edition_label text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_isbn text := public.normalize_isbn13(p_isbn);
  v_profile public.book_publishing_profiles%ROWTYPE;
  v_imprint public.publishing_imprints%ROWTYPE;
  v_inventory public.isbn_inventory%ROWTYPE;
  v_existing public.book_isbn_assignments%ROWTYPE;
BEGIN
  IF p_product_form NOT IN ('paperback', 'hardcover', 'epub', 'pdf', 'audiobook') THEN
    RAISE EXCEPTION 'INVALID_PRODUCT_FORM' USING ERRCODE = '22023';
  END IF;
  IF NOT public.is_valid_isbn13(v_isbn) THEN
    RAISE EXCEPTION 'INVALID_ISBN13' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.books b
    WHERE b.id = p_book_id AND (b.user_id = p_user_id OR b.creator_id = p_user_id)
  ) THEN
    RAISE EXCEPTION 'BOOK_NOT_OWNED' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_profile FROM public.book_publishing_profiles
  WHERE book_id = p_book_id AND owner_user_id = p_user_id;
  IF NOT FOUND OR v_profile.publisher_mode <> 'own_imprint' OR v_profile.imprint_id IS NULL THEN
    RAISE EXCEPTION 'OWN_IMPRINT_REQUIRED' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_imprint FROM public.publishing_imprints WHERE id = v_profile.imprint_id;
  IF NOT FOUND OR v_imprint.scope <> 'user' OR v_imprint.owner_user_id <> p_user_id OR v_imprint.agency_record_attested IS NOT TRUE THEN
    RAISE EXCEPTION 'ISBN_AGENCY_MATCH_ATTESTATION_REQUIRED' USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.isbn_inventory(imprint_id, isbn13, source, status, added_by)
  VALUES (v_imprint.id, v_isbn, 'publisher_owned', 'available', p_user_id)
  ON CONFLICT (isbn13) DO NOTHING;

  SELECT * INTO v_inventory FROM public.isbn_inventory WHERE isbn13 = v_isbn FOR UPDATE;
  IF v_inventory.imprint_id <> v_imprint.id OR v_inventory.source <> 'publisher_owned' THEN
    RAISE EXCEPTION 'ISBN_REGISTERED_TO_DIFFERENT_IMPRINT' USING ERRCODE = '23505';
  END IF;

  SELECT * INTO v_existing FROM public.book_isbn_assignments
  WHERE book_id = p_book_id
    AND product_form = p_product_form
    AND language = p_language
    AND edition_label = p_edition_label
  FOR UPDATE;

  IF EXISTS (
    SELECT 1 FROM public.book_isbn_assignments a
    WHERE a.isbn_id = v_inventory.id
      AND (v_existing.id IS NULL OR a.id <> v_existing.id)
  ) THEN
    RAISE EXCEPTION 'ISBN_ALREADY_ASSIGNED' USING ERRCODE = '23505';
  END IF;

  IF v_existing.id IS NOT NULL AND v_existing.locked_at IS NOT NULL AND v_existing.isbn_id <> v_inventory.id THEN
    RAISE EXCEPTION 'ISBN_ASSIGNMENT_LOCKED_BY_PUBLICATION' USING ERRCODE = '23514';
  END IF;

  IF v_existing.id IS NULL THEN
    INSERT INTO public.book_isbn_assignments(book_id, isbn_id, product_form, language, edition_label, assigned_by)
    VALUES (p_book_id, v_inventory.id, p_product_form, p_language, p_edition_label, p_user_id)
    RETURNING * INTO v_existing;
  ELSIF v_existing.isbn_id <> v_inventory.id THEN
    UPDATE public.isbn_inventory SET status = 'available' WHERE id = v_existing.isbn_id;
    UPDATE public.book_isbn_assignments
      SET isbn_id = v_inventory.id, assigned_by = p_user_id, assigned_at = now()
      WHERE id = v_existing.id
      RETURNING * INTO v_existing;
  END IF;

  UPDATE public.isbn_inventory SET status = 'assigned' WHERE id = v_inventory.id;
  IF p_product_form = 'paperback' THEN
    UPDATE public.books SET isbn = v_isbn WHERE id = p_book_id;
  END IF;

  RETURN QUERY SELECT v_existing.id, v_isbn, p_product_form, p_language, p_edition_label;
END;
$$;

CREATE OR REPLACE FUNCTION public.allocate_platform_isbn(
  p_user_id uuid,
  p_book_id uuid,
  p_product_form text,
  p_language text DEFAULT 'en',
  p_edition_label text DEFAULT 'First edition'
)
RETURNS TABLE(assignment_id uuid, isbn13 text, product_form text, language text, edition_label text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_profile public.book_publishing_profiles%ROWTYPE;
  v_imprint public.publishing_imprints%ROWTYPE;
  v_inventory public.isbn_inventory%ROWTYPE;
  v_existing public.book_isbn_assignments%ROWTYPE;
BEGIN
  IF p_product_form NOT IN ('paperback', 'hardcover', 'epub', 'pdf', 'audiobook') THEN
    RAISE EXCEPTION 'INVALID_PRODUCT_FORM' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.books b
    WHERE b.id = p_book_id AND (b.user_id = p_user_id OR b.creator_id = p_user_id)
  ) THEN
    RAISE EXCEPTION 'BOOK_NOT_OWNED' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_profile FROM public.book_publishing_profiles
  WHERE book_id = p_book_id AND owner_user_id = p_user_id;
  IF NOT FOUND OR v_profile.publisher_mode <> 'platform_imprint' OR v_profile.imprint_id IS NULL THEN
    RAISE EXCEPTION 'PLATFORM_IMPRINT_REQUIRED' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO v_imprint FROM public.publishing_imprints WHERE id = v_profile.imprint_id;
  IF NOT FOUND OR v_imprint.scope <> 'platform' OR v_imprint.verified IS NOT TRUE THEN
    RAISE EXCEPTION 'VERIFIED_PLATFORM_IMPRINT_REQUIRED' USING ERRCODE = '23514';
  END IF;

  SELECT * INTO v_existing FROM public.book_isbn_assignments
  WHERE book_id = p_book_id
    AND product_form = p_product_form
    AND language = p_language
    AND edition_label = p_edition_label
  FOR UPDATE;

  IF v_existing.id IS NOT NULL AND v_existing.locked_at IS NOT NULL THEN
    SELECT * INTO v_inventory FROM public.isbn_inventory WHERE id = v_existing.isbn_id;
    RETURN QUERY SELECT v_existing.id, v_inventory.isbn13, p_product_form, p_language, p_edition_label;
    RETURN;
  END IF;

  SELECT * INTO v_inventory
  FROM public.isbn_inventory
  WHERE imprint_id = v_imprint.id AND source = 'platform_pool' AND status = 'available'
  ORDER BY created_at, id
  FOR UPDATE SKIP LOCKED
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'ISBN_POOL_EMPTY' USING ERRCODE = 'P0002';
  END IF;

  IF v_existing.id IS NULL THEN
    INSERT INTO public.book_isbn_assignments(book_id, isbn_id, product_form, language, edition_label, assigned_by)
    VALUES (p_book_id, v_inventory.id, p_product_form, p_language, p_edition_label, p_user_id)
    RETURNING * INTO v_existing;
  ELSE
    UPDATE public.isbn_inventory SET status = 'available' WHERE id = v_existing.isbn_id;
    UPDATE public.book_isbn_assignments
      SET isbn_id = v_inventory.id, assigned_by = p_user_id, assigned_at = now()
      WHERE id = v_existing.id
      RETURNING * INTO v_existing;
  END IF;

  UPDATE public.isbn_inventory SET status = 'assigned' WHERE id = v_inventory.id;
  IF p_product_form = 'paperback' THEN
    UPDATE public.books SET isbn = v_inventory.isbn13 WHERE id = p_book_id;
  END IF;
  RETURN QUERY SELECT v_existing.id, v_inventory.isbn13, p_product_form, p_language, p_edition_label;
END;
$$;

CREATE OR REPLACE FUNCTION public.lock_book_isbn_assignments(p_book_id uuid, p_publication_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.book_isbn_assignments
  SET locked_at = COALESCE(locked_at, now()),
      locked_publication_id = COALESCE(locked_publication_id, p_publication_id)
  WHERE book_id = p_book_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_owned_isbn(uuid, uuid, text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assign_owned_isbn(uuid, uuid, text, text, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.allocate_platform_isbn(uuid, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.allocate_platform_isbn(uuid, uuid, text, text, text) TO service_role;
REVOKE ALL ON FUNCTION public.lock_book_isbn_assignments(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lock_book_isbn_assignments(uuid, uuid) TO service_role;

COMMENT ON TABLE public.publishing_imprints IS 'Canonical publisher/imprint identities. Platform rows must be administratively verified; user rows preserve agency-match attestation.';
COMMENT ON TABLE public.isbn_inventory IS 'Real ISBN-13 inventory only. Numbers are supplied by publishers/agencies; ScrollLibrary never generates ISBNs.';
COMMENT ON TABLE public.book_isbn_assignments IS 'One ISBN per separately sold product form/language/edition. Assignment becomes immutable after publication.';
