-- Final defensive invariants found during exact-head forensic review.

-- Avoid referencing OLD on INSERT paths; preserve immutable batch history safely.
CREATE OR REPLACE FUNCTION public.tg_record_platform_isbn_batch_membership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.provenance_batch_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.platform_isbn_pool_verification_batch_items(batch_id, isbn_inventory_id, isbn13)
    VALUES(NEW.provenance_batch_id, NEW.id, NEW.isbn13)
    ON CONFLICT DO NOTHING;
  ELSIF OLD.provenance_batch_id IS DISTINCT FROM NEW.provenance_batch_id THEN
    INSERT INTO public.platform_isbn_pool_verification_batch_items(batch_id, isbn_inventory_id, isbn13)
    VALUES(NEW.provenance_batch_id, NEW.id, NEW.isbn13)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.tg_record_platform_isbn_batch_membership() FROM PUBLIC, anon, authenticated;

-- Snapshot-internal consistency matters because exporters consume both the
-- canonical identifiers array and compatibility fields. They must never disagree.
CREATE OR REPLACE FUNCTION public.tg_validate_verified_publication_snapshot_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_identifier jsonb;
  v_map jsonb := '{}'::jsonb;
  v_form text;
  v_isbn text;
  v_print_isbn text;
BEGIN
  IF NEW.integrity_level::text <> 'verified_published' THEN
    RETURN NEW;
  END IF;

  IF NEW.snapshot IS NULL OR pg_catalog.jsonb_typeof(NEW.snapshot) <> 'object' THEN
    RAISE EXCEPTION 'PUBLICATION_SNAPSHOT_REQUIRED' USING ERRCODE = '23514';
  END IF;
  IF NEW.snapshot->>'scroll_edition_id' IS DISTINCT FROM NEW.scroll_edition_id THEN
    RAISE EXCEPTION 'PUBLICATION_SCROLL_EDITION_SNAPSHOT_MISMATCH' USING ERRCODE = '23514';
  END IF;
  IF NEW.snapshot->>'language' IS DISTINCT FROM NEW.language THEN
    RAISE EXCEPTION 'PUBLICATION_LANGUAGE_SNAPSHOT_MISMATCH' USING ERRCODE = '23514';
  END IF;
  IF NEW.snapshot->>'publisher_name' IS DISTINCT FROM NEW.snapshot->'publisher'->>'publisher_name'
     OR NEW.snapshot->>'publisher_imprint' IS DISTINCT FROM NEW.snapshot->'publisher'->>'imprint_name' THEN
    RAISE EXCEPTION 'PUBLICATION_PUBLISHER_COMPATIBILITY_FIELDS_MISMATCH' USING ERRCODE = '23514';
  END IF;

  IF pg_catalog.jsonb_typeof(COALESCE(NEW.snapshot->'identifiers', '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'PUBLICATION_IDENTIFIERS_INVALID' USING ERRCODE = '23514';
  END IF;
  IF pg_catalog.jsonb_typeof(COALESCE(NEW.snapshot->'isbn_by_format', '{}'::jsonb)) <> 'object' THEN
    RAISE EXCEPTION 'PUBLICATION_ISBN_BY_FORMAT_INVALID' USING ERRCODE = '23514';
  END IF;

  FOR v_identifier IN
    SELECT value
    FROM pg_catalog.jsonb_array_elements(COALESCE(NEW.snapshot->'identifiers', '[]'::jsonb))
  LOOP
    IF v_identifier->>'scheme' <> 'ISBN-13' THEN
      CONTINUE;
    END IF;
    v_form := v_identifier->>'product_form';
    v_isbn := public.normalize_isbn13(COALESCE(v_identifier->>'value', ''));
    IF pg_catalog.length(COALESCE(v_form, '')) = 0 OR NOT public.is_valid_isbn13(v_isbn) THEN
      RAISE EXCEPTION 'PUBLICATION_IDENTIFIER_INVALID' USING ERRCODE = '23514';
    END IF;
    IF v_map ? v_form AND v_map->>v_form IS DISTINCT FROM v_isbn THEN
      RAISE EXCEPTION 'PUBLICATION_DUPLICATE_PRODUCT_FORM_ISBN:%', v_form USING ERRCODE = '23514';
    END IF;
    v_map := v_map || pg_catalog.jsonb_build_object(v_form, v_isbn);
  END LOOP;

  IF COALESCE(NEW.snapshot->'isbn_by_format', '{}'::jsonb) IS DISTINCT FROM v_map THEN
    RAISE EXCEPTION 'PUBLICATION_ISBN_BY_FORMAT_MISMATCH' USING ERRCODE = '23514';
  END IF;

  v_print_isbn := COALESCE(v_map->>'paperback', v_map->>'hardcover');
  IF NEW.snapshot->>'isbn' IS DISTINCT FROM v_print_isbn
     OR NEW.snapshot->>'isbn_13' IS DISTINCT FROM v_print_isbn THEN
    RAISE EXCEPTION 'PUBLICATION_LEGACY_PRINT_ISBN_MISMATCH' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.tg_validate_verified_publication_snapshot_consistency() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_validate_verified_publication_snapshot_consistency ON public.publications;
CREATE TRIGGER trg_validate_verified_publication_snapshot_consistency
BEFORE INSERT ON public.publications
FOR EACH ROW EXECUTE FUNCTION public.tg_validate_verified_publication_snapshot_consistency();
