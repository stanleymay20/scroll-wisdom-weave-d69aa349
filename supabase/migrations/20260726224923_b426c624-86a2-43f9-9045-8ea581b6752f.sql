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
    'attribution','integrity','name_protection',
    'copyright_holder','publisher','distributor','licensing','royalties','pricing',
    'subsidiary_rights','audiobook_rights','translation_rights','film_rights'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.rights_change_action AS ENUM ('grant','revoke','transfer','expire','amend');
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

DO $$ BEGIN
  CREATE TYPE public.publication_edition_kind AS ENUM (
    'original','translation','revision','adaptation','student_edition','executive_edition','audiobook_edition','print_edition'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.rights_holders (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  holder_type      public.rights_holder_type NOT NULL,
  user_id          UUID,
  organization_id  UUID,
  display_name     TEXT NOT NULL,
  legal_name       TEXT,
  country_code     TEXT,
  verified         BOOLEAN NOT NULL DEFAULT false,
  verified_at      TIMESTAMPTZ,
  metadata         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT rights_holders_individual_user_unique UNIQUE (user_id, holder_type)
);
GRANT SELECT, INSERT, UPDATE ON public.rights_holders TO authenticated;
GRANT ALL ON public.rights_holders TO service_role;
ALTER TABLE public.rights_holders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rights_holders_select_self_or_org ON public.rights_holders;
CREATE POLICY rights_holders_select_self_or_org
  ON public.rights_holders FOR SELECT TO authenticated
  USING (user_id = auth.uid());
DROP POLICY IF EXISTS rights_holders_insert_self ON public.rights_holders;
CREATE POLICY rights_holders_insert_self
  ON public.rights_holders FOR INSERT TO authenticated
  WITH CHECK (holder_type = 'individual' AND user_id = auth.uid());
DROP POLICY IF EXISTS rights_holders_update_self ON public.rights_holders;
CREATE POLICY rights_holders_update_self
  ON public.rights_holders FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE TABLE IF NOT EXISTS public.works (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title                    TEXT NOT NULL,
  original_language        TEXT NOT NULL DEFAULT 'en',
  work_type                TEXT NOT NULL DEFAULT 'book',
  subject_codes            JSONB NOT NULL DEFAULT '[]'::jsonb,
  description              TEXT,
  owner_rights_holder_id   UUID REFERENCES public.rights_holders(id) ON DELETE RESTRICT,
  created_by               UUID,
  publish_locked_at        TIMESTAMPTZ,
  publish_locked_by        UUID,
  publish_lock_reason      TEXT,
  current_publication_id   UUID,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_works_created_by ON public.works(created_by);
GRANT SELECT, INSERT, UPDATE ON public.works TO authenticated;
GRANT ALL ON public.works TO service_role;
ALTER TABLE public.works ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS works_select_owner ON public.works;
CREATE POLICY works_select_owner
  ON public.works FOR SELECT TO authenticated
  USING (created_by = auth.uid());
DROP POLICY IF EXISTS works_insert_owner ON public.works;
CREATE POLICY works_insert_owner
  ON public.works FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());
DROP POLICY IF EXISTS works_update_owner ON public.works;
CREATE POLICY works_update_owner
  ON public.works FOR UPDATE TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

CREATE TABLE IF NOT EXISTS public.work_authors (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id          UUID NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,
  rights_holder_id UUID REFERENCES public.rights_holders(id) ON DELETE SET NULL,
  user_id          UUID,
  display_name     TEXT NOT NULL,
  author_role      public.work_author_role NOT NULL DEFAULT 'primary',
  sort_order       INTEGER NOT NULL DEFAULT 0,
  attribution_text TEXT,
  metadata         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_work_authors_work ON public.work_authors(work_id);
GRANT SELECT, INSERT, UPDATE ON public.work_authors TO authenticated;
GRANT ALL ON public.work_authors TO service_role;
ALTER TABLE public.work_authors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS work_authors_select_owner ON public.work_authors;
CREATE POLICY work_authors_select_owner
  ON public.work_authors FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.works w WHERE w.id = work_authors.work_id AND w.created_by = auth.uid()));
