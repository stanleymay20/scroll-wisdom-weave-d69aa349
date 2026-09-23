-- Lovable Test convergence Phase 4: publication hash + attestation authority.
--
-- Final-state definitions only. This is a forward-only/idempotent convergence
-- delta for the Lovable-managed Test database after phases 0006-0008.
-- No historical migration replay and no data backfill.

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
    COALESCE(b.work_id::text,'')
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
  'Rich publication fingerprint over work, title/subtitle, contributors, rights, manuscript, media/provenance, publisher/imprint and format-specific ISBN identity.';

CREATE OR REPLACE FUNCTION public.record_publication_gate_attestation(
  p_book_id uuid,
  p_user_id uuid,
  p_gate text,
  p_status text,
  p_artifact jsonb DEFAULT '{}'::jsonb,
  p_source_record_id uuid DEFAULT NULL,
  p_chapter_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_hash text;
  v_id uuid;
BEGIN
  IF p_book_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'book_id and user_id are required';
  END IF;

  IF p_gate NOT IN (
    'editorial','evidence','qa','structural','production','rights'
  ) THEN
    RAISE EXCEPTION 'unsupported publication gate: %', p_gate;
  END IF;

  IF p_status NOT IN ('passed','blocked') THEN
    RAISE EXCEPTION 'unsupported publication gate status: %', p_status;
  END IF;

  IF p_chapter_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.chapters c
      WHERE c.id = p_chapter_id
        AND c.book_id = p_book_id
    ) THEN
      RAISE EXCEPTION 'chapter does not belong to book';
    END IF;
    v_hash := public.compute_chapter_publication_hash(p_chapter_id);
  ELSE
    v_hash := public.compute_book_publication_hash(p_book_id);
  END IF;

  IF v_hash IS NULL THEN
    RAISE EXCEPTION 'unable to compute publication scope hash';
  END IF;

  INSERT INTO public.publication_gate_attestations(
    book_id,
    chapter_id,
    user_id,
    gate,
    scope,
    status,
    scope_hash,
    artifact,
    source_record_id
  )
  VALUES(
    p_book_id,
    p_chapter_id,
    p_user_id,
    p_gate,
    CASE WHEN p_chapter_id IS NULL THEN 'book' ELSE 'chapter' END,
    p_status,
    v_hash,
    COALESCE(p_artifact, '{}'::jsonb),
    p_source_record_id
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- Compatibility only. Application producers must use the scope-bound API.
REVOKE ALL ON FUNCTION public.record_publication_gate_attestation(
  uuid, uuid, text, text, jsonb, uuid, uuid
) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.record_publication_gate_attestation_bound(
  p_book_id uuid,
  p_user_id uuid,
  p_gate text,
  p_status text,
  p_expected_scope_hash text,
  p_artifact jsonb DEFAULT '{}'::jsonb,
  p_source_record_id uuid DEFAULT NULL,
  p_chapter_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_current_hash text;
  v_id uuid;
BEGIN
  IF p_book_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'book_id and user_id are required';
  END IF;

  IF p_gate NOT IN (
    'editorial','evidence','qa','structural','production','rights'
  ) THEN
    RAISE EXCEPTION 'unsupported publication gate: %', p_gate;
  END IF;

  IF p_status NOT IN ('passed','blocked') THEN
    RAISE EXCEPTION 'unsupported publication gate status: %', p_status;
  END IF;

  IF p_expected_scope_hash IS NULL
     OR p_expected_scope_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'INVALID_PUBLICATION_SCOPE_HASH',
      DETAIL = 'Expected publication scope hash must be a lowercase 64-character SHA-256 hex digest.';
  END IF;

  IF p_chapter_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.chapters c
      WHERE c.id = p_chapter_id
        AND c.book_id = p_book_id
    ) THEN
      RAISE EXCEPTION 'chapter does not belong to book';
    END IF;
    v_current_hash := public.compute_chapter_publication_hash(p_chapter_id);
  ELSE
    v_current_hash := public.compute_book_publication_hash(p_book_id);
  END IF;

  IF v_current_hash IS NULL THEN
    RAISE EXCEPTION 'unable to compute publication scope hash';
  END IF;

  IF v_current_hash <> p_expected_scope_hash THEN
    RAISE EXCEPTION USING
      ERRCODE = '40001',
      MESSAGE = 'PUBLICATION_SCOPE_CHANGED',
      DETAIL = 'The publication scope changed after evaluation began; the verdict was not recorded.',
      HINT = 'Reload the persisted scope and rerun the publication gate.';
  END IF;

  INSERT INTO public.publication_gate_attestations(
    book_id,
    chapter_id,
    user_id,
    gate,
    scope,
    status,
    scope_hash,
    artifact,
    source_record_id
  )
  VALUES(
    p_book_id,
    p_chapter_id,
    p_user_id,
    p_gate,
    CASE WHEN p_chapter_id IS NULL THEN 'book' ELSE 'chapter' END,
    p_status,
    p_expected_scope_hash,
    COALESCE(p_artifact, '{}'::jsonb),
    p_source_record_id
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_publication_gate_attestation_bound(
  uuid, uuid, text, text, text, jsonb, uuid, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_publication_gate_attestation_bound(
  uuid, uuid, text, text, text, jsonb, uuid, uuid
) TO service_role;

CREATE OR REPLACE FUNCTION public.has_current_publication_attestations(
  p_book_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_book_hash text;
  v_chapter_count integer := 0;
  v_generated_count integer := 0;
  v_evidence_required boolean := false;
  v_evidence_passed integer := 0;
  v_latest_status text;
BEGIN
  SELECT
    count(*)::integer,
    count(*) FILTER (
      WHERE c.is_generated IS TRUE
        AND NULLIF(btrim(COALESCE(c.content,'')), '') IS NOT NULL
    )::integer
  INTO v_chapter_count, v_generated_count
  FROM public.chapters c
  WHERE c.book_id = p_book_id;

  IF v_chapter_count = 0 OR v_generated_count < v_chapter_count THEN
    RETURN false;
  END IF;

  v_book_hash := public.compute_book_publication_hash(p_book_id);
  IF v_book_hash IS NULL THEN
    RETURN false;
  END IF;

  SELECT a.status
  INTO v_latest_status
  FROM public.publication_gate_attestations a
  WHERE a.book_id = p_book_id
    AND a.gate = 'editorial'
    AND a.scope = 'book'
    AND a.scope_hash = v_book_hash
  ORDER BY a.created_at DESC, a.id DESC
  LIMIT 1;

  IF COALESCE(v_latest_status,'blocked') <> 'passed' THEN
    RETURN false;
  END IF;

  v_latest_status := NULL;
  SELECT a.status
  INTO v_latest_status
  FROM public.publication_gate_attestations a
  WHERE a.book_id = p_book_id
    AND a.gate = 'structural'
    AND a.scope = 'book'
    AND a.scope_hash = v_book_hash
  ORDER BY a.created_at DESC, a.id DESC
  LIMIT 1;

  IF COALESCE(v_latest_status,'blocked') <> 'passed' THEN
    RETURN false;
  END IF;

  v_latest_status := NULL;
  SELECT a.status
  INTO v_latest_status
  FROM public.publication_gate_attestations a
  WHERE a.book_id = p_book_id
    AND a.gate = 'qa'
    AND a.scope = 'book'
    AND a.scope_hash = v_book_hash
  ORDER BY a.created_at DESC, a.id DESC
  LIMIT 1;

  IF COALESCE(v_latest_status,'blocked') <> 'passed' THEN
    RETURN false;
  END IF;

  v_evidence_required := public.book_requires_publication_evidence(p_book_id);
  IF v_evidence_required THEN
    SELECT count(*)::integer
    INTO v_evidence_passed
    FROM public.chapters c
    WHERE c.book_id = p_book_id
      AND COALESCE((
        SELECT a.status = 'passed'
        FROM public.publication_gate_attestations a
        WHERE a.book_id = p_book_id
          AND a.chapter_id = c.id
          AND a.gate = 'evidence'
          AND a.scope = 'chapter'
          AND a.scope_hash = public.compute_chapter_publication_hash(c.id)
        ORDER BY a.created_at DESC, a.id DESC
        LIMIT 1
      ), false);

    IF v_evidence_passed < v_chapter_count THEN
      RETURN false;
    END IF;
  END IF;

  v_latest_status := NULL;
  SELECT a.status
  INTO v_latest_status
  FROM public.publication_gate_attestations a
  WHERE a.book_id = p_book_id
    AND a.gate = 'rights'
    AND a.scope = 'book'
    AND a.scope_hash = v_book_hash
  ORDER BY a.created_at DESC, a.id DESC
  LIMIT 1;

  IF COALESCE(v_latest_status,'blocked') <> 'passed' THEN
    RETURN false;
  END IF;

  v_latest_status := NULL;
  SELECT a.status
  INTO v_latest_status
  FROM public.publication_gate_attestations a
  WHERE a.book_id = p_book_id
    AND a.gate = 'production'
    AND a.scope = 'book'
    AND a.scope_hash = v_book_hash
  ORDER BY a.created_at DESC, a.id DESC
  LIMIT 1;

  IF COALESCE(v_latest_status,'blocked') <> 'passed' THEN
    RETURN false;
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.has_current_publication_attestations(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_current_publication_attestations(uuid)
  TO service_role;
