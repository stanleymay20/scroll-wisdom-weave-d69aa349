-- Idempotent billing-order fulfillment.
-- Service-role only. ISBN assignment is deliberately absent.

CREATE OR REPLACE FUNCTION public.settle_billing_order(
  _order_id uuid,
  _stripe_session_id text,
  _stripe_payment_intent_id text,
  _stripe_customer_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.billing_orders%ROWTYPE;
  v_metric text;
  v_units bigint;
BEGIN
  IF _order_id IS NULL THEN RAISE EXCEPTION 'order_id_required'; END IF;
  IF COALESCE(_stripe_session_id, '') = '' THEN RAISE EXCEPTION 'stripe_session_id_required'; END IF;
  IF COALESCE(_stripe_customer_id, '') = '' THEN RAISE EXCEPTION 'stripe_customer_id_required'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(_order_id::text || ':billing-order', 0));

  SELECT * INTO v_order
  FROM public.billing_orders
  WHERE id = _order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'order_not_found');
  END IF;

  IF v_order.status = 'paid' THEN
    RETURN jsonb_build_object('ok', true, 'idempotent', true, 'status', 'paid');
  END IF;
  IF v_order.status = 'refunded' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'order_refunded');
  END IF;

  IF v_order.stripe_session_id IS NOT NULL AND v_order.stripe_session_id <> _stripe_session_id THEN
    RAISE EXCEPTION 'billing_order_session_mismatch';
  END IF;
  IF v_order.stripe_customer_id IS NOT NULL AND v_order.stripe_customer_id <> _stripe_customer_id THEN
    RAISE EXCEPTION 'billing_order_customer_mismatch';
  END IF;

  IF v_order.kind = 'usage_addon' THEN
    CASE v_order.sku
      WHEN 'ai_text_250k' THEN v_metric := 'ai_text_words'; v_units := 250000;
      WHEN 'visual_50' THEN v_metric := 'visual_credits'; v_units := 50;
      WHEN 'audio_60' THEN v_metric := 'audio_credits'; v_units := 60;
      ELSE RAISE EXCEPTION 'unknown_usage_addon:%', v_order.sku;
    END CASE;

    PERFORM public.grant_billing_usage_addon(
      v_order.user_id,
      v_order.benefit_month,
      v_metric,
      v_units
    );
  ELSIF v_order.kind = 'publishing_service' THEN
    IF v_order.sku NOT IN ('single_edition','print_digital','complete_edition','assisted_launch') THEN
      RAISE EXCEPTION 'unknown_publishing_service:%', v_order.sku;
    END IF;
    -- No ISBN allocation occurs at payment settlement.
  ELSE
    RAISE EXCEPTION 'unknown_billing_order_kind:%', v_order.kind;
  END IF;

  UPDATE public.billing_orders
  SET status = 'paid',
      stripe_session_id = _stripe_session_id,
      stripe_payment_intent_id = NULLIF(_stripe_payment_intent_id, ''),
      stripe_customer_id = _stripe_customer_id,
      paid_at = COALESCE(paid_at, now()),
      fulfilled_at = COALESCE(fulfilled_at, now()),
      updated_at = now()
  WHERE id = _order_id;

  RETURN jsonb_build_object('ok', true, 'idempotent', false, 'status', 'paid');
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_billing_order(
  _order_id uuid,
  _stripe_session_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.billing_orders
  SET status = CASE WHEN status = 'pending' THEN 'failed' ELSE status END,
      stripe_session_id = COALESCE(stripe_session_id, NULLIF(_stripe_session_id, '')),
      updated_at = now()
  WHERE id = _order_id;

  RETURN jsonb_build_object('ok', FOUND);
END;
$$;

REVOKE ALL ON FUNCTION public.settle_billing_order(uuid, text, text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_billing_order(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_billing_order(uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_billing_order(uuid, text) TO service_role;