DROP POLICY IF EXISTS work_authors_write_owner ON public.work_authors;
CREATE POLICY work_authors_write_owner
  ON public.work_authors FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.works w WHERE w.id = work_authors.work_id AND w.created_by = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.works w WHERE w.id = work_authors.work_id AND w.created_by = auth.uid()));

CREATE TABLE IF NOT EXISTS public.work_rights (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id          UUID NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,
  rights_holder_id UUID NOT NULL REFERENCES public.rights_holders(id) ON DELETE RESTRICT,
  rights_class     public.rights_class NOT NULL,
  change_action    public.rights_change_action NOT NULL DEFAULT 'grant',
  effective_from   TIMESTAMPTZ NOT NULL DEFAULT now(),
  effective_to     TIMESTAMPTZ,
  metadata         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_work_rights_work ON public.work_rights(work_id);
GRANT SELECT, INSERT, UPDATE ON public.work_rights TO authenticated;
GRANT ALL ON public.work_rights TO service_role;
ALTER TABLE public.work_rights ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS work_rights_select_owner ON public.work_rights;
CREATE POLICY work_rights_select_owner
  ON public.work_rights FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.works w WHERE w.id = work_rights.work_id AND w.created_by = auth.uid()));
DROP POLICY IF EXISTS work_rights_write_owner ON public.work_rights;
CREATE POLICY work_rights_write_owner
  ON public.work_rights FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.works w WHERE w.id = work_rights.work_id AND w.created_by = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.works w WHERE w.id = work_rights.work_id AND w.created_by = auth.uid()));

CREATE TABLE IF NOT EXISTS public.publications (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id                  UUID NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,
  book_id                  UUID REFERENCES public.books(id) ON DELETE SET NULL,
  edition_kind             public.publication_edition_kind NOT NULL DEFAULT 'original',
  language                 TEXT NOT NULL DEFAULT 'en',
  version                  TEXT NOT NULL DEFAULT 'v1.0.0',
  semver_major             INTEGER NOT NULL DEFAULT 1,
  semver_minor             INTEGER NOT NULL DEFAULT 0,
  semver_patch             INTEGER NOT NULL DEFAULT 0,
  status                   public.publication_status NOT NULL DEFAULT 'draft',
  integrity_level          public.publication_integrity NOT NULL DEFAULT 'draft_export',
  snapshot                 JSONB NOT NULL DEFAULT '{}'::jsonb,
  content_hash             TEXT,
  certificate_id           UUID,
  published_at             TIMESTAMPTZ,
  published_by             UUID,
  unpublished_at           TIMESTAMPTZ,
  unpublish_reason         TEXT,
  superseded_by_publication_id UUID REFERENCES public.publications(id),
  notes                    TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT publications_version_unique UNIQUE (work_id, edition_kind, language, version)
);
CREATE INDEX IF NOT EXISTS idx_publications_work ON public.publications(work_id);
CREATE INDEX IF NOT EXISTS idx_publications_status ON public.publications(status);
GRANT SELECT, INSERT, UPDATE ON public.publications TO authenticated;
GRANT ALL ON public.publications TO service_role;
ALTER TABLE public.publications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS publications_select ON public.publications;
CREATE POLICY publications_select
  ON public.publications FOR SELECT TO authenticated
  USING (status = 'published' OR EXISTS (SELECT 1 FROM public.works w WHERE w.id = publications.work_id AND w.created_by = auth.uid()));
DROP POLICY IF EXISTS publications_write_owner ON public.publications;
CREATE POLICY publications_write_owner
  ON public.publications FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.works w WHERE w.id = publications.work_id AND w.created_by = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.works w WHERE w.id = publications.work_id AND w.created_by = auth.uid()));

