-- ScrollUniversity reusable course-content library
-- Stores reviewed readings/resources and assessment templates independently of
-- any specific term offering so approved course packs can be reused safely.

CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE IF NOT EXISTS public.university_course_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.university_courses(id) ON DELETE CASCADE,
  module_id uuid REFERENCES public.university_modules(id) ON DELETE CASCADE,
  title text NOT NULL,
  resource_type text NOT NULL DEFAULT 'reading' CHECK (
    resource_type IN ('reading','dataset','tool','website','video','audio','case','software','other')
  ),
  url text,
  citation text,
  provenance text NOT NULL DEFAULT '',
  license_note text NOT NULL DEFAULT '',
  required boolean NOT NULL DEFAULT false,
  sequence integer NOT NULL DEFAULT 1 CHECK (sequence > 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (url IS NOT NULL OR citation IS NOT NULL),
  UNIQUE (course_id, title, sequence)
);

CREATE TABLE IF NOT EXISTS public.university_assessment_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.university_courses(id) ON DELETE CASCADE,
  module_id uuid REFERENCES public.university_modules(id) ON DELETE SET NULL,
  code text NOT NULL,
  title text NOT NULL,
  assignment_type text NOT NULL DEFAULT 'assignment' CHECK (
    assignment_type IN ('assignment','quiz','exam','essay','project','lab','presentation','discussion','mastery_check')
  ),
  instructions text NOT NULL DEFAULT '',
  max_points numeric(8,2) NOT NULL DEFAULT 100 CHECK (max_points > 0),
  weight_percent numeric(6,3) NOT NULL DEFAULT 0 CHECK (weight_percent >= 0 AND weight_percent <= 100),
  rubric jsonb NOT NULL DEFAULT '{}'::jsonb,
  release_policy jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (course_id, code)
);

CREATE TABLE IF NOT EXISTS public.university_assessment_template_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  assessment_template_id uuid NOT NULL REFERENCES public.university_assessment_templates(id) ON DELETE CASCADE,
  learning_outcome_id uuid NOT NULL REFERENCES public.university_learning_outcomes(id) ON DELETE CASCADE,
  contribution_weight numeric(6,3) NOT NULL DEFAULT 1 CHECK (contribution_weight > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assessment_template_id, learning_outcome_id)
);

CREATE TABLE IF NOT EXISTS public.university_course_pack_releases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  pack_code text NOT NULL,
  version text NOT NULL,
  programme_code text,
  content_hash text NOT NULL,
  source_ref text,
  qa_status jsonb NOT NULL DEFAULT '{}'::jsonb,
  installed_by uuid,
  installed_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (organization_id, pack_code, version)
);

CREATE INDEX IF NOT EXISTS idx_university_course_resources_course
  ON public.university_course_resources(course_id, module_id, sequence);
CREATE INDEX IF NOT EXISTS idx_university_assessment_templates_course
  ON public.university_assessment_templates(course_id, active);
CREATE INDEX IF NOT EXISTS idx_university_assessment_template_outcomes_template
  ON public.university_assessment_template_outcomes(assessment_template_id);
CREATE INDEX IF NOT EXISTS idx_university_course_pack_releases_org
  ON public.university_course_pack_releases(organization_id, pack_code, installed_at DESC);

ALTER TABLE public.university_course_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.university_assessment_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.university_assessment_template_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.university_course_pack_releases ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.university_course_resources FROM anon, authenticated;
REVOKE ALL ON TABLE public.university_assessment_templates FROM anon, authenticated;
REVOKE ALL ON TABLE public.university_assessment_template_outcomes FROM anon, authenticated;
REVOKE ALL ON TABLE public.university_course_pack_releases FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.university_course_resources TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.university_assessment_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.university_assessment_template_outcomes TO authenticated;
GRANT SELECT ON TABLE public.university_course_pack_releases TO authenticated;
GRANT ALL ON TABLE public.university_course_resources TO service_role;
GRANT ALL ON TABLE public.university_assessment_templates TO service_role;
GRANT ALL ON TABLE public.university_assessment_template_outcomes TO service_role;
GRANT ALL ON TABLE public.university_course_pack_releases TO service_role;

