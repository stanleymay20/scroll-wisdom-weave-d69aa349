
-- =========================================================================
-- Phase 1 Migration A — Work/Publication/Export foundation (ADDITIVE ONLY)
-- =========================================================================

-- ---- Enums --------------------------------------------------------------

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
    'verified_published','draft_export','collaborative_draft','private_review','internal_preview'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.publication_edition_kind AS ENUM (
    'original','translation','revision','adaptation','student_edition','executive_edition','audiobook_edition','print_edition'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.ownership_transfer_status AS ENUM ('pending','accepted','cancelled','expired','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.ai_review_status AS ENUM ('pending','accepted','rejected','modified');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---- 1. rights_holders --------------------------------------------------

CREATE TABLE IF NOT EXISTS public.rights_holders (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  holder_type      public.rights_holder_type NOT NULL,
  user_id          UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id  UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
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

CREATE POLICY rights_holders_select_self_or_org
  ON public.rights_holders FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR organization_id IN (
      SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY rights_holders_insert_self
  ON public.rights_holders FOR INSERT TO authenticated
  WITH CHECK (
    (holder_type = 'individual' AND user_id = auth.uid())
    OR (organization_id IS NOT NULL AND organization_id IN (
      SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid() AND role IN ('owner','admin')
    ))
  );

CREATE POLICY rights_holders_update_self
  ON public.rights_holders FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ---- 2. works -----------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.works (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title                    TEXT NOT NULL,
  original_language        TEXT NOT NULL DEFAULT 'en',
  work_type                TEXT NOT NULL DEFAULT 'book',
  subject_codes            JSONB NOT NULL DEFAULT '[]'::jsonb,
  description              TEXT,
  owner_rights_holder_id   UUID NOT NULL REFERENCES public.rights_holders(id) ON DELETE RESTRICT,
  created_by               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  publish_locked_at        TIMESTAMPTZ,
  publish_locked_by        UUID REFERENCES auth.users(id),
  publish_lock_reason      TEXT,
  current_publication_id   UUID,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_works_owner ON public.works(owner_rights_holder_id);
CREATE INDEX IF NOT EXISTS idx_works_created_by ON public.works(created_by);

GRANT SELECT, INSERT, UPDATE ON public.works TO authenticated;
GRANT ALL ON public.works TO service_role;
ALTER TABLE public.works ENABLE ROW LEVEL SECURITY;

CREATE POLICY works_select_owner
  ON public.works FOR SELECT TO authenticated
  USING (
    created_by = auth.uid()
    OR owner_rights_holder_id IN (SELECT id FROM public.rights_holders WHERE user_id = auth.uid())
  );

CREATE POLICY works_insert_self
  ON public.works FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY works_update_owner_only
  ON public.works FOR UPDATE TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

-- ---- 3. work_authors ----------------------------------------------------

CREATE TABLE IF NOT EXISTS public.work_authors (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id                  UUID NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,
  user_id                  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  display_name             TEXT NOT NULL,
  biography                TEXT,
  photo_url                TEXT,
  author_role              public.work_author_role NOT NULL DEFAULT 'primary',
  contribution_percentage  NUMERIC(5,2),
  sort_order               INTEGER NOT NULL DEFAULT 0,
  verified                 BOOLEAN NOT NULL DEFAULT false,
  verified_at              TIMESTAMPTZ,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_work_authors_work ON public.work_authors(work_id);
CREATE INDEX IF NOT EXISTS idx_work_authors_user ON public.work_authors(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_work_authors_primary
  ON public.work_authors(work_id) WHERE author_role = 'primary';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.work_authors TO authenticated;
GRANT ALL ON public.work_authors TO service_role;
ALTER TABLE public.work_authors ENABLE ROW LEVEL SECURITY;

CREATE POLICY work_authors_select
  ON public.work_authors FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.works w WHERE w.id = work_authors.work_id AND w.created_by = auth.uid())
  );

CREATE POLICY work_authors_insert_owner
  ON public.work_authors FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.works w WHERE w.id = work_authors.work_id AND w.created_by = auth.uid()));

CREATE POLICY work_authors_update_owner_or_self
  ON public.work_authors FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.works w WHERE w.id = work_authors.work_id AND w.created_by = auth.uid())
    OR user_id = auth.uid()
  );

CREATE POLICY work_authors_delete_owner
  ON public.work_authors FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.works w WHERE w.id = work_authors.work_id AND w.created_by = auth.uid()));

