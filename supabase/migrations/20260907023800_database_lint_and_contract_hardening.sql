-- Final database-contract hardening exposed by full fresh-schema linting.
-- This migration fixes stale schema references, enum/text coercion bugs and
-- PL/pgSQL output-parameter ambiguities without weakening any authorization or
-- release gate. Where practical, privileged helpers also use a pinned empty
-- search_path and fully-qualified relations.

-- ---------------------------------------------------------------------------
-- Public certificate verification: validity is represented by revocation state;
-- publishing_certificates has no status column. Keep the intentionally public,
-- limited-data verification RPC, but pin its search path.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.verify_certificate(cert_number text)
RETURNS TABLE (
  is_valid boolean,
  certificate_type text,
  book_title text,
  issued_at timestamptz,
  verification_hash text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    pc.revoked_at IS NULL AS is_valid,
    pc.certificate_type,
    b.title AS book_title,
    pc.issued_at,
    pc.verification_hash
  FROM public.publishing_certificates AS pc
  JOIN public.books AS b ON b.id = pc.book_id
  WHERE pc.certificate_number = $1
  LIMIT 1;
$$;
REVOKE ALL ON FUNCTION public.verify_certificate(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_certificate(text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- Recommendation diversity: books.category is an enum. Convert it to text
-- before introducing the synthetic '(uncategorized)' reporting label.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_recommendation_diversity(_window_days integer DEFAULT 14)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _result jsonb;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admin_required';
  END IF;

  WITH impressions AS (
    SELECT
      rf.listing_id,
      b.user_id AS author_user_id,
      b.category::text AS category,
      ap.display_name
    FROM public.recommendation_feedback AS rf
    JOIN public.public_listings AS pl ON pl.id = rf.listing_id
    JOIN public.books AS b ON b.id = pl.book_id
    LEFT JOIN public.author_profiles AS ap ON ap.user_id = b.user_id
    WHERE rf.action = 'shown'
      AND rf.created_at >= pg_catalog.now() - pg_catalog.make_interval(days => _window_days)
  ),
  totals AS (
    SELECT COUNT(*)::bigint AS n FROM impressions
  ),
  by_author AS (
    SELECT author_user_id, MAX(display_name) AS display_name, COUNT(*)::bigint AS impressions
    FROM impressions
    GROUP BY author_user_id
    ORDER BY impressions DESC
    LIMIT 15
  ),
  by_category AS (
    SELECT COALESCE(category, '(uncategorized)') AS category, COUNT(*)::bigint AS impressions
    FROM impressions
    GROUP BY COALESCE(category, '(uncategorized)')
    ORDER BY impressions DESC
    LIMIT 15
  ),
  top5_author AS (
    SELECT SUM(impressions)::bigint AS s
    FROM (SELECT impressions FROM by_author LIMIT 5) AS t
  )
  SELECT pg_catalog.jsonb_build_object(
    'total_impressions', (SELECT n FROM totals),
    'unique_authors', (SELECT COUNT(DISTINCT author_user_id) FROM impressions),
    'unique_categories', (SELECT COUNT(DISTINCT COALESCE(category, '(uncategorized)')) FROM impressions),
    'top5_author_share', CASE WHEN (SELECT n FROM totals) > 0
      THEN ROUND(COALESCE((SELECT s FROM top5_author), 0)::numeric / (SELECT n FROM totals), 4)
      ELSE 0 END,
    'authors', COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'author_user_id', author_user_id,
      'display_name', COALESCE(display_name, '(unknown)'),
      'impressions', impressions,
      'share', CASE WHEN (SELECT n FROM totals) > 0
        THEN ROUND(impressions::numeric / (SELECT n FROM totals), 4)
        ELSE 0 END
    )) FROM by_author), '[]'::jsonb),
    'categories', COALESCE((SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'category', category,
      'impressions', impressions,
      'share', CASE WHEN (SELECT n FROM totals) > 0
        THEN ROUND(impressions::numeric / (SELECT n FROM totals), 4)
        ELSE 0 END
    )) FROM by_category), '[]'::jsonb)
  ) INTO _result;

  RETURN COALESCE(_result, pg_catalog.jsonb_build_object('total_impressions', 0));
