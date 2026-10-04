-- Economic billing convergence v1.
--
-- Adds race-safe monthly meters for the dimensions that actually drive AI COGS
-- and replaces stacked marketplace fee+surcharge economics with one plan-based
-- ScrollLibrary service fee.
--
-- Internal plan keys remain backwards compatible:
--   student -> Creator, premium -> Pro, prophet_tier -> Teams.

CREATE TABLE IF NOT EXISTS public.billing_usage_monthly (
  user_id uuid NOT NULL,
  month text NOT NULL,
  books_used integer NOT NULL DEFAULT 0 CHECK (books_used >= 0),
  ai_text_words_used bigint NOT NULL DEFAULT 0 CHECK (ai_text_words_used >= 0),
  visual_credits_used integer NOT NULL DEFAULT 0 CHECK (visual_credits_used >= 0),
  audio_units_used bigint NOT NULL DEFAULT 0 CHECK (audio_units_used >= 0),
  extra_ai_text_words bigint NOT NULL DEFAULT 0 CHECK (extra_ai_text_words >= 0),
  extra_visual_credits integer NOT NULL DEFAULT 0 CHECK (extra_visual_credits >= 0),
  extra_audio_credits integer NOT NULL DEFAULT 0 CHECK (extra_audio_credits >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, month),
  CHECK (month ~ '^\d{4}-\d{2}$')
);

ALTER TABLE public.billing_usage_monthly ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.billing_usage_monthly FROM anon, authenticated;
GRANT SELECT ON TABLE public.billing_usage_monthly TO authenticated;
GRANT ALL ON TABLE public.billing_usage_monthly TO service_role;