ALTER TABLE public.works
  DROP CONSTRAINT IF EXISTS works_current_publication_fk;
ALTER TABLE public.works
  ADD CONSTRAINT works_current_publication_fk
  FOREIGN KEY (current_publication_id) REFERENCES public.publications(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.tg_publications_enforce_immutability()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'published' AND NEW.status = 'published' THEN
    IF NEW.snapshot IS DISTINCT FROM OLD.snapshot
       OR NEW.content_hash IS DISTINCT FROM OLD.content_hash
       OR NEW.version IS DISTINCT FROM OLD.version
       OR NEW.edition_kind IS DISTINCT FROM OLD.edition_kind
       OR NEW.language IS DISTINCT FROM OLD.language THEN
      RAISE EXCEPTION 'publications_immutable: published publication snapshot/version/edition/language cannot be modified';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_publications_immutability ON public.publications;
CREATE TRIGGER trg_publications_immutability
BEFORE UPDATE ON public.publications
FOR EACH ROW EXECUTE FUNCTION public.tg_publications_enforce_immutability();

CREATE TABLE IF NOT EXISTS public.publication_certificates (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_id          UUID NOT NULL REFERENCES public.publications(id) ON DELETE CASCADE,
  work_id                 UUID NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,
  authors_snapshot        JSONB NOT NULL DEFAULT '[]'::jsonb,
  rights_holders_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  content_hash            TEXT NOT NULL,
  signature_algorithm     TEXT NOT NULL DEFAULT 'sha256',
  signature_value         TEXT,
  public_key_id           TEXT,
  issuer                  TEXT NOT NULL DEFAULT 'scrolllibrary',
  scrolllibrary_version   TEXT,
  issued_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at              TIMESTAMPTZ,
  revocation_reason       TEXT
);
CREATE INDEX IF NOT EXISTS idx_publication_certs_publication ON public.publication_certificates(publication_id);
GRANT SELECT ON public.publication_certificates TO authenticated;
GRANT ALL ON public.publication_certificates TO service_role;
ALTER TABLE public.publication_certificates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS publication_certs_select ON public.publication_certificates;
CREATE POLICY publication_certs_select
  ON public.publication_certificates FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.publications p
    WHERE p.id = publication_certificates.publication_id
      AND (p.status = 'published' OR EXISTS (SELECT 1 FROM public.works w WHERE w.id = p.work_id AND w.created_by = auth.uid()))
  ));
ALTER TABLE public.publications
  DROP CONSTRAINT IF EXISTS publications_certificate_fk;
