-- ScrollUniversity academic integrity hardening.
-- Enforce concurrent seat capacity, submission windows, grade-weight integrity,
-- grading-scheme-aware completion, outcome evidence, and institution verification.

-- ---------------------------------------------------------------------------
-- Capacity must remain correct under concurrent enrolment writes.
-- Lock the offering row while the enrolled-seat count is checked.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_university_offering_capacity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_capacity integer;
  v_enrolled integer;
BEGIN
  IF NEW.status <> 'enrolled' THEN
    RETURN NEW;
  END IF;

  SELECT capacity INTO v_capacity
  FROM public.university_course_offerings
  WHERE id = NEW.offering_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Course offering not found' USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF v_capacity IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO v_enrolled
  FROM public.university_enrolments
  WHERE offering_id = NEW.offering_id
    AND status = 'enrolled'
    AND (TG_OP = 'INSERT' OR id <> NEW.id);

  IF v_enrolled >= v_capacity THEN
    RAISE EXCEPTION 'Course offering capacity of % has been reached', v_capacity
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Assignment submission windows are server-enforced. Clients cannot bypass
-- opens_at, closes_at or allow_late by manipulating their local clock/state.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_university_submission_window()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_assignment public.university_assignments;
BEGIN
  SELECT * INTO v_assignment
  FROM public.university_assignments
  WHERE id = NEW.assignment_id;

  IF v_assignment.id IS NULL THEN
    RAISE EXCEPTION 'Assignment not found' USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NEW.organization_id <> v_assignment.organization_id THEN
    RAISE EXCEPTION 'Submission organization does not match assignment'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status IN ('submitted', 'late') THEN
    IF NOT v_assignment.published THEN
      RAISE EXCEPTION 'Assignment is not published' USING ERRCODE = 'check_violation';
    END IF;

    IF v_assignment.opens_at IS NOT NULL AND now() < v_assignment.opens_at THEN
      RAISE EXCEPTION 'Assignment submission window has not opened'
        USING ERRCODE = 'check_violation';
    END IF;

    IF v_assignment.closes_at IS NOT NULL AND now() > v_assignment.closes_at THEN
      RAISE EXCEPTION 'Assignment submission window is closed'
        USING ERRCODE = 'check_violation';
    END IF;

    IF v_assignment.due_at IS NOT NULL AND now() > v_assignment.due_at THEN
      IF NOT v_assignment.allow_late THEN
        RAISE EXCEPTION 'Late submissions are not permitted'
          USING ERRCODE = 'check_violation';
      END IF;
      NEW.status := 'late';
    ELSE
      NEW.status := 'submitted';
    END IF;

    NEW.submitted_at := COALESCE(NEW.submitted_at, now());
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_university_submission_window_trigger
ON public.university_submissions;
CREATE TRIGGER validate_university_submission_window_trigger
BEFORE INSERT OR UPDATE OF assignment_id, organization_id, status, submitted_at
ON public.university_submissions
FOR EACH ROW EXECUTE FUNCTION public.validate_university_submission_window();

-- ---------------------------------------------------------------------------
-- Grade weights may not exceed 100% for an offering.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_university_grade_weight_total()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_other_weight numeric(8,3);
BEGIN
  SELECT COALESCE(sum(weight_percent), 0)
  INTO v_other_weight
  FROM public.university_grade_items
  WHERE offering_id = NEW.offering_id
    AND id <> NEW.id;

  IF v_other_weight + NEW.weight_percent > 100.000 THEN
    RAISE EXCEPTION 'Grade item weights for an offering may not exceed 100%%'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS university_grade_weight_guard ON public.university_grade_items;
CREATE TRIGGER university_grade_weight_guard
BEFORE INSERT OR UPDATE OF offering_id, weight_percent ON public.university_grade_items
FOR EACH ROW EXECUTE FUNCTION public.enforce_university_grade_weight_total();