-- ---- 4. work_rights -----------------------------------------------------

CREATE TABLE IF NOT EXISTS public.work_rights (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id             UUID NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,
  rights_holder_id    UUID NOT NULL REFERENCES public.rights_holders(id) ON DELETE RESTRICT,
  rights_class        public.rights_class NOT NULL,
  rights_scope        JSONB NOT NULL DEFAULT '{}'::jsonb,
  territory           TEXT NOT NULL DEFAULT 'world',
  language            TEXT NOT NULL DEFAULT '*',
  effective_from      TIMESTAMPTZ NOT NULL DEFAULT now(),
  effective_to        TIMESTAMPTZ,
  source_contract_ref TEXT,
  created_by          UUID REFERENCES auth.users(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_work_rights_current
  ON public.work_rights(work_id, rights_class, rights_holder_id, territory, language)
  WHERE effective_to IS NULL;
CREATE INDEX IF NOT EXISTS idx_work_rights_work ON public.work_rights(work_id);

GRANT SELECT, INSERT, UPDATE ON public.work_rights TO authenticated;
GRANT ALL ON public.work_rights TO service_role;
ALTER TABLE public.work_rights ENABLE ROW LEVEL SECURITY;

CREATE POLICY work_rights_select
  ON public.work_rights FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.works w WHERE w.id = work_rights.work_id AND w.created_by = auth.uid())
    OR rights_holder_id IN (SELECT id FROM public.rights_holders WHERE user_id = auth.uid())
  );

CREATE POLICY work_rights_write_owner
  ON public.work_rights FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.works w WHERE w.id = work_rights.work_id AND w.created_by = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.works w WHERE w.id = work_rights.work_id AND w.created_by = auth.uid()));

-- ---- 5. rights_history --------------------------------------------------

CREATE TABLE IF NOT EXISTS public.rights_history (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id             UUID NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,
  rights_holder_id    UUID NOT NULL REFERENCES public.rights_holders(id),
  rights_class        public.rights_class NOT NULL,
  rights_scope        JSONB NOT NULL DEFAULT '{}'::jsonb,
  territory           TEXT NOT NULL DEFAULT 'world',
  language            TEXT NOT NULL DEFAULT '*',
  effective_from      TIMESTAMPTZ NOT NULL,
  effective_to        TIMESTAMPTZ,
  change_action       public.rights_change_action NOT NULL,
  change_reason       TEXT,
  changed_by          UUID REFERENCES auth.users(id),
  superseded_by_id    UUID REFERENCES public.rights_history(id),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rights_history_work ON public.rights_history(work_id);

GRANT SELECT ON public.rights_history TO authenticated;
GRANT ALL ON public.rights_history TO service_role;
ALTER TABLE public.rights_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY rights_history_select_owner
  ON public.rights_history FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.works w WHERE w.id = rights_history.work_id AND w.created_by = auth.uid()));

CREATE OR REPLACE FUNCTION public.tg_work_rights_history()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.rights_history(work_id, rights_holder_id, rights_class, rights_scope, territory, language,
      effective_from, effective_to, change_action, changed_by)
    VALUES (NEW.work_id, NEW.rights_holder_id, NEW.rights_class, NEW.rights_scope, NEW.territory, NEW.language,
      NEW.effective_from, NEW.effective_to, 'grant', NEW.created_by);
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.rights_history(work_id, rights_holder_id, rights_class, rights_scope, territory, language,
      effective_from, effective_to, change_action, changed_by)
    VALUES (NEW.work_id, NEW.rights_holder_id, NEW.rights_class, NEW.rights_scope, NEW.territory, NEW.language,
      NEW.effective_from, NEW.effective_to, 'amend', auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.rights_history(work_id, rights_holder_id, rights_class, rights_scope, territory, language,
      effective_from, effective_to, change_action, changed_by)
    VALUES (OLD.work_id, OLD.rights_holder_id, OLD.rights_class, OLD.rights_scope, OLD.territory, OLD.language,
      OLD.effective_from, now(), 'revoke', auth.uid());
    RETURN OLD;
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS trg_work_rights_history ON public.work_rights;
CREATE TRIGGER trg_work_rights_history
AFTER INSERT OR UPDATE OR DELETE ON public.work_rights
FOR EACH ROW EXECUTE FUNCTION public.tg_work_rights_history();

-- ---- 6. publications ----------------------------------------------------

CREATE TABLE IF NOT EXISTS public.publications (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id                  UUID NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,
  edition_kind             public.publication_edition_kind NOT NULL DEFAULT 'original',
  language                 TEXT NOT NULL DEFAULT 'en',
  parent_publication_id    UUID REFERENCES public.publications(id),
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
  published_by             UUID REFERENCES auth.users(id),
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

CREATE POLICY publications_select
  ON public.publications FOR SELECT TO authenticated
  USING (
    status = 'published'
    OR EXISTS (SELECT 1 FROM public.works w WHERE w.id = publications.work_id AND w.created_by = auth.uid())
  );

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

-- ---- 7. publication_certificates ----------------------------------------

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

CREATE POLICY publication_certs_select
  ON public.publication_certificates FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.publications p
    WHERE p.id = publication_certificates.publication_id
      AND (p.status = 'published'
           OR EXISTS (SELECT 1 FROM public.works w WHERE w.id = p.work_id AND w.created_by = auth.uid()))
  ));

