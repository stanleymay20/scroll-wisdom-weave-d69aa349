-- Harden ScrollUniversity roster provisioning at the database trust boundary.
-- Academic roles remain distinct from organization roles: newly provisioned
-- users always enter organization_members as least-privileged members, and
-- existing organization roles are never rewritten here.

CREATE OR REPLACE FUNCTION public.resolve_university_auth_users(_emails text[])
RETURNS TABLE (
  email text,
  user_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH requested AS (
    SELECT DISTINCT pg_catalog.lower(pg_catalog.btrim(e.value)) AS email
    FROM pg_catalog.unnest(_emails) AS e(value)
    WHERE e.value IS NOT NULL
      AND pg_catalog.btrim(e.value) <> ''
    LIMIT 500
  )
  SELECT pg_catalog.lower(u.email) AS email, u.id AS user_id
  FROM auth.users AS u
  JOIN requested AS r
    ON r.email = pg_catalog.lower(u.email)
  WHERE u.email IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.resolve_university_auth_users(text[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_university_auth_users(text[])
  TO service_role;

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

      -- The service-role RPC must never be able to create an organization
      -- membership for an identifier that is not an actual Supabase Auth user.
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

      -- Never derive an organization owner/admin role from an academic role.
      -- New roster members receive the least-privileged organization role.
      -- ON CONFLICT DO NOTHING preserves any existing owner/admin/member role.
      INSERT INTO public.organization_members (
        organization_id, user_id, role, invited_by
      ) VALUES (
        _organization_id, v_user_id, 'member', _actor_id
      )
      ON CONFLICT (organization_id, user_id) DO NOTHING;

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
      -- The inner exception block rolls back only this roster entry.
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
