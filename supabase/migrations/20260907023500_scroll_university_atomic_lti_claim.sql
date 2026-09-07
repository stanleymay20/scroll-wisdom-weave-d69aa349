-- Atomically claim an LTI launch and bind the external LMS identity.
-- Service-role only: the Edge Function supplies the already-authenticated local
-- user id, while this transaction prevents partial claims and identity races.
CREATE OR REPLACE FUNCTION public.claim_university_lti_launch(
  _launch_token_hash text,
  _user_id uuid
)
RETURNS TABLE (
  ok boolean,
  error_code text,
  launch_id uuid,
  organization_id uuid,
  connection_id uuid,
  roles jsonb,
  context_claim jsonb,
  resource_link_claim jsonb,
  custom_claim jsonb,
  university_role text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_launch public.university_lti_launches%ROWTYPE;
  v_person public.university_people%ROWTYPE;
  v_subject_identity public.university_external_identities%ROWTYPE;
  v_user_identity public.university_external_identities%ROWTYPE;
BEGIN
  SELECT l.* INTO v_launch
  FROM public.university_lti_launches l
  WHERE l.launch_token_hash = _launch_token_hash
    AND l.claimed_at IS NULL
    AND l.expires_at > v_now
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'invalid_launch'::text,
      NULL::uuid, NULL::uuid, NULL::uuid,
      NULL::jsonb, NULL::jsonb, NULL::jsonb, NULL::jsonb, NULL::text;
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.organization_id = v_launch.organization_id
      AND om.user_id = _user_id
  ) THEN
    RETURN QUERY SELECT false, 'not_member'::text,
      v_launch.id, v_launch.organization_id, v_launch.connection_id,
      NULL::jsonb, NULL::jsonb, NULL::jsonb, NULL::jsonb, NULL::text;
    RETURN;
  END IF;

  SELECT p.* INTO v_person
  FROM public.university_people p
  WHERE p.organization_id = v_launch.organization_id
    AND p.user_id = _user_id
  FOR UPDATE;

  IF NOT FOUND OR v_person.status NOT IN ('invited','active') THEN
    RETURN QUERY SELECT false, 'inactive_identity'::text,
      v_launch.id, v_launch.organization_id, v_launch.connection_id,
      NULL::jsonb, NULL::jsonb, NULL::jsonb, NULL::jsonb, NULL::text;
    RETURN;
  END IF;

  SELECT ei.* INTO v_subject_identity
  FROM public.university_external_identities ei
  WHERE ei.connection_id = v_launch.connection_id
    AND ei.external_subject = v_launch.subject
  FOR UPDATE;

  IF FOUND AND v_subject_identity.user_id <> _user_id THEN
    RETURN QUERY SELECT false, 'identity_taken'::text,
      v_launch.id, v_launch.organization_id, v_launch.connection_id,
      NULL::jsonb, NULL::jsonb, NULL::jsonb, NULL::jsonb, v_person.university_role;
    RETURN;
  END IF;

  SELECT ei.* INTO v_user_identity
  FROM public.university_external_identities ei
  WHERE ei.connection_id = v_launch.connection_id
    AND ei.user_id = _user_id
  FOR UPDATE;

  IF FOUND AND v_user_identity.external_subject <> v_launch.subject THEN
    RETURN QUERY SELECT false, 'user_already_linked'::text,
      v_launch.id, v_launch.organization_id, v_launch.connection_id,
      NULL::jsonb, NULL::jsonb, NULL::jsonb, NULL::jsonb, v_person.university_role;
    RETURN;
  END IF;

  IF v_subject_identity.id IS NULL THEN
    INSERT INTO public.university_external_identities (
      organization_id, connection_id, external_subject, user_id, roles, last_launch_at
    ) VALUES (
      v_launch.organization_id,
      v_launch.connection_id,
      v_launch.subject,
      _user_id,
      v_launch.roles,
      v_now
    );
  ELSE
    UPDATE public.university_external_identities ei
    SET roles = v_launch.roles, last_launch_at = v_now
    WHERE ei.id = v_subject_identity.id
      AND ei.user_id = _user_id;
  END IF;

  UPDATE public.university_lti_launches l
  SET claimed_by = _user_id, claimed_at = v_now
  WHERE l.id = v_launch.id;

  IF v_person.status = 'invited' THEN
    UPDATE public.university_people p
    SET status = 'active'
    WHERE p.id = v_person.id AND p.status = 'invited';
  END IF;

  PERFORM public.log_audit_event(
    'university.lti.launch.claimed',
    _user_id,
    v_launch.organization_id,
    'lti_launch',
    v_launch.id::text,
    'info',
    jsonb_build_object(
      'connection_id', v_launch.connection_id,
      'university_role', v_person.university_role
    )
  );

  RETURN QUERY SELECT true, NULL::text,
    v_launch.id,
    v_launch.organization_id,
    v_launch.connection_id,
    v_launch.roles,
    v_launch.context_claim,
    v_launch.resource_link_claim,
    v_launch.custom_claim,
    v_person.university_role;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_university_lti_launch(text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_university_lti_launch(text, uuid)
  TO service_role;
