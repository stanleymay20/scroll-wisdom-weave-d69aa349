-- Phase 2.1b.2b — Centralized discovery scoring + recommendation infra

-- 1) compute_discovery_scores: single source of truth used by trending /
--    top-selling / recommended rails. Returns scored candidate listings with
--    component breakdown so callers can derive explanation labels.
CREATE OR REPLACE FUNCTION public.compute_discovery_scores(
  _window_days integer DEFAULT 7,
  _limit integer DEFAULT 200
)
RETURNS TABLE (
  listing_id uuid,
  book_id uuid,
  author_user_id uuid,
  category text,
  score numeric,
  engagement numeric,
  conversion numeric,
  freshness numeric,
  penalty numeric,
  views bigint,
  samples bigint,
  ctas bigint,
  checkouts bigint,
  purchases bigint,
  refunds bigint,
  fraud_hits bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH w AS (
    SELECT
      COALESCE((SELECT value FROM public.discovery_weights WHERE key='w_view'),1)::numeric AS w_view,
      COALESCE((SELECT value FROM public.discovery_weights WHERE key='w_sample'),3)::numeric AS w_sample,
      COALESCE((SELECT value FROM public.discovery_weights WHERE key='w_cta'),5)::numeric AS w_cta,
      COALESCE((SELECT value FROM public.discovery_weights WHERE key='w_checkout'),8)::numeric AS w_checkout,
      COALESCE((SELECT value FROM public.discovery_weights WHERE key='w_purchase'),25)::numeric AS w_purchase,
      COALESCE((SELECT value FROM public.discovery_weights WHERE key='w_refund_penalty'),25)::numeric AS w_refund_penalty,
      COALESCE((SELECT value FROM public.discovery_weights WHERE key='w_fraud_penalty'),50)::numeric AS w_fraud_penalty,
      COALESCE((SELECT value FROM public.discovery_weights WHERE key='w_freshness_days'),14)::numeric AS w_freshness_days,
      COALESCE((SELECT value FROM public.discovery_weights WHERE key='w_freshness_boost'),8)::numeric AS w_freshness_boost
  ),
  ev AS (
    SELECT
      listing_id,
      SUM((event_type='listing_view')::int)::bigint     AS views,
      SUM((event_type='sample_open')::int)::bigint      AS samples,
      SUM((event_type='cta_click')::int)::bigint        AS ctas,
      SUM((event_type='checkout_started')::int)::bigint AS checkouts,
      SUM((event_type='purchase_completed')::int)::bigint AS purchases
    FROM public.storefront_events
    WHERE listing_id IS NOT NULL
      AND created_at >= now() - make_interval(days => _window_days)
    GROUP BY listing_id
  ),
  ref AS (
    SELECT book_id, COUNT(*)::bigint AS refunds
    FROM public.book_purchases
    WHERE status = 'refunded'
      AND created_at >= now() - make_interval(days => _window_days * 2)
    GROUP BY book_id
  ),
  fr AS (
    SELECT NULLIF(metadata->>'book_id','')::uuid AS book_id, COUNT(*)::bigint AS hits
    FROM public.fraud_signals
    WHERE metadata ? 'book_id'
      AND created_at >= now() - make_interval(days => _window_days)
    GROUP BY NULLIF(metadata->>'book_id','')::uuid
  ),
  base AS (
    SELECT pl.id AS listing_id, pl.book_id, pl.created_at, b.user_id AS author_user_id, b.category
    FROM public.public_listings pl
    JOIN public.books b ON b.id = pl.book_id
    WHERE pl.is_public = true
  )
  SELECT
    base.listing_id,
    base.book_id,
    base.author_user_id,
    base.category,
    (
      COALESCE(ev.views,0)     * (SELECT w_view     FROM w)
    + COALESCE(ev.samples,0)   * (SELECT w_sample   FROM w)
    + COALESCE(ev.ctas,0)      * (SELECT w_cta      FROM w)
    + COALESCE(ev.checkouts,0) * (SELECT w_checkout FROM w)
    + COALESCE(ev.purchases,0) * (SELECT w_purchase FROM w)
    - COALESCE(ref.refunds,0)  * (SELECT w_refund_penalty FROM w)
    - COALESCE(fr.hits,0)      * (SELECT w_fraud_penalty  FROM w)
    + GREATEST(0,
        (SELECT w_freshness_boost FROM w)
        * (1 - LEAST(1, EXTRACT(epoch FROM (now()-base.created_at))/86400.0 / NULLIF((SELECT w_freshness_days FROM w),0)))
      )
    )::numeric AS score,
    (COALESCE(ev.views,0)*(SELECT w_view FROM w)
      + COALESCE(ev.samples,0)*(SELECT w_sample FROM w)
      + COALESCE(ev.ctas,0)*(SELECT w_cta FROM w))::numeric AS engagement,
    (COALESCE(ev.checkouts,0)*(SELECT w_checkout FROM w)
      + COALESCE(ev.purchases,0)*(SELECT w_purchase FROM w))::numeric AS conversion,
    GREATEST(0,
      (SELECT w_freshness_boost FROM w)
      * (1 - LEAST(1, EXTRACT(epoch FROM (now()-base.created_at))/86400.0 / NULLIF((SELECT w_freshness_days FROM w),0)))
    )::numeric AS freshness,
    (COALESCE(ref.refunds,0)*(SELECT w_refund_penalty FROM w)
      + COALESCE(fr.hits,0)*(SELECT w_fraud_penalty FROM w))::numeric AS penalty,
    COALESCE(ev.views,0)     AS views,
    COALESCE(ev.samples,0)   AS samples,
    COALESCE(ev.ctas,0)      AS ctas,
    COALESCE(ev.checkouts,0) AS checkouts,
    COALESCE(ev.purchases,0) AS purchases,
    COALESCE(ref.refunds,0)  AS refunds,
    COALESCE(fr.hits,0)      AS fraud_hits
  FROM base
  LEFT JOIN ev ON ev.listing_id = base.listing_id
  LEFT JOIN ref ON ref.book_id  = base.book_id
  LEFT JOIN fr  ON fr.book_id   = base.book_id
  ORDER BY score DESC NULLS LAST
  LIMIT GREATEST(1, LEAST(_limit, 500));
$$;

-- Anon and authenticated may read scores; they're aggregated over public data only.
GRANT EXECUTE ON FUNCTION public.compute_discovery_scores(integer,integer) TO anon, authenticated, service_role;

-- 2) recommendation rail metrics view (CTR + conversion per source).
CREATE OR REPLACE VIEW public.recommendation_rail_metrics AS
WITH agg AS (
  SELECT
    source,
    date_trunc('day', created_at) AS day,
    SUM((action='shown')::int)     AS shown,
    SUM((action='clicked')::int)   AS clicked,
    SUM((action='sampled')::int)   AS sampled,
    SUM((action='purchased')::int) AS purchased,
    SUM((action='hidden')::int)    AS hidden
  FROM public.recommendation_feedback
  WHERE created_at >= now() - interval '60 days'
  GROUP BY source, date_trunc('day', created_at)
)
SELECT
  source,
  day,
  shown, clicked, sampled, purchased, hidden,
  CASE WHEN shown > 0 THEN ROUND(clicked::numeric / shown, 4) ELSE 0 END AS ctr,
  CASE WHEN clicked > 0 THEN ROUND(sampled::numeric / clicked, 4) ELSE 0 END AS sample_rate,
  CASE WHEN clicked > 0 THEN ROUND(purchased::numeric / clicked, 4) ELSE 0 END AS purchase_rate,
  CASE WHEN shown > 0 THEN ROUND(hidden::numeric / shown, 4) ELSE 0 END AS hide_rate
FROM agg;

-- Metrics view is admin-only. Restrict via REVOKE then re-GRANT.
REVOKE ALL ON public.recommendation_rail_metrics FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.recommendation_rail_metrics TO service_role;

-- 3) Scheduled cleanup for velocity buckets (from 2.1c.2 carryover).
-- pg_cron is available on Supabase; use IF NOT EXISTS guards.
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Unschedule any previous job with same name so re-running this migration is safe.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge_velocity_buckets_hourly') THEN
    PERFORM cron.unschedule('purge_velocity_buckets_hourly');
  END IF;
END $$;

SELECT cron.schedule(
  'purge_velocity_buckets_hourly',
  '17 * * * *',
  $$ SELECT public.purge_velocity_buckets(); $$
);
