\set ON_ERROR_STOP on

-- This test runs only against the disposable local Supabase database created by
-- CI. It intentionally degrades that database to the observed GA-staging shape,
-- then proves the repo-tracked recovery sequence can rebuild the current hardened
-- Scroll identity + ISBN contract without fabricating publication or ISBN rows.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.books LIMIT 1)
     OR EXISTS (SELECT 1 FROM public.works LIMIT 1)
     OR EXISTS (SELECT 1 FROM public.rights_holders LIMIT 1)
     OR EXISTS (SELECT 1 FROM public.work_authors LIMIT 1)
     OR EXISTS (SELECT 1 FROM public.work_rights LIMIT 1)
     OR EXISTS (SELECT 1 FROM public.publications LIMIT 1)
     OR EXISTS (SELECT 1 FROM public.publication_certificates LIMIT 1)
  THEN
    RAISE EXCEPTION 'legacy staging convergence simulation requires an empty disposable publication domain';
  END IF;
END;
$$;

-- Remove the modern Scroll-product / ISBN / provenance subsystem and identity
-- fields to reproduce the verified GA-staging gap. CASCADE is safe here because
-- this is an ephemeral CI database; no DROP appears in a production migration.
DROP TABLE IF EXISTS public.publication_external_identifiers CASCADE;
DROP TABLE IF EXISTS public.publication_products CASCADE;
DROP TABLE IF EXISTS public.platform_isbn_pool_verification_batch_items CASCADE;
DROP TABLE IF EXISTS public.publishing_imprint_verifications CASCADE;
DROP TABLE IF EXISTS public.platform_isbn_pool_verification_batches CASCADE;
DROP TABLE IF EXISTS public.isbn_claim_requests CASCADE;
DROP TABLE IF EXISTS public.book_isbn_assignments CASCADE;
DROP TABLE IF EXISTS public.isbn_inventory CASCADE;
DROP TABLE IF EXISTS public.book_publishing_profiles CASCADE;
DROP TABLE IF EXISTS public.publishing_imprints CASCADE;
DROP TABLE IF EXISTS public.book_asset_provenance CASCADE;

ALTER TABLE public.works
  DROP COLUMN IF EXISTS scroll_work_id CASCADE;

ALTER TABLE public.publications
  DROP COLUMN IF EXISTS book_id CASCADE,
  DROP COLUMN IF EXISTS scroll_edition_id CASCADE,
  DROP COLUMN IF EXISTS release_request_key CASCADE;

ALTER TABLE public.books
  DROP COLUMN IF EXISTS publisher_imprint_id CASCADE,
  DROP COLUMN IF EXISTS publisher_mode CASCADE,
  DROP COLUMN IF EXISTS edition_label CASCADE,
  DROP COLUMN IF EXISTS isbn CASCADE,
  DROP COLUMN IF EXISTS author_mode CASCADE,
  DROP COLUMN IF EXISTS author_display_name CASCADE,
  DROP COLUMN IF EXISTS pen_name CASCADE,
  DROP COLUMN IF EXISTS publisher_imprint CASCADE;

-- Exact controlled recovery order for the CURRENT legacy GA-staging lineage.
\ir ../supabase/migrations/20260907223000_legacy_staging_isbn_convergence_prelude.sql
\ir ../supabase/migrations/20260909124500_legacy_staging_publications_book_id_compat.sql
\ir ../supabase/migrations/20260906235000_live_publication_schema_convergence.sql
\ir ../supabase/migrations/20260906235500_scroll_identity_layer.sql
\ir ../supabase/migrations/20260907024300_isbn_provenance_and_publication_atomicity.sql
\ir ../supabase/migrations/20260907024310_imprint_verification_drift.sql
\ir ../supabase/migrations/20260907193000_isbn_governance_separation_and_atomic_mint.sql
\ir ../supabase/migrations/20260907193600_user_imprint_evidence_submission.sql
\ir ../supabase/migrations/20260907193800_bind_owned_isbn_claim_to_pending_imprint_evidence.sql
\ir ../supabase/migrations/20260907194000_isbn_retry_and_identity_drift_hardening.sql
\ir ../supabase/migrations/20260907194200_post_forensic_isbn_publication_invariants.sql
\ir ../supabase/migrations/20260907194300_snapshot_consistency_and_batch_trigger_safety.sql
\ir ../supabase/migrations/20260907194400_isbn_row_identity_immutability.sql
\ir ../supabase/migrations/20260907220000_isbn_independent_review_enforcement.sql

