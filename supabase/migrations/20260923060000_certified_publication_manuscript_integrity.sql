-- Certified Publication manuscript/design integrity.
--
-- Once a book has a current certified Publication, the live rows used by
-- readers may not drift away from the attested/minted state. Visibility and
-- operational metadata remain separate from certified manuscript identity.

CREATE OR REPLACE FUNCTION public.compute_book_publication_hash(p_book_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
WITH book_payload AS (
  SELECT pg_catalog.concat_ws(
    E'\x1f',
    b.id::text,
    COALESCE(b.title,''),
    COALESCE(b.description,''),
    b.category::text,
    COALESCE(b.book_type,''),
    COALESCE(b.language,''),
    COALESCE(b.cover_image_url,''),
    COALESCE(b.author_mode,''),
    COALESCE(b.author_display_name,''),
    COALESCE(b.pen_name,''),
    COALESCE(b.publisher_imprint,''),
    COALESCE(b.work_id::text,''),
    COALESCE(b.design_settings,'{}'::jsonb)::text
  ) payload
  FROM public.books b
  WHERE b.id = p_book_id
),
work_payload AS (
  SELECT pg_catalog.string_agg(
    pg_catalog.concat_ws(
      E'\x1f',
      COALESCE(w.id::text,''),
      COALESCE(w.title,''),
      COALESCE(w.original_language,'')
    ),
    E'\x1e'
    ORDER BY COALESCE(w.id::text,'')
  ) payload
  FROM public.books b
  LEFT JOIN public.works w ON w.id = b.work_id
  WHERE b.id = p_book_id
),
author_payload AS (
  SELECT pg_catalog.string_agg(
    pg_catalog.concat_ws(
      E'\x1f',
      COALESCE(wa.user_id::text,''),
      COALESCE(wa.display_name,''),
      COALESCE(wa.author_role::text,''),
      COALESCE(wa.sort_order,0)::text,
      COALESCE(wa.contribution_percentage,0)::text
    ),
    E'\x1e'
    ORDER BY
      COALESCE(wa.sort_order,0),
      COALESCE(wa.display_name,''),
      COALESCE(wa.user_id::text,'')
  ) payload
  FROM public.books b
  JOIN public.work_authors wa ON wa.work_id = b.work_id
  WHERE b.id = p_book_id
),
rights_payload AS (
  SELECT pg_catalog.string_agg(
    pg_catalog.concat_ws(
      E'\x1f',
      wr.rights_holder_id::text,
      COALESCE(wr.rights_class::text,''),
      COALESCE(wr.rights_scope::text,''),
      COALESCE(wr.territory,''),
      COALESCE(wr.language,''),
      COALESCE(rh.display_name,''),
      COALESCE(rh.holder_type::text,''),
      COALESCE(rh.country_code,'')
    ),
    E'\x1e'
    ORDER BY
      wr.rights_holder_id,
      wr.rights_class::text,
      wr.rights_scope::text,
      wr.territory,
      wr.language
  ) payload
  FROM public.books b
  JOIN public.work_rights wr ON wr.work_id = b.work_id
  LEFT JOIN public.rights_holders rh ON rh.id = wr.rights_holder_id
  WHERE b.id = p_book_id
),
listing_payload AS (
  SELECT pg_catalog.string_agg(
    pg_catalog.concat_ws(
      E'\x1f',
      COALESCE(pl.slug,''),
      COALESCE(pl.subtitle,'')
    ),
    E'\x1e'
    ORDER BY COALESCE(pl.slug,''), COALESCE(pl.subtitle,'')
  ) payload
  FROM public.public_listings pl
  WHERE pl.book_id = p_book_id
),
chapter_payload AS (
  SELECT pg_catalog.string_agg(
    pg_catalog.concat_ws(
      E'\x1f',
      c.id::text,
      c.chapter_number::text,
      COALESCE(c.title,''),
      COALESCE(c.content,''),
      COALESCE(c.is_generated,false)::text,
      COALESCE(c.version_number,1)::text,
      COALESCE(c.academic_mode,false)::text,
      COALESCE(c.citation_style,''),
      COALESCE(c.chapter_references,'[]'::jsonb)::text
    ),
    E'\x1e'
    ORDER BY c.chapter_number, c.id
  ) payload
  FROM public.chapters c
  WHERE c.book_id = p_book_id
),
media_payload AS (
  SELECT pg_catalog.string_agg(
    pg_catalog.concat_ws(
      E'\x1f',
      ca.chapter_id::text,
      ca.asset_id::text,
      ca.placement_order::text,
      COALESCE(ca.caption,''),
      COALESCE(ca.entity,''),
      a.source,
      COALESCE(a.source_id,''),
      a.source_url,
      a.image_url,
      COALESCE(a.license,''),
      COALESCE(a.attribution,''),
      COALESCE(a.content_hash,'')
    ),
    E'\x1e'
    ORDER BY ca.chapter_id, ca.placement_order, ca.asset_id
  ) payload
  FROM public.scrollvision_chapter_assets ca
  JOIN public.scrollvision_assets a ON a.id = ca.asset_id
  WHERE ca.book_id = p_book_id
    AND ca.is_active IS TRUE
),
cover_payload AS (
  SELECT pg_catalog.string_agg(
    pg_catalog.concat_ws(
      E'\x1f',
      p.asset_url,
      p.source_type,
      p.rights_basis,
      COALESCE(p.license,''),
      COALESCE(p.attribution,''),
      COALESCE(p.source_url,''),
      COALESCE(p.provider,''),
      COALESCE(p.model,''),
      p.user_attested::text,
      COALESCE(p.attested_by::text,'')
    ),
    E'\x1e'
    ORDER BY p.id
  ) payload
  FROM public.book_asset_provenance p
  JOIN public.books b ON b.id = p.book_id
  WHERE p.book_id = p_book_id
    AND p.asset_role = 'cover'
    AND p.asset_url = COALESCE(b.cover_image_url,'')
),
profile_payload AS (
  SELECT pg_catalog.string_agg(
    pg_catalog.concat_ws(
      E'\x1f',
      pp.publisher_mode,
      COALESCE(pp.edition_label,''),
      COALESCE(pp.publication_language,''),
      pp.print_identifier_strategy,
      pp.ebook_identifier_strategy,
      pp.distribution_scope,
      COALESCE(pp.imprint_id::text,''),
      COALESCE(pi.scope,''),
      COALESCE(pi.publisher_name,''),
      COALESCE(pi.imprint_name,''),
      COALESCE(pi.country_code,''),
      COALESCE(pi.isbn_agency_name,''),
      COALESCE(pi.registrant_name,''),
      COALESCE(pi.agency_record_attested,false)::text,
      COALESCE(pi.verified,false)::text
    ),
    E'\x1e'
    ORDER BY pp.book_id
  ) payload
  FROM public.book_publishing_profiles pp
  LEFT JOIN public.publishing_imprints pi ON pi.id = pp.imprint_id
  WHERE pp.book_id = p_book_id
),
isbn_payload AS (
  SELECT pg_catalog.string_agg(
    pg_catalog.concat_ws(
      E'\x1f',
      ba.product_form,
      ba.language,
      ba.edition_label,
      i.isbn13,
      i.source,
      i.imprint_id::text,
      COALESCE(ba.locked_publication_id::text,'')
    ),
    E'\x1e'
    ORDER BY ba.product_form, ba.language, ba.edition_label, i.isbn13
  ) payload
  FROM public.book_isbn_assignments ba
  JOIN public.isbn_inventory i ON i.id = ba.isbn_id
  WHERE ba.book_id = p_book_id
)
SELECT pg_catalog.encode(
  extensions.digest(
    bp.payload
      || E'\x1d' || COALESCE(wp.payload,'')
      || E'\x1c' || COALESCE(ap.payload,'')
      || E'\x1b' || COALESCE(rp.payload,'')
      || E'\x1a' || COALESCE(lp.payload,'')
      || E'\x19' || COALESCE(cp.payload,'')
      || E'\x18' || COALESCE(mp.payload,'')
      || E'\x17' || COALESCE(cvp.payload,'')
      || E'\x16' || COALESCE(pp.payload,'')
      || E'\x15' || COALESCE(ip.payload,''),
    'sha256'
  ),
  'hex'
)
FROM book_payload bp
CROSS JOIN work_payload wp
CROSS JOIN author_payload ap
CROSS JOIN rights_payload rp
CROSS JOIN listing_payload lp
CROSS JOIN chapter_payload cp
CROSS JOIN media_payload mp
CROSS JOIN cover_payload cvp
CROSS JOIN profile_payload pp
CROSS JOIN isbn_payload ip;
$$;

REVOKE ALL ON FUNCTION public.compute_book_publication_hash(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.compute_book_publication_hash(uuid)
  TO service_role;

COMMENT ON FUNCTION public.compute_book_publication_hash(uuid) IS
  'Publication fingerprint over bibliographic identity, manuscript, design settings, rights, media/provenance, publisher/imprint and format-specific ISBN identity.';

CREATE OR REPLACE FUNCTION public.tg_lock_certified_book_publication_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.current_publication_id IS NOT NULL THEN
    IF NEW.title IS DISTINCT FROM OLD.title
       OR NEW.description IS DISTINCT FROM OLD.description
       OR NEW.category IS DISTINCT FROM OLD.category
       OR NEW.book_type IS DISTINCT FROM OLD.book_type
       OR NEW.language IS DISTINCT FROM OLD.language
       OR NEW.cover_image_url IS DISTINCT FROM OLD.cover_image_url
       OR NEW.author_mode IS DISTINCT FROM OLD.author_mode
       OR NEW.author_display_name IS DISTINCT FROM OLD.author_display_name
       OR NEW.pen_name IS DISTINCT FROM OLD.pen_name
       OR NEW.publisher_imprint IS DISTINCT FROM OLD.publisher_imprint
       OR NEW.work_id IS DISTINCT FROM OLD.work_id
       OR NEW.design_settings IS DISTINCT FROM OLD.design_settings THEN
      RAISE EXCEPTION 'CERTIFIED_BOOK_IDENTITY_IMMUTABLE'
        USING ERRCODE = '23514',
              DETAIL = 'Create a new revision workflow instead of mutating the certified live book.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.tg_lock_certified_book_publication_fields()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_lock_certified_book_publication_fields
  ON public.books;
CREATE TRIGGER trg_lock_certified_book_publication_fields
BEFORE UPDATE
ON public.books
FOR EACH ROW
EXECUTE FUNCTION public.tg_lock_certified_book_publication_fields();

CREATE OR REPLACE FUNCTION public.tg_lock_certified_chapter_publication_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_old_certified boolean := false;
  v_new_certified boolean := false;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT b.current_publication_id IS NOT NULL
    INTO v_new_certified
    FROM public.books AS b
    WHERE b.id = NEW.book_id;

    IF COALESCE(v_new_certified, false) THEN
      RAISE EXCEPTION 'CERTIFIED_PUBLICATION_MANUSCRIPT_IMMUTABLE'
        USING ERRCODE = '23514',
              DETAIL = 'A certified book cannot receive new live chapters without a revision workflow.';
    END IF;

    RETURN NEW;
  END IF;

  SELECT b.current_publication_id IS NOT NULL
  INTO v_old_certified
  FROM public.books AS b
  WHERE b.id = OLD.book_id;

  SELECT b.current_publication_id IS NOT NULL
  INTO v_new_certified
  FROM public.books AS b
  WHERE b.id = NEW.book_id;

  IF COALESCE(v_old_certified, false)
     OR COALESCE(v_new_certified, false) THEN
    IF NEW.book_id IS DISTINCT FROM OLD.book_id
       OR NEW.chapter_number IS DISTINCT FROM OLD.chapter_number
       OR NEW.title IS DISTINCT FROM OLD.title
       OR NEW.content IS DISTINCT FROM OLD.content
       OR NEW.is_generated IS DISTINCT FROM OLD.is_generated
       OR NEW.version_number IS DISTINCT FROM OLD.version_number
       OR NEW.academic_mode IS DISTINCT FROM OLD.academic_mode
       OR NEW.citation_style IS DISTINCT FROM OLD.citation_style
       OR NEW.chapter_references IS DISTINCT FROM OLD.chapter_references THEN
      RAISE EXCEPTION 'CERTIFIED_PUBLICATION_MANUSCRIPT_IMMUTABLE'
        USING ERRCODE = '23514',
              DETAIL = 'Create a new revision workflow instead of mutating certified chapter content.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.tg_lock_certified_chapter_publication_fields()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_lock_certified_chapter_publication_fields
  ON public.chapters;
CREATE TRIGGER trg_lock_certified_chapter_publication_fields
BEFORE INSERT OR UPDATE
ON public.chapters
FOR EACH ROW
EXECUTE FUNCTION public.tg_lock_certified_chapter_publication_fields();

-- Browser owners may not delete certified manuscript rows. This is an RLS
-- restriction rather than a DELETE trigger so service-role account-erasure
-- workflows can still remove the user's data and cascade normally.
DROP POLICY IF EXISTS certified_chapters_delete_guard ON public.chapters;
CREATE POLICY certified_chapters_delete_guard
ON public.chapters
AS RESTRICTIVE
FOR DELETE
TO authenticated
USING (
  NOT EXISTS (
    SELECT 1
    FROM public.books AS b
    WHERE b.id = chapters.book_id
      AND b.current_publication_id IS NOT NULL
  )
);

DROP POLICY IF EXISTS certified_books_delete_guard ON public.books;
CREATE POLICY certified_books_delete_guard
ON public.books
AS RESTRICTIVE
FOR DELETE
TO authenticated
USING (current_publication_id IS NULL);
