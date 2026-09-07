-- PostgreSQL/PLpgSQL lint hardening for roster provisioning.
-- The function returns a column named user_id, so an unqualified
-- ON CONFLICT (organization_id, user_id) target is ambiguous inside PL/pgSQL.
-- Target the table's named unique constraint instead.

CREATE OR REPLACE FUNCTION public.provision_university_roster_batch(
  _organization_id uuid,
  _actor_id uuid,
  _people jsonb
)
RETURNS TABLE (
  user_id uuid,
  ok boolean,
  error_message text,
  effective_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  item jsonb;
  v_user_id uuid;
  v_role text;
  v_display_name text;
  v_student_number text;
  v_staff_number text;
  v_initial_status text;
  v_existing_status text;
BEGIN
  IF NOT public.is_org_admin(_actor_id, _organization_id) THEN
    RAISE EXCEPTION 'Organization owner or admin required'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF pg_catalog.jsonb_typeof(_people) <> 'array'
     OR pg_catalog.jsonb_array_length(_people) > 500 THEN
    RAISE EXCEPTION 'Roster batch must be a JSON array with at most 500 entries'
      USING ERRCODE = 'check_violation';
  END IF;

  FOR item IN
    SELECT e.value
    FROM pg_catalog.jsonb_array_elements(_people) AS e(value)
  LOOP
    BEGIN
      v_user_id := NULLIF(item ->> 'user_id', '')::uuid;
      v_role := item ->> 'university_role';
      v_display_name := NULLIF(pg_catalog.btrim(item ->> 'display_name'), '');
      v_student_number := NULLIF(pg_catalog.btrim(item ->> 'student_number'), '');
      v_staff_number := NULLIF(pg_catalog.btrim(item ->> 'staff_number'), '');
      v_initial_status := COALESCE(NULLIF(item ->> 'initial_status', ''), 'active');

      IF v_user_id IS NULL OR v_display_name IS NULL THEN
        RAISE EXCEPTION 'user_id and display_name are required';
      END IF;

      IF NOT EXISTS (
        SELECT 1
        FROM auth.users AS u
        WHERE u.id = v_user_id
      ) THEN
        RAISE EXCEPTION 'Unknown auth user';
      END IF;

      IF v_role NOT IN (
        'chancellor','registrar','dean','programme_lead','lecturer',
        'teaching_assistant','advisor','student','auditor'
      ) THEN
        RAISE EXCEPTION 'Invalid university role';
      END IF;

      IF v_initial_status NOT IN ('invited','active') THEN
        RAISE EXCEPTION 'Initial university status must be invited or active';
      END IF;

      -- Academic authority never implies organization owner/admin authority.
      -- Existing organization roles are preserved; new roster users receive
      -- the least-privileged organization membership.
      INSERT INTO public.organization_members (
        organization_id, user_id, role, invited_by
      ) VALUES (
        _organization_id, v_user_id, 'member', _actor_id
      )
      ON CONFLICT ON CONSTRAINT organization_members_organization_id_user_id_key
      DO NOTHING;

      SELECT p.status
      INTO v_existing_status
      FROM public.university_people AS p
      WHERE p.organization_id = _organization_id
        AND p.user_id = v_user_id
      FOR UPDATE;

      IF FOUND THEN
        UPDATE public.university_people AS p
        SET
          university_role = v_role,
          display_name = v_display_name,
          student_number = v_student_number,
          staff_number = v_staff_number
        WHERE p.organization_id = _organization_id
          AND p.user_id = v_user_id;
      ELSE
        INSERT INTO public.university_people (
          organization_id, user_id, university_role, display_name,
          student_number, staff_number, status
        ) VALUES (
          _organization_id, v_user_id, v_role, v_display_name,
          v_student_number, v_staff_number, v_initial_status
        );
        v_existing_status := v_initial_status;
      END IF;

      user_id := v_user_id;
      ok := true;
      error_message := NULL;
      effective_status := v_existing_status;
      RETURN NEXT;
    EXCEPTION WHEN OTHERS THEN
      user_id := v_user_id;
      ok := false;
      error_message := SQLERRM;
      effective_status := NULL;
      RETURN NEXT;
    END;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.provision_university_roster_batch(uuid, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provision_university_roster_batch(uuid, uuid, jsonb)
  TO service_role;