DO $$
DECLARE
  v_name text;
BEGIN
  FOREACH v_name IN ARRAY ARRAY[
    'publishing_imprints',
    'book_publishing_profiles',
    'isbn_inventory',
    'book_isbn_assignments',
    'publishing_imprint_verifications',
    'isbn_claim_requests',
    'platform_isbn_pool_verification_batches',
    'platform_isbn_pool_verification_batch_items',
    'book_asset_provenance',
    'publication_products',
    'publication_external_identifiers'
  ]
  LOOP
    IF to_regclass('public.' || v_name) IS NULL THEN
      RAISE EXCEPTION 'legacy convergence failed to recreate table: %', v_name;
    END IF;
  END LOOP;

  FOREACH v_name IN ARRAY ARRAY[
    'author_mode',
    'author_display_name',
    'pen_name',
    'publisher_imprint',
    'publisher_imprint_id',
    'publisher_mode',
    'edition_label',
    'isbn'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'books'
        AND column_name = v_name
    ) THEN
      RAISE EXCEPTION 'legacy convergence failed to recreate books column: %', v_name;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='publications' AND column_name='book_id'
  ) THEN
    RAISE EXCEPTION 'legacy convergence failed to restore publications.book_id compatibility link';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='works' AND column_name='scroll_work_id'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='publications' AND column_name='scroll_edition_id'
  ) OR NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='publications' AND column_name='release_request_key'
  ) THEN
    RAISE EXCEPTION 'legacy convergence failed to restore Scroll/release identity columns';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'finalize_publication_release'
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'mint_verified_publication_release'
  ) THEN
    RAISE EXCEPTION 'transactional/idempotent publication mint functions missing after legacy convergence';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.publishing_imprint_verifications'::regclass
      AND conname = 'publishing_imprint_verifications_independent_reviewer_chk'
      AND convalidated
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.platform_isbn_pool_verification_batches'::regclass
      AND conname = 'platform_isbn_pool_batches_independent_reviewer_chk'
      AND convalidated
  ) THEN
    RAISE EXCEPTION 'independent provenance-review constraints missing after legacy convergence';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger
    WHERE tgrelid='public.isbn_inventory'::regclass
      AND tgname='trg_lock_isbn_inventory_identity'
      AND NOT tgisinternal
  ) OR NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_trigger
    WHERE tgrelid='public.publications'::regclass
      AND tgname='trg_validate_verified_publication_snapshot_consistency'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'post-forensic ISBN/publication invariant triggers missing after legacy convergence';
  END IF;

  IF EXISTS (SELECT 1 FROM public.publishing_imprints LIMIT 1)
     OR EXISTS (SELECT 1 FROM public.book_publishing_profiles LIMIT 1)
     OR EXISTS (SELECT 1 FROM public.isbn_inventory LIMIT 1)
     OR EXISTS (SELECT 1 FROM public.book_isbn_assignments LIMIT 1)
     OR EXISTS (SELECT 1 FROM public.platform_isbn_pool_verification_batches LIMIT 1)
     OR EXISTS (SELECT 1 FROM public.publication_products LIMIT 1)
     OR EXISTS (SELECT 1 FROM public.publications LIMIT 1)
  THEN
    RAISE EXCEPTION 'legacy convergence fabricated publishing, product, or ISBN records';
  END IF;
END;
$$;
