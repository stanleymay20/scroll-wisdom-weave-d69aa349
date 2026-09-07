-- ScrollUniversity SCORM package/runtime model.
--
-- This implements the persistence/security substrate for private SCORM 1.2 and
-- SCORM 2004 packages. Package bytes are stored in a private Storage bucket and
-- are only served by the SCORM runtime Edge Function through opaque, expiring
-- runtime sessions. Browser clients never receive service-role credentials or
-- direct bucket access.

CREATE TABLE IF NOT EXISTS public.university_scorm_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.university_courses(id) ON DELETE CASCADE,
  module_id uuid REFERENCES public.university_modules(id) ON DELETE SET NULL,
  title text NOT NULL,
  scorm_version text NOT NULL CHECK (scorm_version IN ('scorm_1_2','scorm_2004')),
  manifest_identifier text,
  entrypoint text NOT NULL,
  storage_prefix text NOT NULL,
  content_hash text NOT NULL,
  manifest jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing','ready','disabled','error')),
  error_message text,
  imported_by uuid NOT NULL,
  imported_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (course_id, content_hash),
  UNIQUE (storage_prefix)
);

CREATE TABLE IF NOT EXISTS public.university_scorm_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  package_id uuid NOT NULL REFERENCES public.university_scorm_packages(id) ON DELETE CASCADE,
  identifier text NOT NULL,
  parent_identifier text,
  title text NOT NULL,
  launch_path text,
  parameters text,
  sequence integer NOT NULL DEFAULT 1 CHECK (sequence > 0),
  visible boolean NOT NULL DEFAULT true,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (package_id, identifier)
);

CREATE TABLE IF NOT EXISTS public.university_scorm_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  package_id uuid NOT NULL REFERENCES public.university_scorm_packages(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.university_scorm_items(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.university_courses(id) ON DELETE CASCADE,
  offering_id uuid REFERENCES public.university_course_offerings(id) ON DELETE CASCADE,
  enrolment_id uuid REFERENCES public.university_enrolments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  launch_mode text NOT NULL DEFAULT 'learner' CHECK (launch_mode IN ('learner','preview')),
  attempt_number integer NOT NULL DEFAULT 1 CHECK (attempt_number > 0),
  completion_status text NOT NULL DEFAULT 'not_attempted'
    CHECK (completion_status IN ('unknown','not_attempted','incomplete','completed','passed','failed','browsed')),
  success_status text NOT NULL DEFAULT 'unknown'
    CHECK (success_status IN ('unknown','passed','failed')),
  score_raw numeric,
  score_min numeric,
  score_max numeric,
  score_scaled numeric CHECK (score_scaled IS NULL OR (score_scaled >= -1 AND score_scaled <= 1)),
  location text,
  suspend_data text,
  exit_mode text,
  total_time_ms bigint NOT NULL DEFAULT 0 CHECK (total_time_ms >= 0),
  runtime_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_activity_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (item_id, user_id, attempt_number),
  CHECK (
    (launch_mode = 'learner' AND offering_id IS NOT NULL AND enrolment_id IS NOT NULL)
    OR launch_mode = 'preview'
  )
);

CREATE TABLE IF NOT EXISTS public.university_scorm_runtime_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL REFERENCES public.university_scorm_attempts(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_university_scorm_packages_course
  ON public.university_scorm_packages(course_id, status, imported_at DESC);
CREATE INDEX IF NOT EXISTS idx_university_scorm_items_package
  ON public.university_scorm_items(package_id, sequence);
CREATE INDEX IF NOT EXISTS idx_university_scorm_attempts_user
  ON public.university_scorm_attempts(user_id, course_id, last_activity_at DESC);
CREATE INDEX IF NOT EXISTS idx_university_scorm_attempts_offering
  ON public.university_scorm_attempts(offering_id, item_id, user_id);
CREATE INDEX IF NOT EXISTS idx_university_scorm_runtime_sessions_expiry
  ON public.university_scorm_runtime_sessions(expires_at)
  WHERE revoked_at IS NULL;

ALTER TABLE public.university_scorm_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.university_scorm_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.university_scorm_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.university_scorm_runtime_sessions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.university_scorm_packages FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.university_scorm_items FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.university_scorm_attempts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.university_scorm_runtime_sessions FROM PUBLIC, anon, authenticated;

-- Package imports, attempt mutation and runtime sessions are server-authoritative.
GRANT SELECT ON TABLE public.university_scorm_packages TO authenticated;
GRANT SELECT ON TABLE public.university_scorm_items TO authenticated;
GRANT SELECT ON TABLE public.university_scorm_attempts TO authenticated;
GRANT ALL ON TABLE public.university_scorm_packages TO service_role;
GRANT ALL ON TABLE public.university_scorm_items TO service_role;
GRANT ALL ON TABLE public.university_scorm_attempts TO service_role;
GRANT ALL ON TABLE public.university_scorm_runtime_sessions TO service_role;

CREATE POLICY "Course participants can view SCORM packages"
ON public.university_scorm_packages FOR SELECT TO authenticated
USING ((SELECT private.university_can_access_course(organization_id, course_id)));

CREATE POLICY "Course participants can view SCORM items"
ON public.university_scorm_items FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.university_scorm_packages p
    WHERE p.id = package_id
      AND (SELECT private.university_can_access_course(p.organization_id, p.course_id))
  )
);

