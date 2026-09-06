-- Publication identity must include active media and cover provenance, not only text.
-- Otherwise an illustration can be swapped after certification without invalidating
-- current-hash attestations.

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
  )
  SELECT pg_catalog.encode(
    extensions.digest(
      bp.payload
        || E'\x1d' || COALESCE(cp.payload, '')
        || E'\x1c' || COALESCE(mp.payload, '')
        || E'\x1b' || COALESCE(cpp.payload, ''),
      'sha256'
    ),
    'hex'
  )
  FROM book_payload bp
  CROSS JOIN chapter_payload cp
  CROSS JOIN media_payload mp
  CROSS JOIN cover_provenance_payload cpp;
$$;

REVOKE ALL ON FUNCTION public.compute_book_publication_hash(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.compute_book_publication_hash(uuid)
  TO service_role;