-- ---------------------------------------------------------------------------
-- Finalisation respects each institution's grading scheme and refuses to
-- finalize an incomplete gradebook. Missing grades are explicit zeroes;
-- excused items are removed from the denominator.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.finalize_university_enrolment(
  _enrolment_id uuid,
  _grade_label text DEFAULT NULL
)
RETURNS public.university_enrolments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_enrolment public.university_enrolments;
  v_course public.university_courses;
  v_scheme jsonb;
  v_pass_mark numeric(6,2) := 50;
  v_weight_total numeric(8,3);
  v_effective_weight numeric(8,3);
  v_unresolved integer;
  v_percentage numeric(6,2);
  v_derived_label text;
BEGIN
  SELECT * INTO v_enrolment
  FROM public.university_enrolments
  WHERE id = _enrolment_id;

  IF v_enrolment.id IS NULL THEN
    RAISE EXCEPTION 'Enrolment not found' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT public.manages_university_offering((SELECT auth.uid()), v_enrolment.offering_id) THEN
    RAISE EXCEPTION 'Not authorized to finalize this enrolment'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT c.* INTO v_course
  FROM public.university_course_offerings o
  JOIN public.university_courses c ON c.id = o.course_id
  WHERE o.id = v_enrolment.offering_id;

  SELECT grading_scheme INTO v_scheme
  FROM public.university_settings
  WHERE organization_id = v_enrolment.organization_id;

  IF v_scheme ? 'pass_mark' THEN
    v_pass_mark := (v_scheme ->> 'pass_mark')::numeric;
  END IF;

  SELECT COALESCE(sum(gi.weight_percent), 0)
  INTO v_weight_total
  FROM public.university_grade_items gi
  WHERE gi.offering_id = v_enrolment.offering_id
    AND gi.published;

  IF abs(v_weight_total - 100.000) > 0.001 THEN
    RAISE EXCEPTION 'Published grade item weights must total 100%% before finalisation; current total is %', v_weight_total
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*)
  INTO v_unresolved
  FROM public.university_grade_items gi
  LEFT JOIN public.university_grades g
    ON g.grade_item_id = gi.id
   AND g.user_id = v_enrolment.user_id
  WHERE gi.offering_id = v_enrolment.offering_id
    AND gi.published
    AND (g.id IS NULL OR g.status IN ('draft','incomplete'));

  IF v_unresolved > 0 THEN
    RAISE EXCEPTION 'Cannot finalize: % published grade item(s) remain unresolved', v_unresolved
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT
    NULLIF(sum(CASE WHEN g.status = 'excused' THEN 0 ELSE gi.weight_percent END), 0),
    round(
      sum(
        CASE
          WHEN g.status = 'published' THEN COALESCE(g.percentage, 0) * gi.weight_percent
          WHEN g.status = 'missing' THEN 0
          ELSE 0
        END
      )
      / NULLIF(sum(CASE WHEN g.status = 'excused' THEN 0 ELSE gi.weight_percent END), 0),
      2
    )
  INTO v_effective_weight, v_percentage
  FROM public.university_grade_items gi
  LEFT JOIN public.university_grades g
    ON g.grade_item_id = gi.id
   AND g.user_id = v_enrolment.user_id
  WHERE gi.offering_id = v_enrolment.offering_id
    AND gi.published;

  IF v_effective_weight IS NULL OR v_percentage IS NULL THEN
    RAISE EXCEPTION 'Cannot finalize without assessable published grade items'
      USING ERRCODE = 'check_violation';
  END IF;

  IF _grade_label IS NOT NULL THEN
    v_derived_label := _grade_label;
  ELSIF jsonb_typeof(v_scheme -> 'bands') = 'array' THEN
    SELECT band ->> 'label'
    INTO v_derived_label
    FROM jsonb_array_elements(v_scheme -> 'bands') AS band
    WHERE v_percentage >= (band ->> 'min')::numeric
    ORDER BY (band ->> 'min')::numeric DESC
    LIMIT 1;
  END IF;

  UPDATE public.university_enrolments
  SET
    final_percentage = v_percentage,
    final_grade = v_derived_label,
    credits_earned = CASE WHEN v_percentage >= v_pass_mark THEN v_course.credits ELSE 0 END,
    status = CASE WHEN v_percentage >= v_pass_mark THEN 'completed' ELSE 'failed' END,
    completed_at = now()
  WHERE id = _enrolment_id
  RETURNING * INTO v_enrolment;

  RETURN v_enrolment;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_university_enrolment(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_university_enrolment(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- Outcome evidence: programme outcomes map to course outcomes in the existing
-- mapping table; course outcomes now map to taught content and assessment.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.university_outcome_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  outcome_id uuid NOT NULL REFERENCES public.university_learning_outcomes(id) ON DELETE CASCADE,
  module_id uuid REFERENCES public.university_modules(id) ON DELETE CASCADE,
  lesson_id uuid REFERENCES public.university_lessons(id) ON DELETE CASCADE,
  assignment_id uuid REFERENCES public.university_assignments(id) ON DELETE CASCADE,
  alignment_level text NOT NULL DEFAULT 'reinforced'
    CHECK (alignment_level IN ('introduced','reinforced','mastered','assessed')),
  contribution_weight numeric(6,3) NOT NULL DEFAULT 1 CHECK (contribution_weight > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(module_id, lesson_id, assignment_id) = 1)
);

CREATE INDEX IF NOT EXISTS idx_university_outcome_evidence_outcome
  ON public.university_outcome_evidence(outcome_id);
CREATE INDEX IF NOT EXISTS idx_university_outcome_evidence_assignment
  ON public.university_outcome_evidence(assignment_id) WHERE assignment_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.validate_university_outcome_evidence()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_outcome_course uuid;
  v_outcome_org uuid;
  v_target_course uuid;
  v_target_org uuid;
BEGIN
  SELECT course_id, organization_id
  INTO v_outcome_course, v_outcome_org
  FROM public.university_learning_outcomes
  WHERE id = NEW.outcome_id;

  IF v_outcome_course IS NULL THEN
    RAISE EXCEPTION 'Outcome evidence must reference a course-level learning outcome'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.module_id IS NOT NULL THEN
    SELECT course_id, organization_id
    INTO v_target_course, v_target_org
    FROM public.university_modules
    WHERE id = NEW.module_id;
  ELSIF NEW.lesson_id IS NOT NULL THEN
    SELECT m.course_id, l.organization_id
    INTO v_target_course, v_target_org
    FROM public.university_lessons l
    JOIN public.university_modules m ON m.id = l.module_id
    WHERE l.id = NEW.lesson_id;
  ELSE
    SELECT o.course_id, a.organization_id
    INTO v_target_course, v_target_org
    FROM public.university_assignments a
    JOIN public.university_course_offerings o ON o.id = a.offering_id
    WHERE a.id = NEW.assignment_id;
  END IF;

  IF v_target_course IS NULL OR v_target_org IS NULL THEN
    RAISE EXCEPTION 'Outcome evidence target not found' USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF v_outcome_course <> v_target_course OR v_outcome_org <> v_target_org OR NEW.organization_id <> v_outcome_org THEN
    RAISE EXCEPTION 'Outcome evidence must remain inside the same institution and course'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_university_outcome_evidence_trigger
ON public.university_outcome_evidence;
CREATE TRIGGER validate_university_outcome_evidence_trigger
BEFORE INSERT OR UPDATE ON public.university_outcome_evidence
FOR EACH ROW EXECUTE FUNCTION public.validate_university_outcome_evidence();

ALTER TABLE public.university_outcome_evidence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.university_outcome_evidence FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.university_outcome_evidence TO authenticated;
GRANT ALL ON TABLE public.university_outcome_evidence TO service_role;

CREATE POLICY "University members can view outcome evidence"
ON public.university_outcome_evidence FOR SELECT TO authenticated
USING (public.is_org_member((SELECT auth.uid()), organization_id));

CREATE POLICY "Academic staff can create outcome evidence"
ON public.university_outcome_evidence FOR INSERT TO authenticated
WITH CHECK (
  public.is_university_academic_admin((SELECT auth.uid()), organization_id)
  OR EXISTS (
    SELECT 1
    FROM public.university_learning_outcomes lo
    JOIN public.university_course_offerings o ON o.course_id = lo.course_id
    WHERE lo.id = university_outcome_evidence.outcome_id
      AND public.manages_university_offering((SELECT auth.uid()), o.id)
  )
);

CREATE POLICY "Academic staff can update outcome evidence"
ON public.university_outcome_evidence FOR UPDATE TO authenticated
USING (
  public.is_university_academic_admin((SELECT auth.uid()), organization_id)
  OR EXISTS (
    SELECT 1
    FROM public.university_learning_outcomes lo
    JOIN public.university_course_offerings o ON o.course_id = lo.course_id
    WHERE lo.id = university_outcome_evidence.outcome_id
      AND public.manages_university_offering((SELECT auth.uid()), o.id)
  )
)
WITH CHECK (
  public.is_university_academic_admin((SELECT auth.uid()), organization_id)
  OR EXISTS (
    SELECT 1
    FROM public.university_learning_outcomes lo
    JOIN public.university_course_offerings o ON o.course_id = lo.course_id
    WHERE lo.id = university_outcome_evidence.outcome_id
      AND public.manages_university_offering((SELECT auth.uid()), o.id)
  )
);

CREATE POLICY "Academic staff can delete outcome evidence"
ON public.university_outcome_evidence FOR DELETE TO authenticated
USING (
  public.is_university_academic_admin((SELECT auth.uid()), organization_id)
  OR EXISTS (
    SELECT 1
    FROM public.university_learning_outcomes lo
    JOIN public.university_course_offerings o ON o.course_id = lo.course_id
    WHERE lo.id = university_outcome_evidence.outcome_id
      AND public.manages_university_offering((SELECT auth.uid()), o.id)
  )
);

-- ---------------------------------------------------------------------------
-- Institution verification. University administrators may submit/update the
-- evidence while pending, but only service-side trusted processes can change
-- the verification decision fields.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.university_institution_verification (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  legal_name text NOT NULL,
  website_url text,
  primary_domain text,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','verified','rejected','suspended')),
  requested_by uuid NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_notes text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.university_institution_verification ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.university_institution_verification FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.university_institution_verification TO authenticated;
GRANT UPDATE (legal_name, website_url, primary_domain, evidence, requested_at, updated_at)
  ON public.university_institution_verification TO authenticated;
GRANT ALL ON TABLE public.university_institution_verification TO service_role;

CREATE POLICY "Academic admins can view institution verification"
ON public.university_institution_verification FOR SELECT TO authenticated
USING (public.is_university_academic_admin((SELECT auth.uid()), organization_id));

CREATE POLICY "Organization admins can request institution verification"
ON public.university_institution_verification FOR INSERT TO authenticated
WITH CHECK (
  public.is_org_admin((SELECT auth.uid()), organization_id)
  AND requested_by = (SELECT auth.uid())
  AND status = 'pending'
  AND reviewed_by IS NULL
  AND reviewed_at IS NULL
);

CREATE POLICY "Organization admins can update pending verification evidence"
ON public.university_institution_verification FOR UPDATE TO authenticated
USING (
  public.is_org_admin((SELECT auth.uid()), organization_id)
  AND status = 'pending'
)
WITH CHECK (
  public.is_org_admin((SELECT auth.uid()), organization_id)
  AND status = 'pending'
  AND reviewed_by IS NULL
  AND reviewed_at IS NULL
);

CREATE POLICY "Organization admins can withdraw verification request"
ON public.university_institution_verification FOR DELETE TO authenticated
USING (public.is_org_admin((SELECT auth.uid()), organization_id) AND status = 'pending');

DROP TRIGGER IF EXISTS update_university_institution_verification_updated_at
ON public.university_institution_verification;
CREATE TRIGGER update_university_institution_verification_updated_at
BEFORE UPDATE ON public.university_institution_verification
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Extra indexes used by university dashboards at 1,000+ learner scale.
CREATE INDEX IF NOT EXISTS idx_university_grade_items_offering_published
  ON public.university_grade_items(offering_id, published);
CREATE INDEX IF NOT EXISTS idx_university_grades_item_user_status
  ON public.university_grades(grade_item_id, user_id, status);
CREATE INDEX IF NOT EXISTS idx_university_assignments_offering_published_due
  ON public.university_assignments(offering_id, published, due_at);
CREATE INDEX IF NOT EXISTS idx_university_people_org_status_role
  ON public.university_people(organization_id, status, university_role);