END;
$$;
REVOKE ALL ON FUNCTION public.get_recommendation_diversity(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_recommendation_diversity(integer) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Admin entitlement detail: external_publications never had listing_id. Derive
-- the optional storefront listing from book_id so the JSON response contract is
-- retained without inventing a column.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_creator_entitlement_detail(_target_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _caller uuid := auth.uid();
  _out jsonb;
BEGIN
  IF _caller IS NULL OR NOT public.has_role(_caller, 'admin') THEN
    RAISE EXCEPTION 'admin_required';
  END IF;

  SELECT pg_catalog.jsonb_build_object(
    'user', pg_catalog.jsonb_build_object(
      'user_id', ce.user_id,
      'email', au.email,
      'tier', ce.tier,
      'payment_status', ce.payment_status,
      'grace_period_until', ce.grace_period_until,
      'current_period_end', ce.current_period_end,
      'stripe_customer_id', ce.stripe_customer_id,
      'stripe_price_id', ce.stripe_price_id,
      'stripe_subscription_id', ce.stripe_subscription_id,
      'source', ce.source,
      'updated_at', ce.updated_at
    ),
    'snapshots', COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(s) ORDER BY s.created_at DESC)
      FROM (
        SELECT ces.id, ces.context_type, ces.context_id, ces.tier, ces.payment_status, ces.source,
               ces.can_publish_external, ces.can_schedule_releases, ces.priority_generation,
               ces.rev_share_surcharge_bps, ces.stripe_price_id, ces.current_period_end,
               ces.grace_period_until, ces.metadata, ces.created_at
        FROM public.creator_entitlement_snapshots AS ces
        WHERE ces.user_id = _target_user_id
        ORDER BY ces.created_at DESC
        LIMIT 50
      ) AS s
    ), '[]'::jsonb),
    'audit_events', COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(a) ORDER BY a.created_at DESC)
      FROM (
        SELECT pal.id, pal.platform, pal.event_type, pal.severity, pal.message, pal.metadata, pal.created_at
        FROM public.publishing_audit_log AS pal
        WHERE pal.user_id = _target_user_id
          AND pal.event_type IN (
            'publish_blocked_by_tier','entitlement_granted','entitlement_revoked',
            'entitlement_overridden','entitlement_resynced','admin_manual_upgrade','admin_manual_downgrade',
            'token_revoked','token_expired','publish_failed'
          )
        ORDER BY pal.created_at DESC
        LIMIT 50
      ) AS a
    ), '[]'::jsonb),
    'publications', COALESCE((
      SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(p) ORDER BY p.created_at DESC)
      FROM (
        SELECT
          ep.id,
          ep.book_id,
          (SELECT pl.id FROM public.public_listings AS pl WHERE pl.book_id = ep.book_id LIMIT 1) AS listing_id,
          ep.platform,
          ep.status,
          ep.external_id,
          ep.external_url,
          ep.sync_state,
          ep.entitlement_snapshot_id,
          ep.created_at,
          ep.updated_at
        FROM public.external_publications AS ep
        WHERE ep.user_id = _target_user_id
        ORDER BY ep.created_at DESC
        LIMIT 50
      ) AS p
    ), '[]'::jsonb)
  ) INTO _out
  FROM public.creator_entitlements AS ce
  LEFT JOIN auth.users AS au ON au.id = ce.user_id
  WHERE ce.user_id = _target_user_id;

  RETURN COALESCE(
    _out,
    pg_catalog.jsonb_build_object(
      'user', NULL,
      'snapshots', '[]'::jsonb,
      'audit_events', '[]'::jsonb,
      'publications', '[]'::jsonb
    )
  );
