-- Allow a user-imprint owner to submit evidence for later independent admin
-- review. Platform imprints remain admin-submission-only. The RPC stays
-- service-role-only so authorization is enforced both here and by Edge APIs.
CREATE OR REPLACE FUNCTION public.submit_publishing_imprint_verification(
  p_admin_user_id uuid,
  p_imprint_id uuid,
  p_verification_reference text,
  p_verification_method text DEFAULT 'manual_agency_record_review',
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_imprint public.publishing_imprints%ROWTYPE;
  v_now timestamptz := pg_catalog.now();
  v_is_admin boolean := false;
BEGIN
  IF pg_catalog.length(pg_catalog.btrim(COALESCE(p_verification_reference, ''))) = 0 THEN
    RAISE EXCEPTION 'VERIFICATION_REFERENCE_REQUIRED' USING ERRCODE = '22023';
  END IF;
  IF pg_catalog.length(pg_catalog.btrim(COALESCE(p_verification_method, ''))) = 0 THEN
    RAISE EXCEPTION 'VERIFICATION_METHOD_REQUIRED' USING ERRCODE = '22023';
  END IF;

  SELECT pi.* INTO v_imprint
  FROM public.publishing_imprints AS pi
  WHERE pi.id = p_imprint_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'IMPRINT_NOT_FOUND' USING ERRCODE = 'P0002';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.user_roles AS ur
    WHERE ur.user_id = p_admin_user_id AND ur.role = 'admin'
  ) INTO v_is_admin;

  IF v_imprint.scope = 'platform' THEN
    IF NOT v_is_admin THEN
      RAISE EXCEPTION 'ADMIN_REQUIRED' USING ERRCODE = '42501';
    END IF;
  ELSIF v_imprint.scope = 'user' THEN
    IF v_imprint.owner_user_id IS DISTINCT FROM p_admin_user_id AND NOT v_is_admin THEN
      RAISE EXCEPTION 'IMPRINT_OWNER_OR_ADMIN_REQUIRED' USING ERRCODE = '42501';
    END IF;
  ELSE
    RAISE EXCEPTION 'UNSUPPORTED_IMPRINT_SCOPE' USING ERRCODE = '23514';
  END IF;

  UPDATE public.publishing_imprints AS pi
  SET verified = false,
      verified_at = NULL,
      verified_by = NULL,
      verification_reference = NULL,
      verification_method = NULL,
      verification_pending_reference = pg_catalog.btrim(p_verification_reference),
      verification_pending_method = pg_catalog.btrim(p_verification_method),
      verification_pending_notes = p_notes,
      verification_submitted_by = p_admin_user_id,
      verification_submitted_at = v_now
  WHERE pi.id = p_imprint_id;

  RETURN pg_catalog.jsonb_build_object(
    'imprint_id', p_imprint_id,
    'status', 'pending',
    'verified', false,
    'verification_reference', pg_catalog.btrim(p_verification_reference),
    'verification_method', pg_catalog.btrim(p_verification_method),
    'submitted_at', v_now
  );
END;
$$;
REVOKE ALL ON FUNCTION public.submit_publishing_imprint_verification(uuid,uuid,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_publishing_imprint_verification(uuid,uuid,text,text,text) TO service_role;
