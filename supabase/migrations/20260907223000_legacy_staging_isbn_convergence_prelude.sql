-- Guarded prelude for the legacy ScrollLibrary GA staging database.
--
-- The GA staging project was created from an older Lovable schema lineage. It has
-- the Work/Publication spine, but it can legitimately lack the legacy author
-- identity columns that the authoritative publication hash/convergence migration
-- expects. It can also lack the Scroll product identity layer and ISBN subsystem.
--
-- This migration is intentionally narrow:
--   * it never invents, imports, allocates, verifies, assigns, or locks an ISBN;
--   * it never fabricates a Publication, Work, rights record, or certificate;
--   * it fails closed if the ISBN subsystem is absent while publication-critical
--     data exists, because that case requires a data-preserving migration plan;
--   * on an already-converged production database it is additive/idempotent.
--
-- After this prelude, the controlled legacy-staging recovery sequence follows
-- the CURRENT canonical dependency chain (not the older handoff order):
--   1. 20260906235000_live_publication_schema_convergence.sql
--   2. 20260906235500_scroll_identity_layer.sql
--   3. 20260907024300_isbn_provenance_and_publication_atomicity.sql
--   4. 20260907024310_imprint_verification_drift.sql
--   5. 20260907193000_isbn_governance_separation_and_atomic_mint.sql
--   6. 20260907193600_user_imprint_evidence_submission.sql
--   7. 20260907193800_bind_owned_isbn_claim_to_pending_imprint_evidence.sql
--   8. 20260907194000_isbn_retry_and_identity_drift_hardening.sql
--   9. 20260907194200_post_forensic_isbn_publication_invariants.sql
--  10. 20260907194300_snapshot_consistency_and_batch_trigger_safety.sql
--  11. 20260907194400_isbn_row_identity_immutability.sql
--  12. 20260907220000_isbn_independent_review_enforcement.sql
--
-- Unrelated migrations (for example interactive-voice quota changes) are not
-- replayed merely to imitate chronological history; only actual dependencies of
-- the publication/identifier contract belong in this controlled recovery path.

DO $$
DECLARE
  v_required_table text;
  v_legacy_isbn_missing boolean := to_regclass('public.publishing_imprints') IS NULL;
BEGIN
  IF v_legacy_isbn_missing THEN
    FOREACH v_required_table IN ARRAY ARRAY[
      'books',
      'works',
      'rights_holders',
      'work_authors',
      'work_rights',
      'publications',
      'publication_certificates',
      'author_profiles',
      'profiles',
      'public_listings',
      'scrollvision_assets',
      'scrollvision_chapter_assets',
      'user_roles'
    ]
    LOOP
      IF to_regclass('public.' || v_required_table) IS NULL THEN
        RAISE EXCEPTION 'LEGACY_STAGING_BASE_SCHEMA_MISSING:%', v_required_table
          USING ERRCODE = '55000';
      END IF;
    END LOOP;

    IF EXISTS (SELECT 1 FROM public.books LIMIT 1)
       OR EXISTS (SELECT 1 FROM public.works LIMIT 1)
       OR EXISTS (SELECT 1 FROM public.rights_holders LIMIT 1)
       OR EXISTS (SELECT 1 FROM public.work_authors LIMIT 1)
       OR EXISTS (SELECT 1 FROM public.work_rights LIMIT 1)
       OR EXISTS (SELECT 1 FROM public.publications LIMIT 1)
       OR EXISTS (SELECT 1 FROM public.publication_certificates LIMIT 1)
    THEN
      RAISE EXCEPTION 'LEGACY_STAGING_CONVERGENCE_REQUIRES_EMPTY_PUBLICATION_DOMAIN'
        USING ERRCODE = '55000';
    END IF;
  END IF;
END;
$$;

-- These four fields predate the Work/Publication convergence migration but are
-- still part of the canonical publication fingerprint. Legacy staging can lack
-- them even when newer Work/Publication tables are already present.
ALTER TABLE public.books
  ADD COLUMN IF NOT EXISTS author_mode text
    CHECK (author_mode IN ('user_name', 'pen_name', 'ai', 'hidden'))
    DEFAULT 'ai',
  ADD COLUMN IF NOT EXISTS author_display_name text,
  ADD COLUMN IF NOT EXISTS pen_name text,
  ADD COLUMN IF NOT EXISTS publisher_imprint text;

COMMENT ON COLUMN public.books.author_mode IS
  'Legacy-compatible authorship display mode retained in the canonical publication fingerprint.';
COMMENT ON COLUMN public.books.author_display_name IS
  'Legacy-compatible author display name retained in the canonical publication fingerprint.';
COMMENT ON COLUMN public.books.pen_name IS
  'Legacy-compatible pen name retained in the canonical publication fingerprint.';
COMMENT ON COLUMN public.books.publisher_imprint IS
  'Legacy-compatible publisher imprint mirror retained in the canonical publication fingerprint.';