END;
$$;
REVOKE ALL ON FUNCTION public.admin_get_creator_entitlement_detail(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_creator_entitlement_detail(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- Creator subscription analytics: fix the stale outer created_at reference and
-- eliminate row multiplication in daily-series and publisher-revenue metrics.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_get_creator_subscription_analytics(_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _caller uuid := auth.uid();
  _days_clamped integer := LEAST(GREATEST(COALESCE(_days, 30), 1), 365);
  _since timestamptz;
  _overview jsonb;
  _tier_breakdown jsonb;
  _payment_breakdown jsonb;
  _blocked jsonb;
  _grace jsonb;
  _series jsonb;
  _top_publishers jsonb;
BEGIN
  IF _caller IS NULL OR NOT public.has_role(_caller, 'admin') THEN
    RAISE EXCEPTION 'admin_required';
  END IF;
  _since := pg_catalog.now() - pg_catalog.make_interval(days => _days_clamped);

  SELECT pg_catalog.jsonb_build_object(
    'active_creators', COUNT(*) FILTER (WHERE ce.tier IN ('creator','creator_pro')),
    'creator_users', COUNT(*) FILTER (WHERE ce.tier = 'creator'),
    'creator_pro_users', COUNT(*) FILTER (WHERE ce.tier = 'creator_pro'),
    'free_users_with_entitlement_rows', COUNT(*) FILTER (WHERE ce.tier = 'free'),
    'grace_period_users', COUNT(*) FILTER (WHERE ce.payment_status = 'grace_period' OR ce.grace_period_until > pg_catalog.now()),
    'failed_payment_users', COUNT(*) FILTER (WHERE ce.payment_status IN ('past_due','unpaid','incomplete','incomplete_expired')),
    'estimated_mrr_cents',
      COUNT(*) FILTER (WHERE ce.tier = 'creator') * 1900 +
      COUNT(*) FILTER (WHERE ce.tier = 'creator_pro') * 4900,
    'estimated_arr_cents',
      (COUNT(*) FILTER (WHERE ce.tier = 'creator') * 1900 +
       COUNT(*) FILTER (WHERE ce.tier = 'creator_pro') * 4900) * 12,
    'stripe_synced_creators', COUNT(*) FILTER (WHERE ce.source = 'stripe'),
    'admin_overrides', COUNT(*) FILTER (WHERE ce.source = 'admin')
  ) INTO _overview
  FROM public.creator_entitlements AS ce;

  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('tier', t.tier, 'count', t.count) ORDER BY t.tier), '[]'::jsonb)
  INTO _tier_breakdown
  FROM (
    SELECT ce.tier, COUNT(*)::integer AS count
    FROM public.creator_entitlements AS ce
    GROUP BY ce.tier
  ) AS t;

  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('status', p.payment_status, 'count', p.count) ORDER BY p.payment_status), '[]'::jsonb)
  INTO _payment_breakdown
  FROM (
    SELECT ce.payment_status, COUNT(*)::integer AS count
    FROM public.creator_entitlements AS ce
    GROUP BY ce.payment_status
  ) AS p;

  SELECT pg_catalog.jsonb_build_object(
    'count', COALESCE(SUM(b.platform_count), 0),
    'latest_at', MAX(b.latest_platform_at),
    'by_platform', COALESCE(pg_catalog.jsonb_object_agg(b.platform, b.platform_count), '{}'::jsonb)
  ) INTO _blocked
  FROM (
    SELECT pal.platform, COUNT(*)::integer AS platform_count, MAX(pal.created_at) AS latest_platform_at
    FROM public.publishing_audit_log AS pal
    WHERE pal.event_type = 'publish_blocked_by_tier'
      AND pal.created_at >= _since
    GROUP BY pal.platform
  ) AS b;

  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(g) ORDER BY g.grace_period_until ASC), '[]'::jsonb)
  INTO _grace
  FROM (
    SELECT ce.user_id, au.email, ce.tier, ce.payment_status, ce.grace_period_until, ce.current_period_end
    FROM public.creator_entitlements AS ce
    LEFT JOIN auth.users AS au ON au.id = ce.user_id
    WHERE ce.payment_status = 'grace_period' OR ce.grace_period_until > pg_catalog.now()
    ORDER BY ce.grace_period_until ASC NULLS LAST
    LIMIT 25
  ) AS g;

  WITH days AS (
    SELECT gs::date AS day
    FROM pg_catalog.generate_series(
      (_since AT TIME ZONE 'UTC')::date,
      (pg_catalog.now() AT TIME ZONE 'UTC')::date,
      interval '1 day'
    ) AS gs
  ),
  creator_daily AS (
    SELECT d.day,
      (SELECT COUNT(*)::integer
       FROM public.creator_entitlements AS ce
       WHERE ce.tier IN ('creator','creator_pro') AND ce.updated_at::date <= d.day) AS active_creators
    FROM days AS d
  ),
  blocked_daily AS (
    SELECT pal.created_at::date AS day, COUNT(*)::integer AS blocked_events
    FROM public.publishing_audit_log AS pal
    WHERE pal.event_type = 'publish_blocked_by_tier' AND pal.created_at >= _since
    GROUP BY pal.created_at::date
  ),
  publication_daily AS (
    SELECT ep.created_at::date AS day, COUNT(*)::integer AS external_publications
    FROM public.external_publications AS ep
    WHERE ep.created_at >= _since
    GROUP BY ep.created_at::date
  )
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'day', d.day,
    'active_creators', cd.active_creators,
    'blocked_events', COALESCE(bd.blocked_events, 0),
    'external_publications', COALESCE(pd.external_publications, 0)
  ) ORDER BY d.day), '[]'::jsonb)
  INTO _series
  FROM days AS d
  JOIN creator_daily AS cd ON cd.day = d.day
  LEFT JOIN blocked_daily AS bd ON bd.day = d.day
  LEFT JOIN publication_daily AS pd ON pd.day = d.day;

  WITH publication_stats AS (
    SELECT ep.user_id, COUNT(*)::integer AS external_publications_count
    FROM public.external_publications AS ep
    WHERE ep.created_at >= _since
    GROUP BY ep.user_id
  ),
  revenue_stats AS (
    SELECT cel.creator_user_id AS user_id,
           COALESCE(SUM(cel.creator_net_cents), 0)::bigint AS creator_revenue_cents,
           COALESCE(SUM(cel.platform_fee_cents), 0)::bigint AS platform_fee_cents
    FROM public.creator_earnings_ledger AS cel
    WHERE cel.occurred_at >= _since
    GROUP BY cel.creator_user_id
  )
  SELECT COALESCE(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(tp)
    ORDER BY tp.external_publications_count DESC, tp.creator_revenue_cents DESC), '[]'::jsonb)
  INTO _top_publishers
  FROM (
    SELECT ce.user_id, au.email, ce.tier,
           COALESCE(ps.external_publications_count, 0) AS external_publications_count,
           COALESCE(rs.creator_revenue_cents, 0)::bigint AS creator_revenue_cents,
           COALESCE(rs.platform_fee_cents, 0)::bigint AS platform_fee_cents
    FROM public.creator_entitlements AS ce
    LEFT JOIN auth.users AS au ON au.id = ce.user_id
    LEFT JOIN publication_stats AS ps ON ps.user_id = ce.user_id
    LEFT JOIN revenue_stats AS rs ON rs.user_id = ce.user_id
    WHERE COALESCE(ps.external_publications_count, 0) > 0
       OR COALESCE(rs.creator_revenue_cents, 0) <> 0
    ORDER BY external_publications_count DESC, creator_revenue_cents DESC
    LIMIT 20
  ) AS tp;

  RETURN pg_catalog.jsonb_build_object(
    'window_days', _days_clamped,
    'overview', COALESCE(_overview, '{}'::jsonb),
    'tier_breakdown', COALESCE(_tier_breakdown, '[]'::jsonb),
    'payment_breakdown', COALESCE(_payment_breakdown, '[]'::jsonb),
    'blocked_publishing', COALESCE(_blocked, '{}'::jsonb),
    'grace_watchlist', COALESCE(_grace, '[]'::jsonb),
    'daily_series', COALESCE(_series, '[]'::jsonb),
    'top_publishers', COALESCE(_top_publishers, '[]'::jsonb)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.admin_get_creator_subscription_analytics(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_get_creator_subscription_analytics(integer) TO authenticated;

-- ---------------------------------------------------------------------------
-- Elite-readiness category check: category is an enum; NULL is the only
-- uncategorized state, so compare its text representation to the reporting
-- sentinel instead of coercing the sentinel into the enum.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.compute_book_elite_readiness(_book_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
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
  pf_pass int := 0; pf_total int := 0;
  rd_pass int := 0; rd_total int := 0;
  ex_pass int := 0; ex_total int := 0;
  ct_pass int := 0; ct_total int := 0;
  dc_pass int := 0; dc_total int := 0;
  preflight_score numeric;
  reading_score numeric;
  export_score numeric;
  catalog_score numeric;
  discover_score numeric;
  composite numeric;
  hard_blockers text[] := ARRAY[]::text[];
  publish_blockers text[] := ARRAY[]::text[];
  verdict text;
  bundle_kind text;
  paid boolean;
BEGIN
  SELECT * INTO b FROM public.books WHERE id = _book_id;
  IF NOT FOUND THEN RETURN pg_catalog.jsonb_build_object('error', 'book_not_found'); END IF;
  SELECT * INTO l FROM public.public_listings WHERE book_id = _book_id;
  SELECT * INTO ap FROM public.author_profiles WHERE user_id = b.user_id;

  SELECT COUNT(*), COALESCE(SUM(COALESCE(word_count, 0)), 0),
         COUNT(*) FILTER (WHERE audit_id IS NOT NULL),
         COUNT(*) FILTER (WHERE COALESCE(LENGTH(content), 0) < 200)
  INTO chapter_count, total_words, audited_chapter_count, empty_chapter_count
  FROM public.chapters WHERE book_id = _book_id;

  SELECT * INTO ba FROM public.book_audits WHERE book_id = _book_id ORDER BY created_at DESC LIMIT 1;
  SELECT COUNT(*) INTO graph_nodes FROM public.concept_nodes WHERE book_id = _book_id;
  required_nodes := GREATEST(5, CEIL(GREATEST(total_words, 0)::numeric / 2000.0));

  SELECT COUNT(*) INTO completed_export_count
  FROM public.export_jobs
  WHERE book_id = _book_id AND status = 'completed'
    AND COALESCE(completed_at, updated_at) >= pg_catalog.now() - interval '30 days';

  SELECT COALESCE(array_agg(DISTINCT bundle_type), ARRAY[]::text[]) INTO bundles_ready
  FROM public.export_jobs
  WHERE book_id = _book_id AND status = 'completed'
    AND COALESCE(completed_at, updated_at) >= pg_catalog.now() - interval '30 days';

  SELECT COUNT(*) INTO open_reports FROM public.content_reports
  WHERE book_id = _book_id AND status IN ('open','pending','reviewing');
  SELECT COUNT(*) INTO open_citation_flags
  FROM public.citation_flags AS cf JOIN public.chapters AS c ON c.id = cf.chapter_id
  WHERE c.book_id = _book_id AND cf.status IN ('open','pending');
  SELECT COUNT(*), AVG(rating)::numeric INTO review_count, rating_avg
  FROM public.book_reviews WHERE book_id = _book_id;

  paid := COALESCE(l.price_cents, 0) > 0;
  IF COALESCE(b.cover_image_url, '') = '' THEN publish_blockers := publish_blockers || ARRAY['cover_missing']; END IF;
  IF COALESCE(chapter_count, 0) < 5 THEN publish_blockers := publish_blockers || ARRAY['too_few_chapters']; END IF;
  IF empty_chapter_count > 0 THEN publish_blockers := publish_blockers || ARRAY['empty_chapters']; END IF;

  pf_total := 8;
  IF COALESCE(b.cover_image_url, '') <> '' THEN pf_pass := pf_pass + 1; ELSE hard_blockers := hard_blockers || ARRAY['cover_missing']; END IF;
  IF l.id IS NOT NULL AND COALESCE(l.subtitle, '') <> '' THEN pf_pass := pf_pass + 1; ELSE hard_blockers := hard_blockers || ARRAY['subtitle_missing']; END IF;
  IF l.id IS NOT NULL AND LENGTH(COALESCE(l.blurb, '')) >= 120 THEN pf_pass := pf_pass + 1; ELSE hard_blockers := hard_blockers || ARRAY['blurb_too_short']; END IF;
  IF l.id IS NOT NULL AND LENGTH(COALESCE(l.amazon_description, '')) >= 200 THEN pf_pass := pf_pass + 1; ELSE hard_blockers := hard_blockers || ARRAY['amazon_description_too_short']; END IF;
  IF l.id IS NOT NULL AND COALESCE(l.sample_chapters, 0) >= 3 THEN pf_pass := pf_pass + 1; ELSE hard_blockers := hard_blockers || ARRAY['sample_chapters_below_3']; END IF;
  IF (NOT paid) OR (paid AND COALESCE(l.price_cents, 0) > 0) THEN pf_pass := pf_pass + 1; ELSE hard_blockers := hard_blockers || ARRAY['price_missing']; END IF;
  IF chapter_count >= 5 AND empty_chapter_count = 0 THEN pf_pass := pf_pass + 1; ELSE hard_blockers := hard_blockers || ARRAY['chapters_incomplete']; END IF;
  IF audited_chapter_count = chapter_count AND chapter_count > 0 THEN pf_pass := pf_pass + 1; ELSE hard_blockers := hard_blockers || ARRAY['chapters_unaudited']; END IF;

  rd_total := 4;
  IF ba.id IS NOT NULL AND ba.overall_score >= 0.85 THEN rd_pass := rd_pass + 1; ELSE hard_blockers := hard_blockers || ARRAY['book_audit_below_threshold']; END IF;
  IF ba.id IS NOT NULL AND ba.certification_eligible THEN rd_pass := rd_pass + 1; ELSE hard_blockers := hard_blockers || ARRAY['certification_not_eligible']; END IF;
  IF graph_nodes >= required_nodes THEN rd_pass := rd_pass + 1; ELSE hard_blockers := hard_blockers || ARRAY['knowledge_graph_too_sparse']; END IF;
  IF ba.id IS NOT NULL AND (ba.pedagogical_score + ba.academic_score) / 2.0 >= 0.75 THEN rd_pass := rd_pass + 1; END IF;

  ex_total := 2;
  IF completed_export_count >= 1 THEN ex_pass := ex_pass + 1; ELSE hard_blockers := hard_blockers || ARRAY['no_recent_export']; END IF;
  IF COALESCE(array_length(bundles_ready, 1), 0) >= 2 THEN ex_pass := ex_pass + 1; END IF;
  FOREACH bundle_kind IN ARRAY ARRAY['kdp','gumroad','substack','patreon','etsy','shopify'] LOOP
    IF NOT (bundles_ready @> ARRAY[bundle_kind]) THEN bundles_missing := bundles_missing || ARRAY[bundle_kind]; END IF;
  END LOOP;

  ct_total := 3;
  IF open_reports = 0 THEN ct_pass := ct_pass + 1; ELSE hard_blockers := hard_blockers || ARRAY['open_content_reports']; END IF;
  IF open_citation_flags = 0 THEN ct_pass := ct_pass + 1; ELSE hard_blockers := hard_blockers || ARRAY['open_citation_flags']; END IF;
  IF l.id IS NOT NULL AND l.is_public = true THEN ct_pass := ct_pass + 1; END IF;

  dc_total := 6;
  IF COALESCE(b.title, '') <> '' THEN dc_pass := dc_pass + 1; END IF;
  IF LENGTH(COALESCE(l.amazon_description, l.blurb, b.description, '')) >= 120 THEN dc_pass := dc_pass + 1; END IF;
  IF l.id IS NOT NULL AND COALESCE(array_length(l.seo_keywords, 1), 0) >= 3 THEN dc_pass := dc_pass + 1; ELSE hard_blockers := hard_blockers || ARRAY['seo_keywords_below_3']; END IF;
  IF COALESCE(b.category::text, 'general') <> 'general' THEN dc_pass := dc_pass + 1; ELSE hard_blockers := hard_blockers || ARRAY['category_default']; END IF;
  IF COALESCE(b.language, '') <> '' THEN dc_pass := dc_pass + 1; END IF;
  IF ap.user_id IS NOT NULL AND COALESCE(ap.display_name, '') <> '' AND COALESCE(ap.bio, '') <> '' THEN dc_pass := dc_pass + 1; ELSE hard_blockers := hard_blockers || ARRAY['author_profile_incomplete']; END IF;

  preflight_score := CASE WHEN pf_total > 0 THEN pf_pass::numeric / pf_total ELSE 0 END;
  reading_score := CASE WHEN rd_total > 0 THEN rd_pass::numeric / rd_total ELSE 0 END;
  export_score := CASE WHEN ex_total > 0 THEN ex_pass::numeric / ex_total ELSE 0 END;
  catalog_score := CASE WHEN ct_total > 0 THEN ct_pass::numeric / ct_total ELSE 0 END;
  discover_score := CASE WHEN dc_total > 0 THEN dc_pass::numeric / dc_total ELSE 0 END;
  composite := ROUND((preflight_score*0.30 + reading_score*0.30 + export_score*0.15 + catalog_score*0.15 + discover_score*0.10)::numeric, 4);

  IF COALESCE(array_length(publish_blockers, 1), 0) > 0 THEN verdict := 'draft';
  ELSIF composite >= 0.85 AND COALESCE(array_length(hard_blockers, 1), 0) = 0 THEN verdict := 'elite';
  ELSIF composite >= 0.65 THEN verdict := 'ready';
  ELSE verdict := 'needs_work'; END IF;

  RETURN pg_catalog.jsonb_build_object(
    'book_id', _book_id, 'tier', verdict, 'composite', composite,
    'dimensions', pg_catalog.jsonb_build_object(
      'preflight', pg_catalog.jsonb_build_object('score', preflight_score, 'passed', pf_pass, 'total', pf_total),
      'reading', pg_catalog.jsonb_build_object('score', reading_score, 'passed', rd_pass, 'total', rd_total, 'graph_nodes', graph_nodes, 'required_nodes', required_nodes, 'total_words', total_words, 'audit_score', ba.overall_score),
      'export', pg_catalog.jsonb_build_object('score', export_score, 'passed', ex_pass, 'total', ex_total, 'bundles_ready', pg_catalog.to_jsonb(bundles_ready), 'bundles_missing', pg_catalog.to_jsonb(bundles_missing), 'completed_30d', completed_export_count),
      'catalog', pg_catalog.jsonb_build_object('score', catalog_score, 'passed', ct_pass, 'total', ct_total, 'open_reports', open_reports, 'open_citation_flags', open_citation_flags, 'review_count', review_count, 'rating_avg', rating_avg),
      'discoverability', pg_catalog.jsonb_build_object('score', discover_score, 'passed', dc_pass, 'total', dc_total)
    ),
    'hard_blockers', pg_catalog.to_jsonb(hard_blockers),
    'publish_blockers', pg_catalog.to_jsonb(publish_blockers),
    'computed_at', pg_catalog.now()
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- ISBN assignment functions: qualify columns that collide with RETURNS TABLE
-- output names. Preserve locking and one-ISBN-per-product semantics.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assign_owned_isbn(
  p_user_id uuid,
  p_book_id uuid,
  p_isbn text,
  p_product_form text,
  p_language text DEFAULT 'en',
  p_edition_label text DEFAULT 'First edition'
)
RETURNS TABLE(assignment_id uuid, isbn13 text, product_form text, language text, edition_label text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_isbn text := public.normalize_isbn13(p_isbn);
  v_profile public.book_publishing_profiles%ROWTYPE;
  v_imprint public.publishing_imprints%ROWTYPE;
  v_inventory public.isbn_inventory%ROWTYPE;
  v_existing public.book_isbn_assignments%ROWTYPE;
BEGIN
  IF p_product_form NOT IN ('paperback','hardcover','epub','pdf','audiobook') THEN RAISE EXCEPTION 'INVALID_PRODUCT_FORM' USING ERRCODE='22023'; END IF;
  IF NOT public.is_valid_isbn13(v_isbn) THEN RAISE EXCEPTION 'INVALID_ISBN13' USING ERRCODE='22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.books AS b WHERE b.id=p_book_id AND (b.user_id=p_user_id OR b.creator_id=p_user_id)) THEN
    RAISE EXCEPTION 'BOOK_NOT_OWNED' USING ERRCODE='42501';
  END IF;

  SELECT bpp.* INTO v_profile FROM public.book_publishing_profiles AS bpp
  WHERE bpp.book_id=p_book_id AND bpp.owner_user_id=p_user_id;
  IF NOT FOUND OR v_profile.publisher_mode <> 'own_imprint' OR v_profile.imprint_id IS NULL THEN RAISE EXCEPTION 'OWN_IMPRINT_REQUIRED' USING ERRCODE='23514'; END IF;

  SELECT pi.* INTO v_imprint FROM public.publishing_imprints AS pi WHERE pi.id=v_profile.imprint_id;
  IF NOT FOUND OR v_imprint.scope <> 'user' OR v_imprint.owner_user_id <> p_user_id OR v_imprint.agency_record_attested IS NOT TRUE THEN
    RAISE EXCEPTION 'ISBN_AGENCY_MATCH_ATTESTATION_REQUIRED' USING ERRCODE='23514';
  END IF;

  INSERT INTO public.isbn_inventory(imprint_id,isbn13,source,status,added_by)
  VALUES(v_imprint.id,v_isbn,'publisher_owned','available',p_user_id)
  ON CONFLICT ON CONSTRAINT isbn_inventory_isbn13_key DO NOTHING;

  SELECT ii.* INTO v_inventory FROM public.isbn_inventory AS ii WHERE ii.isbn13=v_isbn FOR UPDATE;
  IF v_inventory.imprint_id <> v_imprint.id OR v_inventory.source <> 'publisher_owned' THEN RAISE EXCEPTION 'ISBN_REGISTERED_TO_DIFFERENT_IMPRINT' USING ERRCODE='23505'; END IF;

  SELECT bia.* INTO v_existing FROM public.book_isbn_assignments AS bia
  WHERE bia.book_id=p_book_id AND bia.product_form=p_product_form AND bia.language=p_language AND bia.edition_label=p_edition_label
  FOR UPDATE;

  IF EXISTS (SELECT 1 FROM public.book_isbn_assignments AS a WHERE a.isbn_id=v_inventory.id AND (v_existing.id IS NULL OR a.id<>v_existing.id)) THEN
    RAISE EXCEPTION 'ISBN_ALREADY_ASSIGNED' USING ERRCODE='23505';
  END IF;
  IF v_existing.id IS NOT NULL AND v_existing.locked_at IS NOT NULL AND v_existing.isbn_id<>v_inventory.id THEN
    RAISE EXCEPTION 'ISBN_ASSIGNMENT_LOCKED_BY_PUBLICATION' USING ERRCODE='23514';
  END IF;

  IF v_existing.id IS NULL THEN
    INSERT INTO public.book_isbn_assignments(book_id,isbn_id,product_form,language,edition_label,assigned_by)
    VALUES(p_book_id,v_inventory.id,p_product_form,p_language,p_edition_label,p_user_id) RETURNING * INTO v_existing;
  ELSIF v_existing.isbn_id<>v_inventory.id THEN
    UPDATE public.isbn_inventory AS ii SET status='available' WHERE ii.id=v_existing.isbn_id;
    UPDATE public.book_isbn_assignments AS bia SET isbn_id=v_inventory.id,assigned_by=p_user_id,assigned_at=pg_catalog.now()
    WHERE bia.id=v_existing.id RETURNING * INTO v_existing;
  END IF;

  UPDATE public.isbn_inventory AS ii SET status='assigned' WHERE ii.id=v_inventory.id;
  IF p_product_form='paperback' THEN UPDATE public.books AS b SET isbn=v_isbn WHERE b.id=p_book_id; END IF;
  RETURN QUERY SELECT v_existing.id,v_isbn,p_product_form,p_language,p_edition_label;
END;
$$;
REVOKE ALL ON FUNCTION public.assign_owned_isbn(uuid,uuid,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.assign_owned_isbn(uuid,uuid,text,text,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.allocate_platform_isbn(
  p_user_id uuid,
  p_book_id uuid,
  p_product_form text,
  p_language text DEFAULT 'en',
  p_edition_label text DEFAULT 'First edition'
)
RETURNS TABLE(assignment_id uuid, isbn13 text, product_form text, language text, edition_label text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_profile public.book_publishing_profiles%ROWTYPE;
  v_imprint public.publishing_imprints%ROWTYPE;
  v_inventory public.isbn_inventory%ROWTYPE;
  v_existing public.book_isbn_assignments%ROWTYPE;
BEGIN
  IF p_product_form NOT IN ('paperback','hardcover','epub','pdf','audiobook') THEN RAISE EXCEPTION 'INVALID_PRODUCT_FORM' USING ERRCODE='22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.books AS b WHERE b.id=p_book_id AND (b.user_id=p_user_id OR b.creator_id=p_user_id)) THEN RAISE EXCEPTION 'BOOK_NOT_OWNED' USING ERRCODE='42501'; END IF;

  SELECT bpp.* INTO v_profile FROM public.book_publishing_profiles AS bpp WHERE bpp.book_id=p_book_id AND bpp.owner_user_id=p_user_id;
  IF NOT FOUND OR v_profile.publisher_mode<>'platform_imprint' OR v_profile.imprint_id IS NULL THEN RAISE EXCEPTION 'PLATFORM_IMPRINT_REQUIRED' USING ERRCODE='23514'; END IF;
  SELECT pi.* INTO v_imprint FROM public.publishing_imprints AS pi WHERE pi.id=v_profile.imprint_id;
  IF NOT FOUND OR v_imprint.scope<>'platform' OR v_imprint.verified IS NOT TRUE THEN RAISE EXCEPTION 'VERIFIED_PLATFORM_IMPRINT_REQUIRED' USING ERRCODE='23514'; END IF;

  SELECT bia.* INTO v_existing FROM public.book_isbn_assignments AS bia
  WHERE bia.book_id=p_book_id AND bia.product_form=p_product_form AND bia.language=p_language AND bia.edition_label=p_edition_label FOR UPDATE;

  IF v_existing.id IS NOT NULL AND v_existing.locked_at IS NOT NULL THEN
    SELECT ii.* INTO v_inventory FROM public.isbn_inventory AS ii WHERE ii.id=v_existing.isbn_id;
    RETURN QUERY SELECT v_existing.id,v_inventory.isbn13,p_product_form,p_language,p_edition_label;
    RETURN;
  END IF;

  SELECT ii.* INTO v_inventory FROM public.isbn_inventory AS ii
  WHERE ii.imprint_id=v_imprint.id AND ii.source='platform_pool' AND ii.status='available'
  ORDER BY ii.created_at,ii.id FOR UPDATE SKIP LOCKED LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'ISBN_POOL_EMPTY' USING ERRCODE='P0002'; END IF;

  IF v_existing.id IS NULL THEN
    INSERT INTO public.book_isbn_assignments(book_id,isbn_id,product_form,language,edition_label,assigned_by)
    VALUES(p_book_id,v_inventory.id,p_product_form,p_language,p_edition_label,p_user_id) RETURNING * INTO v_existing;
  ELSE
    UPDATE public.isbn_inventory AS ii SET status='available' WHERE ii.id=v_existing.isbn_id;
    UPDATE public.book_isbn_assignments AS bia SET isbn_id=v_inventory.id,assigned_by=p_user_id,assigned_at=pg_catalog.now()
    WHERE bia.id=v_existing.id RETURNING * INTO v_existing;
  END IF;

  UPDATE public.isbn_inventory AS ii SET status='assigned' WHERE ii.id=v_inventory.id;
  IF p_product_form='paperback' THEN UPDATE public.books AS b SET isbn=v_inventory.isbn13 WHERE b.id=p_book_id; END IF;
  RETURN QUERY SELECT v_existing.id,v_inventory.isbn13,p_product_form,p_language,p_edition_label;
END;
$$;
REVOKE ALL ON FUNCTION public.allocate_platform_isbn(uuid,uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.allocate_platform_isbn(uuid,uuid,text,text,text) TO service_role;

-- ---------------------------------------------------------------------------
-- Roster provisioning: the RETURNS TABLE user_id output variable collides with
-- an ON CONFLICT column name. Target the actual unique constraint explicitly.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.provision_university_roster_batch(
  _organization_id uuid,
  _actor_id uuid,
  _people jsonb
)
RETURNS TABLE(user_id uuid, ok boolean, error_message text, effective_status text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  item jsonb;
  v_user_id uuid;
  v_role text;
  v_display_name text;
  v_student_number text;
  v_staff_number text;
  v_initial_status text;
  v_existing_status text;
BEGIN
  IF NOT public.is_org_admin(_actor_id,_organization_id) THEN
    RAISE EXCEPTION 'Organization owner or admin required' USING ERRCODE='insufficient_privilege';
  END IF;
  IF pg_catalog.jsonb_typeof(_people)<>'array' OR pg_catalog.jsonb_array_length(_people)>500 THEN
    RAISE EXCEPTION 'Roster batch must be a JSON array with at most 500 entries' USING ERRCODE='check_violation';
  END IF;

  FOR item IN SELECT value FROM pg_catalog.jsonb_array_elements(_people) LOOP
    BEGIN
      v_user_id:=NULLIF(item->>'user_id','')::uuid;
      v_role:=item->>'university_role';
      v_display_name:=NULLIF(pg_catalog.btrim(item->>'display_name'),'');
      v_student_number:=NULLIF(pg_catalog.btrim(item->>'student_number'),'');
      v_staff_number:=NULLIF(pg_catalog.btrim(item->>'staff_number'),'');
      v_initial_status:=COALESCE(NULLIF(item->>'initial_status',''),'active');
      IF v_user_id IS NULL OR v_display_name IS NULL THEN RAISE EXCEPTION 'user_id and display_name are required'; END IF;
      IF v_role NOT IN ('chancellor','registrar','dean','programme_lead','lecturer','teaching_assistant','advisor','student','auditor') THEN RAISE EXCEPTION 'Invalid university role'; END IF;
      IF v_initial_status NOT IN ('invited','active') THEN RAISE EXCEPTION 'Initial university status must be invited or active'; END IF;

      INSERT INTO public.organization_members(organization_id,user_id,role,invited_by)
      VALUES(_organization_id,v_user_id,'member',_actor_id)
      ON CONFLICT ON CONSTRAINT organization_members_organization_id_user_id_key DO NOTHING;

      SELECT p.status INTO v_existing_status FROM public.university_people AS p
      WHERE p.organization_id=_organization_id AND p.user_id=v_user_id FOR UPDATE;
      IF FOUND THEN
        UPDATE public.university_people AS p SET university_role=v_role,display_name=v_display_name,
          student_number=v_student_number,staff_number=v_staff_number
        WHERE p.organization_id=_organization_id AND p.user_id=v_user_id;
      ELSE
        INSERT INTO public.university_people(organization_id,user_id,university_role,display_name,student_number,staff_number,status)
        VALUES(_organization_id,v_user_id,v_role,v_display_name,v_student_number,v_staff_number,v_initial_status);
        v_existing_status:=v_initial_status;
      END IF;

      user_id:=v_user_id; ok:=true; error_message:=NULL; effective_status:=v_existing_status; RETURN NEXT;
    EXCEPTION WHEN OTHERS THEN
      user_id:=v_user_id; ok:=false; error_message:=SQLERRM; effective_status:=NULL; RETURN NEXT;
    END;
  END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.provision_university_roster_batch(uuid,uuid,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.provision_university_roster_batch(uuid,uuid,jsonb) TO service_role;