-- Safe helper used by RLS. It accepts only course/org identifiers and binds the
-- current authenticated user internally, preventing callers from probing access
-- for arbitrary user ids.
CREATE OR REPLACE FUNCTION private.university_can_access_course(
  _organization_id uuid,
  _course_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT (SELECT auth.uid()) IS NOT NULL AND (
    EXISTS (
      SELECT 1
      FROM public.organization_members om
      WHERE om.organization_id = _organization_id
        AND om.user_id = (SELECT auth.uid())
        AND om.role IN ('owner','admin')
    )
    OR EXISTS (
      SELECT 1
      FROM public.university_people up
      WHERE up.organization_id = _organization_id
        AND up.user_id = (SELECT auth.uid())
        AND up.status IN ('active','invited')
        AND up.university_role IN ('chancellor','registrar','dean','programme_lead','auditor')
    )
    OR EXISTS (
      SELECT 1
      FROM public.university_course_offerings o
      JOIN public.university_teaching_assignments ta ON ta.offering_id = o.id
      WHERE o.organization_id = _organization_id
        AND o.course_id = _course_id
        AND ta.user_id = (SELECT auth.uid())
    )
    OR EXISTS (
      SELECT 1
      FROM public.university_course_offerings o
      JOIN public.university_enrolments e ON e.offering_id = o.id
      WHERE o.organization_id = _organization_id
        AND o.course_id = _course_id
        AND e.user_id = (SELECT auth.uid())
        AND e.status IN ('enrolled','completed')
    )
  );
$$;

CREATE OR REPLACE FUNCTION private.university_can_manage_course(
  _organization_id uuid,
  _course_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT (SELECT auth.uid()) IS NOT NULL AND (
    EXISTS (
      SELECT 1
      FROM public.organization_members om
      WHERE om.organization_id = _organization_id
        AND om.user_id = (SELECT auth.uid())
        AND om.role IN ('owner','admin')
    )
    OR EXISTS (
      SELECT 1
      FROM public.university_people up
      WHERE up.organization_id = _organization_id
        AND up.user_id = (SELECT auth.uid())
        AND up.status = 'active'
        AND up.university_role IN ('chancellor','registrar','dean','programme_lead')
    )
    OR EXISTS (
      SELECT 1
      FROM public.university_course_offerings o
      JOIN public.university_teaching_assignments ta ON ta.offering_id = o.id
      WHERE o.organization_id = _organization_id
        AND o.course_id = _course_id
        AND ta.user_id = (SELECT auth.uid())
        AND ta.teaching_role IN ('lead_lecturer','lecturer')
    )
  );
$$;

REVOKE ALL ON FUNCTION private.university_can_access_course(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.university_can_manage_course(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.university_can_access_course(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION private.university_can_manage_course(uuid, uuid) TO authenticated;

CREATE POLICY "Course participants can view course resources"
ON public.university_course_resources FOR SELECT TO authenticated
USING ((SELECT private.university_can_access_course(organization_id, course_id)));

CREATE POLICY "Course managers can create resources"
ON public.university_course_resources FOR INSERT TO authenticated
WITH CHECK ((SELECT private.university_can_manage_course(organization_id, course_id)));
CREATE POLICY "Course managers can update resources"
ON public.university_course_resources FOR UPDATE TO authenticated
USING ((SELECT private.university_can_manage_course(organization_id, course_id)))
WITH CHECK ((SELECT private.university_can_manage_course(organization_id, course_id)));
CREATE POLICY "Course managers can remove resources"
ON public.university_course_resources FOR DELETE TO authenticated
USING ((SELECT private.university_can_manage_course(organization_id, course_id)));

CREATE POLICY "Course participants can view assessment templates"
ON public.university_assessment_templates FOR SELECT TO authenticated
USING ((SELECT private.university_can_access_course(organization_id, course_id)));
CREATE POLICY "Course managers can create assessment templates"
ON public.university_assessment_templates FOR INSERT TO authenticated
WITH CHECK ((SELECT private.university_can_manage_course(organization_id, course_id)));
CREATE POLICY "Course managers can update assessment templates"
ON public.university_assessment_templates FOR UPDATE TO authenticated
USING ((SELECT private.university_can_manage_course(organization_id, course_id)))
WITH CHECK ((SELECT private.university_can_manage_course(organization_id, course_id)));
CREATE POLICY "Course managers can remove assessment templates"
ON public.university_assessment_templates FOR DELETE TO authenticated
USING ((SELECT private.university_can_manage_course(organization_id, course_id)));

CREATE POLICY "Course participants can view assessment outcome mappings"
ON public.university_assessment_template_outcomes FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.university_assessment_templates t
    WHERE t.id = assessment_template_id
      AND (SELECT private.university_can_access_course(t.organization_id, t.course_id))
  )
);
CREATE POLICY "Course managers can create assessment outcome mappings"
ON public.university_assessment_template_outcomes FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.university_assessment_templates t
    WHERE t.id = assessment_template_id
      AND (SELECT private.university_can_manage_course(t.organization_id, t.course_id))
  )
);
CREATE POLICY "Course managers can update assessment outcome mappings"
ON public.university_assessment_template_outcomes FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.university_assessment_templates t
    WHERE t.id = assessment_template_id
      AND (SELECT private.university_can_manage_course(t.organization_id, t.course_id))
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.university_assessment_templates t
    WHERE t.id = assessment_template_id
      AND (SELECT private.university_can_manage_course(t.organization_id, t.course_id))
  )
);
CREATE POLICY "Course managers can remove assessment outcome mappings"
ON public.university_assessment_template_outcomes FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.university_assessment_templates t
    WHERE t.id = assessment_template_id
      AND (SELECT private.university_can_manage_course(t.organization_id, t.course_id))
  )
);

CREATE POLICY "Academic admins can view installed course packs"
ON public.university_course_pack_releases FOR SELECT TO authenticated
USING (public.is_university_academic_admin((SELECT auth.uid()), organization_id));
