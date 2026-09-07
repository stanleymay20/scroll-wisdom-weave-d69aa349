-- ScrollUniversity student academic lifecycle.
-- Adds programme membership, advising, standing, recognized credit, progression
-- and completion-clearance records without making accreditation claims.

CREATE TABLE IF NOT EXISTS public.university_programme_registrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  programme_id uuid NOT NULL REFERENCES public.university_programmes(id) ON DELETE RESTRICT,
  user_id uuid NOT NULL,
  cohort_id uuid REFERENCES public.university_cohorts(id) ON DELETE SET NULL,
  entry_term_id uuid REFERENCES public.university_academic_terms(id) ON DELETE SET NULL,
  expected_completion_term_id uuid REFERENCES public.university_academic_terms(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'admitted'
    CHECK (status IN ('admitted','active','leave','deferred','completed','withdrawn','dismissed')),
  admission_basis text,
  admitted_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (programme_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.university_advising_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  programme_registration_id uuid NOT NULL REFERENCES public.university_programme_registrations(id) ON DELETE CASCADE,
  advisor_user_id uuid NOT NULL,
  starts_on date NOT NULL DEFAULT CURRENT_DATE,
  ends_on date,
  is_primary boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (programme_registration_id, advisor_user_id)
);

CREATE TABLE IF NOT EXISTS public.university_advising_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  programme_registration_id uuid NOT NULL REFERENCES public.university_programme_registrations(id) ON DELETE CASCADE,
  author_user_id uuid NOT NULL,
  note_type text NOT NULL DEFAULT 'academic'
    CHECK (note_type IN ('academic','progress','wellbeing_referral','career','administrative')),
  note text NOT NULL,
  student_visible boolean NOT NULL DEFAULT false,
  follow_up_on date,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.university_academic_standing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  programme_registration_id uuid NOT NULL REFERENCES public.university_programme_registrations(id) ON DELETE CASCADE,
  term_id uuid NOT NULL REFERENCES public.university_academic_terms(id) ON DELETE RESTRICT,
  standing text NOT NULL DEFAULT 'good'
    CHECK (standing IN ('good','warning','probation','suspension','dismissed','completed')),
  credits_attempted numeric(8,2) NOT NULL DEFAULT 0 CHECK (credits_attempted >= 0),
  credits_earned numeric(8,2) NOT NULL DEFAULT 0 CHECK (credits_earned >= 0),
  average_percentage numeric(6,2) CHECK (average_percentage IS NULL OR (average_percentage >= 0 AND average_percentage <= 100)),
  decision_notes text,
  decided_by uuid,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (programme_registration_id, term_id)
);

CREATE TABLE IF NOT EXISTS public.university_recognized_credits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  programme_registration_id uuid NOT NULL REFERENCES public.university_programme_registrations(id) ON DELETE CASCADE,
  course_id uuid REFERENCES public.university_courses(id) ON DELETE SET NULL,
  external_course_code text,
  external_course_title text NOT NULL,
  source_institution text,
  credits numeric(8,2) NOT NULL CHECK (credits > 0),
  equivalent_percentage numeric(6,2) CHECK (equivalent_percentage IS NULL OR (equivalent_percentage >= 0 AND equivalent_percentage <= 100)),
  decision text NOT NULL DEFAULT 'pending'
    CHECK (decision IN ('pending','approved','rejected','revoked')),
  evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.university_progression_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  programme_registration_id uuid NOT NULL REFERENCES public.university_programme_registrations(id) ON DELETE CASCADE,
  term_id uuid REFERENCES public.university_academic_terms(id) ON DELETE SET NULL,
  decision text NOT NULL
    CHECK (decision IN ('progress','progress_with_conditions','repeat','defer','leave','withdraw','complete','dismiss')),
  rationale text,
  conditions jsonb NOT NULL DEFAULT '[]'::jsonb,
  decided_by uuid NOT NULL,
  decided_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.university_completion_clearances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  programme_registration_id uuid NOT NULL REFERENCES public.university_programme_registrations(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'not_ready'
    CHECK (status IN ('not_ready','eligible','review','approved','held','completed')),
  academic_requirements_met boolean NOT NULL DEFAULT false,
  outstanding_requirements jsonb NOT NULL DEFAULT '[]'::jsonb,
  reviewed_by uuid,
  reviewed_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (programme_registration_id)
);

-- Cross-entity integrity: lifecycle records must remain inside one institution.
CREATE OR REPLACE FUNCTION public.validate_university_programme_registration()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_programme_org uuid;
  v_cohort_org uuid;
  v_entry_org uuid;
  v_completion_org uuid;
