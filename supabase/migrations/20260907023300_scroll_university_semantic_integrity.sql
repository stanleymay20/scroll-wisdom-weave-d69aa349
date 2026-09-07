-- ScrollUniversity semantic and academic-integrity constraints.
-- These checks make important relationships and provenance server-authoritative
-- rather than relying on UI behavior or RLS alone.

-- ---------------------------------------------------------------------------
-- Student submissions: learners may edit their own working state and submit it,
-- but cannot manufacture grading/return states, integrity metadata, or a past
-- submission timestamp.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_university_student_submission()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
BEGIN
  IF v_uid IS NULL OR NEW.user_id <> v_uid THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.integrity_metadata <> '{}'::jsonb THEN
      RAISE EXCEPTION 'Learners cannot set academic integrity metadata'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NEW.status NOT IN ('draft','submitted','late') THEN
      RAISE EXCEPTION 'Learners cannot create a submission in status %', NEW.status
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    IF NEW.status = 'draft' THEN
      NEW.submitted_at := NULL;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.integrity_metadata IS DISTINCT FROM OLD.integrity_metadata THEN
    RAISE EXCEPTION 'Learners cannot modify academic integrity metadata'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.status <> OLD.status AND NEW.status NOT IN ('submitted','late') THEN
    RAISE EXCEPTION 'Learners cannot transition a submission from % to %', OLD.status, NEW.status
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_university_student_submission() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER a_university_submission_student_guard
BEFORE INSERT OR UPDATE ON public.university_submissions
FOR EACH ROW EXECUTE FUNCTION public.guard_university_student_submission();

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

    -- Submission evidence is server time, never a client-provided timestamp.
    NEW.submitted_at := now();
  END IF;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Academic staff and learner identities referenced by teaching/enrolment rows.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_university_teaching_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.university_people p
    WHERE p.organization_id = NEW.organization_id
      AND p.user_id = NEW.user_id
      AND p.status = 'active'
      AND p.university_role IN (
        'chancellor','registrar','dean','programme_lead','lecturer',
        'teaching_assistant','advisor','auditor'
      )
  ) THEN
    RAISE EXCEPTION 'Teaching assignment requires an active university staff identity'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER university_teaching_identity_guard
BEFORE INSERT OR UPDATE OF organization_id, user_id ON public.university_teaching_assignments
FOR EACH ROW EXECUTE FUNCTION public.validate_university_teaching_identity();

CREATE OR REPLACE FUNCTION public.validate_university_student_identity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.university_people p
    WHERE p.organization_id = NEW.organization_id
      AND p.user_id = NEW.user_id
      AND p.university_role = 'student'
      AND p.status IN ('invited','active','alumni')
  ) THEN
    RAISE EXCEPTION '% requires a student identity in the same institution', TG_TABLE_NAME
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER university_enrolment_student_guard
BEFORE INSERT OR UPDATE OF organization_id, user_id ON public.university_enrolments
FOR EACH ROW EXECUTE FUNCTION public.validate_university_student_identity();

CREATE TRIGGER university_cohort_member_student_guard
BEFORE INSERT OR UPDATE OF organization_id, user_id ON public.university_cohort_members
FOR EACH ROW EXECUTE FUNCTION public.validate_university_student_identity();

-- ---------------------------------------------------------------------------
-- Course/assessment links must represent the same taught course/offering.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.validate_university_assignment_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_offering_course uuid;
  v_module_course uuid;
BEGIN
  SELECT course_id INTO v_offering_course
  FROM public.university_course_offerings
  WHERE id = NEW.offering_id;

  IF NEW.module_id IS NOT NULL THEN
    SELECT course_id INTO v_module_course
    FROM public.university_modules
    WHERE id = NEW.module_id;
    IF v_module_course IS NULL OR v_module_course <> v_offering_course THEN
      RAISE EXCEPTION 'Assignment module must belong to the offering course'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER university_assignment_scope_guard
BEFORE INSERT OR UPDATE OF offering_id, module_id ON public.university_assignments
FOR EACH ROW EXECUTE FUNCTION public.validate_university_assignment_scope();

