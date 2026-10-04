-- Refund reconciliation for one-time billing orders.
-- A full refund revokes the extra allowance or marks the publishing service
-- order refunded. Partial refunds are tracked but do not partially revoke units.

CREATE TABLE IF NOT EXISTS public.billing_order_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  billing_order_id uuid NOT NULL REFERENCES public.billing_orders(id) ON DELETE RESTRICT,
  stripe_refund_id text NOT NULL UNIQUE,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.billing_order_refunds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.billing_order_refunds FROM anon, authenticated;
GRANT ALL ON TABLE public.billing_order_refunds TO service_role;

CREATE OR REPLACE FUNCTION public.record_billing_order_refund(
  _order_id uuid,
  _stripe_refund_id text,
  _amount_cents integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.billing_orders%ROWTYPE;
  v_refunded integer := 0;
  v_metric text;
  v_units bigint;
BEGIN
  IF _order_id IS NULL THEN RAISE EXCEPTION 'order_id_required'; END IF;
  IF COALESCE(_stripe_refund_id, '') = '' THEN RAISE EXCEPTION 'stripe_refund_id_required'; END IF;
  IF _amount_cents IS NULL OR _amount_cents <= 0 THEN RAISE EXCEPTION 'invalid_refund_amount'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(_order_id::text || ':billing-order-refund', 0));

  SELECT * INTO v_order
  FROM public.billing_orders
  WHERE id = _order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'order_not_found');
  END IF;

  INSERT INTO public.billing_order_refunds (billing_order_id, stripe_refund_id, amount_cents)
  VALUES (_order_id, _stripe_refund_id, _amount_cents)
  ON CONFLICT (stripe_refund_id) DO NOTHING;

  SELECT COALESCE(sum(amount_cents), 0)::integer
  INTO v_refunded
  FROM public.billing_order_refunds
  WHERE billing_order_id = _order_id;

  IF v_refunded > v_order.expected_amount_cents THEN
    RAISE EXCEPTION 'billing_order_refund_exceeds_paid_amount';
  END IF;

  IF v_refunded = v_order.expected_amount_cents AND v_order.status <> 'refunded' THEN
    IF v_order.kind = 'usage_addon' THEN
      CASE v_order.sku
        WHEN 'ai_text_250k' THEN v_metric := 'ai_text_words'; v_units := 250000;
        WHEN 'visual_50' THEN v_metric := 'visual_credits'; v_units := 50;
        WHEN 'audio_60' THEN v_metric := 'audio_credits'; v_units := 60;
        ELSE RAISE EXCEPTION 'unknown_usage_addon:%', v_order.sku;
      END CASE;

      UPDATE public.billing_usage_monthly
      SET extra_ai_text_words = CASE
            WHEN v_metric = 'ai_text_words' THEN GREATEST(extra_ai_text_words - v_units, 0)
            ELSE extra_ai_text_words END,
          extra_visual_credits = CASE
            WHEN v_metric = 'visual_credits' THEN GREATEST(extra_visual_credits - v_units::integer, 0)
            ELSE extra_visual_credits END,
          extra_audio_credits = CASE
            WHEN v_metric = 'audio_credits' THEN GREATEST(extra_audio_credits - v_units::integer, 0)
            ELSE extra_audio_credits END,
          updated_at = now()
      WHERE user_id = v_order.user_id
        AND month = v_order.benefit_month;
    END IF;

    UPDATE public.billing_orders
    SET status = 'refunded',
        refunded_at = now(),
        updated_at = now()
    WHERE id = _order_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'refunded_cents', v_refunded,
    'fully_refunded', v_refunded = v_order.expected_amount_cents
  );
END;
$$;

REVOKE ALL ON FUNCTION public.record_billing_order_refund(uuid, text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_billing_order_refund(uuid, text, integer) TO service_role;