CREATE POLICY "Users and course managers can view SCORM attempts"
ON public.university_scorm_attempts FOR SELECT TO authenticated
USING (
  user_id = (SELECT auth.uid())
  OR (SELECT private.university_can_manage_course(organization_id, course_id))
);

-- Keep cross-tenant/course relationships correct even for service-role writes.
CREATE OR REPLACE FUNCTION private.validate_university_scorm_package()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_course_org uuid;
  v_module_course uuid;
  v_module_org uuid;
BEGIN
  SELECT c.organization_id
  INTO v_course_org
  FROM public.university_courses c
  WHERE c.id = NEW.course_id;

  IF v_course_org IS NULL OR v_course_org <> NEW.organization_id THEN
    RAISE EXCEPTION 'SCORM package course must belong to the same organization';
  END IF;

  IF NEW.module_id IS NOT NULL THEN
    SELECT m.course_id, m.organization_id
    INTO v_module_course, v_module_org
    FROM public.university_modules m
    WHERE m.id = NEW.module_id;

    IF v_module_course IS NULL
       OR v_module_course <> NEW.course_id
       OR v_module_org <> NEW.organization_id THEN
      RAISE EXCEPTION 'SCORM package module must belong to the same course and organization';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.validate_university_scorm_item()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_package_org uuid;
BEGIN
  SELECT p.organization_id
  INTO v_package_org
  FROM public.university_scorm_packages p
  WHERE p.id = NEW.package_id;

  IF v_package_org IS NULL OR v_package_org <> NEW.organization_id THEN
    RAISE EXCEPTION 'SCORM item must belong to the package organization';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION private.validate_university_scorm_attempt()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_package_org uuid;
  v_package_course uuid;
  v_item_package uuid;
  v_offering_org uuid;
  v_offering_course uuid;
  v_enrolment_org uuid;
  v_enrolment_offering uuid;
  v_enrolment_user uuid;
  v_enrolment_status text;
BEGIN
  SELECT p.organization_id, p.course_id
  INTO v_package_org, v_package_course
  FROM public.university_scorm_packages p
  WHERE p.id = NEW.package_id;

  IF v_package_org IS NULL
     OR v_package_org <> NEW.organization_id
     OR v_package_course <> NEW.course_id THEN
    RAISE EXCEPTION 'SCORM attempt package must match organization and course';
  END IF;

  SELECT i.package_id
  INTO v_item_package
  FROM public.university_scorm_items i
  WHERE i.id = NEW.item_id;

  IF v_item_package IS NULL OR v_item_package <> NEW.package_id THEN
    RAISE EXCEPTION 'SCORM attempt item must belong to the package';
  END IF;

  IF NEW.launch_mode = 'learner' THEN
    SELECT o.organization_id, o.course_id
    INTO v_offering_org, v_offering_course
    FROM public.university_course_offerings o
    WHERE o.id = NEW.offering_id;

    IF v_offering_org IS NULL
       OR v_offering_org <> NEW.organization_id
       OR v_offering_course <> NEW.course_id THEN
      RAISE EXCEPTION 'SCORM learner attempt offering must match organization and course';
    END IF;

    SELECT e.organization_id, e.offering_id, e.user_id, e.status
    INTO v_enrolment_org, v_enrolment_offering, v_enrolment_user, v_enrolment_status
    FROM public.university_enrolments e
    WHERE e.id = NEW.enrolment_id;

    IF v_enrolment_org IS NULL
       OR v_enrolment_org <> NEW.organization_id
       OR v_enrolment_offering <> NEW.offering_id
       OR v_enrolment_user <> NEW.user_id
       OR v_enrolment_status NOT IN ('enrolled','completed') THEN
      RAISE EXCEPTION 'SCORM learner attempt requires a matching active/completed enrolment';
    END IF;
  ELSE
    IF NEW.enrolment_id IS NOT NULL OR NEW.offering_id IS NOT NULL THEN
      RAISE EXCEPTION 'SCORM preview attempts cannot be attached to learner enrolments or offerings';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_university_scorm_package_relations
ON public.university_scorm_packages;
CREATE TRIGGER validate_university_scorm_package_relations
BEFORE INSERT OR UPDATE ON public.university_scorm_packages
FOR EACH ROW EXECUTE FUNCTION private.validate_university_scorm_package();

DROP TRIGGER IF EXISTS validate_university_scorm_item_relations
ON public.university_scorm_items;
CREATE TRIGGER validate_university_scorm_item_relations
BEFORE INSERT OR UPDATE ON public.university_scorm_items
FOR EACH ROW EXECUTE FUNCTION private.validate_university_scorm_item();

DROP TRIGGER IF EXISTS validate_university_scorm_attempt_relations
ON public.university_scorm_attempts;
CREATE TRIGGER validate_university_scorm_attempt_relations
BEFORE INSERT OR UPDATE ON public.university_scorm_attempts
FOR EACH ROW EXECUTE FUNCTION private.validate_university_scorm_attempt();

REVOKE ALL ON FUNCTION private.validate_university_scorm_package() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.validate_university_scorm_item() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.validate_university_scorm_attempt() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS update_university_scorm_packages_updated_at
ON public.university_scorm_packages;
CREATE TRIGGER update_university_scorm_packages_updated_at
BEFORE UPDATE ON public.university_scorm_packages
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_university_scorm_attempts_updated_at
ON public.university_scorm_attempts;
CREATE TRIGGER update_university_scorm_attempts_updated_at
BEFORE UPDATE ON public.university_scorm_attempts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