CREATE OR REPLACE FUNCTION public.validate_university_grade_item_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assignment_offering uuid;
BEGIN
  IF NEW.assignment_id IS NOT NULL THEN
    SELECT offering_id INTO v_assignment_offering
    FROM public.university_assignments
    WHERE id = NEW.assignment_id;
    IF v_assignment_offering IS NULL OR v_assignment_offering <> NEW.offering_id THEN
      RAISE EXCEPTION 'Grade item assignment must belong to the same offering'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER university_grade_item_scope_guard
BEFORE INSERT OR UPDATE OF offering_id, assignment_id ON public.university_grade_items
FOR EACH ROW EXECUTE FUNCTION public.validate_university_grade_item_scope();

CREATE OR REPLACE FUNCTION public.validate_university_grade_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_offering_id uuid;
  v_assignment_id uuid;
  v_submission_user uuid;
  v_submission_assignment uuid;
BEGIN
  SELECT offering_id, assignment_id
  INTO v_offering_id, v_assignment_id
  FROM public.university_grade_items
  WHERE id = NEW.grade_item_id;

  IF v_offering_id IS NULL THEN
    RAISE EXCEPTION 'Grade item not found' USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.university_enrolments e
    WHERE e.offering_id = v_offering_id AND e.user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'Grade user must have an enrolment in the grade item offering'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.submission_id IS NOT NULL THEN
    SELECT user_id, assignment_id
    INTO v_submission_user, v_submission_assignment
    FROM public.university_submissions
    WHERE id = NEW.submission_id;

    IF v_submission_user IS NULL OR v_submission_user <> NEW.user_id THEN
      RAISE EXCEPTION 'Grade submission must belong to the graded learner'
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_assignment_id IS NULL OR v_submission_assignment <> v_assignment_id THEN
      RAISE EXCEPTION 'Grade submission must match the grade item assignment'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER university_grade_scope_guard
BEFORE INSERT OR UPDATE OF grade_item_id, user_id, submission_id ON public.university_grades
FOR EACH ROW EXECUTE FUNCTION public.validate_university_grade_scope();

-- Grade provenance is server-controlled for authenticated graders. Service-role
-- imports may retain explicit historical provenance because auth.uid() is null.
CREATE OR REPLACE FUNCTION public.stamp_university_grade_provenance()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
BEGIN
  IF v_uid IS NOT NULL THEN
    NEW.graded_by := v_uid;
    NEW.graded_at := now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER university_grade_provenance_guard
BEFORE INSERT OR UPDATE OF points, percentage, grade_label, feedback, status, submission_id
ON public.university_grades
FOR EACH ROW EXECUTE FUNCTION public.stamp_university_grade_provenance();

-- Attendance can only be recorded for a learner who belongs to the session's
-- offering, while preserving historical rows after course completion.
CREATE OR REPLACE FUNCTION public.validate_university_attendance_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_offering_id uuid;
BEGIN
  SELECT offering_id INTO v_offering_id
  FROM public.university_attendance_sessions
  WHERE id = NEW.session_id;

  IF v_offering_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.university_enrolments e
    WHERE e.offering_id = v_offering_id AND e.user_id = NEW.user_id
  ) THEN
    RAISE EXCEPTION 'Attendance user must have an enrolment in the session offering'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER university_attendance_scope_guard
BEFORE INSERT OR UPDATE OF session_id, user_id ON public.university_attendance_records
FOR EACH ROW EXECUTE FUNCTION public.validate_university_attendance_scope();

-- Outcome mappings must connect a programme outcome to a course outcome whose
-- course actually belongs to that programme's curriculum.
CREATE OR REPLACE FUNCTION public.validate_university_outcome_mapping_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_programme_id uuid;
  v_programme_course uuid;
  v_course_id uuid;
  v_course_programme uuid;
