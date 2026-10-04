-- Forward convergence after Lovable production schema publishing removed the
-- canonical creator payout settlement objects. This intentionally recreates the
-- 20261001150000 contract under a new migration identity because production has
-- already recorded the original version without executing its body.
--
-- The earnings ledger remains immutable. Settlement state lives in an
-- append-auditable transfer/allocation layer and every mutation RPC is
-- service-role only.

CREATE TABLE IF NOT EXISTS public.creator_payout_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_user_id uuid NOT NULL,
  stripe_connect_account_id text NOT NULL,
  currency text NOT NULL,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  status text NOT NULL DEFAULT 'reserved'
    CHECK (status IN ('reserved','transferred','failed','reversed')),
  stripe_transfer_id text UNIQUE,
  idempotency_key text NOT NULL UNIQUE,
  failure_code text,
  failure_message text,
  balance_snapshot jsonb NOT NULL DEFAULT '{}',
  metadata jsonb NOT NULL DEFAULT '{}',
  reserved_at timestamptz NOT NULL DEFAULT now(),
  transferred_at timestamptz,
  failed_at timestamptz,
  reversed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS creator_payout_transfers_creator_time_idx
  ON public.creator_payout_transfers (creator_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS creator_payout_transfers_status_idx
  ON public.creator_payout_transfers (status, created_at);

ALTER TABLE public.creator_payout_transfers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.creator_payout_transfers FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.creator_payout_transfers TO service_role;

CREATE TABLE IF NOT EXISTS public.creator_payout_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payout_transfer_id uuid NOT NULL
    REFERENCES public.creator_payout_transfers(id) ON DELETE RESTRICT,
  ledger_entry_id uuid NOT NULL
    REFERENCES public.creator_earnings_ledger(id) ON DELETE RESTRICT,
  allocated_cents integer NOT NULL CHECK (allocated_cents <> 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (payout_transfer_id, ledger_entry_id)
);

CREATE INDEX IF NOT EXISTS creator_payout_allocations_ledger_idx
  ON public.creator_payout_allocations (ledger_entry_id);
CREATE INDEX IF NOT EXISTS creator_payout_allocations_transfer_idx
  ON public.creator_payout_allocations (payout_transfer_id);

ALTER TABLE public.creator_payout_allocations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.creator_payout_allocations FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.creator_payout_allocations TO service_role;

CREATE OR REPLACE FUNCTION public.creator_payout_entry_is_eligible(_entry public.creator_earnings_ledger)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN _entry.creator_net_cents > 0 THEN
      _entry.entry_type = 'sale'
      AND _entry.available_at IS NOT NULL
      AND _entry.available_at <= now()
      AND _entry.hold_reason IS NULL
      AND _entry.fraud_flags = '[]'::jsonb
      AND COALESCE(_entry.chargeback_status, '') NOT IN ('disputed','chargeback_pending')
    WHEN _entry.creator_net_cents < 0 THEN
      _entry.entry_type IN ('refund','chargeback','adjustment')
    ELSE false
  END;
$$;

REVOKE ALL ON FUNCTION public.creator_payout_entry_is_eligible(public.creator_earnings_ledger)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.creator_payout_entry_is_eligible(public.creator_earnings_ledger)
  TO service_role;

CREATE OR REPLACE FUNCTION public.get_creator_payout_balance(_creator_user_id uuid)
RETURNS TABLE (
  currency text,
  eligible_cents bigint,
  reserved_cents bigint,
  transferred_cents bigint,
  payable_cents bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH currencies AS (
    SELECT DISTINCT lower(l.currency) AS currency
    FROM public.creator_earnings_ledger l
    WHERE l.creator_user_id = _creator_user_id
    UNION
    SELECT DISTINCT lower(t.currency)
    FROM public.creator_payout_transfers t
    WHERE t.creator_user_id = _creator_user_id
  ),
  ledger_totals AS (
    SELECT lower(l.currency) AS currency,
           COALESCE(SUM(l.creator_net_cents), 0)::bigint AS eligible_cents
    FROM public.creator_earnings_ledger l
    WHERE l.creator_user_id = _creator_user_id
      AND public.creator_payout_entry_is_eligible(l)
    GROUP BY lower(l.currency)
  ),
  transfer_totals AS (
    SELECT lower(t.currency) AS currency,
           COALESCE(SUM(t.amount_cents) FILTER (WHERE t.status = 'reserved'), 0)::bigint AS reserved_cents,
           COALESCE(SUM(t.amount_cents) FILTER (WHERE t.status = 'transferred'), 0)::bigint AS transferred_cents
    FROM public.creator_payout_transfers t
    WHERE t.creator_user_id = _creator_user_id
      AND t.status IN ('reserved','transferred')
    GROUP BY lower(t.currency)
  )
  SELECT c.currency,
         COALESCE(l.eligible_cents, 0),
         COALESCE(t.reserved_cents, 0),
         COALESCE(t.transferred_cents, 0),
         GREATEST(
           COALESCE(l.eligible_cents, 0)
           - COALESCE(t.reserved_cents, 0)
           - COALESCE(t.transferred_cents, 0),
           0
         )::bigint AS payable_cents
  FROM currencies c
  LEFT JOIN ledger_totals l USING (currency)
  LEFT JOIN transfer_totals t USING (currency)
  ORDER BY c.currency;
$$;

REVOKE ALL ON FUNCTION public.get_creator_payout_balance(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_creator_payout_balance(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.list_creator_payout_candidates(
  _minimum_cents integer DEFAULT 100,
  _limit integer DEFAULT 25
)
RETURNS TABLE (
  creator_user_id uuid,
  currency text,
  payable_cents bigint,
  reserved_cents bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH verified AS (
    SELECT p.user_id
    FROM public.creator_payout_profiles p
    WHERE p.payout_method = 'stripe_connect'
      AND p.stripe_connect_status = 'verified'
      AND p.stripe_connect_account_id IS NOT NULL
      AND length(p.stripe_connect_account_id) > 0
  ),
  currencies AS (
    SELECT DISTINCT l.creator_user_id, lower(l.currency) AS currency
    FROM public.creator_earnings_ledger l
    JOIN verified v ON v.user_id = l.creator_user_id
    WHERE public.creator_payout_entry_is_eligible(l)
    UNION
    SELECT DISTINCT t.creator_user_id, lower(t.currency)
    FROM public.creator_payout_transfers t
    JOIN verified v ON v.user_id = t.creator_user_id
    WHERE t.status = 'reserved'
  ),
  ledger_totals AS (
    SELECT l.creator_user_id,
           lower(l.currency) AS currency,
           COALESCE(SUM(l.creator_net_cents), 0)::bigint AS eligible_cents
    FROM public.creator_earnings_ledger l
    JOIN verified v ON v.user_id = l.creator_user_id
    WHERE public.creator_payout_entry_is_eligible(l)
    GROUP BY l.creator_user_id, lower(l.currency)
  ),
  transfer_totals AS (
    SELECT t.creator_user_id,
           lower(t.currency) AS currency,
           COALESCE(SUM(t.amount_cents) FILTER (WHERE t.status = 'reserved'), 0)::bigint AS reserved_cents,
           COALESCE(SUM(t.amount_cents) FILTER (WHERE t.status = 'transferred'), 0)::bigint AS transferred_cents
    FROM public.creator_payout_transfers t
    JOIN verified v ON v.user_id = t.creator_user_id
    WHERE t.status IN ('reserved','transferred')
    GROUP BY t.creator_user_id, lower(t.currency)
  ),
  balances AS (
    SELECT c.creator_user_id,
           c.currency,
           GREATEST(
             COALESCE(l.eligible_cents, 0)
             - COALESCE(t.reserved_cents, 0)
             - COALESCE(t.transferred_cents, 0),
             0
           )::bigint AS payable_cents,
           COALESCE(t.reserved_cents, 0)::bigint AS reserved_cents
    FROM currencies c
    LEFT JOIN ledger_totals l
      ON l.creator_user_id = c.creator_user_id AND l.currency = c.currency
    LEFT JOIN transfer_totals t
      ON t.creator_user_id = c.creator_user_id AND t.currency = c.currency
  )
  SELECT b.creator_user_id, b.currency, b.payable_cents, b.reserved_cents
  FROM balances b
  WHERE b.reserved_cents > 0
     OR b.payable_cents >= GREATEST(COALESCE(_minimum_cents, 100), 1)
  ORDER BY CASE WHEN b.reserved_cents > 0 THEN 0 ELSE 1 END,
           b.creator_user_id,
           b.currency
  LIMIT LEAST(GREATEST(COALESCE(_limit, 25), 1), 100);
$$;

REVOKE ALL ON FUNCTION public.list_creator_payout_candidates(integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_creator_payout_candidates(integer, integer)
  TO service_role;

CREATE OR REPLACE FUNCTION public.reserve_creator_payout(
  _creator_user_id uuid,
  _currency text,
  _minimum_cents integer DEFAULT 100
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_currency text := lower(trim(COALESCE(_currency, '')));
  v_profile public.creator_payout_profiles%ROWTYPE;
  v_existing public.creator_payout_transfers%ROWTYPE;
  v_payout_id uuid;
  v_amount bigint := 0;
  v_allocated bigint := 0;
  v_idempotency_key text;
BEGIN
  IF _creator_user_id IS NULL THEN
    RAISE EXCEPTION 'creator_user_id_required';
  END IF;
  IF v_currency = '' OR length(v_currency) <> 3 THEN
    RAISE EXCEPTION 'invalid_currency';
  END IF;
  IF _minimum_cents IS NULL OR _minimum_cents < 1 THEN
    RAISE EXCEPTION 'invalid_minimum_cents';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(_creator_user_id::text || ':creator-payout:' || v_currency, 0)
  );

  SELECT * INTO v_existing
  FROM public.creator_payout_transfers
  WHERE creator_user_id = _creator_user_id
    AND lower(currency) = v_currency
    AND status = 'reserved'
  ORDER BY created_at ASC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'reused', true,
      'payout_transfer_id', v_existing.id,
      'creator_user_id', v_existing.creator_user_id,
      'stripe_connect_account_id', v_existing.stripe_connect_account_id,
      'currency', v_existing.currency,
      'amount_cents', v_existing.amount_cents,
      'idempotency_key', v_existing.idempotency_key
    );
  END IF;

  SELECT * INTO v_profile
  FROM public.creator_payout_profiles
  WHERE user_id = _creator_user_id
  FOR SHARE;

  IF NOT FOUND
     OR v_profile.payout_method <> 'stripe_connect'
     OR v_profile.stripe_connect_status <> 'verified'
     OR v_profile.stripe_connect_account_id IS NULL
     OR length(v_profile.stripe_connect_account_id) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'creator_not_payout_ready');
  END IF;

  SELECT COALESCE(SUM(l.creator_net_cents), 0)::bigint
  INTO v_amount
  FROM public.creator_earnings_ledger l
  WHERE l.creator_user_id = _creator_user_id
    AND lower(l.currency) = v_currency
    AND public.creator_payout_entry_is_eligible(l)
    AND NOT EXISTS (
      SELECT 1
      FROM public.creator_payout_allocations a
      JOIN public.creator_payout_transfers t ON t.id = a.payout_transfer_id
      WHERE a.ledger_entry_id = l.id
        AND t.status IN ('reserved','transferred')
    );

  IF v_amount < _minimum_cents THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', CASE WHEN v_amount <= 0 THEN 'no_payable_balance' ELSE 'below_minimum' END,
      'currency', v_currency,
      'amount_cents', v_amount,
      'minimum_cents', _minimum_cents
    );
  END IF;

  v_payout_id := gen_random_uuid();
  v_idempotency_key := 'scrolllibrary:creator-payout:' || v_payout_id::text;

  INSERT INTO public.creator_payout_transfers (
    id, creator_user_id, stripe_connect_account_id, currency, amount_cents,
    status, idempotency_key, balance_snapshot
  ) VALUES (
    v_payout_id, _creator_user_id, v_profile.stripe_connect_account_id,
    v_currency, v_amount::integer, 'reserved', v_idempotency_key,
    jsonb_build_object(
      'reserved_amount_cents', v_amount,
      'minimum_cents', _minimum_cents,
      'reserved_at', now()
    )
  );

  INSERT INTO public.creator_payout_allocations (
    payout_transfer_id, ledger_entry_id, allocated_cents
  )
  SELECT v_payout_id, l.id, l.creator_net_cents
  FROM public.creator_earnings_ledger l
  WHERE l.creator_user_id = _creator_user_id
    AND lower(l.currency) = v_currency
    AND public.creator_payout_entry_is_eligible(l)
    AND NOT EXISTS (
      SELECT 1
      FROM public.creator_payout_allocations a
      JOIN public.creator_payout_transfers t ON t.id = a.payout_transfer_id
      WHERE a.ledger_entry_id = l.id
        AND t.status IN ('reserved','transferred')
    );

  SELECT COALESCE(SUM(allocated_cents), 0)::bigint
  INTO v_allocated
  FROM public.creator_payout_allocations
  WHERE payout_transfer_id = v_payout_id;

  IF v_allocated <> v_amount THEN
    RAISE EXCEPTION 'creator_payout_allocation_mismatch expected=% actual=%', v_amount, v_allocated;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'reused', false,
    'payout_transfer_id', v_payout_id,
    'creator_user_id', _creator_user_id,
    'stripe_connect_account_id', v_profile.stripe_connect_account_id,
    'currency', v_currency,
    'amount_cents', v_amount,
    'idempotency_key', v_idempotency_key
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_creator_payout(uuid, text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_creator_payout(uuid, text, integer)
  TO service_role;

CREATE OR REPLACE FUNCTION public.mark_creator_payout_transferred(
  _payout_transfer_id uuid,
  _stripe_transfer_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.creator_payout_transfers%ROWTYPE;
BEGIN
  IF _payout_transfer_id IS NULL THEN
    RAISE EXCEPTION 'payout_transfer_id_required';
  END IF;
  IF _stripe_transfer_id IS NULL OR length(trim(_stripe_transfer_id)) = 0 THEN
    RAISE EXCEPTION 'stripe_transfer_id_required';
  END IF;

  SELECT * INTO v_row
  FROM public.creator_payout_transfers
  WHERE id = _payout_transfer_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'payout_transfer_not_found'; END IF;

  IF v_row.status = 'transferred' THEN
    IF v_row.stripe_transfer_id <> _stripe_transfer_id THEN
      RAISE EXCEPTION 'stripe_transfer_id_conflict';
    END IF;
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'status', 'transferred');
  END IF;

  IF v_row.status <> 'reserved' THEN
    RAISE EXCEPTION 'payout_transfer_not_reserved status=%', v_row.status;
  END IF;

  UPDATE public.creator_payout_transfers
  SET status = 'transferred',
      stripe_transfer_id = _stripe_transfer_id,
      transferred_at = now(),
      failure_code = NULL,
      failure_message = NULL,
      updated_at = now()
  WHERE id = _payout_transfer_id;

  RETURN jsonb_build_object('ok', true, 'idempotent', false, 'status', 'transferred');
END;
$$;

REVOKE ALL ON FUNCTION public.mark_creator_payout_transferred(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_creator_payout_transferred(uuid, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.mark_creator_payout_failed(
  _payout_transfer_id uuid,
  _failure_code text,
  _failure_message text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.creator_payout_transfers%ROWTYPE;
BEGIN
  SELECT * INTO v_row
  FROM public.creator_payout_transfers
  WHERE id = _payout_transfer_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'payout_transfer_not_found'; END IF;
  IF v_row.status = 'transferred' THEN
    RAISE EXCEPTION 'transferred_payout_cannot_fail';
  END IF;
  IF v_row.status = 'failed' THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'status', 'failed');
  END IF;
  IF v_row.status <> 'reserved' THEN
    RAISE EXCEPTION 'payout_transfer_not_reserved status=%', v_row.status;
  END IF;

  UPDATE public.creator_payout_transfers
  SET status = 'failed',
      failure_code = NULLIF(left(COALESCE(_failure_code, ''), 128), ''),
      failure_message = NULLIF(left(COALESCE(_failure_message, ''), 1000), ''),
      failed_at = now(),
      updated_at = now()
  WHERE id = _payout_transfer_id;

  RETURN jsonb_build_object('ok', true, 'idempotent', false, 'status', 'failed');
END;
$$;

REVOKE ALL ON FUNCTION public.mark_creator_payout_failed(uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_creator_payout_failed(uuid, text, text)
  TO service_role;