ALTER TABLE public.publications
  DROP CONSTRAINT IF EXISTS publications_certificate_fk;
ALTER TABLE public.publications
  ADD CONSTRAINT publications_certificate_fk
  FOREIGN KEY (certificate_id) REFERENCES public.publication_certificates(id) ON DELETE SET NULL;

-- ---- 8. exports ---------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.exports (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_id         UUID REFERENCES public.publications(id) ON DELETE SET NULL,
  certificate_id         UUID REFERENCES public.publication_certificates(id) ON DELETE SET NULL,
  work_id                UUID REFERENCES public.works(id) ON DELETE SET NULL,
  book_id                UUID REFERENCES public.books(id) ON DELETE SET NULL,
  exported_by            UUID NOT NULL REFERENCES auth.users(id),
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

CREATE POLICY exports_select_self_or_owner
  ON public.exports FOR SELECT TO authenticated
  USING (
    exported_by = auth.uid()
    OR EXISTS (SELECT 1 FROM public.works w WHERE w.id = exports.work_id AND w.created_by = auth.uid())
  );

-- ---- 9. ownership_transfers ---------------------------------------------

CREATE TABLE IF NOT EXISTS public.ownership_transfers (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id                  UUID NOT NULL REFERENCES public.works(id) ON DELETE CASCADE,
  from_rights_holder_id    UUID NOT NULL REFERENCES public.rights_holders(id),
  to_rights_holder_id      UUID NOT NULL REFERENCES public.rights_holders(id),
  requested_by             UUID NOT NULL REFERENCES auth.users(id),
  requested_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at              TIMESTAMPTZ,
  cancelled_at             TIMESTAMPTZ,
  expires_at               TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '30 days'),
  status                   public.ownership_transfer_status NOT NULL DEFAULT 'pending',
  reason                   TEXT
);

CREATE INDEX IF NOT EXISTS idx_ownership_transfers_work ON public.ownership_transfers(work_id);

GRANT SELECT, INSERT, UPDATE ON public.ownership_transfers TO authenticated;
GRANT ALL ON public.ownership_transfers TO service_role;
ALTER TABLE public.ownership_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY ownership_transfers_select
  ON public.ownership_transfers FOR SELECT TO authenticated
  USING (
    requested_by = auth.uid()
    OR from_rights_holder_id IN (SELECT id FROM public.rights_holders WHERE user_id = auth.uid())
    OR to_rights_holder_id IN (SELECT id FROM public.rights_holders WHERE user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.works w WHERE w.id = ownership_transfers.work_id AND w.created_by = auth.uid())
  );

CREATE POLICY ownership_transfers_insert_owner
  ON public.ownership_transfers FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.works w WHERE w.id = ownership_transfers.work_id AND w.created_by = auth.uid()));

CREATE POLICY ownership_transfers_update_party
  ON public.ownership_transfers FOR UPDATE TO authenticated
  USING (
    requested_by = auth.uid()
    OR to_rights_holder_id IN (SELECT id FROM public.rights_holders WHERE user_id = auth.uid())
  );

-- ---- 10. ai_attribution_ledger -----------------------------------------