BEGIN
  SELECT programme_id, course_id
  INTO v_programme_id, v_programme_course
  FROM public.university_learning_outcomes
  WHERE id = NEW.programme_outcome_id;

  SELECT course_id, programme_id
  INTO v_course_id, v_course_programme
  FROM public.university_learning_outcomes
  WHERE id = NEW.course_outcome_id;

  IF v_programme_id IS NULL OR v_programme_course IS NOT NULL THEN
    RAISE EXCEPTION 'programme_outcome_id must reference a programme-level outcome'
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_course_id IS NULL OR v_course_programme IS NOT NULL THEN
    RAISE EXCEPTION 'course_outcome_id must reference a course-level outcome'
      USING ERRCODE = 'check_violation';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.university_programme_courses pc
    WHERE pc.programme_id = v_programme_id AND pc.course_id = v_course_id
  ) THEN
    RAISE EXCEPTION 'Mapped course outcome must belong to the programme curriculum'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER university_outcome_mapping_scope_guard
BEFORE INSERT OR UPDATE OF programme_outcome_id, course_outcome_id
ON public.university_outcome_mappings
FOR EACH ROW EXECUTE FUNCTION public.validate_university_outcome_mapping_scope();

-- A recognized-credit course equivalence, when supplied, must refer to a
-- course in the learner's registered programme.
CREATE OR REPLACE FUNCTION public.validate_university_recognized_credit_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_programme_id uuid;
BEGIN
  IF NEW.course_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT programme_id INTO v_programme_id
  FROM public.university_programme_registrations
  WHERE id = NEW.programme_registration_id;

  IF v_programme_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.university_programme_courses pc
    WHERE pc.programme_id = v_programme_id AND pc.course_id = NEW.course_id
  ) THEN
    RAISE EXCEPTION 'Recognized-credit course must belong to the registered programme curriculum'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER university_recognized_credit_scope_guard
BEFORE INSERT OR UPDATE OF programme_registration_id, course_id
ON public.university_recognized_credits
FOR EACH ROW EXECUTE FUNCTION public.validate_university_recognized_credit_scope();

-- ---------------------------------------------------------------------------
-- Immutable authorship for first-party authored records.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_university_creator_reassignment()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.created_by IS DISTINCT FROM OLD.created_by THEN
    RAISE EXCEPTION 'created_by is immutable' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER university_assignment_creator_guard
BEFORE UPDATE OF created_by ON public.university_assignments
FOR EACH ROW EXECUTE FUNCTION public.prevent_university_creator_reassignment();
CREATE TRIGGER university_attendance_session_creator_guard
BEFORE UPDATE OF created_by ON public.university_attendance_sessions
FOR EACH ROW EXECUTE FUNCTION public.prevent_university_creator_reassignment();
CREATE TRIGGER university_announcement_creator_guard
BEFORE UPDATE OF created_by ON public.university_announcements
FOR EACH ROW EXECUTE FUNCTION public.prevent_university_creator_reassignment();

-- ---------------------------------------------------------------------------
-- Temporal invariants.
-- ---------------------------------------------------------------------------
ALTER TABLE public.university_cohorts
  ADD CONSTRAINT university_cohort_date_order
  CHECK (starts_on IS NULL OR expected_completion_on IS NULL OR expected_completion_on >= starts_on);
ALTER TABLE public.university_course_offerings
  ADD CONSTRAINT university_offering_time_order
  CHECK (starts_at IS NULL OR ends_at IS NULL OR ends_at >= starts_at);
ALTER TABLE public.university_assignments
  ADD CONSTRAINT university_assignment_open_due_order
  CHECK (opens_at IS NULL OR due_at IS NULL OR due_at >= opens_at),
  ADD CONSTRAINT university_assignment_open_close_order
  CHECK (opens_at IS NULL OR closes_at IS NULL OR closes_at >= opens_at),
  ADD CONSTRAINT university_assignment_due_close_order
  CHECK (due_at IS NULL OR closes_at IS NULL OR closes_at >= due_at);
ALTER TABLE public.university_attendance_sessions
  ADD CONSTRAINT university_attendance_session_time_order
  CHECK (ends_at IS NULL OR ends_at >= starts_at);
ALTER TABLE public.university_announcements
  ADD CONSTRAINT university_announcement_expiry_order
  CHECK (published_at IS NULL OR expires_at IS NULL OR expires_at >= published_at);
ALTER TABLE public.university_advising_assignments
  ADD CONSTRAINT university_advising_assignment_date_order
  CHECK (ends_on IS NULL OR ends_on >= starts_on);
