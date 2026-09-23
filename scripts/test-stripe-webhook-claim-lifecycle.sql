\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  v_id text := 'evt_scrolllibrary_claim_fixture';
  v_claim jsonb;
BEGIN
  IF has_function_privilege('anon', 'public.claim_stripe_webhook_event(text,text,jsonb,text)'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION 'anon can claim Stripe webhook events';
  END IF;
  IF has_function_privilege('authenticated', 'public.claim_stripe_webhook_event(text,text,jsonb,text)'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated can claim Stripe webhook events';
  END IF;
  IF NOT has_function_privilege('service_role', 'public.claim_stripe_webhook_event(text,text,jsonb,text)'::regprocedure, 'EXECUTE') THEN
    RAISE EXCEPTION 'service_role cannot claim Stripe webhook events';
  END IF;

  DELETE FROM public.stripe_webhook_events WHERE stripe_event_id = v_id;

  v_claim := public.claim_stripe_webhook_event(
    v_id, 'checkout.session.completed', '{"id":"evt_fixture"}'::jsonb, 'corr-1'
  );
  IF COALESCE((v_claim->>'claimed')::boolean, false) IS NOT TRUE
     OR (v_claim->>'attempts')::integer <> 1 THEN
    RAISE EXCEPTION 'first delivery was not claimed correctly: %', v_claim;
  END IF;

  v_claim := public.claim_stripe_webhook_event(
    v_id, 'checkout.session.completed', '{"id":"evt_fixture"}'::jsonb, 'corr-2'
  );
  IF COALESCE((v_claim->>'claimed')::boolean, true) IS NOT FALSE
     OR COALESCE((v_claim->>'in_flight')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'concurrent delivery was not classified in-flight: %', v_claim;
  END IF;

  UPDATE public.stripe_webhook_events
  SET status = 'processed', updated_at = now()
  WHERE stripe_event_id = v_id;
  v_claim := public.claim_stripe_webhook_event(
    v_id, 'checkout.session.completed', '{"id":"evt_fixture"}'::jsonb, 'corr-3'
  );
  IF COALESCE((v_claim->>'terminal')::boolean, false) IS NOT TRUE
     OR v_claim->>'status' <> 'processed' THEN
    RAISE EXCEPTION 'processed event was not terminal: %', v_claim;
  END IF;

  UPDATE public.stripe_webhook_events
  SET status = 'replayed', updated_at = now()
  WHERE stripe_event_id = v_id;
  v_claim := public.claim_stripe_webhook_event(
    v_id, 'checkout.session.completed', '{"id":"evt_fixture"}'::jsonb, 'corr-4'
  );
  IF COALESCE((v_claim->>'terminal')::boolean, false) IS NOT TRUE
     OR v_claim->>'status' <> 'replayed' THEN
    RAISE EXCEPTION 'replayed event was not terminal: %', v_claim;
  END IF;

  UPDATE public.stripe_webhook_events
  SET status = 'dead_lettered', dead_letter_reason = 'fixture', updated_at = now()
  WHERE stripe_event_id = v_id;
  v_claim := public.claim_stripe_webhook_event(
    v_id, 'checkout.session.completed', '{"id":"evt_fixture"}'::jsonb, 'corr-5'
  );
  IF COALESCE((v_claim->>'terminal')::boolean, false) IS NOT TRUE
     OR v_claim->>'status' <> 'dead_lettered' THEN
    RAISE EXCEPTION 'dead-lettered event was automatically resurrected: %', v_claim;
  END IF;

  -- Explicit admin replay stages the row to failed. The ordinary atomic claim
  -- must then be allowed to acquire it again.
  UPDATE public.stripe_webhook_events
  SET status = 'failed', updated_at = now()
  WHERE stripe_event_id = v_id;
  v_claim := public.claim_stripe_webhook_event(
    v_id, 'checkout.session.completed', '{"id":"evt_fixture"}'::jsonb, 'corr-replay'
  );
  IF COALESCE((v_claim->>'claimed')::boolean, false) IS NOT TRUE
     OR v_claim->>'status' <> 'processing' THEN
    RAISE EXCEPTION 'explicit replay staging could not re-acquire event: %', v_claim;
  END IF;

  -- A stale processing lease is recoverable; a fresh lease is not.
  UPDATE public.stripe_webhook_events
  SET status = 'processing', updated_at = now() - interval '6 minutes'
  WHERE stripe_event_id = v_id;
  v_claim := public.claim_stripe_webhook_event(
    v_id, 'checkout.session.completed', '{"id":"evt_fixture"}'::jsonb, 'corr-stale'
  );
  IF COALESCE((v_claim->>'claimed')::boolean, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'stale processing lease was not recoverable: %', v_claim;
  END IF;
END
$$;

ROLLBACK;
