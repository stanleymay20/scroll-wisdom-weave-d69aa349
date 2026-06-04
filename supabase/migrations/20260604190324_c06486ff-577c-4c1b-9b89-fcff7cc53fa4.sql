CREATE OR REPLACE FUNCTION public.get_creator_revenue_summary(
  _user_id uuid,
  _window_days int DEFAULT 30
) RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _result jsonb;
BEGIN
  IF _caller IS NULL OR (_caller <> _user_id AND NOT public.has_role(_caller, 'admin')) THEN
    RAISE EXCEPTION 'not_authorised';
  END IF;

  WITH lifetime AS (
    SELECT
      COALESCE(SUM(creator_net_cents) FILTER (WHERE entry_type = 'sale'), 0)::bigint AS lifetime_net_cents,
      COALESCE(SUM(gross_cents) FILTER (WHERE entry_type = 'sale'), 0)::bigint AS lifetime_gross_cents,
      COUNT(*) FILTER (WHERE entry_type = 'sale')::bigint AS lifetime_sales,
      COUNT(*) FILTER (WHERE entry_type IN ('refund','chargeback'))::bigint AS lifetime_refunds
    FROM public.creator_earnings_ledger
    WHERE creator_user_id = _user_id
  ),
  window_rev AS (
    SELECT
      COALESCE(SUM(creator_net_cents) FILTER (WHERE entry_type = 'sale'), 0)::bigint AS window_net_cents,
      COUNT(*) FILTER (WHERE entry_type = 'sale')::bigint AS window_sales
    FROM public.creator_earnings_ledger
    WHERE creator_user_id = _user_id
      AND occurred_at >= now() - make_interval(days => _window_days)
  ),
  prev_window_rev AS (
    SELECT COALESCE(SUM(creator_net_cents) FILTER (WHERE entry_type = 'sale'), 0)::bigint AS prev_net_cents
    FROM public.creator_earnings_ledger
    WHERE creator_user_id = _user_id
      AND occurred_at >= now() - make_interval(days => _window_days * 2)
      AND occurred_at <  now() - make_interval(days => _window_days)
  ),
  by_book AS (
    SELECT
      b.id AS book_id,
      COALESCE(NULLIF(l.book_title_snapshot,''), b.title) AS title,
      SUM(l.creator_net_cents) FILTER (WHERE l.entry_type = 'sale')::bigint AS net_cents,
      COUNT(*) FILTER (WHERE l.entry_type = 'sale')::bigint AS sales
    FROM public.creator_earnings_ledger l
    JOIN public.books b ON b.id = l.book_id
    WHERE l.creator_user_id = _user_id
    GROUP BY b.id, COALESCE(NULLIF(l.book_title_snapshot,''), b.title)
    ORDER BY net_cents DESC NULLS LAST
    LIMIT 10
  ),
  sl_channel AS (
    SELECT
      COALESCE(SUM(creator_net_cents) FILTER (WHERE entry_type = 'sale'), 0)::bigint AS net_cents,
      COUNT(*) FILTER (WHERE entry_type = 'sale')::bigint AS sales
    FROM public.creator_earnings_ledger
    WHERE creator_user_id = _user_id
  ),
  external_channels AS (
    SELECT
      ep.platform AS channel,
      COUNT(*)::bigint AS publications,
      SUM((ep.status='live')::int)::bigint AS live
    FROM public.external_publications ep
    WHERE ep.user_id = _user_id
    GROUP BY ep.platform
  ),
  daily_trend AS (
    SELECT
      day,
      SUM(net_cents)::bigint AS net_cents,
      SUM(sales_count)::bigint AS sales
    FROM public.creator_revenue_daily
    WHERE creator_user_id = _user_id
      AND day >= (now() - interval '90 days')::date
    GROUP BY day
    ORDER BY day
  )
  SELECT jsonb_build_object(
    'window_days', _window_days,
    'lifetime', (SELECT to_jsonb(lifetime.*) FROM lifetime),
    'window_net_cents', (SELECT window_net_cents FROM window_rev),
    'window_sales', (SELECT window_sales FROM window_rev),
    'prev_window_net_cents', (SELECT prev_net_cents FROM prev_window_rev),
    'growth_pct', CASE
      WHEN (SELECT prev_net_cents FROM prev_window_rev) > 0
      THEN ROUND(((SELECT window_net_cents FROM window_rev) - (SELECT prev_net_cents FROM prev_window_rev))::numeric
                 / (SELECT prev_net_cents FROM prev_window_rev) * 100, 1)
      ELSE NULL
    END,
    'top_books', COALESCE((SELECT jsonb_agg(to_jsonb(by_book.*)) FROM by_book), '[]'::jsonb),
    'by_channel', jsonb_build_object(
      'scrolllibrary', (SELECT to_jsonb(sl_channel.*) FROM sl_channel),
      'external', COALESCE((SELECT jsonb_agg(to_jsonb(external_channels.*)) FROM external_channels), '[]'::jsonb)
    ),
    'daily_trend', COALESCE((SELECT jsonb_agg(to_jsonb(daily_trend.*)) FROM daily_trend), '[]'::jsonb),
    'generated_at', now()
  ) INTO _result;

  RETURN _result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_creator_revenue_summary(uuid, int) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_creator_revenue_summary(uuid, int) FROM anon;


