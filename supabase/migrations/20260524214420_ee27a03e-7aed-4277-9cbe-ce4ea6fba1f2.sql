-- Admins can read all recommendation feedback (for analytics)
CREATE POLICY "Admins view all rec feedback"
  ON public.recommendation_feedback
  FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- Seed new tunable weight
INSERT INTO public.discovery_weights (key, value, description)
VALUES
  ('w_small_author_boost', 5, 'Boost applied to authors with few prior sales'),
  ('w_diversity_cap_per_author', 2, 'Max items per author per rail')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- get_recommendation_analytics
-- Returns per-source (rail) aggregated metrics over the window
-- Optional grouping by context (metadata->>'context')
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_recommendation_analytics(_window_days integer DEFAULT 14)
RETURNS TABLE(
  source text,
  context text,
  shown bigint,
  clicked bigint,
  sampled bigint,
  purchased bigint,
  hidden bigint,
  ctr numeric,
  sample_rate numeric,
  purchase_rate numeric,
  hide_rate numeric,
  unique_users bigint,
  unique_listings bigint
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH guard AS (
    SELECT public.has_role(auth.uid(), 'admin') AS ok
  ),
  base AS (
    SELECT
      rf.source,
      COALESCE(NULLIF(rf.metadata->>'context',''), 'default') AS context,
      rf.action,
      rf.user_id,
      rf.listing_id
    FROM public.recommendation_feedback rf, guard
    WHERE guard.ok = true
      AND rf.created_at >= now() - make_interval(days => _window_days)
  )
  SELECT
    source,
    context,
    SUM((action='shown')::int)::bigint     AS shown,
    SUM((action='clicked')::int)::bigint   AS clicked,
    SUM((action='sampled')::int)::bigint   AS sampled,
    SUM((action='purchased')::int)::bigint AS purchased,
    SUM((action='hidden')::int)::bigint    AS hidden,
    CASE WHEN SUM((action='shown')::int) > 0
         THEN ROUND(SUM((action='clicked')::int)::numeric / SUM((action='shown')::int), 4)
         ELSE 0 END AS ctr,
    CASE WHEN SUM((action='clicked')::int) > 0
         THEN ROUND(SUM((action='sampled')::int)::numeric / SUM((action='clicked')::int), 4)
         ELSE 0 END AS sample_rate,
    CASE WHEN SUM((action='clicked')::int) > 0
         THEN ROUND(SUM((action='purchased')::int)::numeric / SUM((action='clicked')::int), 4)
         ELSE 0 END AS purchase_rate,
    CASE WHEN SUM((action='shown')::int) > 0
         THEN ROUND(SUM((action='hidden')::int)::numeric / SUM((action='shown')::int), 4)
         ELSE 0 END AS hide_rate,
    COUNT(DISTINCT user_id)::bigint    AS unique_users,
    COUNT(DISTINCT listing_id)::bigint AS unique_listings
  FROM base
  GROUP BY source, context
  ORDER BY shown DESC NULLS LAST
$$;

-- ============================================================
-- get_recommendation_diversity
-- Returns concentration of impressions across authors & categories
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_recommendation_diversity(_window_days integer DEFAULT 14)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _result jsonb;
  _total bigint;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'admin_required';
  END IF;

  WITH impressions AS (
    SELECT rf.listing_id, b.user_id AS author_user_id, b.category, ap.display_name
    FROM public.recommendation_feedback rf
    JOIN public.public_listings pl ON pl.id = rf.listing_id
    JOIN public.books b ON b.id = pl.book_id
    LEFT JOIN public.author_profiles ap ON ap.user_id = b.user_id
    WHERE rf.action = 'shown'
      AND rf.created_at >= now() - make_interval(days => _window_days)
  ),
  totals AS (SELECT COUNT(*)::bigint AS n FROM impressions),
  by_author AS (
    SELECT author_user_id, MAX(display_name) AS display_name, COUNT(*)::bigint AS impressions
    FROM impressions
    GROUP BY author_user_id
    ORDER BY impressions DESC
    LIMIT 15
  ),
  by_category AS (
    SELECT COALESCE(category,'(uncategorized)') AS category, COUNT(*)::bigint AS impressions
    FROM impressions
    GROUP BY COALESCE(category,'(uncategorized)')
    ORDER BY impressions DESC
    LIMIT 15
  ),
  top5_author AS (
    SELECT SUM(impressions)::bigint AS s FROM (
      SELECT impressions FROM by_author LIMIT 5
    ) t
  )
  SELECT jsonb_build_object(
    'total_impressions', (SELECT n FROM totals),
    'unique_authors', (SELECT COUNT(DISTINCT author_user_id) FROM impressions),
    'unique_categories', (SELECT COUNT(DISTINCT COALESCE(category,'(uncategorized)')) FROM impressions),
    'top5_author_share', CASE WHEN (SELECT n FROM totals) > 0
                              THEN ROUND((SELECT s FROM top5_author)::numeric / (SELECT n FROM totals), 4)
                              ELSE 0 END,
    'authors', (SELECT jsonb_agg(jsonb_build_object(
                  'author_user_id', author_user_id,
                  'display_name', COALESCE(display_name,'(unknown)'),
                  'impressions', impressions,
                  'share', CASE WHEN (SELECT n FROM totals) > 0
                                THEN ROUND(impressions::numeric / (SELECT n FROM totals), 4)
                                ELSE 0 END
                )) FROM by_author),
    'categories', (SELECT jsonb_agg(jsonb_build_object(
                     'category', category,
                     'impressions', impressions,
                     'share', CASE WHEN (SELECT n FROM totals) > 0
                                   THEN ROUND(impressions::numeric / (SELECT n FROM totals), 4)
                                   ELSE 0 END
                   )) FROM by_category)
  )
  INTO _result;

  RETURN COALESCE(_result, jsonb_build_object('total_impressions', 0));
END;
$$;

-- ============================================================
-- admin_update_discovery_weight — audited weight tuning
-- ============================================================
CREATE OR REPLACE FUNCTION public.admin_update_discovery_weight(_key text, _value numeric)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _caller uuid := auth.uid();
  _old numeric;
BEGIN
  IF _caller IS NULL OR NOT public.has_role(_caller, 'admin') THEN
    RAISE EXCEPTION 'admin_required';
  END IF;
  IF _key IS NULL OR length(_key) = 0 THEN
    RAISE EXCEPTION 'invalid_key';
  END IF;
  IF _value < 0 OR _value > 1000 THEN
    RAISE EXCEPTION 'value_out_of_range';
  END IF;

  SELECT value INTO _old FROM public.discovery_weights WHERE key = _key;

  INSERT INTO public.discovery_weights (key, value, updated_at, updated_by)
  VALUES (_key, _value, now(), _caller)
  ON CONFLICT (key) DO UPDATE
    SET value = EXCLUDED.value,
        updated_at = now(),
        updated_by = _caller;

  PERFORM public.log_audit_event(
    'discovery_weight_updated', _caller, NULL, 'discovery_weights', _key,
    'info', jsonb_build_object('old_value', _old, 'new_value', _value)
  );

  RETURN jsonb_build_object('ok', true, 'key', _key, 'old_value', _old, 'new_value', _value);
END;
$$;

-- ============================================================
-- get_user_recommendation_suppression
-- Per-source counts of hides and (shown-without-click) ignores
-- Used by storefront-user-api/recommended-for-user to down-rank.
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_user_recommendation_suppression(_user_id uuid, _window_days integer DEFAULT 30)
RETURNS TABLE(source text, hide_count bigint, shown_count bigint, click_count bigint, ignore_ratio numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    source,
    SUM((action='hidden')::int)::bigint  AS hide_count,
    SUM((action='shown')::int)::bigint   AS shown_count,
    SUM((action='clicked')::int)::bigint AS click_count,
    CASE WHEN SUM((action='shown')::int) > 0
         THEN ROUND(1 - (SUM((action='clicked')::int)::numeric / SUM((action='shown')::int)), 4)
         ELSE 0 END AS ignore_ratio
  FROM public.recommendation_feedback
  WHERE user_id = _user_id
    AND created_at >= now() - make_interval(days => _window_days)
  GROUP BY source
$$;