ALTER TABLE public.publications
  ADD CONSTRAINT publications_certificate_fk
  FOREIGN KEY (certificate_id) REFERENCES public.publication_certificates(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.exports (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_id         UUID REFERENCES public.publications(id) ON DELETE SET NULL,
  certificate_id         UUID REFERENCES public.publication_certificates(id) ON DELETE SET NULL,
  work_id                UUID REFERENCES public.works(id) ON DELETE SET NULL,
  book_id                UUID REFERENCES public.books(id) ON DELETE SET NULL,
  exported_by            UUID NOT NULL,
  provider_id            TEXT NOT NULL,
  format                 TEXT NOT NULL,
  integrity_level        public.publication_integrity NOT NULL DEFAULT 'draft_export',
  file_hash              TEXT,
  signature_algorithm    TEXT,
  signature_value        TEXT,
  public_key_id          TEXT,
  renderer_version       TEXT,
  scrolllibrary_version  TEXT,
  watermark              JSONB NOT NULL DEFAULT '{}'::jsonb,
  client_metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  exported_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_exports_publication ON public.exports(publication_id);
CREATE INDEX IF NOT EXISTS idx_exports_user ON public.exports(exported_by);
GRANT SELECT ON public.exports TO authenticated;
GRANT ALL ON public.exports TO service_role;
ALTER TABLE public.exports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS exports_select_self_or_owner ON public.exports;
CREATE POLICY exports_select_self_or_owner
  ON public.exports FOR SELECT TO authenticated
  USING (exported_by = auth.uid() OR EXISTS (SELECT 1 FROM public.works w WHERE w.id = exports.work_id AND w.created_by = auth.uid()));

CREATE TABLE IF NOT EXISTS public.authorship_audit_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id         UUID REFERENCES public.works(id) ON DELETE CASCADE,
  book_id         UUID REFERENCES public.books(id) ON DELETE SET NULL,
  publication_id  UUID REFERENCES public.publications(id) ON DELETE SET NULL,
  user_id         UUID,
  actor_kind      TEXT NOT NULL DEFAULT 'human',
  action          TEXT NOT NULL,
  field_name      TEXT,
  old_value       JSONB,
  new_value       JSONB,
  allowed         BOOLEAN NOT NULL DEFAULT true,
  reason          TEXT,
  correlation_id  TEXT,
  metadata        JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_auth_audit_work ON public.authorship_audit_log(work_id);
CREATE INDEX IF NOT EXISTS idx_auth_audit_user ON public.authorship_audit_log(user_id);
GRANT SELECT ON public.authorship_audit_log TO authenticated;
GRANT ALL ON public.authorship_audit_log TO service_role;
ALTER TABLE public.authorship_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS authorship_audit_select_owner ON public.authorship_audit_log;
CREATE POLICY authorship_audit_select_owner
  ON public.authorship_audit_log FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.works w WHERE w.id = authorship_audit_log.work_id AND w.created_by = auth.uid()));

ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS work_id UUID REFERENCES public.works(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS current_publication_id UUID REFERENCES public.publications(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS publish_locked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS publish_locked_by UUID,
  ADD COLUMN IF NOT EXISTS publish_lock_reason TEXT;
CREATE INDEX IF NOT EXISTS idx_books_work_id ON public.books(work_id);

CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_works_updated BEFORE UPDATE ON public.works FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_rh_updated BEFORE UPDATE ON public.rights_holders FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_wa_updated BEFORE UPDATE ON public.work_authors FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_wr_updated BEFORE UPDATE ON public.work_rights FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_pub_updated BEFORE UPDATE ON public.publications FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE OR REPLACE FUNCTION public.verify_export_public(_export_id UUID)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  result JSONB;
BEGIN
  SELECT jsonb_build_object(
    'export_id', e.id,
    'exported_at', e.exported_at,
    'format', e.format,
    'provider_id', e.provider_id,
    'integrity_level', e.integrity_level,
    'file_hash', e.file_hash,
    'certificate_id', e.certificate_id,
    'signature_algorithm', e.signature_algorithm,
    'publication', CASE WHEN p.id IS NOT NULL THEN jsonb_build_object(
      'id', p.id,
      'version', p.version,
      'edition_kind', p.edition_kind,
      'language', p.language,
      'status', p.status,
      'published_at', p.published_at,
      'content_hash', p.content_hash
    ) ELSE NULL END,
    'work', CASE WHEN w.id IS NOT NULL THEN jsonb_build_object(
      'id', w.id,
      'title', w.title,
      'original_language', w.original_language
    ) ELSE NULL END,
    'authors', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('display_name', wa.display_name, 'role', wa.author_role) ORDER BY wa.sort_order)
      FROM public.work_authors wa WHERE wa.work_id = w.id
    ), '[]'::jsonb),
    'revoked', (c.revoked_at IS NOT NULL)
  ) INTO result
  FROM public.exports e
  LEFT JOIN public.publications p ON p.id = e.publication_id
  LEFT JOIN public.works w ON w.id = COALESCE(p.work_id, e.work_id)
  LEFT JOIN public.publication_certificates c ON c.id = e.certificate_id
  WHERE e.id = _export_id
    AND (p.status = 'published' OR p.id IS NULL);

  RETURN result;
END $$;
GRANT EXECUTE ON FUNCTION public.verify_export_public(UUID) TO anon, authenticated, service_role;