BEGIN
  SELECT organization_id INTO v_programme_org
  FROM public.university_programmes WHERE id = NEW.programme_id;
  IF v_programme_org IS NULL OR v_programme_org <> NEW.organization_id THEN
    RAISE EXCEPTION 'Programme registration must reference a programme in the same institution'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.cohort_id IS NOT NULL THEN
    SELECT organization_id INTO v_cohort_org FROM public.university_cohorts WHERE id = NEW.cohort_id;
    IF v_cohort_org IS NULL OR v_cohort_org <> NEW.organization_id THEN
      RAISE EXCEPTION 'Programme registration cohort must belong to the same institution'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW.entry_term_id IS NOT NULL THEN
    SELECT organization_id INTO v_entry_org FROM public.university_academic_terms WHERE id = NEW.entry_term_id;
    IF v_entry_org IS NULL OR v_entry_org <> NEW.organization_id THEN
      RAISE EXCEPTION 'Entry term must belong to the same institution' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NEW.expected_completion_term_id IS NOT NULL THEN
    SELECT organization_id INTO v_completion_org FROM public.university_academic_terms WHERE id = NEW.expected_completion_term_id;
    IF v_completion_org IS NULL OR v_completion_org <> NEW.organization_id THEN
      RAISE EXCEPTION 'Completion term must belong to the same institution' USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.university_people p
    WHERE p.organization_id = NEW.organization_id
      AND p.user_id = NEW.user_id
      AND p.university_role = 'student'
      AND p.status IN ('invited','active','alumni')
  ) THEN
    RAISE EXCEPTION 'Programme registration requires a university student identity'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_university_programme_registration_trigger
BEFORE INSERT OR UPDATE ON public.university_programme_registrations
FOR EACH ROW EXECUTE FUNCTION public.validate_university_programme_registration();

CREATE OR REPLACE FUNCTION public.validate_university_advisor_assignment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_registration_org uuid;
BEGIN
  SELECT organization_id INTO v_registration_org
  FROM public.university_programme_registrations
  WHERE id = NEW.programme_registration_id;

  IF v_registration_org IS NULL OR v_registration_org <> NEW.organization_id THEN
    RAISE EXCEPTION 'Advising assignment registration must belong to the same institution'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.university_people p
    WHERE p.organization_id = NEW.organization_id
      AND p.user_id = NEW.advisor_user_id
      AND p.status = 'active'
      AND p.university_role IN ('advisor','lecturer','programme_lead','dean','registrar','chancellor')
  ) THEN
    RAISE EXCEPTION 'Advisor must be active academic staff in the institution'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_university_advisor_assignment_trigger
BEFORE INSERT OR UPDATE ON public.university_advising_assignments
FOR EACH ROW EXECUTE FUNCTION public.validate_university_advisor_assignment();

-- Reporting: programme progress/degree-audit-style view. This reports academic
-- completion against the institution-defined curriculum; it does not confer an
-- accredited degree or external legal status.
CREATE OR REPLACE VIEW public.university_programme_progress_v
WITH (security_invoker = true)
AS
WITH curriculum AS (
  SELECT
    pc.organization_id,
    pc.programme_id,
    count(*) FILTER (WHERE pc.is_required) AS required_courses,
    COALESCE(sum(COALESCE(pc.credits_override, c.credits)) FILTER (WHERE pc.is_required), 0) AS required_credits
  FROM public.university_programme_courses pc
  JOIN public.university_courses c ON c.id = pc.course_id
  GROUP BY pc.organization_id, pc.programme_id
),
completed AS (
  SELECT
    r.id AS programme_registration_id,
    count(DISTINCT pc.course_id) FILTER (
      WHERE pc.is_required AND e.status = 'completed'
    ) AS required_courses_completed,
    COALESCE(sum(DISTINCT CASE
      WHEN pc.is_required AND e.status = 'completed' THEN COALESCE(pc.credits_override, c.credits)
      ELSE 0
    END), 0) AS institutional_credits_earned
  FROM public.university_programme_registrations r
  LEFT JOIN public.university_programme_courses pc ON pc.programme_id = r.programme_id
  LEFT JOIN public.university_courses c ON c.id = pc.course_id
  LEFT JOIN public.university_course_offerings o ON o.course_id = pc.course_id
  LEFT JOIN public.university_enrolments e
    ON e.offering_id = o.id
   AND e.user_id = r.user_id
   AND e.status = 'completed'
  GROUP BY r.id
),
recognized AS (
  SELECT
    programme_registration_id,
    COALESCE(sum(credits) FILTER (WHERE decision = 'approved'), 0) AS recognized_credits
  FROM public.university_recognized_credits
  GROUP BY programme_registration_id
)
SELECT
  r.organization_id,
  r.id AS programme_registration_id,
  r.user_id,
  p.student_number,
  p.display_name,
  r.programme_id,
  pr.code AS programme_code,
  pr.name AS programme_name,
  r.status AS programme_status,
  COALESCE(cu.required_courses, 0) AS required_courses,
  COALESCE(co.required_courses_completed, 0) AS required_courses_completed,
  COALESCE(cu.required_credits, pr.total_credits, 0) AS required_credits,
  COALESCE(co.institutional_credits_earned, 0) AS institutional_credits_earned,
  COALESCE(rc.recognized_credits, 0) AS recognized_credits,
  COALESCE(co.institutional_credits_earned, 0) + COALESCE(rc.recognized_credits, 0) AS total_recognized_progress_credits,
  CASE
    WHEN COALESCE(cu.required_courses, 0) = COALESCE(co.required_courses_completed, 0)
     AND COALESCE(co.institutional_credits_earned, 0) + COALESCE(rc.recognized_credits, 0)
       >= COALESCE(cu.required_credits, pr.total_credits, 0)
    THEN true ELSE false
  END AS academic_requirements_met
