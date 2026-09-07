-- Post-forensic hardening for ISBN governance and verified Publication minting.
-- The imprint identity-drift trigger already exists from the earlier publishing
-- identity migrations; replacing its function body preserves that binding.
-- This migration closes three additional residual integrity gaps:
--   1. preserve immutable ISBN verification-batch membership history;
--   2. canonicalize order-insensitive snapshot arrays for retry idempotency;
--   3. re-validate frozen publisher/ISBN identity in the database transaction.

-- ---------------------------------------------------------------------------
-- 1. Immutable verification-batch membership history.
-- Inventory rows may move to a later batch only after rejection; the historical
-- membership record must remain attached to every reviewed batch forever.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.platform_isbn_pool_verification_batch_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id uuid NOT NULL REFERENCES public.platform_isbn_pool_verification_batches(id) ON DELETE RESTRICT,
  isbn_inventory_id uuid NOT NULL REFERENCES public.isbn_inventory(id) ON DELETE RESTRICT,
  isbn13 text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT pg_catalog.now(),
  CONSTRAINT platform_isbn_pool_batch_item_batch_isbn_uq UNIQUE(batch_id, isbn13),
  CONSTRAINT platform_isbn_pool_batch_item_batch_inventory_uq UNIQUE(batch_id, isbn_inventory_id),
  CONSTRAINT platform_isbn_pool_batch_item_isbn13_format_ck CHECK (isbn13 ~ '^97[89][0-9]{10}$')
);

ALTER TABLE public.platform_isbn_pool_verification_batch_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.platform_isbn_pool_verification_batch_items FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.platform_isbn_pool_verification_batch_items TO service_role;

INSERT INTO public.platform_isbn_pool_verification_batch_items(batch_id, isbn_inventory_id, isbn13)
SELECT ii.provenance_batch_id, ii.id, ii.isbn13
FROM public.isbn_inventory AS ii
WHERE ii.provenance_batch_id IS NOT NULL
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.tg_record_platform_isbn_batch_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.provenance_batch_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR OLD.provenance_batch_id IS DISTINCT FROM NEW.provenance_batch_id) THEN
    INSERT INTO public.platform_isbn_pool_verification_batch_items(batch_id, isbn_inventory_id, isbn13)
    VALUES(NEW.provenance_batch_id, NEW.id, NEW.isbn13)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.tg_record_platform_isbn_batch_membership() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_record_platform_isbn_batch_membership ON public.isbn_inventory;
CREATE TRIGGER trg_record_platform_isbn_batch_membership
AFTER INSERT OR UPDATE OF provenance_batch_id ON public.isbn_inventory
FOR EACH ROW EXECUTE FUNCTION public.tg_record_platform_isbn_batch_membership();

-- Reviewed batch metadata is append-only. The review RPC changes a pending row
-- exactly once; after that, application code cannot rewrite its audit result.
CREATE OR REPLACE FUNCTION public.tg_lock_reviewed_platform_isbn_batch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.status <> 'pending' AND NEW IS DISTINCT FROM OLD THEN
    RAISE EXCEPTION 'ISBN_POOL_BATCH_REVIEW_IMMUTABLE' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.tg_lock_reviewed_platform_isbn_batch() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_lock_reviewed_platform_isbn_batch ON public.platform_isbn_pool_verification_batches;
CREATE TRIGGER trg_lock_reviewed_platform_isbn_batch
BEFORE UPDATE ON public.platform_isbn_pool_verification_batches
FOR EACH ROW EXECUTE FUNCTION public.tg_lock_reviewed_platform_isbn_batch();

-- ---------------------------------------------------------------------------
-- 2. Retry identity canonicalization.
-- Rights, rights-holder, citation and identifier arrays are sets for release
-- identity purposes. Their database-return order is not semantically meaningful,
-- so normalize only those arrays. Author and chapter order remains significant.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.canonicalize_publication_snapshot_for_retry(p_snapshot jsonb)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = ''
AS $$
DECLARE
  v_snapshot jsonb := p_snapshot - 'scroll_edition_id' - 'frozen_at';
  v_key text;
  v_sorted jsonb;
BEGIN
  FOREACH v_key IN ARRAY ARRAY['rights_holders','rights','citations','identifiers']::text[] LOOP
    IF pg_catalog.jsonb_typeof(v_snapshot->v_key) = 'array' THEN
      SELECT COALESCE(pg_catalog.jsonb_agg(e.value ORDER BY e.value::text), '[]'::jsonb)
      INTO v_sorted
      FROM pg_catalog.jsonb_array_elements(v_snapshot->v_key) AS e(value);
      v_snapshot := pg_catalog.jsonb_set(v_snapshot, ARRAY[v_key], v_sorted, false);
    END IF;
  END LOOP;
  RETURN v_snapshot;
