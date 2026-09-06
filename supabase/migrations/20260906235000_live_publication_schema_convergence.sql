-- Controlled forward convergence for the legacy ScrollLibrary cloud database.
-- Additive only. This migration intentionally does NOT mark legacy books as new
-- certified Publications, does NOT infer copyright grants, and does NOT invent
-- or allocate ISBNs. It creates the authoritative spine required by the current
-- server-owned publication/registry pipeline and safely backfills Work identity.

-- -------------------------------------------------------------------------
-- Canonical enums
-- -------------------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE public.rights_holder_type AS ENUM (
    'individual','organization','publisher','institution','government','nonprofit','research_institute'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.work_author_role AS ENUM (
    'primary','co_author','ghostwriter','translator','editor_credit','contributor'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.rights_class AS ENUM (
    'attribution','integrity','name_protection','copyright_holder','publisher','distributor',
    'licensing','royalties','pricing','subsidiary_rights','audiobook_rights','translation_rights','film_rights'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.publication_status AS ENUM (
    'draft','internal_review','external_review','approved','published','archived','retracted','superseded'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE public.publication_integrity AS ENUM (
    'verified_published','draft_export','collaborative_draft','private_review','internal_preview','published_export'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TYPE public.publication_integrity ADD VALUE IF NOT EXISTS 'published_export';
DO $$ BEGIN
  CREATE TYPE public.publication_edition_kind AS ENUM (
    'original','translation','revision','adaptation','student_edition','executive_edition','audiobook_edition','print_edition'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- -------------------------------------------------------------------------
-- Work / contributor / rights foundation
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rights_holders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  holder_type public.rights_holder_type NOT NULL,
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid,
  display_name text NOT NULL,
  legal_name text,
  country_code text,
  verified boolean NOT NULL DEFAULT false,
  verified_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rights_holders_individual_user_unique UNIQUE (user_id, holder_type)
);
CREATE INDEX IF NOT EXISTS rights_holders_user_idx ON public.rights_holders(user_id);
ALTER TABLE public.rights_holders ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.rights_holders FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.rights_holders TO authenticated;
GRANT ALL ON public.rights_holders TO service_role;
DROP POLICY IF EXISTS rights_holders_select_self ON public.rights_holders;
CREATE POLICY rights_holders_select_self ON public.rights_holders FOR SELECT TO authenticated
USING (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.works (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  original_language text NOT NULL DEFAULT 'en',
  work_type text NOT NULL DEFAULT 'book',
  subject_codes jsonb NOT NULL DEFAULT '[]'::jsonb,
  description text,
  owner_rights_holder_id uuid NOT NULL REFERENCES public.rights_holders(id) ON DELETE RESTRICT,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  publish_locked_at timestamptz,
  publish_locked_by uuid REFERENCES auth.users(id),
  publish_lock_reason text,
  current_publication_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS works_created_by_idx ON public.works(created_by);
ALTER TABLE public.works ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.works FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.works TO authenticated;
GRANT ALL ON public.works TO service_role;
DROP POLICY IF EXISTS works_select_owner ON public.works;
CREATE POLICY works_select_owner ON public.works FOR SELECT TO authenticated
USING (created_by = auth.uid() OR owner_rights_holder_id IN (
  SELECT rh.id FROM public.rights_holders rh WHERE rh.user_id = auth.uid()
));

CREATE TABLE IF NOT EXISTS public.work_authors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id uuid NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  display_name text NOT NULL,
  biography text,
  photo_url text,
  author_role public.work_author_role NOT NULL DEFAULT 'primary',
  contribution_percentage numeric(5,2),
  sort_order integer NOT NULL DEFAULT 0,
  verified boolean NOT NULL DEFAULT false,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS work_authors_work_idx ON public.work_authors(work_id);
CREATE UNIQUE INDEX IF NOT EXISTS work_authors_primary_uq ON public.work_authors(work_id) WHERE author_role='primary';
ALTER TABLE public.work_authors ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.work_authors FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.work_authors TO authenticated;
GRANT ALL ON public.work_authors TO service_role;
DROP POLICY IF EXISTS work_authors_select_owner ON public.work_authors;
CREATE POLICY work_authors_select_owner ON public.work_authors FOR SELECT TO authenticated
USING (user_id=auth.uid() OR EXISTS (
  SELECT 1 FROM public.works w WHERE w.id=work_authors.work_id AND w.created_by=auth.uid()
));

CREATE TABLE IF NOT EXISTS public.work_rights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id uuid NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,
  rights_holder_id uuid NOT NULL REFERENCES public.rights_holders(id) ON DELETE RESTRICT,
  rights_class public.rights_class NOT NULL,
  rights_scope jsonb NOT NULL DEFAULT '{}'::jsonb,
  territory text NOT NULL DEFAULT 'world',
  language text NOT NULL DEFAULT '*',
  effective_from timestamptz NOT NULL DEFAULT now(),
  effective_to timestamptz,
  source_contract_ref text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS work_rights_current_uq
ON public.work_rights(work_id,rights_class,rights_holder_id,territory,language) WHERE effective_to IS NULL;
ALTER TABLE public.work_rights ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.work_rights FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.work_rights TO authenticated;
GRANT ALL ON public.work_rights TO service_role;
DROP POLICY IF EXISTS work_rights_select_owner ON public.work_rights;
CREATE POLICY work_rights_select_owner ON public.work_rights FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.works w WHERE w.id=work_rights.work_id AND w.created_by=auth.uid())
       OR rights_holder_id IN (SELECT rh.id FROM public.rights_holders rh WHERE rh.user_id=auth.uid()));

-- -------------------------------------------------------------------------
-- Book columns expected by current publication/export code
-- -------------------------------------------------------------------------
ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS work_id uuid REFERENCES public.works(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS current_publication_id uuid,
  ADD COLUMN IF NOT EXISTS publish_locked_at timestamptz,
  ADD COLUMN IF NOT EXISTS publish_locked_by uuid,
  ADD COLUMN IF NOT EXISTS publish_lock_reason text,
  ADD COLUMN IF NOT EXISTS design_settings jsonb NOT NULL DEFAULT jsonb_build_object(
    'preset','editorial','font_pair','spectral_inter','trim_size','us_letter','accent_color','#1d4ed8',
    'header_style','title_chapter','footer_style','page_center','endnotes_per_chapter',false,'citation_style','apa'
  );
CREATE INDEX IF NOT EXISTS books_work_id_idx ON public.books(work_id);

-- Conservative backfill: create unverified identity records only. No work_rights
-- rows are inferred, and no current Publication is fabricated for legacy books.
INSERT INTO public.rights_holders(holder_type,user_id,display_name,verified,metadata)
SELECT 'individual'::public.rights_holder_type,
       owners.user_id,
       COALESCE(ap.display_name, NULLIF(p.full_name,''), 'ScrollLibrary creator'),
       false,
       jsonb_build_object('backfill','live_schema_convergence')
FROM (
  SELECT DISTINCT COALESCE(b.user_id,b.creator_id) AS user_id FROM public.books b
  WHERE COALESCE(b.user_id,b.creator_id) IS NOT NULL
) owners
LEFT JOIN public.author_profiles ap ON ap.user_id=owners.user_id
LEFT JOIN public.profiles p ON p.id=owners.user_id
ON CONFLICT (user_id,holder_type) DO NOTHING;

DO $$
DECLARE
  b record;
  v_owner uuid;
  v_work uuid;
  v_name text;
BEGIN
  FOR b IN
    SELECT * FROM public.books WHERE work_id IS NULL AND COALESCE(user_id,creator_id) IS NOT NULL ORDER BY created_at,id
  LOOP
    SELECT rh.id INTO v_owner FROM public.rights_holders rh
    WHERE rh.user_id=COALESCE(b.user_id,b.creator_id) AND rh.holder_type='individual'
    LIMIT 1;
    IF v_owner IS NULL THEN
      RAISE EXCEPTION 'WORK_BACKFILL_RIGHTS_HOLDER_MISSING:%', b.id;
    END IF;
    SELECT COALESCE(NULLIF(b.pen_name,''),NULLIF(b.author_display_name,''),ap.display_name,'ScrollLibrary creator')
      INTO v_name FROM (SELECT 1) x
      LEFT JOIN public.author_profiles ap ON ap.user_id=COALESCE(b.user_id,b.creator_id);
    INSERT INTO public.works(title,original_language,description,owner_rights_holder_id,created_by)
    VALUES (b.title,COALESCE(NULLIF(b.language,''),'en'),b.description,v_owner,COALESCE(b.user_id,b.creator_id))
    RETURNING id INTO v_work;
    UPDATE public.books SET work_id=v_work WHERE id=b.id;
    INSERT INTO public.work_authors(work_id,user_id,display_name,author_role,contribution_percentage,sort_order,verified)
    VALUES(v_work,COALESCE(b.user_id,b.creator_id),v_name,'primary',100,0,false)
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;

-- Ensure newly-created books receive a Work identity without asserting rights.
CREATE OR REPLACE FUNCTION public.tg_ensure_book_work_identity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  v_user uuid := COALESCE(NEW.user_id,NEW.creator_id);
  v_holder uuid;
  v_work uuid;
  v_name text;
BEGIN
  IF NEW.work_id IS NOT NULL OR v_user IS NULL THEN RETURN NEW; END IF;
  SELECT rh.id INTO v_holder FROM public.rights_holders rh
    WHERE rh.user_id=v_user AND rh.holder_type='individual' LIMIT 1;
  IF v_holder IS NULL THEN
    SELECT COALESCE(ap.display_name,NULLIF(NEW.pen_name,''),NULLIF(NEW.author_display_name,''),'ScrollLibrary creator')
      INTO v_name FROM (SELECT 1) x LEFT JOIN public.author_profiles ap ON ap.user_id=v_user;
    INSERT INTO public.rights_holders(holder_type,user_id,display_name,verified,metadata)
    VALUES('individual',v_user,v_name,false,jsonb_build_object('created_by','book_identity_trigger'))
    RETURNING id INTO v_holder;
  END IF;
  INSERT INTO public.works(title,original_language,description,owner_rights_holder_id,created_by)
  VALUES(NEW.title,COALESCE(NULLIF(NEW.language,''),'en'),NEW.description,v_holder,v_user)
  RETURNING id INTO v_work;
  UPDATE public.books SET work_id=v_work WHERE id=NEW.id;
  SELECT COALESCE(ap.display_name,NULLIF(NEW.pen_name,''),NULLIF(NEW.author_display_name,''),'ScrollLibrary creator')
    INTO v_name FROM (SELECT 1) x LEFT JOIN public.author_profiles ap ON ap.user_id=v_user;
  INSERT INTO public.work_authors(work_id,user_id,display_name,author_role,contribution_percentage,sort_order,verified)
  VALUES(v_work,v_user,v_name,'primary',100,0,false);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.tg_ensure_book_work_identity() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS trg_books_ensure_work_identity ON public.books;
CREATE TRIGGER trg_books_ensure_work_identity AFTER INSERT ON public.books
FOR EACH ROW EXECUTE FUNCTION public.tg_ensure_book_work_identity();

-- -------------------------------------------------------------------------
-- Immutable Publication spine
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.publications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id uuid NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,
  book_id uuid REFERENCES public.books(id) ON DELETE SET NULL,
  edition_kind public.publication_edition_kind NOT NULL DEFAULT 'original',
  language text NOT NULL DEFAULT 'en',
  parent_publication_id uuid REFERENCES public.publications(id),
  version text NOT NULL DEFAULT 'v1.0.0',
  semver_major integer NOT NULL DEFAULT 1,
  semver_minor integer NOT NULL DEFAULT 0,
  semver_patch integer NOT NULL DEFAULT 0,
  status public.publication_status NOT NULL DEFAULT 'draft',
  integrity_level public.publication_integrity NOT NULL DEFAULT 'draft_export',
  snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  design_snapshot jsonb,
  content_hash text,
  certificate_id uuid,
  published_at timestamptz,
  published_by uuid REFERENCES auth.users(id),
  unpublished_at timestamptz,
  unpublish_reason text,
  superseded_by_publication_id uuid REFERENCES public.publications(id),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT publications_version_unique UNIQUE(work_id,edition_kind,language,version)
);
CREATE INDEX IF NOT EXISTS publications_work_idx ON public.publications(work_id);
CREATE INDEX IF NOT EXISTS publications_book_idx ON public.publications(book_id);
ALTER TABLE public.publications ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.publications FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.publications TO authenticated;
GRANT ALL ON public.publications TO service_role;
DROP POLICY IF EXISTS publications_select_owner_or_published ON public.publications;
CREATE POLICY publications_select_owner_or_published ON public.publications FOR SELECT TO authenticated
USING(status='published' OR EXISTS(SELECT 1 FROM public.works w WHERE w.id=publications.work_id AND w.created_by=auth.uid()));

ALTER TABLE public.works DROP CONSTRAINT IF EXISTS works_current_publication_fk;
ALTER TABLE public.works ADD CONSTRAINT works_current_publication_fk FOREIGN KEY(current_publication_id) REFERENCES public.publications(id) ON DELETE SET NULL;
ALTER TABLE public.books DROP CONSTRAINT IF EXISTS books_current_publication_id_fkey;
ALTER TABLE public.books ADD CONSTRAINT books_current_publication_id_fkey FOREIGN KEY(current_publication_id) REFERENCES public.publications(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.tg_publications_enforce_immutability()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  IF OLD.status='published' AND NEW.status='published' THEN
    IF NEW.snapshot IS DISTINCT FROM OLD.snapshot OR NEW.design_snapshot IS DISTINCT FROM OLD.design_snapshot
       OR NEW.content_hash IS DISTINCT FROM OLD.content_hash OR NEW.version IS DISTINCT FROM OLD.version
       OR NEW.edition_kind IS DISTINCT FROM OLD.edition_kind OR NEW.language IS DISTINCT FROM OLD.language
       OR NEW.work_id IS DISTINCT FROM OLD.work_id OR NEW.book_id IS DISTINCT FROM OLD.book_id THEN
      RAISE EXCEPTION 'PUBLICATION_IMMUTABLE' USING ERRCODE='22023';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.tg_publications_enforce_immutability() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS trg_publications_immutability ON public.publications;
CREATE TRIGGER trg_publications_immutability BEFORE UPDATE ON public.publications
FOR EACH ROW EXECUTE FUNCTION public.tg_publications_enforce_immutability();

CREATE TABLE IF NOT EXISTS public.publication_certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_id uuid NOT NULL REFERENCES public.publications(id) ON DELETE CASCADE,
  work_id uuid NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,
  authors_snapshot jsonb NOT NULL DEFAULT '[]'::jsonb,
  rights_holders_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  content_hash text NOT NULL,
  signature_algorithm text NOT NULL DEFAULT 'sha256',
  signature_value text,
  public_key_id text,
  issuer text NOT NULL DEFAULT 'scrolllibrary',
  scrolllibrary_version text,
  issued_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revocation_reason text
);
CREATE UNIQUE INDEX IF NOT EXISTS publication_certificates_publication_uq ON public.publication_certificates(publication_id);
ALTER TABLE public.publication_certificates ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.publication_certificates FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.publication_certificates TO authenticated;
GRANT ALL ON public.publication_certificates TO service_role;
DROP POLICY IF EXISTS publication_certificates_select_owner_or_published ON public.publication_certificates;
CREATE POLICY publication_certificates_select_owner_or_published ON public.publication_certificates FOR SELECT TO authenticated
USING(EXISTS(SELECT 1 FROM public.publications p JOIN public.works w ON w.id=p.work_id
             WHERE p.id=publication_certificates.publication_id AND (p.status='published' OR w.created_by=auth.uid())));
ALTER TABLE public.publications DROP CONSTRAINT IF EXISTS publications_certificate_fk;
ALTER TABLE public.publications ADD CONSTRAINT publications_certificate_fk FOREIGN KEY(certificate_id) REFERENCES public.publication_certificates(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_id uuid REFERENCES public.publications(id) ON DELETE SET NULL,
  certificate_id uuid REFERENCES public.publication_certificates(id) ON DELETE SET NULL,
  work_id uuid REFERENCES public.works(id) ON DELETE SET NULL,
  book_id uuid REFERENCES public.books(id) ON DELETE SET NULL,
  exported_by uuid NOT NULL REFERENCES auth.users(id),
  provider_id text NOT NULL,
  format text NOT NULL,
  integrity_level public.publication_integrity NOT NULL DEFAULT 'draft_export',
  file_hash text,
  signature_algorithm text,
  signature_value text,
  public_key_id text,
  renderer_version text,
  scrolllibrary_version text,
  watermark jsonb NOT NULL DEFAULT '{}'::jsonb,
  client_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  exported_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.exports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.exports FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.exports TO authenticated;
GRANT ALL ON public.exports TO service_role;
DROP POLICY IF EXISTS exports_select_self_or_owner ON public.exports;
CREATE POLICY exports_select_self_or_owner ON public.exports FOR SELECT TO authenticated
USING(exported_by=auth.uid() OR EXISTS(SELECT 1 FROM public.works w WHERE w.id=exports.work_id AND w.created_by=auth.uid()));

-- Evidence table required when freezing a Publication snapshot.
CREATE TABLE IF NOT EXISTS public.book_citations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  citation_key text NOT NULL,
  source_type text,
  citation_text text,
  authors jsonb NOT NULL DEFAULT '[]'::jsonb,
  publisher text,
  container_title text,
  volume text,
  issue text,
  pages text,
  doi text,
  isbn text,
  url text,
  accessed_at date,
  publication_date text,
  confidence text NOT NULL DEFAULT 'unverified',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(book_id,citation_key)
);
ALTER TABLE public.book_citations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.book_citations FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.book_citations TO authenticated;
GRANT ALL ON public.book_citations TO service_role;
DROP POLICY IF EXISTS book_citations_select_owner ON public.book_citations;
CREATE POLICY book_citations_select_owner ON public.book_citations FOR SELECT TO authenticated
USING(EXISTS(SELECT 1 FROM public.books b WHERE b.id=book_citations.book_id AND (b.user_id=auth.uid() OR b.creator_id=auth.uid())));

-- -------------------------------------------------------------------------
-- Publisher / imprint / ISBN registry (real externally supplied ISBNs only)
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.normalize_isbn13(p_value text)
RETURNS text LANGUAGE sql IMMUTABLE STRICT SET search_path='' AS $$
  SELECT pg_catalog.regexp_replace(p_value,'[^0-9]','','g');
$$;
CREATE OR REPLACE FUNCTION public.is_valid_isbn13(p_value text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE STRICT SET search_path='' AS $$
DECLARE v text:=public.normalize_isbn13(p_value); total integer:=0; i integer; expected integer;
BEGIN
  IF pg_catalog.length(v)<>13 OR pg_catalog.substring(v FROM 1 FOR 3) NOT IN ('978','979') THEN RETURN false; END IF;
  FOR i IN 1..12 LOOP total:=total+(pg_catalog.substring(v FROM i FOR 1)::integer*CASE WHEN i%2=1 THEN 1 ELSE 3 END); END LOOP;
  expected:=(10-(total%10))%10;
  RETURN expected=pg_catalog.substring(v FROM 13 FOR 1)::integer;
EXCEPTION WHEN others THEN RETURN false; END $$;
REVOKE ALL ON FUNCTION public.normalize_isbn13(text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.is_valid_isbn13(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_isbn13(text),public.is_valid_isbn13(text) TO service_role;

CREATE TABLE IF NOT EXISTS public.publishing_imprints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  scope text NOT NULL CHECK(scope IN ('user','platform')),
  publisher_name text NOT NULL CHECK(length(btrim(publisher_name)) BETWEEN 1 AND 200),
  imprint_name text NOT NULL CHECK(length(btrim(imprint_name)) BETWEEN 1 AND 100),
  country_code text CHECK(country_code IS NULL OR country_code ~ '^[A-Z]{2}$'),
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
  CONSTRAINT publishing_imprints_scope_owner CHECK((scope='user' AND owner_user_id IS NOT NULL) OR (scope='platform' AND owner_user_id IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS publishing_imprints_user_uq ON public.publishing_imprints(owner_user_id,lower(publisher_name),lower(imprint_name)) WHERE scope='user';
CREATE UNIQUE INDEX IF NOT EXISTS publishing_imprints_platform_uq ON public.publishing_imprints(lower(publisher_name),lower(imprint_name)) WHERE scope='platform';
ALTER TABLE public.publishing_imprints ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.publishing_imprints FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.publishing_imprints TO authenticated;
GRANT ALL ON public.publishing_imprints TO service_role;
DROP POLICY IF EXISTS publishing_imprints_read ON public.publishing_imprints;
CREATE POLICY publishing_imprints_read ON public.publishing_imprints FOR SELECT TO authenticated
USING(owner_user_id=auth.uid() OR (scope='platform' AND verified=true));

CREATE TABLE IF NOT EXISTS public.book_publishing_profiles (
  book_id uuid PRIMARY KEY REFERENCES public.books(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  imprint_id uuid REFERENCES public.publishing_imprints(id) ON DELETE RESTRICT,
  publisher_mode text NOT NULL DEFAULT 'own_imprint' CHECK(publisher_mode IN ('own_imprint','platform_imprint','kdp_independent')),
  edition_label text NOT NULL DEFAULT 'First edition',
  publication_language text NOT NULL DEFAULT 'en',
  print_identifier_strategy text NOT NULL DEFAULT 'unassigned' CHECK(print_identifier_strategy IN ('own_isbn','platform_isbn','kdp_free','unassigned')),
  ebook_identifier_strategy text NOT NULL DEFAULT 'unassigned' CHECK(ebook_identifier_strategy IN ('own_isbn','platform_isbn','unassigned')),
  distribution_scope text NOT NULL DEFAULT 'global' CHECK(distribution_scope IN ('global','kdp_only','direct_only')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT book_publishing_profiles_mode CHECK(
    (publisher_mode='kdp_independent' AND imprint_id IS NULL AND print_identifier_strategy='kdp_free' AND distribution_scope='kdp_only')
    OR (publisher_mode IN ('own_imprint','platform_imprint') AND imprint_id IS NOT NULL)
  ),
  CONSTRAINT book_publishing_profiles_strategy_matches_mode CHECK(
    (publisher_mode='own_imprint' AND print_identifier_strategy IN ('own_isbn','unassigned') AND ebook_identifier_strategy IN ('own_isbn','unassigned'))
    OR (publisher_mode='platform_imprint' AND print_identifier_strategy IN ('platform_isbn','unassigned') AND ebook_identifier_strategy IN ('platform_isbn','unassigned'))
    OR (publisher_mode='kdp_independent' AND print_identifier_strategy='kdp_free' AND ebook_identifier_strategy='unassigned' AND distribution_scope='kdp_only')
  )
);
ALTER TABLE public.book_publishing_profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.book_publishing_profiles FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.book_publishing_profiles TO authenticated;
GRANT ALL ON public.book_publishing_profiles TO service_role;
DROP POLICY IF EXISTS book_publishing_profiles_read ON public.book_publishing_profiles;
CREATE POLICY book_publishing_profiles_read ON public.book_publishing_profiles FOR SELECT TO authenticated USING(owner_user_id=auth.uid());

CREATE TABLE IF NOT EXISTS public.isbn_inventory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  imprint_id uuid NOT NULL REFERENCES public.publishing_imprints(id) ON DELETE RESTRICT,
  isbn13 text NOT NULL UNIQUE,
  source text NOT NULL CHECK(source IN ('publisher_owned','platform_pool')),
  status text NOT NULL DEFAULT 'available' CHECK(status IN ('available','assigned','retired')),
  added_by uuid REFERENCES auth.users(id),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT isbn_inventory_valid_isbn CHECK(public.is_valid_isbn13(isbn13))
);
CREATE INDEX IF NOT EXISTS isbn_inventory_available_idx ON public.isbn_inventory(imprint_id,status,created_at) WHERE status='available';
ALTER TABLE public.isbn_inventory ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.isbn_inventory FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.isbn_inventory TO service_role;

CREATE TABLE IF NOT EXISTS public.book_isbn_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  isbn_id uuid NOT NULL UNIQUE REFERENCES public.isbn_inventory(id) ON DELETE RESTRICT,
  product_form text NOT NULL CHECK(product_form IN ('paperback','hardcover','epub','pdf','audiobook')),
  language text NOT NULL DEFAULT 'en',
  edition_label text NOT NULL DEFAULT 'First edition',
  assigned_by uuid REFERENCES auth.users(id),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  locked_publication_id uuid REFERENCES public.publications(id) ON DELETE RESTRICT,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT book_isbn_assignment_form_uq UNIQUE(book_id,product_form,language,edition_label)
);
ALTER TABLE public.book_isbn_assignments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.book_isbn_assignments FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.book_isbn_assignments TO authenticated;
GRANT ALL ON public.book_isbn_assignments TO service_role;
DROP POLICY IF EXISTS book_isbn_assignments_read ON public.book_isbn_assignments;
CREATE POLICY book_isbn_assignments_read ON public.book_isbn_assignments FOR SELECT TO authenticated
USING(EXISTS(SELECT 1 FROM public.books b WHERE b.id=book_isbn_assignments.book_id AND (b.user_id=auth.uid() OR b.creator_id=auth.uid())));

ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS publisher_imprint_id uuid REFERENCES public.publishing_imprints(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS publisher_mode text,
  ADD COLUMN IF NOT EXISTS edition_label text,
  ADD COLUMN IF NOT EXISTS isbn text;

CREATE OR REPLACE FUNCTION public.touch_publishing_identity_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$ BEGIN NEW.updated_at:=now(); RETURN NEW; END $$;
REVOKE ALL ON FUNCTION public.touch_publishing_identity_updated_at() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS trg_publishing_imprints_updated_at ON public.publishing_imprints;
CREATE TRIGGER trg_publishing_imprints_updated_at BEFORE UPDATE ON public.publishing_imprints FOR EACH ROW EXECUTE FUNCTION public.touch_publishing_identity_updated_at();
DROP TRIGGER IF EXISTS trg_book_publishing_profiles_updated_at ON public.book_publishing_profiles;
CREATE TRIGGER trg_book_publishing_profiles_updated_at BEFORE UPDATE ON public.book_publishing_profiles FOR EACH ROW EXECUTE FUNCTION public.touch_publishing_identity_updated_at();
DROP TRIGGER IF EXISTS trg_isbn_inventory_updated_at ON public.isbn_inventory;
CREATE TRIGGER trg_isbn_inventory_updated_at BEFORE UPDATE ON public.isbn_inventory FOR EACH ROW EXECUTE FUNCTION public.touch_publishing_identity_updated_at();

CREATE OR REPLACE FUNCTION public.prevent_imprint_identity_drift()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF (NEW.publisher_name IS DISTINCT FROM OLD.publisher_name OR NEW.imprint_name IS DISTINCT FROM OLD.imprint_name)
     AND EXISTS(SELECT 1 FROM public.isbn_inventory i WHERE i.imprint_id=OLD.id) THEN
    RAISE EXCEPTION 'IMPRINT_IDENTITY_LOCKED' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.prevent_imprint_identity_drift() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS trg_prevent_imprint_identity_drift ON public.publishing_imprints;
CREATE TRIGGER trg_prevent_imprint_identity_drift BEFORE UPDATE ON public.publishing_imprints FOR EACH ROW EXECUTE FUNCTION public.prevent_imprint_identity_drift();

CREATE OR REPLACE FUNCTION public.assign_owned_isbn(p_user_id uuid,p_book_id uuid,p_isbn text,p_product_form text,p_language text DEFAULT 'en',p_edition_label text DEFAULT 'First edition')
RETURNS TABLE(assignment_id uuid,isbn13 text,product_form text,language text,edition_label text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_isbn text:=public.normalize_isbn13(p_isbn); v_profile public.book_publishing_profiles%ROWTYPE; v_imprint public.publishing_imprints%ROWTYPE; v_inventory public.isbn_inventory%ROWTYPE; v_existing public.book_isbn_assignments%ROWTYPE;
BEGIN
  IF p_product_form NOT IN ('paperback','hardcover','epub','pdf','audiobook') THEN RAISE EXCEPTION 'INVALID_PRODUCT_FORM' USING ERRCODE='22023'; END IF;
  IF NOT public.is_valid_isbn13(v_isbn) THEN RAISE EXCEPTION 'INVALID_ISBN13' USING ERRCODE='22023'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.books b WHERE b.id=p_book_id AND (b.user_id=p_user_id OR b.creator_id=p_user_id)) THEN RAISE EXCEPTION 'BOOK_NOT_OWNED' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_profile FROM public.book_publishing_profiles WHERE book_id=p_book_id AND owner_user_id=p_user_id;
  IF NOT FOUND OR v_profile.publisher_mode<>'own_imprint' OR v_profile.imprint_id IS NULL THEN RAISE EXCEPTION 'OWN_IMPRINT_REQUIRED' USING ERRCODE='23514'; END IF;
  SELECT * INTO v_imprint FROM public.publishing_imprints WHERE id=v_profile.imprint_id;
  IF NOT FOUND OR v_imprint.scope<>'user' OR v_imprint.owner_user_id<>p_user_id OR v_imprint.agency_record_attested IS NOT TRUE THEN RAISE EXCEPTION 'ISBN_AGENCY_MATCH_ATTESTATION_REQUIRED' USING ERRCODE='23514'; END IF;
  INSERT INTO public.isbn_inventory(imprint_id,isbn13,source,status,added_by) VALUES(v_imprint.id,v_isbn,'publisher_owned','available',p_user_id) ON CONFLICT(isbn13) DO NOTHING;
  SELECT * INTO v_inventory FROM public.isbn_inventory WHERE isbn13=v_isbn FOR UPDATE;
  IF v_inventory.imprint_id<>v_imprint.id OR v_inventory.source<>'publisher_owned' THEN RAISE EXCEPTION 'ISBN_REGISTERED_TO_DIFFERENT_IMPRINT' USING ERRCODE='23505'; END IF;
  SELECT * INTO v_existing FROM public.book_isbn_assignments WHERE book_id=p_book_id AND product_form=p_product_form AND language=p_language AND edition_label=p_edition_label FOR UPDATE;
  IF EXISTS(SELECT 1 FROM public.book_isbn_assignments a WHERE a.isbn_id=v_inventory.id AND (v_existing.id IS NULL OR a.id<>v_existing.id)) THEN RAISE EXCEPTION 'ISBN_ALREADY_ASSIGNED' USING ERRCODE='23505'; END IF;
  IF v_existing.id IS NOT NULL AND v_existing.locked_at IS NOT NULL AND v_existing.isbn_id<>v_inventory.id THEN RAISE EXCEPTION 'ISBN_ASSIGNMENT_LOCKED_BY_PUBLICATION' USING ERRCODE='23514'; END IF;
  IF v_existing.id IS NULL THEN
    INSERT INTO public.book_isbn_assignments(book_id,isbn_id,product_form,language,edition_label,assigned_by) VALUES(p_book_id,v_inventory.id,p_product_form,p_language,p_edition_label,p_user_id) RETURNING * INTO v_existing;
  ELSIF v_existing.isbn_id<>v_inventory.id THEN
    UPDATE public.isbn_inventory SET status='available' WHERE id=v_existing.isbn_id;
    UPDATE public.book_isbn_assignments SET isbn_id=v_inventory.id,assigned_by=p_user_id,assigned_at=now() WHERE id=v_existing.id RETURNING * INTO v_existing;
  END IF;
  UPDATE public.isbn_inventory SET status='assigned' WHERE id=v_inventory.id;
  IF p_product_form='paperback' THEN UPDATE public.books SET isbn=v_isbn WHERE id=p_book_id; END IF;
  RETURN QUERY SELECT v_existing.id,v_isbn,p_product_form,p_language,p_edition_label;
END $$;

CREATE OR REPLACE FUNCTION public.allocate_platform_isbn(p_user_id uuid,p_book_id uuid,p_product_form text,p_language text DEFAULT 'en',p_edition_label text DEFAULT 'First edition')
RETURNS TABLE(assignment_id uuid,isbn13 text,product_form text,language text,edition_label text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_profile public.book_publishing_profiles%ROWTYPE; v_imprint public.publishing_imprints%ROWTYPE; v_inventory public.isbn_inventory%ROWTYPE; v_existing public.book_isbn_assignments%ROWTYPE;
BEGIN
  IF p_product_form NOT IN ('paperback','hardcover','epub','pdf','audiobook') THEN RAISE EXCEPTION 'INVALID_PRODUCT_FORM' USING ERRCODE='22023'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.books b WHERE b.id=p_book_id AND (b.user_id=p_user_id OR b.creator_id=p_user_id)) THEN RAISE EXCEPTION 'BOOK_NOT_OWNED' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_profile FROM public.book_publishing_profiles WHERE book_id=p_book_id AND owner_user_id=p_user_id;
  IF NOT FOUND OR v_profile.publisher_mode<>'platform_imprint' OR v_profile.imprint_id IS NULL THEN RAISE EXCEPTION 'PLATFORM_IMPRINT_REQUIRED' USING ERRCODE='23514'; END IF;
  SELECT * INTO v_imprint FROM public.publishing_imprints WHERE id=v_profile.imprint_id;
  IF NOT FOUND OR v_imprint.scope<>'platform' OR v_imprint.verified IS NOT TRUE THEN RAISE EXCEPTION 'VERIFIED_PLATFORM_IMPRINT_REQUIRED' USING ERRCODE='23514'; END IF;
  SELECT * INTO v_existing FROM public.book_isbn_assignments WHERE book_id=p_book_id AND product_form=p_product_form AND language=p_language AND edition_label=p_edition_label FOR UPDATE;
  IF v_existing.id IS NOT NULL AND v_existing.locked_at IS NOT NULL THEN
    SELECT * INTO v_inventory FROM public.isbn_inventory WHERE id=v_existing.isbn_id;
    RETURN QUERY SELECT v_existing.id,v_inventory.isbn13,p_product_form,p_language,p_edition_label; RETURN;
  END IF;
  SELECT * INTO v_inventory FROM public.isbn_inventory WHERE imprint_id=v_imprint.id AND source='platform_pool' AND status='available' ORDER BY created_at,id FOR UPDATE SKIP LOCKED LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'ISBN_POOL_EMPTY' USING ERRCODE='P0002'; END IF;
  IF v_existing.id IS NULL THEN
    INSERT INTO public.book_isbn_assignments(book_id,isbn_id,product_form,language,edition_label,assigned_by) VALUES(p_book_id,v_inventory.id,p_product_form,p_language,p_edition_label,p_user_id) RETURNING * INTO v_existing;
  ELSE
    UPDATE public.isbn_inventory SET status='available' WHERE id=v_existing.isbn_id;
    UPDATE public.book_isbn_assignments SET isbn_id=v_inventory.id,assigned_by=p_user_id,assigned_at=now() WHERE id=v_existing.id RETURNING * INTO v_existing;
  END IF;
  UPDATE public.isbn_inventory SET status='assigned' WHERE id=v_inventory.id;
  IF p_product_form='paperback' THEN UPDATE public.books SET isbn=v_inventory.isbn13 WHERE id=p_book_id; END IF;
  RETURN QUERY SELECT v_existing.id,v_inventory.isbn13,p_product_form,p_language,p_edition_label;
END $$;

CREATE OR REPLACE FUNCTION public.lock_book_isbn_assignments(p_book_id uuid,p_publication_id uuid)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_count integer;
BEGIN
  IF EXISTS(SELECT 1 FROM public.book_isbn_assignments a WHERE a.book_id=p_book_id AND a.locked_publication_id IS NOT NULL AND a.locked_publication_id<>p_publication_id) THEN
    RAISE EXCEPTION 'ISBN_ASSIGNMENT_ALREADY_LOCKED_TO_OTHER_PUBLICATION' USING ERRCODE='23514';
  END IF;
  UPDATE public.book_isbn_assignments SET locked_at=COALESCE(locked_at,now()),locked_publication_id=COALESCE(locked_publication_id,p_publication_id) WHERE book_id=p_book_id;
  GET DIAGNOSTICS v_count=ROW_COUNT; RETURN v_count;
END $$;
REVOKE ALL ON FUNCTION public.assign_owned_isbn(uuid,uuid,text,text,text,text),public.allocate_platform_isbn(uuid,uuid,text,text,text),public.lock_book_isbn_assignments(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.assign_owned_isbn(uuid,uuid,text,text,text,text),public.allocate_platform_isbn(uuid,uuid,text,text,text),public.lock_book_isbn_assignments(uuid,uuid) TO service_role;

-- -------------------------------------------------------------------------
-- Controlled commercial metadata
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.book_distribution_metadata (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_form text NOT NULL CHECK(product_form IN ('paperback','hardcover','epub')),
  language text NOT NULL DEFAULT 'en',
  edition_label text NOT NULL DEFAULT 'First edition',
  publication_date date,
  warengruppe_code text CHECK(warengruppe_code IS NULL OR warengruppe_code ~ '^[0-9]{4}$'),
  product_availability text CHECK(product_availability IS NULL OR product_availability ~ '^[0-9]{2}$'),
  publishing_status text CHECK(publishing_status IS NULL OR publishing_status ~ '^[0-9]{2}$'),
  price_type text CHECK(price_type IS NULL OR price_type IN ('02','04','12','14')),
  price_cents integer CHECK(price_cents IS NULL OR price_cents>=0),
  currency text NOT NULL DEFAULT 'EUR' CHECK(currency ~ '^[A-Z]{3}$'),
  price_country text NOT NULL DEFAULT 'DE' CHECK(price_country ~ '^[A-Z]{2}$'),
  tax_rate_code text CHECK(tax_rate_code IS NULL OR tax_rate_code IN ('R','S')),
  tax_rate_percent numeric(6,3) CHECK(tax_rate_percent IS NULL OR (tax_rate_percent>=0 AND tax_rate_percent<=100)),
  unpriced_item_type text CHECK(unpriced_item_type IS NULL OR unpriced_item_type IN ('01','02')),
  thema_codes text[] NOT NULL DEFAULT ARRAY[]::text[],
  keywords text[] NOT NULL DEFAULT ARRAY[]::text[],
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT book_distribution_metadata_identity_uq UNIQUE(book_id,product_form,language,edition_label),
  CONSTRAINT book_distribution_metadata_price_shape CHECK((price_cents IS NULL AND price_type IS NULL) OR (price_cents IS NOT NULL AND price_type IS NOT NULL)),
  CONSTRAINT book_distribution_metadata_priced_or_unpriced CHECK(NOT(price_cents IS NOT NULL AND unpriced_item_type IS NOT NULL))
);
ALTER TABLE public.book_distribution_metadata ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.book_distribution_metadata FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.book_distribution_metadata TO authenticated;
GRANT ALL ON public.book_distribution_metadata TO service_role;
DROP POLICY IF EXISTS book_distribution_metadata_read ON public.book_distribution_metadata;
CREATE POLICY book_distribution_metadata_read ON public.book_distribution_metadata FOR SELECT TO authenticated
USING(owner_user_id=auth.uid() AND EXISTS(SELECT 1 FROM public.books b WHERE b.id=book_distribution_metadata.book_id AND (b.user_id=auth.uid() OR b.creator_id=auth.uid())));
DROP TRIGGER IF EXISTS trg_book_distribution_metadata_updated_at ON public.book_distribution_metadata;
CREATE TRIGGER trg_book_distribution_metadata_updated_at BEFORE UPDATE ON public.book_distribution_metadata FOR EACH ROW EXECUTE FUNCTION public.touch_publishing_identity_updated_at();

-- -------------------------------------------------------------------------
-- Publication media / cover provenance
-- -------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.scrollvision_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), source text NOT NULL, source_id text, source_url text NOT NULL,
  image_url text NOT NULL, thumbnail_url text, title text, description text, license text, attribution text,
  entity text, query text, content_hash text UNIQUE, width integer, height integer, relevance_score numeric DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.scrollvision_assets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.scrollvision_assets FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.scrollvision_assets TO authenticated;
GRANT ALL ON public.scrollvision_assets TO service_role;
DROP POLICY IF EXISTS scrollvision_assets_read ON public.scrollvision_assets;
CREATE POLICY scrollvision_assets_read ON public.scrollvision_assets FOR SELECT TO authenticated USING(true);

CREATE TABLE IF NOT EXISTS public.scrollvision_chapter_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  chapter_id uuid NOT NULL REFERENCES public.chapters(id) ON DELETE CASCADE,
  asset_id uuid NOT NULL REFERENCES public.scrollvision_assets(id) ON DELETE CASCADE,
  placement_order integer NOT NULL DEFAULT 0, caption text, entity text, is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(chapter_id,asset_id)
);
ALTER TABLE public.scrollvision_chapter_assets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.scrollvision_chapter_assets FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.scrollvision_chapter_assets TO authenticated;
GRANT ALL ON public.scrollvision_chapter_assets TO service_role;
DROP POLICY IF EXISTS scrollvision_chapter_assets_read ON public.scrollvision_chapter_assets;
CREATE POLICY scrollvision_chapter_assets_read ON public.scrollvision_chapter_assets FOR SELECT TO authenticated USING(true);

CREATE TABLE IF NOT EXISTS public.book_asset_provenance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  asset_role text NOT NULL CHECK(asset_role IN ('cover','chapter_media','other')),
  asset_url text NOT NULL,
  source_type text NOT NULL CHECK(source_type IN ('ai_generated','user_upload','external_licensed')),
  rights_basis text NOT NULL, license text, attribution text, source_url text, provider text, model text,
  user_attested boolean NOT NULL DEFAULT false, attested_by uuid, metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(book_id,asset_role,asset_url)
);
ALTER TABLE public.book_asset_provenance ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.book_asset_provenance FROM PUBLIC,anon,authenticated;
GRANT ALL ON public.book_asset_provenance TO service_role;

-- -------------------------------------------------------------------------
-- Rich publication hash. Existing legacy attestations will no longer match it.
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.compute_book_publication_hash(p_book_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
WITH book_payload AS (
  SELECT pg_catalog.concat_ws(E'\x1f',b.id::text,COALESCE(b.title,''),COALESCE(b.description,''),b.category::text,
    COALESCE(b.book_type,''),COALESCE(b.language,''),COALESCE(b.cover_image_url,''),COALESCE(b.author_mode,''),
    COALESCE(b.author_display_name,''),COALESCE(b.pen_name,''),COALESCE(b.publisher_imprint,''),COALESCE(b.work_id::text,'')) payload
  FROM public.books b WHERE b.id=p_book_id
), work_payload AS (
  SELECT pg_catalog.string_agg(pg_catalog.concat_ws(E'\x1f',COALESCE(w.id::text,''),COALESCE(w.title,''),COALESCE(w.original_language,'')),E'\x1e' ORDER BY COALESCE(w.id::text,'')) payload
  FROM public.books b LEFT JOIN public.works w ON w.id=b.work_id WHERE b.id=p_book_id
), author_payload AS (
  SELECT pg_catalog.string_agg(pg_catalog.concat_ws(E'\x1f',COALESCE(wa.user_id::text,''),COALESCE(wa.display_name,''),COALESCE(wa.author_role::text,''),COALESCE(wa.sort_order,0)::text,COALESCE(wa.contribution_percentage,0)::text),E'\x1e' ORDER BY COALESCE(wa.sort_order,0),COALESCE(wa.display_name,''),COALESCE(wa.user_id::text,'')) payload
  FROM public.books b JOIN public.work_authors wa ON wa.work_id=b.work_id WHERE b.id=p_book_id
), rights_payload AS (
  SELECT pg_catalog.string_agg(pg_catalog.concat_ws(E'\x1f',wr.rights_holder_id::text,COALESCE(wr.rights_class::text,''),COALESCE(wr.rights_scope::text,''),COALESCE(wr.territory,''),COALESCE(wr.language,''),COALESCE(rh.display_name,''),COALESCE(rh.holder_type::text,''),COALESCE(rh.country_code,'')),E'\x1e' ORDER BY wr.rights_holder_id,wr.rights_class::text,wr.rights_scope::text,wr.territory,wr.language) payload
  FROM public.books b JOIN public.work_rights wr ON wr.work_id=b.work_id LEFT JOIN public.rights_holders rh ON rh.id=wr.rights_holder_id WHERE b.id=p_book_id
), listing_payload AS (
  SELECT pg_catalog.string_agg(pg_catalog.concat_ws(E'\x1f',COALESCE(pl.slug,''),COALESCE(pl.subtitle,'')),E'\x1e' ORDER BY COALESCE(pl.slug,''),COALESCE(pl.subtitle,'')) payload
  FROM public.public_listings pl WHERE pl.book_id=p_book_id
), chapter_payload AS (
  SELECT pg_catalog.string_agg(pg_catalog.concat_ws(E'\x1f',c.id::text,c.chapter_number::text,COALESCE(c.title,''),COALESCE(c.content,''),COALESCE(c.is_generated,false)::text,COALESCE(c.version_number,1)::text,COALESCE(c.academic_mode,false)::text,COALESCE(c.citation_style,''),COALESCE(c.chapter_references,'[]'::jsonb)::text),E'\x1e' ORDER BY c.chapter_number,c.id) payload
  FROM public.chapters c WHERE c.book_id=p_book_id
), media_payload AS (
  SELECT pg_catalog.string_agg(pg_catalog.concat_ws(E'\x1f',ca.chapter_id::text,ca.asset_id::text,ca.placement_order::text,COALESCE(ca.caption,''),COALESCE(ca.entity,''),a.source,COALESCE(a.source_id,''),a.source_url,a.image_url,COALESCE(a.license,''),COALESCE(a.attribution,''),COALESCE(a.content_hash,'')),E'\x1e' ORDER BY ca.chapter_id,ca.placement_order,ca.asset_id) payload
  FROM public.scrollvision_chapter_assets ca JOIN public.scrollvision_assets a ON a.id=ca.asset_id WHERE ca.book_id=p_book_id AND ca.is_active IS TRUE
), cover_payload AS (
  SELECT pg_catalog.string_agg(pg_catalog.concat_ws(E'\x1f',p.asset_url,p.source_type,p.rights_basis,COALESCE(p.license,''),COALESCE(p.attribution,''),COALESCE(p.source_url,''),COALESCE(p.provider,''),COALESCE(p.model,''),p.user_attested::text,COALESCE(p.attested_by::text,'')),E'\x1e' ORDER BY p.id) payload
  FROM public.book_asset_provenance p JOIN public.books b ON b.id=p.book_id WHERE p.book_id=p_book_id AND p.asset_role='cover' AND p.asset_url=COALESCE(b.cover_image_url,'')
), profile_payload AS (
  SELECT pg_catalog.string_agg(pg_catalog.concat_ws(E'\x1f',pp.publisher_mode,COALESCE(pp.edition_label,''),COALESCE(pp.publication_language,''),pp.print_identifier_strategy,pp.ebook_identifier_strategy,pp.distribution_scope,COALESCE(pp.imprint_id::text,''),COALESCE(pi.scope,''),COALESCE(pi.publisher_name,''),COALESCE(pi.imprint_name,''),COALESCE(pi.country_code,''),COALESCE(pi.isbn_agency_name,''),COALESCE(pi.registrant_name,''),COALESCE(pi.agency_record_attested,false)::text,COALESCE(pi.verified,false)::text),E'\x1e' ORDER BY pp.book_id) payload
  FROM public.book_publishing_profiles pp LEFT JOIN public.publishing_imprints pi ON pi.id=pp.imprint_id WHERE pp.book_id=p_book_id
), isbn_payload AS (
  SELECT pg_catalog.string_agg(pg_catalog.concat_ws(E'\x1f',ba.product_form,ba.language,ba.edition_label,i.isbn13,i.source,i.imprint_id::text,COALESCE(ba.locked_publication_id::text,'')),E'\x1e' ORDER BY ba.product_form,ba.language,ba.edition_label,i.isbn13) payload
  FROM public.book_isbn_assignments ba JOIN public.isbn_inventory i ON i.id=ba.isbn_id WHERE ba.book_id=p_book_id
)
SELECT pg_catalog.encode(extensions.digest(bp.payload||E'\x1d'||COALESCE(wp.payload,'')||E'\x1c'||COALESCE(ap.payload,'')||E'\x1b'||COALESCE(rp.payload,'')||E'\x1a'||COALESCE(lp.payload,'')||E'\x19'||COALESCE(cp.payload,'')||E'\x18'||COALESCE(mp.payload,'')||E'\x17'||COALESCE(cvp.payload,'')||E'\x16'||COALESCE(pp.payload,'')||E'\x15'||COALESCE(ip.payload,''),'sha256'),'hex')
FROM book_payload bp CROSS JOIN work_payload wp CROSS JOIN author_payload ap CROSS JOIN rights_payload rp CROSS JOIN listing_payload lp CROSS JOIN chapter_payload cp CROSS JOIN media_payload mp CROSS JOIN cover_payload cvp CROSS JOIN profile_payload pp CROSS JOIN isbn_payload ip;
$$;
REVOKE ALL ON FUNCTION public.compute_book_publication_hash(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.compute_book_publication_hash(uuid) TO service_role;

COMMENT ON FUNCTION public.compute_book_publication_hash(uuid) IS 'Rich publication fingerprint over work, title/subtitle, contributors, rights, manuscript, media/provenance, publisher/imprint and format-specific ISBN identity.';