CREATE TABLE IF NOT EXISTS public.ai_attribution_ledger (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id              UUID REFERENCES public.works(id) ON DELETE CASCADE,
  publication_id       UUID REFERENCES public.publications(id) ON DELETE SET NULL,
  chapter_id           UUID,
  model_name           TEXT,
  model_version        TEXT,
  model_provider       TEXT,
  prompt_hash          TEXT,
  operation            TEXT,
  purpose              TEXT,
  human_review_status  public.ai_review_status NOT NULL DEFAULT 'pending',
  final_editor_id      UUID REFERENCES auth.users(id),
  input_tokens         INTEGER,
  output_tokens        INTEGER,
  cost_cents           INTEGER,
  correlation_id       TEXT,
  owner_approved       BOOLEAN NOT NULL DEFAULT false,
  approved_by          UUID REFERENCES auth.users(id),
  approved_at          TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_ledger_work ON public.ai_attribution_ledger(work_id);

GRANT SELECT ON public.ai_attribution_ledger TO authenticated;
GRANT ALL ON public.ai_attribution_ledger TO service_role;
ALTER TABLE public.ai_attribution_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY ai_ledger_select_owner
  ON public.ai_attribution_ledger FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.works w WHERE w.id = ai_attribution_ledger.work_id AND w.created_by = auth.uid()));

-- ---- 11. authorship_audit_log ------------------------------------------

CREATE TABLE IF NOT EXISTS public.authorship_audit_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_id         UUID REFERENCES public.works(id) ON DELETE CASCADE,
  book_id         UUID REFERENCES public.books(id) ON DELETE SET NULL,
  publication_id  UUID REFERENCES public.publications(id) ON DELETE SET NULL,
  user_id         UUID REFERENCES auth.users(id),
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

CREATE POLICY authorship_audit_select_owner
  ON public.authorship_audit_log FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.works w WHERE w.id = authorship_audit_log.work_id AND w.created_by = auth.uid())
  );

-- ---- 12. Additive columns on existing tables ----------------------------

ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS work_id                UUID REFERENCES public.works(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS current_publication_id UUID REFERENCES public.publications(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS publish_locked_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS publish_locked_by      UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS publish_lock_reason    TEXT;

CREATE INDEX IF NOT EXISTS idx_books_work_id ON public.books(work_id);

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS org_type TEXT;

-- ---- 13. updated_at triggers -------------------------------------------

CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_works_updated      BEFORE UPDATE ON public.works            FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_rh_updated         BEFORE UPDATE ON public.rights_holders   FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_wa_updated         BEFORE UPDATE ON public.work_authors     FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_wr_updated         BEFORE UPDATE ON public.work_rights      FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TRIGGER trg_pub_updated        BEFORE UPDATE ON public.publications     FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---- 14. ensure_individual_rights_holder --------------------------------

CREATE OR REPLACE FUNCTION public.ensure_individual_rights_holder(_user_id UUID, _display_name TEXT DEFAULT NULL)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  rh_id UUID;
  fallback_name TEXT;
BEGIN
  SELECT id INTO rh_id FROM public.rights_holders
   WHERE user_id = _user_id AND holder_type = 'individual'
   LIMIT 1;
  IF rh_id IS NOT NULL THEN RETURN rh_id; END IF;

  fallback_name := COALESCE(
    _display_name,
    (SELECT NULLIF(display_name,'') FROM public.profiles WHERE user_id = _user_id LIMIT 1),
    (SELECT email FROM auth.users WHERE id = _user_id LIMIT 1),
    'Author'
  );

  INSERT INTO public.rights_holders(holder_type, user_id, display_name)
  VALUES ('individual', _user_id, fallback_name)
  RETURNING id INTO rh_id;

  RETURN rh_id;
END $$;

GRANT EXECUTE ON FUNCTION public.ensure_individual_rights_holder(UUID, TEXT) TO authenticated, service_role;

-- ---- 15. verify_export_public (safe fields only) ------------------------

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
    'rights', COALESCE((
      SELECT jsonb_object_agg(wr.rights_class::text, jsonb_build_object('display_name', rh.display_name, 'holder_type', rh.holder_type))
      FROM public.work_rights wr
      JOIN public.rights_holders rh ON rh.id = wr.rights_holder_id
      WHERE wr.work_id = w.id
        AND wr.rights_class IN ('copyright_holder','publisher','distributor')
        AND wr.effective_to IS NULL
    ), '{}'::jsonb),
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
