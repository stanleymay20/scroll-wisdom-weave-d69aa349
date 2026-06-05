
CREATE OR REPLACE FUNCTION public.compute_book_elite_readiness(_book_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  b record;
  l record;
  ap record;
  ba record;
  total_words integer := 0;
  chapter_count integer := 0;
  audited_chapter_count integer := 0;
  empty_chapter_count integer := 0;
  graph_nodes integer := 0;
  required_nodes numeric := 0;
  completed_export_count integer := 0;
  bundles_ready text[] := ARRAY[]::text[];
  bundles_missing text[] := ARRAY[]::text[];
  open_reports integer := 0;
  open_citation_flags integer := 0;
  review_count integer := 0;
  rating_avg numeric := NULL;

  pf_checks jsonb := '[]'::jsonb;
  rd_checks jsonb := '[]'::jsonb;
  ex_checks jsonb := '[]'::jsonb;
  ct_checks jsonb := '[]'::jsonb;
  dc_checks jsonb := '[]'::jsonb;

  pf_pass int := 0; pf_total int := 0;
  rd_pass int := 0; rd_total int := 0;
  ex_pass int := 0; ex_total int := 0;
  ct_pass int := 0; ct_total int := 0;
  dc_pass int := 0; dc_total int := 0;

  preflight_score numeric;
  reading_score   numeric;
  export_score    numeric;
  catalog_score   numeric;
  discover_score  numeric;
  composite       numeric;

  hard_blockers text[] := ARRAY[]::text[];
  publish_blockers text[] := ARRAY[]::text[];
  tier text;

  PAID boolean;
BEGIN
  SELECT * INTO b FROM public.books WHERE id = _book_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'book_not_found');
  END IF;

  SELECT * INTO l FROM public.public_listings WHERE book_id = _book_id;
  SELECT * INTO ap FROM public.author_profiles WHERE user_id = b.user_id;

  SELECT COUNT(*), COALESCE(SUM(COALESCE(word_count, 0)), 0),
         COUNT(*) FILTER (WHERE audit_id IS NOT NULL),
         COUNT(*) FILTER (WHERE COALESCE(LENGTH(content), 0) < 200)
    INTO chapter_count, total_words, audited_chapter_count, empty_chapter_count
    FROM public.chapters WHERE book_id = _book_id;

  SELECT * INTO ba
    FROM public.book_audits
   WHERE book_id = _book_id
   ORDER BY created_at DESC
   LIMIT 1;

  SELECT COUNT(*) INTO graph_nodes FROM public.concept_nodes WHERE book_id = _book_id;
  -- Graph density scales with length: floor 5 nodes, plus 1 node / 2000 words.
  required_nodes := GREATEST(5, CEIL(GREATEST(total_words, 0)::numeric / 2000.0));

  SELECT COUNT(*) INTO completed_export_count
    FROM public.export_jobs
   WHERE book_id = _book_id
     AND status = 'completed'
     AND COALESCE(completed_at, updated_at) >= now() - INTERVAL '30 days';

  SELECT COALESCE(array_agg(DISTINCT bundle_type), ARRAY[]::text[]) INTO bundles_ready
    FROM public.export_jobs
   WHERE book_id = _book_id
     AND status = 'completed'
     AND COALESCE(completed_at, updated_at) >= now() - INTERVAL '30 days';

  SELECT COUNT(*) INTO open_reports
    FROM public.content_reports
   WHERE book_id = _book_id AND status IN ('open','pending','reviewing');

  SELECT COUNT(*) INTO open_citation_flags
    FROM public.citation_flags cf
    JOIN public.chapters c ON c.id = cf.chapter_id
   WHERE c.book_id = _book_id AND cf.status IN ('open','pending');

  SELECT COUNT(*), AVG(rating)::numeric INTO review_count, rating_avg
    FROM public.book_reviews WHERE book_id = _book_id;

  PAID := COALESCE(l.price_cents, 0) > 0;

  -- ===== Publishing blockers (Draft if any) =====
  IF COALESCE(b.cover_image_url, '') = '' THEN
    publish_blockers := publish_blockers || 'cover_missing';
  END IF;
  IF COALESCE(chapter_count, 0) < 5 THEN
    publish_blockers := publish_blockers || 'too_few_chapters';
  END IF;
  IF empty_chapter_count > 0 THEN
    publish_blockers := publish_blockers || 'empty_chapters';
  END IF;

  -- ===== PREFLIGHT (30%) =====
  pf_total := 8;
  IF COALESCE(b.cover_image_url, '') <> '' THEN pf_pass := pf_pass + 1; ELSE hard_blockers := hard_blockers || 'cover_missing'; END IF;
  IF l.id IS NOT NULL AND COALESCE(l.subtitle, '') <> '' THEN pf_pass := pf_pass + 1; ELSE hard_blockers := hard_blockers || 'subtitle_missing'; END IF;
  IF l.id IS NOT NULL AND LENGTH(COALESCE(l.blurb, '')) >= 120 THEN pf_pass := pf_pass + 1; ELSE hard_blockers := hard_blockers || 'blurb_too_short'; END IF;
  IF l.id IS NOT NULL AND LENGTH(COALESCE(l.amazon_description, '')) >= 200 THEN pf_pass := pf_pass + 1; ELSE hard_blockers := hard_blockers || 'amazon_description_too_short'; END IF;
  IF l.id IS NOT NULL AND COALESCE(l.sample_chapters, 0) >= 3 THEN pf_pass := pf_pass + 1; ELSE hard_blockers := hard_blockers || 'sample_chapters_below_3'; END IF;
  IF (NOT PAID) OR (PAID AND COALESCE(l.price_cents, 0) > 0) THEN pf_pass := pf_pass + 1; ELSE hard_blockers := hard_blockers || 'price_missing'; END IF;
  IF chapter_count >= 5 AND empty_chapter_count = 0 THEN pf_pass := pf_pass + 1; ELSE hard_blockers := hard_blockers || 'chapters_incomplete'; END IF;
  IF audited_chapter_count = chapter_count AND chapter_count > 0 THEN pf_pass := pf_pass + 1; ELSE hard_blockers := hard_blockers || 'chapters_unaudited'; END IF;

  -- ===== READING (30%) =====
  rd_total := 4;
  IF ba.id IS NOT NULL AND ba.overall_score >= 0.85 THEN rd_pass := rd_pass + 1; ELSE hard_blockers := hard_blockers || 'book_audit_below_threshold'; END IF;
  IF ba.id IS NOT NULL AND ba.certification_eligible THEN rd_pass := rd_pass + 1; ELSE hard_blockers := hard_blockers || 'certification_not_eligible'; END IF;
  IF graph_nodes >= required_nodes THEN rd_pass := rd_pass + 1; ELSE hard_blockers := hard_blockers || 'knowledge_graph_too_sparse'; END IF;
  IF ba.id IS NOT NULL AND (ba.pedagogical_score + ba.academic_score) / 2.0 >= 0.75 THEN rd_pass := rd_pass + 1; END IF;

  -- ===== EXPORT (15%) — only gates Elite =====
  ex_total := 2;
  IF completed_export_count >= 1 THEN ex_pass := ex_pass + 1; ELSE hard_blockers := hard_blockers || 'no_recent_export'; END IF;
  IF array_length(bundles_ready, 1) >= 2 THEN ex_pass := ex_pass + 1; END IF;

  FOREACH tier IN ARRAY ARRAY['kdp','gumroad','substack','patreon','etsy','shopify'] LOOP
    IF NOT (bundles_ready @> ARRAY[tier]) THEN
      bundles_missing := bundles_missing || tier;
    END IF;
  END LOOP;

  -- ===== CATALOG (15%) =====
  ct_total := 3;
  IF open_reports = 0 THEN ct_pass := ct_pass + 1; ELSE hard_blockers := hard_blockers || 'open_content_reports'; END IF;
  IF open_citation_flags = 0 THEN ct_pass := ct_pass + 1; ELSE hard_blockers := hard_blockers || 'open_citation_flags'; END IF;
  IF l.id IS NOT NULL AND l.is_public = true THEN ct_pass := ct_pass + 1; END IF;
  -- NOTE: reviews/rating intentionally do NOT gate Elite. They feed marketplace trust elsewhere.

  -- ===== DISCOVERABILITY (10%) =====
  dc_total := 6;
  IF COALESCE(b.title, '') <> '' THEN dc_pass := dc_pass + 1; END IF;
  IF LENGTH(COALESCE(l.amazon_description, l.blurb, b.description, '')) >= 120 THEN dc_pass := dc_pass + 1; END IF;
  IF l.id IS NOT NULL AND COALESCE(array_length(l.seo_keywords, 1), 0) >= 3 THEN dc_pass := dc_pass + 1; ELSE hard_blockers := hard_blockers || 'seo_keywords_below_3'; END IF;
  IF COALESCE(b.category, 'general') <> 'general' THEN dc_pass := dc_pass + 1; ELSE hard_blockers := hard_blockers || 'category_default'; END IF;
  IF COALESCE(b.language, '') <> '' THEN dc_pass := dc_pass + 1; END IF;
  IF ap.user_id IS NOT NULL AND COALESCE(ap.display_name, '') <> '' AND COALESCE(ap.bio, '') <> '' THEN dc_pass := dc_pass + 1; ELSE hard_blockers := hard_blockers || 'author_profile_incomplete'; END IF;

  -- ===== Dimension scores (0..1) =====
  preflight_score := CASE WHEN pf_total > 0 THEN pf_pass::numeric / pf_total ELSE 0 END;
  reading_score   := CASE WHEN rd_total > 0 THEN rd_pass::numeric / rd_total ELSE 0 END;
  export_score    := CASE WHEN ex_total > 0 THEN ex_pass::numeric / ex_total ELSE 0 END;
  catalog_score   := CASE WHEN ct_total > 0 THEN ct_pass::numeric / ct_total ELSE 0 END;
  discover_score  := CASE WHEN dc_total > 0 THEN dc_pass::numeric / dc_total ELSE 0 END;

  composite := ROUND(
    (preflight_score * 0.30
   + reading_score   * 0.30
   + export_score    * 0.15
   + catalog_score   * 0.15
   + discover_score  * 0.10)::numeric, 4);

  IF array_length(publish_blockers, 1) > 0 THEN
    tier := 'draft';
  ELSIF composite >= 0.85 AND array_length(hard_blockers, 1) IS NULL THEN
    tier := 'elite';
  ELSIF composite >= 0.65 THEN
    tier := 'ready';
  ELSE
    tier := 'needs_work';
  END IF;

  RETURN jsonb_build_object(
    'book_id', _book_id,
    'tier', tier,
    'composite', composite,
    'dimensions', jsonb_build_object(
      'preflight',      jsonb_build_object('score', preflight_score, 'passed', pf_pass, 'total', pf_total),
      'reading',        jsonb_build_object('score', reading_score,   'passed', rd_pass, 'total', rd_total,
                                            'graph_nodes', graph_nodes, 'required_nodes', required_nodes,
                                            'total_words', total_words, 'audit_score', ba.overall_score),
      'export',         jsonb_build_object('score', export_score,    'passed', ex_pass, 'total', ex_total,
                                            'bundles_ready', to_jsonb(bundles_ready),
                                            'bundles_missing', to_jsonb(bundles_missing),
                                            'completed_30d', completed_export_count),
      'catalog',        jsonb_build_object('score', catalog_score,   'passed', ct_pass, 'total', ct_total,
                                            'open_reports', open_reports, 'open_citation_flags', open_citation_flags,
                                            'review_count', review_count, 'rating_avg', rating_avg),
      'discoverability',jsonb_build_object('score', discover_score,  'passed', dc_pass, 'total', dc_total)
    ),
    'hard_blockers', to_jsonb(COALESCE(hard_blockers, ARRAY[]::text[])),
    'publish_blockers', to_jsonb(COALESCE(publish_blockers, ARRAY[]::text[])),
    'computed_at', now()
  );
