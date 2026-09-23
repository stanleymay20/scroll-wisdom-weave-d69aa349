-- Make Stripe webhook claim semantics match the reliability dashboard:
-- processed/replayed/dead_lettered are terminal to ordinary delivery.
-- An explicit admin replay first stages a terminal event back to failed, then
-- the normal claim path atomically acquires it again.

CREATE OR REPLACE FUNCTION public.claim_stripe_webhook_event(
  _stripe_event_id text,
  _event_type text,
  _payload jsonb,
  _correlation_id text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.stripe_webhook_events%ROWTYPE;
BEGIN
  IF _stripe_event_id IS NULL OR length(_stripe_event_id) = 0 THEN
    RAISE EXCEPTION 'stripe_event_id_required';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(_stripe_event_id, 0));

  SELECT *
    INTO v_row
  FROM public.stripe_webhook_events
  WHERE stripe_event_id = _stripe_event_id;

  IF NOT FOUND THEN
    INSERT INTO public.stripe_webhook_events(
      stripe_event_id,
      event_type,
      payload,
      status,
      attempts,
      correlation_id,
      received_at,
      updated_at
    )
    VALUES (
      _stripe_event_id,
      _event_type,
      _payload,
      'processing',
      1,
      _correlation_id,
      now(),
      now()
    );
    RETURN jsonb_build_object(
      'claimed', true,
      'attempts', 1,
      'status', 'processing'
    );
  END IF;

  IF v_row.status IN ('processed', 'replayed', 'dead_lettered') THEN
    RETURN jsonb_build_object(
      'claimed', false,
      'terminal', true,
      'status', v_row.status,
      'attempts', v_row.attempts
    );
  END IF;

  IF v_row.status = 'processing'
     AND v_row.updated_at > now() - interval '5 minutes' THEN
    RETURN jsonb_build_object(
      'claimed', false,
      'in_flight', true,
      'status', 'processing',
      'attempts', v_row.attempts
    );
  END IF;

  UPDATE public.stripe_webhook_events
  SET status = 'processing',
      attempts = COALESCE(attempts, 0) + 1,
      event_type = _event_type,
      payload = _payload,
      correlation_id = _correlation_id,
      last_error = NULL,
      updated_at = now()
  WHERE stripe_event_id = _stripe_event_id
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'claimed', true,
    'attempts', v_row.attempts,
    'status', 'processing'
  );
END
$$;

REVOKE ALL ON FUNCTION public.claim_stripe_webhook_event(text, text, jsonb, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_stripe_webhook_event(text, text, jsonb, text)
  TO service_role;
