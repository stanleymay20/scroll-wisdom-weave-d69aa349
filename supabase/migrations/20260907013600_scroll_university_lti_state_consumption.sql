-- Consume LTI OIDC state exactly once to prevent replay races without destructive migration SQL.
ALTER TABLE public.university_lti_oidc_states
  ADD COLUMN IF NOT EXISTS consumed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_university_lti_states_unconsumed
  ON public.university_lti_oidc_states(state_hash)
  WHERE consumed_at IS NULL;

CREATE OR REPLACE FUNCTION public.consume_university_lti_oidc_state(_state_hash text)
RETURNS TABLE (
  connection_id uuid,
  nonce text,
  login_hint text,
  lti_message_hint text,
  target_link_uri text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.university_lti_oidc_states s
  SET consumed_at = now()
  WHERE s.state_hash = _state_hash
    AND s.expires_at > now()
    AND s.consumed_at IS NULL
  RETURNING s.connection_id, s.nonce, s.login_hint, s.lti_message_hint, s.target_link_uri;
$$;

REVOKE ALL ON FUNCTION public.consume_university_lti_oidc_state(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_university_lti_oidc_state(text)
  TO service_role;