END;
$$;

-- Author-or-admin wrapper.
CREATE OR REPLACE FUNCTION public.get_book_elite_readiness(_book_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _owner uuid;
BEGIN
  SELECT user_id INTO _owner FROM public.books WHERE id = _book_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'book_not_found');
  END IF;
  IF _uid IS NULL OR (_owner <> _uid AND NOT public.has_role(_uid, 'admin')) THEN
    RETURN jsonb_build_object('error', 'forbidden');
  END IF;
  RETURN public.compute_book_elite_readiness(_book_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.compute_book_elite_readiness(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.compute_book_elite_readiness(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_book_elite_readiness(uuid) TO authenticated, service_role;

-- Marketplace sweep (admin only).
CREATE OR REPLACE FUNCTION public.get_marketplace_elite_readiness(
  _limit int DEFAULT 50,
  _offset int DEFAULT 0,
  _tier text DEFAULT NULL
)
RETURNS TABLE(
  book_id uuid,
  title text,
  author_user_id uuid,
  listing_slug text,
  tier text,
  composite numeric,
  hard_blocker_count int,
  dimensions jsonb
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL OR NOT public.has_role(_uid, 'admin') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  WITH listed AS (
    SELECT b.id AS book_id, b.title, b.user_id, pl.slug
    FROM public.public_listings pl
    JOIN public.books b ON b.id = pl.book_id
    WHERE pl.is_public = true
    ORDER BY pl.created_at DESC
    LIMIT GREATEST(_limit, 1) OFFSET GREATEST(_offset, 0)
  ),
  scored AS (
    SELECT
      l.book_id, l.title, l.user_id AS author_user_id, l.slug,
      public.compute_book_elite_readiness(l.book_id) AS s
    FROM listed l
  )
  SELECT
    s.book_id,
    s.title,
    s.author_user_id,
    s.slug,
    (s.s->>'tier')::text,
    ((s.s->>'composite')::numeric),
    COALESCE(jsonb_array_length(s.s->'hard_blockers'), 0),
    s.s->'dimensions'
  FROM scored s
  WHERE _tier IS NULL OR (s.s->>'tier') = _tier;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_marketplace_elite_readiness(int, int, text) TO authenticated, service_role;