CREATE OR REPLACE FUNCTION public.get_creator_audience_summary(
  _user_id uuid,
  _window_days int DEFAULT 30
) RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _result jsonb;
BEGIN
  IF _caller IS NULL OR (_caller <> _user_id AND NOT public.has_role(_caller, 'admin')) THEN
    RAISE EXCEPTION 'not_authorised';
  END IF;

  WITH followers AS (
    SELECT
      COUNT(*)::bigint AS total_followers,
      COUNT(*) FILTER (WHERE created_at >= now() - make_interval(days => _window_days))::bigint AS new_followers
    FROM public.author_followers
    WHERE author_user_id = _user_id
  ),
  books_owned AS (
    SELECT id FROM public.books WHERE user_id = _user_id
  ),
  active_learners AS (
    SELECT COUNT(DISTINCT rp.user_id)::bigint AS n
    FROM public.reading_progress rp
    WHERE rp.book_id IN (SELECT id FROM books_owned)
      AND rp.updated_at >= now() - make_interval(days => _window_days)
  ),
  ret_readers AS (
    SELECT COUNT(*)::bigint AS n
    FROM (
      SELECT user_id
      FROM public.reading_progress
      WHERE book_id IN (SELECT id FROM books_owned)
        AND updated_at >= now() - make_interval(days => _window_days)
      GROUP BY user_id
      HAVING COUNT(DISTINCT date_trunc('day', updated_at)) >= 2
    ) t
  ),
  certs AS (
    SELECT COUNT(*)::bigint AS n
    FROM public.competency_certificates cc
    WHERE cc.book_id IN (SELECT id FROM books_owned)
      AND cc.issued_at >= now() - make_interval(days => _window_days)
  ),
  customers AS (
    SELECT COUNT(DISTINCT buyer_user_id)::bigint AS n
    FROM public.book_purchases
    WHERE book_id IN (SELECT id FROM books_owned)
      AND status = 'paid'
  )
  SELECT jsonb_build_object(
    'window_days', _window_days,
    'total_followers', (SELECT total_followers FROM followers),
    'new_followers', (SELECT new_followers FROM followers),
    'active_learners', (SELECT n FROM active_learners),
    'returning_readers', (SELECT n FROM ret_readers),
    'certifications_earned', (SELECT n FROM certs),
    'lifetime_customers', (SELECT n FROM customers),
    'email_subscribers', 0,
    'generated_at', now()
  ) INTO _result;

  RETURN _result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_creator_audience_summary(uuid, int) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_creator_audience_summary(uuid, int) FROM anon;


CREATE OR REPLACE FUNCTION public.get_creator_sales_conversion(
  _user_id uuid,
  _window_days int DEFAULT 30
) RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _views bigint; _samples bigint; _ctas bigint; _checkouts bigint; _purchases bigint;
  _net bigint; _followers bigint;
BEGIN
  IF _caller IS NULL OR (_caller <> _user_id AND NOT public.has_role(_caller, 'admin')) THEN
    RAISE EXCEPTION 'not_authorised';
  END IF;

  WITH books_owned AS (SELECT id FROM public.books WHERE user_id = _user_id),
  listings AS (SELECT id FROM public.public_listings WHERE book_id IN (SELECT id FROM books_owned))
  SELECT
    COALESCE(SUM((event_type='listing_view')::int),0)::bigint,
    COALESCE(SUM((event_type='sample_open')::int),0)::bigint,
    COALESCE(SUM((event_type='cta_click')::int),0)::bigint,
    COALESCE(SUM((event_type='checkout_started')::int),0)::bigint,
    COALESCE(SUM((event_type='checkout_completed')::int),0)::bigint
  INTO _views, _samples, _ctas, _checkouts, _purchases
  FROM public.storefront_events
  WHERE listing_id IN (SELECT id FROM listings)
    AND created_at >= now() - make_interval(days => _window_days);

  SELECT COALESCE(SUM(creator_net_cents) FILTER (WHERE entry_type='sale'),0)::bigint
  INTO _net
  FROM public.creator_earnings_ledger
  WHERE creator_user_id = _user_id
    AND occurred_at >= now() - make_interval(days => _window_days);

  SELECT COUNT(*)::bigint INTO _followers
  FROM public.author_followers WHERE author_user_id = _user_id;

  RETURN jsonb_build_object(
    'window_days', _window_days,
    'views', _views,
    'samples', _samples,
    'ctas', _ctas,
    'checkouts', _checkouts,
    'purchases', _purchases,
    'cart_abandonment_pct', CASE WHEN _checkouts > 0 THEN ROUND((1 - _purchases::numeric / _checkouts) * 100, 1) ELSE NULL END,
    'sample_to_purchase_pct', CASE WHEN _samples > 0 THEN ROUND(_purchases::numeric / _samples * 100, 2) ELSE NULL END,
    'checkout_conversion_pct', CASE WHEN _checkouts > 0 THEN ROUND(_purchases::numeric / _checkouts * 100, 1) ELSE NULL END,
    'storefront_conversion_pct', CASE WHEN _views > 0 THEN ROUND(_purchases::numeric / _views * 100, 2) ELSE NULL END,
    'revenue_per_visitor_cents', CASE WHEN _views > 0 THEN ROUND(_net::numeric / _views) ELSE 0 END,
    'revenue_per_follower_cents', CASE WHEN _followers > 0 THEN ROUND(_net::numeric / _followers) ELSE 0 END,
    'generated_at', now()
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_creator_sales_conversion(uuid, int) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_creator_sales_conversion(uuid, int) FROM anon;
