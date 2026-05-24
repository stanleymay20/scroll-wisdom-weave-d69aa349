
-- ============ Notifications ============
CREATE TABLE public.creator_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN (
    'new_release','followed_author_release','collection_update',
    'recommendation_digest','continue_reading','publish_status','system'
  )),
  title text NOT NULL,
  body text,
  link_url text,
  resource_type text,
  resource_id text,
  read_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_creator_notifications_user_unread
  ON public.creator_notifications(user_id, created_at DESC)
  WHERE read_at IS NULL;
CREATE INDEX idx_creator_notifications_user_recent
  ON public.creator_notifications(user_id, created_at DESC);

ALTER TABLE public.creator_notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own notifications"
  ON public.creator_notifications FOR SELECT
  USING (auth.uid() = user_id);
CREATE POLICY "Users update own notifications"
  ON public.creator_notifications FOR UPDATE
  USING (auth.uid() = user_id);
CREATE POLICY "Users delete own notifications"
  ON public.creator_notifications FOR DELETE
  USING (auth.uid() = user_id);
CREATE POLICY "Admins view all notifications"
  ON public.creator_notifications FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- ============ Release Schedules (serialized publishing) ============
CREATE TABLE public.release_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id uuid NOT NULL REFERENCES public.books(id) ON DELETE CASCADE,
  owner_user_id uuid NOT NULL,
  cadence text NOT NULL DEFAULT 'weekly'
    CHECK (cadence IN ('daily','weekly','biweekly','monthly','manual')),
  start_at timestamptz NOT NULL DEFAULT now(),
  channel text NOT NULL DEFAULT 'platform'
    CHECK (channel IN ('platform','substack','patreon','email','rss')),
  early_access_tier text,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('draft','active','paused','completed','cancelled')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_release_schedules_owner ON public.release_schedules(owner_user_id);
CREATE INDEX idx_release_schedules_book ON public.release_schedules(book_id);

CREATE TABLE public.release_schedule_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id uuid NOT NULL REFERENCES public.release_schedules(id) ON DELETE CASCADE,
  chapter_id uuid,
  chapter_number int,
  release_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled','released','skipped','failed')),
  released_at timestamptz,
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_release_items_schedule ON public.release_schedule_items(schedule_id, release_at);
CREATE INDEX idx_release_items_due
  ON public.release_schedule_items(release_at)
  WHERE status = 'scheduled';

ALTER TABLE public.release_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.release_schedule_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage schedules"
  ON public.release_schedules FOR ALL
  USING (auth.uid() = owner_user_id)
  WITH CHECK (auth.uid() = owner_user_id);
CREATE POLICY "Admins view schedules"
  ON public.release_schedules FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Owners manage schedule items"
  ON public.release_schedule_items FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.release_schedules s
    WHERE s.id = schedule_id AND s.owner_user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.release_schedules s
    WHERE s.id = schedule_id AND s.owner_user_id = auth.uid()
  ));
CREATE POLICY "Admins view schedule items"
  ON public.release_schedule_items FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER release_schedules_updated_at
  BEFORE UPDATE ON public.release_schedules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ RPCs ============
CREATE OR REPLACE FUNCTION public.get_creator_publishing_analytics(
  _user_id uuid,
  _window_days int DEFAULT 30
)
RETURNS jsonb
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

  WITH exports AS (
    SELECT bundle_type AS channel,
           COUNT(*)::bigint AS total,
           SUM((status='completed')::int)::bigint AS completed,
           SUM((status='failed')::int)::bigint AS failed,
           AVG(EXTRACT(epoch FROM (COALESCE(completed_at,now()) - created_at)))::numeric AS avg_seconds
    FROM public.export_jobs
    WHERE user_id = _user_id
      AND created_at >= now() - make_interval(days => _window_days)
    GROUP BY bundle_type
  ),
  pubs AS (
    SELECT platform AS channel,
           COUNT(*)::bigint AS published,
           SUM((status='live')::int)::bigint AS live
    FROM public.external_publications
    WHERE user_id = _user_id
    GROUP BY platform
  ),
  revenue AS (
    SELECT COALESCE(SUM(creator_net_cents),0)::bigint AS net_cents,
           COUNT(*) FILTER (WHERE entry_type='sale')::bigint AS sales,
           COUNT(*) FILTER (WHERE entry_type='refund')::bigint AS refunds
    FROM public.creator_earnings_ledger
    WHERE creator_user_id = _user_id
      AND occurred_at >= now() - make_interval(days => _window_days)
  ),
  channels AS (
    SELECT COALESCE(e.channel, p.channel) AS channel,
           COALESCE(e.total,0) AS exports_total,
           COALESCE(e.completed,0) AS exports_completed,
           COALESCE(e.failed,0) AS exports_failed,
           COALESCE(e.avg_seconds,0) AS time_to_publish_seconds,
           COALESCE(p.published,0) AS publications,
           COALESCE(p.live,0) AS live
    FROM exports e
    FULL OUTER JOIN pubs p ON p.channel = e.channel
  )
  SELECT jsonb_build_object(
    'window_days', _window_days,
    'channels', COALESCE((SELECT jsonb_agg(to_jsonb(channels.*) ORDER BY exports_total DESC NULLS LAST) FROM channels), '[]'::jsonb),
    'revenue', (SELECT to_jsonb(revenue.*) FROM revenue),
    'generated_at', now()
  ) INTO _result;
  RETURN _result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_creator_publishing_analytics(uuid,int) FROM anon;