FROM public.university_programme_registrations r
JOIN public.university_programmes pr ON pr.id = r.programme_id
JOIN public.university_people p
  ON p.organization_id = r.organization_id AND p.user_id = r.user_id
LEFT JOIN curriculum cu ON cu.programme_id = r.programme_id
LEFT JOIN completed co ON co.programme_registration_id = r.id
LEFT JOIN recognized rc ON rc.programme_registration_id = r.id;

-- Performance indexes.
CREATE INDEX IF NOT EXISTS idx_university_programme_registrations_user
  ON public.university_programme_registrations(organization_id, user_id, status);
CREATE INDEX IF NOT EXISTS idx_university_programme_registrations_programme
  ON public.university_programme_registrations(programme_id, status);
CREATE INDEX IF NOT EXISTS idx_university_advising_assignments_advisor
  ON public.university_advising_assignments(advisor_user_id, starts_on, ends_on);
CREATE INDEX IF NOT EXISTS idx_university_standing_registration_term
  ON public.university_academic_standing(programme_registration_id, term_id);
CREATE INDEX IF NOT EXISTS idx_university_recognized_credits_registration
  ON public.university_recognized_credits(programme_registration_id, decision);
CREATE INDEX IF NOT EXISTS idx_university_progression_registration
  ON public.university_progression_decisions(programme_registration_id, decided_at DESC);

-- RLS and grants.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'university_programme_registrations','university_advising_assignments','university_advising_notes',
    'university_academic_standing','university_recognized_credits','university_progression_decisions',
    'university_completion_clearances'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', t);
  END LOOP;
END $$;

REVOKE ALL ON TABLE public.university_programme_progress_v FROM anon, authenticated;
GRANT SELECT ON TABLE public.university_programme_progress_v TO authenticated;
GRANT ALL ON TABLE public.university_programme_progress_v TO service_role;

-- Programme registrations: learner sees own; academic admins and assigned
-- advisors see records they are responsible for.
CREATE POLICY "Students can view own programme registration"
ON public.university_programme_registrations FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()));
CREATE POLICY "Academic admins can manage programme registrations"
ON public.university_programme_registrations FOR ALL TO authenticated
USING (public.is_university_academic_admin((SELECT auth.uid()), organization_id))
WITH CHECK (public.is_university_academic_admin((SELECT auth.uid()), organization_id));
CREATE POLICY "Assigned advisors can view programme registrations"
ON public.university_programme_registrations FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.university_advising_assignments a
  WHERE a.programme_registration_id = university_programme_registrations.id
    AND a.advisor_user_id = (SELECT auth.uid())
    AND (a.ends_on IS NULL OR a.ends_on >= CURRENT_DATE)
));

CREATE POLICY "Students can view own advisor assignment"
ON public.university_advising_assignments FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.university_programme_registrations r
  WHERE r.id = university_advising_assignments.programme_registration_id
    AND r.user_id = (SELECT auth.uid())
));
CREATE POLICY "Academic admins can manage advising assignments"
ON public.university_advising_assignments FOR ALL TO authenticated
USING (public.is_university_academic_admin((SELECT auth.uid()), organization_id))
WITH CHECK (public.is_university_academic_admin((SELECT auth.uid()), organization_id));
CREATE POLICY "Advisors can view own advising assignments"
ON public.university_advising_assignments FOR SELECT TO authenticated
USING (advisor_user_id = (SELECT auth.uid()));