DROP POLICY IF EXISTS "users read own billing usage" ON public.billing_usage_monthly;
CREATE POLICY "users read own billing usage"
  ON public.billing_usage_monthly
  FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE OR REPLACE FUNCTION public.reserve_billing_usage(
  _user_id uuid,
  _month text,
  _metric text,
  _units bigint,
  _base_limit bigint
)
RETURNS TABLE (
  allowed boolean,
  used bigint,
  remaining bigint,
  effective_limit bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_used bigint := 0;
  v_extra bigint := 0;
  v_limit bigint;
  v_next bigint;
BEGIN
  IF _user_id IS NULL THEN RAISE EXCEPTION 'user_id_required'; END IF;
  IF _month IS NULL OR _month !~ '^\d{4}-\d{2}$' THEN RAISE EXCEPTION 'invalid_month'; END IF;
  IF _metric NOT IN ('books','ai_text_words','visual_credits','audio_units') THEN RAISE EXCEPTION 'invalid_metric'; END IF;
  IF _units IS NULL OR _units <= 0 THEN RAISE EXCEPTION 'invalid_units'; END IF;
  IF _base_limit IS NULL OR _base_limit = 0 OR _base_limit < -1 THEN RAISE EXCEPTION 'invalid_limit'; END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(_user_id::text || ':billing:' || _month || ':' || _metric, 0)
  );

  INSERT INTO public.billing_usage_monthly (user_id, month)
  VALUES (_user_id, _month)
  ON CONFLICT (user_id, month) DO NOTHING;

  SELECT
    CASE _metric
      WHEN 'books' THEN b.books_used::bigint
      WHEN 'ai_text_words' THEN b.ai_text_words_used
      WHEN 'visual_credits' THEN b.visual_credits_used::bigint
      WHEN 'audio_units' THEN b.audio_units_used
    END,
    CASE _metric
      WHEN 'books' THEN 0::bigint
      WHEN 'ai_text_words' THEN b.extra_ai_text_words
      WHEN 'visual_credits' THEN b.extra_visual_credits::bigint
      WHEN 'audio_units' THEN b.extra_audio_credits::bigint * 60
    END
  INTO v_used, v_extra
  FROM public.billing_usage_monthly b
  WHERE b.user_id = _user_id AND b.month = _month
  FOR UPDATE;

  v_used := COALESCE(v_used, 0);
  v_extra := COALESCE(v_extra, 0);
  v_limit := CASE WHEN _base_limit < 0 THEN -1 ELSE _base_limit + v_extra END;

  IF v_limit >= 0 AND v_used + _units > v_limit THEN
    RETURN QUERY SELECT false, v_used, GREATEST(v_limit - v_used, 0), v_limit;
    RETURN;
  END IF;

  v_next := v_used + _units;

  UPDATE public.billing_usage_monthly
  SET
    books_used = CASE WHEN _metric = 'books' THEN v_next::integer ELSE books_used END,
    ai_text_words_used = CASE WHEN _metric = 'ai_text_words' THEN v_next ELSE ai_text_words_used END,
    visual_credits_used = CASE WHEN _metric = 'visual_credits' THEN v_next::integer ELSE visual_credits_used END,
    audio_units_used = CASE WHEN _metric = 'audio_units' THEN v_next ELSE audio_units_used END,
    updated_at = now()
  WHERE user_id = _user_id AND month = _month;

  RETURN QUERY
    SELECT true,
      v_next,
      CASE WHEN v_limit < 0 THEN -1 ELSE GREATEST(v_limit - v_next, 0) END,
      v_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_billing_usage(
  _user_id uuid,
  _month text,
  _metric text,
  _units bigint
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_remaining bigint := 0;
BEGIN
  IF _user_id IS NULL THEN RAISE EXCEPTION 'user_id_required'; END IF;
  IF _month IS NULL OR _month !~ '^\d{4}-\d{2}$' THEN RAISE EXCEPTION 'invalid_month'; END IF;
  IF _metric NOT IN ('books','ai_text_words','visual_credits','audio_units') THEN RAISE EXCEPTION 'invalid_metric'; END IF;
  IF _units IS NULL OR _units <= 0 THEN RAISE EXCEPTION 'invalid_units'; END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(_user_id::text || ':billing:' || _month || ':' || _metric, 0)
  );

  IF _metric = 'books' THEN
    UPDATE public.billing_usage_monthly
    SET books_used = GREATEST(books_used - _units::integer, 0), updated_at = now()
    WHERE user_id = _user_id AND month = _month
    RETURNING books_used INTO v_remaining;
  ELSIF _metric = 'ai_text_words' THEN
    UPDATE public.billing_usage_monthly
    SET ai_text_words_used = GREATEST(ai_text_words_used - _units, 0), updated_at = now()
    WHERE user_id = _user_id AND month = _month
    RETURNING ai_text_words_used INTO v_remaining;
  ELSIF _metric = 'visual_credits' THEN
    UPDATE public.billing_usage_monthly
    SET visual_credits_used = GREATEST(visual_credits_used - _units::integer, 0), updated_at = now()
    WHERE user_id = _user_id AND month = _month
    RETURNING visual_credits_used INTO v_remaining;
  ELSE
    UPDATE public.billing_usage_monthly
    SET audio_units_used = GREATEST(audio_units_used - _units, 0), updated_at = now()
    WHERE user_id = _user_id AND month = _month
    RETURNING audio_units_used INTO v_remaining;
  END IF;

  RETURN COALESCE(v_remaining, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.grant_billing_usage_addon(
  _user_id uuid,
  _month text,
  _addon text,
  _units bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _user_id IS NULL THEN RAISE EXCEPTION 'user_id_required'; END IF;
  IF _month IS NULL OR _month !~ '^\d{4}-\d{2}$' THEN RAISE EXCEPTION 'invalid_month'; END IF;
  IF _addon NOT IN ('ai_text_words','visual_credits','audio_credits') THEN RAISE EXCEPTION 'invalid_addon'; END IF;
  IF _units IS NULL OR _units <= 0 THEN RAISE EXCEPTION 'invalid_units'; END IF;

  INSERT INTO public.billing_usage_monthly (user_id, month)
  VALUES (_user_id, _month)
  ON CONFLICT (user_id, month) DO NOTHING;

  UPDATE public.billing_usage_monthly
  SET
    extra_ai_text_words = CASE WHEN _addon = 'ai_text_words' THEN extra_ai_text_words + _units ELSE extra_ai_text_words END,
    extra_visual_credits = CASE WHEN _addon = 'visual_credits' THEN extra_visual_credits + _units::integer ELSE extra_visual_credits END,
    extra_audio_credits = CASE WHEN _addon = 'audio_credits' THEN extra_audio_credits + _units::integer ELSE extra_audio_credits END,
    updated_at = now()
  WHERE user_id = _user_id AND month = _month;

  RETURN jsonb_build_object('ok', true, 'user_id', _user_id, 'month', _month, 'addon', _addon, 'units', _units);
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_billing_usage(uuid, text, text, bigint, bigint)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_billing_usage(uuid, text, text, bigint)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.grant_billing_usage_addon(uuid, text, text, bigint)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_billing_usage(uuid, text, text, bigint, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_billing_usage(uuid, text, text, bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.grant_billing_usage_addon(uuid, text, text, bigint) TO service_role;

CREATE OR REPLACE FUNCTION public.get_my_billing_usage_snapshot()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_month text := to_char((now() AT TIME ZONE 'UTC'), 'YYYY-MM');
  v_row public.billing_usage_monthly%ROWTYPE;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;

  SELECT * INTO v_row
  FROM public.billing_usage_monthly
  WHERE user_id = v_user AND month = v_month;

  RETURN jsonb_build_object(
    'month', v_month,
    'books_used', COALESCE(v_row.books_used, 0),
    'ai_text_words_used', COALESCE(v_row.ai_text_words_used, 0),
    'visual_credits_used', COALESCE(v_row.visual_credits_used, 0),
    'audio_units_used', COALESCE(v_row.audio_units_used, 0),
    'audio_credits_used', COALESCE(v_row.audio_units_used, 0)::numeric / 60,
    'extra_ai_text_words', COALESCE(v_row.extra_ai_text_words, 0),
    'extra_visual_credits', COALESCE(v_row.extra_visual_credits, 0),
    'extra_audio_credits', COALESCE(v_row.extra_audio_credits, 0),
    'generated_at', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_billing_usage_snapshot() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_billing_usage_snapshot() TO authenticated, service_role;

-- One transparent marketplace fee. Do not stack a hidden surcharge on top.
CREATE OR REPLACE FUNCTION public.get_user_marketplace_fee_bps(_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tier text := 'free';
BEGIN
  SELECT s.tier INTO v_tier
  FROM public.subscriptions s
  WHERE s.user_id = _user_id
    AND s.status IN ('active','trialing')
    AND (s.current_period_end IS NULL OR s.current_period_end > now())
  LIMIT 1;

  IF v_tier IS NULL OR v_tier = '' THEN
    SELECT p.plan INTO v_tier
    FROM public.profiles p
    WHERE p.user_id = _user_id OR p.id = _user_id
    ORDER BY (p.user_id = _user_id) DESC
    LIMIT 1;
  END IF;

  RETURN CASE COALESCE(v_tier, 'free')
    WHEN 'student' THEN 1000
    WHEN 'premium' THEN 500
    WHEN 'prophet_tier' THEN 300
    ELSE 1500
  END;
END;
$$;

-- Legacy surcharge remains callable for historical code but is now neutral.
CREATE OR REPLACE FUNCTION public.get_user_rev_share_surcharge_bps(_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 0
$$;

REVOKE ALL ON FUNCTION public.get_user_marketplace_fee_bps(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_user_rev_share_surcharge_bps(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_marketplace_fee_bps(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_user_rev_share_surcharge_bps(uuid) TO service_role;

-- Sale writer: fee_bps_applied is now the complete ScrollLibrary service fee.
CREATE OR REPLACE FUNCTION public.record_purchase_ledger(_purchase_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_p record;
  v_book record;
  v_listing record;
  v_author record;
  v_fee_bps integer;
  v_gross integer;
  v_fee integer;
  v_net integer;
  v_sale_exists boolean;
  v_day date;
BEGIN
  SELECT * INTO v_p FROM public.book_purchases WHERE id = _purchase_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'purchase_not_found'); END IF;

  SELECT id, user_id, title INTO v_book FROM public.books WHERE id = v_p.book_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'book_not_found'); END IF;

  SELECT id, slug INTO v_listing FROM public.public_listings WHERE id = v_p.listing_id;
  SELECT display_name INTO v_author FROM public.author_profiles WHERE user_id = v_book.user_id;

  v_fee_bps := public.get_user_marketplace_fee_bps(v_book.user_id);
  v_gross := COALESCE(v_p.amount_cents, 0);
  v_fee := (v_gross::numeric * v_fee_bps / 10000)::integer;
  v_net := v_gross - v_fee;
  v_day := COALESCE(
    (v_p.purchased_at AT TIME ZONE 'UTC')::date,
    (now() AT TIME ZONE 'UTC')::date
  );

  SELECT EXISTS (
    SELECT 1 FROM public.creator_earnings_ledger
    WHERE purchase_id = _purchase_id AND entry_type = 'sale'
  ) INTO v_sale_exists;

  IF NOT v_sale_exists AND v_p.status IN ('paid', 'refunded') THEN
    INSERT INTO public.creator_earnings_ledger (
      purchase_id, creator_user_id, book_id, listing_id, entry_type,
      gross_cents, platform_fee_cents, creator_net_cents, fee_bps_applied,
      currency, base_currency, payout_status, available_at,
      book_title_snapshot, creator_display_name_snapshot, listing_slug_snapshot,
      occurred_at, metadata, rev_share_surcharge_bps, rev_share_surcharge_cents
    ) VALUES (
      _purchase_id, v_book.user_id, v_p.book_id, v_p.listing_id, 'sale',
      v_gross, v_fee, v_net, v_fee_bps,
      v_p.currency, v_p.currency, 'pending',
      COALESCE(v_p.purchased_at, now()) + interval '14 days',
      v_book.title, COALESCE(v_author.display_name, ''), COALESCE(v_listing.slug, ''),
      COALESCE(v_p.purchased_at, now()),
      jsonb_build_object('source','record_purchase_ledger','marketplace_fee_bps',v_fee_bps),
      0, 0
    )
    ON CONFLICT (purchase_id) WHERE entry_type = 'sale' DO NOTHING;

    IF FOUND THEN
      INSERT INTO public.creator_revenue_daily (
        creator_user_id, book_id, day, currency,
        gross_cents, platform_fee_cents, net_cents, sales_count
      ) VALUES (
        v_book.user_id, v_p.book_id, v_day, v_p.currency,
        v_gross, v_fee, v_net, 1
      )
      ON CONFLICT (creator_user_id, book_id, day, currency) DO UPDATE
      SET gross_cents = creator_revenue_daily.gross_cents + EXCLUDED.gross_cents,
          platform_fee_cents = creator_revenue_daily.platform_fee_cents + EXCLUDED.platform_fee_cents,
          net_cents = creator_revenue_daily.net_cents + EXCLUDED.net_cents,
          sales_count = creator_revenue_daily.sales_count + 1,
          updated_at = now();
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'creator_user_id', v_book.user_id,
    'fee_bps', v_fee_bps,
    'surcharge_bps', 0
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_purchase_ledger(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_purchase_ledger(uuid) TO service_role;
