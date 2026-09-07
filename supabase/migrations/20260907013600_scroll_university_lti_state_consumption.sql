-- Consume LTI OIDC state exactly once to prevent replay races.
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
  DELETE FROM public.university_lti_oidc_states s
  WHERE s.state_hash = _state_hash
    AND s.expires_at > now()
  RETURNING s.connection_id, s.nonce, s.login_hint, s.lti_message_hint, s.target_link_uri;
$$;

REVOKE ALL ON FUNCTION public.consume_university_lti_oidc_state(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_university_lti_oidc_state(text)
  TO service_role;