CREATE POLICY "Students can view released advising notes"
ON public.university_advising_notes FOR SELECT TO authenticated
USING (
  student_visible
  AND EXISTS (
    SELECT 1 FROM public.university_programme_registrations r
    WHERE r.id = university_advising_notes.programme_registration_id
      AND r.user_id = (SELECT auth.uid())
  )
);
CREATE POLICY "Assigned advisors can manage advising notes"
ON public.university_advising_notes FOR ALL TO authenticated
USING (
  author_user_id = (SELECT auth.uid())
  OR public.is_university_academic_admin((SELECT auth.uid()), organization_id)
)
WITH CHECK (
  (author_user_id = (SELECT auth.uid()) AND EXISTS (
    SELECT 1 FROM public.university_advising_assignments a
    WHERE a.programme_registration_id = university_advising_notes.programme_registration_id
      AND a.advisor_user_id = (SELECT auth.uid())
      AND (a.ends_on IS NULL OR a.ends_on >= CURRENT_DATE)
  ))
  OR public.is_university_academic_admin((SELECT auth.uid()), organization_id)
);

CREATE POLICY "Students can view own academic standing"
ON public.university_academic_standing FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.university_programme_registrations r
  WHERE r.id = university_academic_standing.programme_registration_id
    AND r.user_id = (SELECT auth.uid())
));
CREATE POLICY "Academic admins can manage academic standing"
ON public.university_academic_standing FOR ALL TO authenticated
USING (public.is_university_academic_admin((SELECT auth.uid()), organization_id))
WITH CHECK (public.is_university_academic_admin((SELECT auth.uid()), organization_id));
CREATE POLICY "Assigned advisors can view academic standing"
ON public.university_academic_standing FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.university_advising_assignments a
  WHERE a.programme_registration_id = university_academic_standing.programme_registration_id
    AND a.advisor_user_id = (SELECT auth.uid())
    AND (a.ends_on IS NULL OR a.ends_on >= CURRENT_DATE)
));

CREATE POLICY "Students can view own recognized credit"
ON public.university_recognized_credits FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.university_programme_registrations r
  WHERE r.id = university_recognized_credits.programme_registration_id
    AND r.user_id = (SELECT auth.uid())
));
CREATE POLICY "Academic admins can manage recognized credit"
ON public.university_recognized_credits FOR ALL TO authenticated
USING (public.is_university_academic_admin((SELECT auth.uid()), organization_id))
WITH CHECK (public.is_university_academic_admin((SELECT auth.uid()), organization_id));

CREATE POLICY "Students can view own progression decisions"
ON public.university_progression_decisions FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.university_programme_registrations r
  WHERE r.id = university_progression_decisions.programme_registration_id
    AND r.user_id = (SELECT auth.uid())
));
CREATE POLICY "Academic admins can manage progression decisions"
ON public.university_progression_decisions FOR ALL TO authenticated
USING (public.is_university_academic_admin((SELECT auth.uid()), organization_id))
WITH CHECK (
  public.is_university_academic_admin((SELECT auth.uid()), organization_id)
  AND decided_by = (SELECT auth.uid())
);

CREATE POLICY "Students can view own completion clearance"
ON public.university_completion_clearances FOR SELECT TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.university_programme_registrations r
  WHERE r.id = university_completion_clearances.programme_registration_id
    AND r.user_id = (SELECT auth.uid())
));
CREATE POLICY "Academic admins can manage completion clearance"
ON public.university_completion_clearances FOR ALL TO authenticated
USING (public.is_university_academic_admin((SELECT auth.uid()), organization_id))
WITH CHECK (public.is_university_academic_admin((SELECT auth.uid()), organization_id));

-- updated_at consistency.
CREATE TRIGGER update_university_programme_registrations_updated_at
BEFORE UPDATE ON public.university_programme_registrations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_university_advising_notes_updated_at
BEFORE UPDATE ON public.university_advising_notes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_university_academic_standing_updated_at
BEFORE UPDATE ON public.university_academic_standing
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_university_recognized_credits_updated_at
BEFORE UPDATE ON public.university_recognized_credits
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_university_completion_clearances_updated_at
BEFORE UPDATE ON public.university_completion_clearances
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