END;
$$;
REVOKE ALL ON FUNCTION public.canonicalize_publication_snapshot_for_retry(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.canonicalize_publication_snapshot_for_retry(jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.compute_publication_release_request_key(
  p_work_id uuid,
  p_book_id uuid,
  p_edition_kind public.publication_edition_kind,
  p_language text,
  p_snapshot jsonb
)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = ''
AS $$
  SELECT pg_catalog.encode(
    extensions.digest(
      pg_catalog.convert_to(
        pg_catalog.jsonb_build_object(
          'work_id', p_work_id,
          'book_id', p_book_id,
          'edition_kind', p_edition_kind::text,
          'language', p_language,
          'snapshot', public.canonicalize_publication_snapshot_for_retry(p_snapshot)
        )::text,
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
$$;
REVOKE ALL ON FUNCTION public.compute_publication_release_request_key(uuid,uuid,public.publication_edition_kind,text,jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.compute_publication_release_request_key(uuid,uuid,public.publication_edition_kind,text,jsonb)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Frozen publisher/ISBN identity is re-validated inside the INSERT
-- transaction immediately before the existing atomic finalizer runs.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_finalize_verified_publication_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_profile public.book_publishing_profiles%ROWTYPE;
  v_imprint public.publishing_imprints%ROWTYPE;
  v_publisher jsonb;
  v_identifier jsonb;
  v_isbn text;
  v_expected_source text;
BEGIN
  IF NEW.status = 'approved'
     AND NEW.integrity_level::text = 'verified_published'
     AND NEW.book_id IS NOT NULL
     AND NEW.published_by IS NOT NULL
     AND NEW.content_hash IS NOT NULL
     AND NEW.snapshot IS NOT NULL
     AND NEW.snapshot ? 'publication_trust' THEN

    IF NEW.content_hash !~ '^[0-9a-f]{64}$' THEN
      RAISE EXCEPTION 'PUBLICATION_CONTENT_HASH_INVALID' USING ERRCODE = '23514';
    END IF;

    SELECT bpp.* INTO v_profile
    FROM public.book_publishing_profiles AS bpp
    WHERE bpp.book_id = NEW.book_id
      AND bpp.owner_user_id = NEW.published_by
    FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'PUBLISHING_IDENTITY_REQUIRED' USING ERRCODE = '23514';
    END IF;

    IF NEW.snapshot->>'print_identifier_strategy' IS DISTINCT FROM v_profile.print_identifier_strategy::text
       OR NEW.snapshot->>'ebook_identifier_strategy' IS DISTINCT FROM v_profile.ebook_identifier_strategy::text
       OR NEW.snapshot->>'distribution_scope' IS DISTINCT FROM v_profile.distribution_scope::text
       OR NEW.snapshot->>'edition' IS DISTINCT FROM v_profile.edition_label
       OR NEW.language IS DISTINCT FROM v_profile.publication_language THEN
      RAISE EXCEPTION 'PUBLICATION_PROFILE_SNAPSHOT_STALE' USING ERRCODE = '23514';
    END IF;

    v_publisher := NEW.snapshot->'publisher';
    IF pg_catalog.jsonb_typeof(v_publisher) IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'PUBLICATION_PUBLISHER_SNAPSHOT_REQUIRED' USING ERRCODE = '23514';
    END IF;
    IF v_publisher->>'mode' IS DISTINCT FROM v_profile.publisher_mode::text THEN
      RAISE EXCEPTION 'PUBLICATION_PUBLISHER_MODE_STALE' USING ERRCODE = '23514';
    END IF;

    IF pg_catalog.jsonb_typeof(COALESCE(NEW.snapshot->'identifiers', '[]'::jsonb)) IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'PUBLICATION_IDENTIFIERS_INVALID' USING ERRCODE = '23514';
    END IF;

    IF v_profile.publisher_mode::text = 'kdp_independent' THEN
      IF v_profile.print_identifier_strategy::text <> 'kdp_free'
         OR v_profile.distribution_scope::text <> 'kdp_only'
         OR v_profile.imprint_id IS NOT NULL
         OR v_publisher->>'verification' IS DISTINCT FROM 'kdp_free_isbn_at_submission'
         OR pg_catalog.jsonb_array_length(COALESCE(NEW.snapshot->'identifiers', '[]'::jsonb)) <> 0 THEN
        RAISE EXCEPTION 'KDP_FREE_PUBLICATION_IDENTITY_INVALID' USING ERRCODE = '23514';
      END IF;
    ELSE
      IF v_profile.imprint_id IS NULL THEN
        RAISE EXCEPTION 'PUBLISHER_IMPRINT_REQUIRED' USING ERRCODE = '23514';
      END IF;

      SELECT pi.* INTO v_imprint
      FROM public.publishing_imprints AS pi
      WHERE pi.id = v_profile.imprint_id
      FOR SHARE;
      IF NOT FOUND OR v_imprint.verified IS NOT TRUE OR v_imprint.verification_reference IS NULL THEN
        RAISE EXCEPTION 'VERIFIED_PUBLISHER_IMPRINT_REQUIRED' USING ERRCODE = '23514';
      END IF;
      IF v_profile.publisher_mode::text = 'own_imprint'
         AND (v_imprint.scope <> 'user' OR v_imprint.owner_user_id IS DISTINCT FROM NEW.published_by) THEN
        RAISE EXCEPTION 'VERIFIED_USER_IMPRINT_REQUIRED' USING ERRCODE = '23514';
      END IF;
      IF v_profile.publisher_mode::text = 'platform_imprint' AND v_imprint.scope <> 'platform' THEN
        RAISE EXCEPTION 'VERIFIED_PLATFORM_IMPRINT_REQUIRED' USING ERRCODE = '23514';
      END IF;

      IF v_publisher->>'imprint_id' IS DISTINCT FROM v_imprint.id::text
         OR v_publisher->>'publisher_name' IS DISTINCT FROM v_imprint.publisher_name
         OR v_publisher->>'imprint_name' IS DISTINCT FROM v_imprint.imprint_name
         OR v_publisher->>'country_code' IS DISTINCT FROM v_imprint.country_code
         OR v_publisher->>'isbn_agency_name' IS DISTINCT FROM v_imprint.isbn_agency_name
         OR v_publisher->>'registrant_name' IS DISTINCT FROM v_imprint.registrant_name
         OR v_publisher->>'verification_reference' IS DISTINCT FROM v_imprint.verification_reference
         OR v_publisher->>'verification_method' IS DISTINCT FROM v_imprint.verification_method THEN
        RAISE EXCEPTION 'PUBLICATION_PUBLISHER_SNAPSHOT_STALE' USING ERRCODE = '23514';
      END IF;

      v_expected_source := CASE
        WHEN v_profile.publisher_mode::text = 'own_imprint' THEN 'publisher_owned'
        ELSE 'platform_pool'
      END;

      FOR v_identifier IN
        SELECT value
        FROM pg_catalog.jsonb_array_elements(COALESCE(NEW.snapshot->'identifiers', '[]'::jsonb))
      LOOP
        IF v_identifier->>'scheme' <> 'ISBN-13' THEN
          CONTINUE;
        END IF;
        v_isbn := public.normalize_isbn13(COALESCE(v_identifier->>'value', ''));
        IF NOT public.is_valid_isbn13(v_isbn) THEN
          RAISE EXCEPTION 'PUBLICATION_SNAPSHOT_INVALID_ISBN' USING ERRCODE = '23514';
        END IF;

        IF NOT EXISTS (
          SELECT 1
          FROM public.book_isbn_assignments AS bia
          JOIN public.isbn_inventory AS ii ON ii.id = bia.isbn_id
          WHERE bia.book_id = NEW.book_id
            AND bia.product_form = v_identifier->>'product_form'
            AND bia.language = v_identifier->>'language'
            AND bia.edition_label = v_identifier->>'edition_label'
            AND ii.isbn13 = v_isbn
            AND ii.imprint_id = v_profile.imprint_id
            AND ii.source = v_expected_source
            AND ii.provenance_status = 'verified'
            AND ii.provenance_reference IS NOT NULL
            AND (v_profile.publisher_mode::text <> 'own_imprint' OR ii.claimed_by_user_id = NEW.published_by)
            AND v_identifier->>'source' = ii.source
            AND v_identifier->>'provenance_status' = ii.provenance_status
            AND v_identifier->>'provenance_reference' = ii.provenance_reference
        ) THEN
          RAISE EXCEPTION 'PUBLICATION_SNAPSHOT_ISBN_IDENTITY_STALE:%', v_isbn USING ERRCODE = '23514';
        END IF;
      END LOOP;
    END IF;

    PERFORM public.finalize_publication_release(NEW.id, NEW.published_by);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.tg_finalize_verified_publication_insert() FROM PUBLIC, anon, authenticated;
