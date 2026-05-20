-- Phase 2.1c.2 — Heuristic risk scoring foundation
CREATE TABLE IF NOT EXISTS public.user_risk_scores (
  user_id uuid PRIMARY KEY,
  score int NOT NULL DEFAULT 0 CHECK (score >= 0 AND score <= 100),
  tier text NOT NULL DEFAULT 'low' CHECK (tier IN ('low','medium','high','blocked')),
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  last_evaluated_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_notes text,
  manual_override_tier text CHECK (manual_override_tier IN ('low','medium','high','blocked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_risk_tier ON public.user_risk_scores(tier) WHERE tier IN ('high','blocked');
CREATE INDEX IF NOT EXISTS idx_user_risk_last_eval ON public.user_risk_scores(last_evaluated_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_risk_override ON public.user_risk_scores(manual_override_tier) WHERE manual_override_tier IS NOT NULL;

ALTER TABLE public.user_risk_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins read user_risk_scores" ON public.user_risk_scores;
CREATE POLICY "admins read user_risk_scores"
  ON public.user_risk_scores FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "users read own risk score" ON public.user_risk_scores;
CREATE POLICY "users read own risk score"
  ON public.user_risk_scores FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Writes flow through SECURITY DEFINER RPC / service role only. No anon/authenticated INSERT/UPDATE/DELETE policies.

-- Effective-tier helper: manual override wins.
CREATE OR REPLACE FUNCTION public.get_effective_user_tier(_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(manual_override_tier, tier, 'low')
  FROM public.user_risk_scores
  WHERE user_id = _user_id
$$;

REVOKE EXECUTE ON FUNCTION public.get_effective_user_tier(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_effective_user_tier(uuid) TO service_role;

-- Admin override RPC: writes through audit_log + stamps reviewer.
CREATE OR REPLACE FUNCTION public.admin_set_user_risk_override(
  _user_id uuid,
  _override_tier text,
  _notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _old text;
BEGIN
  IF _caller IS NULL OR NOT public.has_role(_caller, 'admin') THEN
    RAISE EXCEPTION 'admin_required';
  END IF;
  IF _override_tier IS NOT NULL AND _override_tier NOT IN ('low','medium','high','blocked') THEN
    RAISE EXCEPTION 'invalid_tier';
  END IF;

  SELECT manual_override_tier INTO _old FROM public.user_risk_scores WHERE user_id = _user_id;

  INSERT INTO public.user_risk_scores (user_id, manual_override_tier, reviewed_by, reviewed_at, review_notes, updated_at)
  VALUES (_user_id, _override_tier, _caller, now(), _notes, now())
  ON CONFLICT (user_id) DO UPDATE
  SET manual_override_tier = EXCLUDED.manual_override_tier,
      reviewed_by = EXCLUDED.reviewed_by,
      reviewed_at = EXCLUDED.reviewed_at,
      review_notes = COALESCE(EXCLUDED.review_notes, public.user_risk_scores.review_notes),
      updated_at = now();

  PERFORM public.log_audit_event(
    'risk_manual_override',
    _caller, NULL, 'user_risk_scores', _user_id::text,
    'warning',
    jsonb_build_object('old_override', _old, 'new_override', _override_tier, 'notes', _notes)
  );

  RETURN jsonb_build_object('ok', true, 'user_id', _user_id, 'manual_override_tier', _override_tier);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.admin_set_user_risk_override(uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_user_risk_override(uuid, text, text) TO authenticated;

-- Velocity bucket janitor (Phase 2.1c.1 cleanup)
CREATE OR REPLACE FUNCTION public.purge_velocity_buckets()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _deleted int;
BEGIN
  DELETE FROM public.velocity_buckets
  WHERE updated_at < now() - interval '24 hours';
  GET DIAGNOSTICS _deleted = ROW_COUNT;
  RETURN _deleted;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.purge_velocity_buckets() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_velocity_buckets() TO service_role;