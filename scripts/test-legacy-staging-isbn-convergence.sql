\set ON_ERROR_STOP on

-- This test runs only against the disposable local Supabase database created by
-- CI. It intentionally degrades that database to the observed GA-staging shape,
-- then proves the repo-tracked recovery sequence can rebuild the hardened ISBN
-- contract without fabricating publication or ISBN records.

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

-- Remove the modern ISBN/provenance subsystem and legacy book identity mirrors
-- to reproduce the verified GA-staging gap. CASCADE is safe here because this is
-- an ephemeral CI database; the selected convergence migrations must recreate
-- every required dependent function/trigger/constraint afterwards.
DROP TABLE IF EXISTS public.publishing_imprint_verifications CASCADE;
DROP TABLE IF EXISTS public.platform_isbn_pool_verification_batches CASCADE;
DROP TABLE IF EXISTS public.isbn_claim_requests CASCADE;
DROP TABLE IF EXISTS public.book_isbn_assignments CASCADE;
DROP TABLE IF EXISTS public.isbn_inventory CASCADE;
DROP TABLE IF EXISTS public.book_publishing_profiles CASCADE;
DROP TABLE IF EXISTS public.publishing_imprints CASCADE;
DROP TABLE IF EXISTS public.book_asset_provenance CASCADE;

ALTER TABLE public.books
  DROP COLUMN IF EXISTS publisher_imprint_id CASCADE,
  DROP COLUMN IF EXISTS publisher_mode CASCADE,
  DROP COLUMN IF EXISTS edition_label CASCADE,
  DROP COLUMN IF EXISTS isbn CASCADE,
  DROP COLUMN IF EXISTS author_mode CASCADE,
  DROP COLUMN IF EXISTS author_display_name CASCADE,
  DROP COLUMN IF EXISTS pen_name CASCADE,
  DROP COLUMN IF EXISTS publisher_imprint CASCADE;

-- Exact controlled recovery order for the legacy GA-staging lineage.
\ir ../supabase/migrations/20260907223000_legacy_staging_isbn_convergence_prelude.sql
\ir ../supabase/migrations/20260906235000_live_publication_schema_convergence.sql
\ir ../supabase/migrations/20260907024300_isbn_provenance_and_publication_atomicity.sql
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
    'book_asset_provenance'
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
    SELECT 1 FROM pg_catalog.pg_proc p
    JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'finalize_publication_release'
  ) THEN
    RAISE EXCEPTION 'transactional publication finalizer missing after legacy convergence';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.publishing_imprint_verifications'::regclass
      AND conname = 'publishing_imprint_verifications_independent_reviewer_chk'
      AND convalidated
  ) THEN
    RAISE EXCEPTION 'independent imprint reviewer constraint missing after legacy convergence';
  END IF;

  IF EXISTS (SELECT 1 FROM public.publishing_imprints LIMIT 1)
     OR EXISTS (SELECT 1 FROM public.book_publishing_profiles LIMIT 1)
     OR EXISTS (SELECT 1 FROM public.isbn_inventory LIMIT 1)
     OR EXISTS (SELECT 1 FROM public.book_isbn_assignments LIMIT 1)
     OR EXISTS (SELECT 1 FROM public.publications LIMIT 1)
  THEN
    RAISE EXCEPTION 'legacy convergence fabricated publishing or ISBN records';
  END IF;
END;
$$;
