-- Bind publisher/imprint and format-specific ISBN identity to the same publication
-- hash used by editorial, evidence, rights and production attestations.
--
-- A publisher/ISBN change after certification must invalidate the old PASS rather
-- than producing a different exported book under a stale production attestation.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'book_publishing_profiles_strategy_matches_mode'
      AND conrelid = 'public.book_publishing_profiles'::regclass
  ) THEN
    ALTER TABLE public.book_publishing_profiles
      ADD CONSTRAINT book_publishing_profiles_strategy_matches_mode CHECK (
        (publisher_mode = 'own_imprint'
          AND print_identifier_strategy IN ('own_isbn', 'unassigned')
          AND ebook_identifier_strategy IN ('own_isbn', 'unassigned'))
        OR (publisher_mode = 'platform_imprint'
          AND print_identifier_strategy IN ('platform_isbn', 'unassigned')
          AND ebook_identifier_strategy IN ('platform_isbn', 'unassigned'))
        OR (publisher_mode = 'kdp_independent'
          AND print_identifier_strategy = 'kdp_free'
          AND ebook_identifier_strategy = 'unassigned'
          AND distribution_scope = 'kdp_only')
      ) NOT VALID;
  END IF;
END $$;

-- Add referential integrity for assignment locking where possible without
-- rewriting historical rows. New rows are checked immediately; historical rows
-- may be validated in a later convergence window.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'book_isbn_assignments_locked_publication_fkey'
      AND conrelid = 'public.book_isbn_assignments'::regclass
  ) THEN
    ALTER TABLE public.book_isbn_assignments
      ADD CONSTRAINT book_isbn_assignments_locked_publication_fkey
      FOREIGN KEY (locked_publication_id)
      REFERENCES public.publications(id)
      ON DELETE RESTRICT
      NOT VALID;
  END IF;
END $$;

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
      COALESCE(b.title, ''),
      COALESCE(b.description, ''),
      b.category::text,
      COALESCE(b.book_type, ''),
      COALESCE(b.language, ''),
      COALESCE(b.cover_image_url, ''),
      COALESCE(b.author_mode, ''),
      COALESCE(b.author_display_name, ''),
      COALESCE(b.pen_name, ''),
      COALESCE(b.publisher_imprint, '')
    ) AS payload
    FROM public.books b
    WHERE b.id = p_book_id
  ),
  chapter_payload AS (
    SELECT pg_catalog.string_agg(
      pg_catalog.concat_ws(
        E'\x1f',
        c.id::text,
        c.chapter_number::text,
        COALESCE(c.title, ''),
        COALESCE(c.content, ''),
        COALESCE(c.is_generated, false)::text,
        COALESCE(c.version_number, 1)::text,
        COALESCE(c.academic_mode, false)::text,
        COALESCE(c.citation_style, ''),
        COALESCE(c.chapter_references, '[]'::jsonb)::text
      ),
      E'\x1e' ORDER BY c.chapter_number, c.id
    ) AS payload
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
        COALESCE(ca.caption, ''),
        COALESCE(ca.entity, ''),
        a.source,
        COALESCE(a.source_id, ''),
        a.source_url,
        a.image_url,
        COALESCE(a.license, ''),
        COALESCE(a.attribution, ''),
        COALESCE(a.content_hash, '')
      ),
      E'\x1e' ORDER BY ca.chapter_id, ca.placement_order, ca.asset_id
    ) AS payload
    FROM public.scrollvision_chapter_assets ca
    JOIN public.scrollvision_assets a ON a.id = ca.asset_id
    WHERE ca.book_id = p_book_id
      AND ca.is_active IS TRUE
  ),
  cover_provenance_payload AS (
    SELECT pg_catalog.string_agg(
      pg_catalog.concat_ws(
        E'\x1f',
        p.asset_url,
        p.source_type,
        p.rights_basis,
        COALESCE(p.license, ''),
        COALESCE(p.attribution, ''),
        COALESCE(p.source_url, ''),
        COALESCE(p.provider, ''),
        COALESCE(p.model, ''),
        p.user_attested::text,
        COALESCE(p.attested_by::text, '')
      ),
      E'\x1e' ORDER BY p.id
    ) AS payload
    FROM public.book_asset_provenance p
    JOIN public.books b ON b.id = p.book_id
    WHERE p.book_id = p_book_id
      AND p.asset_role = 'cover'
      AND p.asset_url = COALESCE(b.cover_image_url, '')
  ),
  publishing_profile_payload AS (
    SELECT pg_catalog.string_agg(
      pg_catalog.concat_ws(
        E'\x1f',
        pp.publisher_mode,
        COALESCE(pp.edition_label, ''),
        COALESCE(pp.publication_language, ''),
        pp.print_identifier_strategy,
        pp.ebook_identifier_strategy,
        pp.distribution_scope,
        COALESCE(pp.imprint_id::text, ''),
        COALESCE(pi.scope, ''),
        COALESCE(pi.publisher_name, ''),
        COALESCE(pi.imprint_name, ''),
        COALESCE(pi.country_code, ''),
        COALESCE(pi.isbn_agency_name, ''),
        COALESCE(pi.registrant_name, ''),
        COALESCE(pi.agency_record_attested, false)::text,
        COALESCE(pi.verified, false)::text
      ),
      E'\x1e' ORDER BY pp.book_id
    ) AS payload
    FROM public.book_publishing_profiles pp
    LEFT JOIN public.publishing_imprints pi ON pi.id = pp.imprint_id
    WHERE pp.book_id = p_book_id
  ),
  isbn_assignment_payload AS (
    SELECT pg_catalog.string_agg(
      pg_catalog.concat_ws(
        E'\x1f',
        ba.product_form,
        ba.language,
        ba.edition_label,
        i.isbn13,
        i.source,
        i.imprint_id::text,
        COALESCE(ba.locked_publication_id::text, '')
      ),
      E'\x1e' ORDER BY ba.product_form, ba.language, ba.edition_label, i.isbn13
    ) AS payload
    FROM public.book_isbn_assignments ba
    JOIN public.isbn_inventory i ON i.id = ba.isbn_id
    WHERE ba.book_id = p_book_id
  )
  SELECT pg_catalog.encode(
    extensions.digest(
      bp.payload
        || E'\x1d' || COALESCE(cp.payload, '')
        || E'\x1c' || COALESCE(mp.payload, '')
        || E'\x1b' || COALESCE(cpp.payload, '')
        || E'\x1a' || COALESCE(ppp.payload, '')
        || E'\x19' || COALESCE(iap.payload, ''),
      'sha256'
    ),
    'hex'
  )
  FROM book_payload bp
  CROSS JOIN chapter_payload cp
  CROSS JOIN media_payload mp
  CROSS JOIN cover_provenance_payload cpp
  CROSS JOIN publishing_profile_payload ppp
  CROSS JOIN isbn_assignment_payload iap;
$$;

REVOKE ALL ON FUNCTION public.compute_book_publication_hash(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.compute_book_publication_hash(uuid)
  TO service_role;

COMMENT ON FUNCTION public.compute_book_publication_hash(uuid) IS
  'Exact publication fingerprint over manuscript, active media/rights, publisher/imprint identity and format-specific ISBN assignments.';