CREATE OR REPLACE FUNCTION public.get_creator_publishing_funnel(
  _user_id uuid,
  _window_days int DEFAULT 30
)
RETURNS jsonb
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

  WITH books_owned AS (
    SELECT id FROM public.books WHERE user_id = _user_id
  ),
  listings AS (
    SELECT id FROM public.public_listings WHERE book_id IN (SELECT id FROM books_owned)
  ),
  ev AS (
    SELECT event_type, COUNT(*)::bigint AS n
    FROM public.storefront_events
    WHERE listing_id IN (SELECT id FROM listings)
      AND created_at >= now() - make_interval(days => _window_days)
    GROUP BY event_type
  ),
  purchases AS (
    SELECT
      SUM((status='paid')::int)::bigint AS purchased,
      SUM((status='refunded')::int)::bigint AS refunded
    FROM public.book_purchases
    WHERE book_id IN (SELECT id FROM books_owned)
      AND created_at >= now() - make_interval(days => _window_days)
  ),
  followers AS (
    SELECT COUNT(*)::bigint AS new_followers
    FROM public.author_followers
    WHERE author_user_id = _user_id
      AND created_at >= now() - make_interval(days => _window_days)
  )
  SELECT jsonb_build_object(
    'window_days', _window_days,
    'generated', (SELECT COUNT(*) FROM public.books WHERE user_id = _user_id AND created_at >= now() - make_interval(days => _window_days)),
    'published', (SELECT COUNT(*) FROM listings),
    'viewed',    COALESCE((SELECT n FROM ev WHERE event_type='listing_view'),0),
    'sampled',   COALESCE((SELECT n FROM ev WHERE event_type='sample_open'),0),
    'cta',       COALESCE((SELECT n FROM ev WHERE event_type='cta_click'),0),
    'checkout',  COALESCE((SELECT n FROM ev WHERE event_type='checkout_started'),0),
    'purchased', COALESCE((SELECT purchased FROM purchases),0),
    'refunded',  COALESCE((SELECT refunded FROM purchases),0),
    'followers_gained', COALESCE((SELECT new_followers FROM followers),0),
    'generated_at', now()
  ) INTO _result;
  RETURN _result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_creator_publishing_funnel(uuid,int) FROM anon;

CREATE OR REPLACE FUNCTION public.get_creator_channel_recommendations(
  _user_id uuid,
  _window_days int DEFAULT 60
)
RETURNS jsonb
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

  WITH my_cats AS (
    SELECT DISTINCT category FROM public.books WHERE user_id = _user_id AND category IS NOT NULL
  ),
  perf AS (
    SELECT b.category,
           ep.platform AS channel,
           COUNT(*)::bigint AS publications,
           SUM((ep.status='live')::int)::bigint AS live
    FROM public.external_publications ep
    JOIN public.books b ON b.id = ep.book_id
    WHERE b.category IN (SELECT category FROM my_cats)
      AND ep.created_at >= now() - make_interval(days => _window_days)
    GROUP BY b.category, ep.platform
  ),
  ranked AS (
    SELECT category, channel, publications, live,
           ROW_NUMBER() OVER (PARTITION BY category ORDER BY live DESC, publications DESC) AS rk
    FROM perf
  )
  SELECT jsonb_build_object(
    'window_days', _window_days,
    'suggestions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'category', category,
        'channel', channel,
        'publications', publications,
        'live', live,
        'reason', concat('Top performing channel for ', category, ' over last ', _window_days, ' days')
      ) ORDER BY category)
      FROM ranked WHERE rk <= 2
    ), '[]'::jsonb),
    'generated_at', now()
  ) INTO _result;
  RETURN _result;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_creator_channel_recommendations(uuid,int) FROM anon;
