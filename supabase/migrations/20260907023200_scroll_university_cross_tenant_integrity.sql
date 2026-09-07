-- Enforce tenant consistency across the ScrollUniversity relational graph.
-- UUID foreign keys alone do not guarantee that the referenced academic object
-- belongs to the row's organization. This trigger validates that invariant
-- server-side, including for service-role writes and future clients.
CREATE OR REPLACE FUNCTION public.enforce_university_same_organization()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  i integer := 0;
  v_ref_table regclass;
  v_ref_column text;
  v_ref_id uuid;
  v_ref_org uuid;
  v_new jsonb := to_jsonb(NEW);
BEGIN
  IF mod(TG_NARGS, 2) <> 0 THEN
    RAISE EXCEPTION 'enforce_university_same_organization requires table/column argument pairs';
  END IF;

  WHILE i < TG_NARGS LOOP
    v_ref_table := to_regclass(TG_ARGV[i]);
    v_ref_column := TG_ARGV[i + 1];
    IF v_ref_table IS NULL THEN
      RAISE EXCEPTION 'Referenced table % does not exist', TG_ARGV[i];
    END IF;

    v_ref_id := NULLIF(v_new ->> v_ref_column, '')::uuid;
    IF v_ref_id IS NOT NULL THEN
      EXECUTE format('SELECT organization_id FROM %s WHERE id = $1', v_ref_table)
        INTO v_ref_org
        USING v_ref_id;

      IF v_ref_org IS NULL THEN
        RAISE EXCEPTION 'Referenced % row % was not found', v_ref_table, v_ref_id
          USING ERRCODE = 'foreign_key_violation';
      END IF;

      IF v_ref_org <> NEW.organization_id THEN
        RAISE EXCEPTION '% reference % must belong to organization %',
          v_ref_column, v_ref_id, NEW.organization_id
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;

    i := i + 2;
  END LOOP;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_university_same_organization() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER university_school_org_guard
BEFORE INSERT OR UPDATE OF organization_id, parent_school_id ON public.university_schools
FOR EACH ROW EXECUTE FUNCTION public.enforce_university_same_organization(
  'public.university_schools', 'parent_school_id'
);

CREATE TRIGGER university_programme_org_guard
BEFORE INSERT OR UPDATE OF organization_id, school_id ON public.university_programmes
FOR EACH ROW EXECUTE FUNCTION public.enforce_university_same_organization(
  'public.university_schools', 'school_id'
);

CREATE TRIGGER university_programme_course_org_guard
BEFORE INSERT OR UPDATE OF organization_id, programme_id, course_id ON public.university_programme_courses
FOR EACH ROW EXECUTE FUNCTION public.enforce_university_same_organization(
  'public.university_programmes', 'programme_id',
  'public.university_courses', 'course_id'
);

CREATE TRIGGER university_course_prerequisite_org_guard
BEFORE INSERT OR UPDATE OF organization_id, course_id, prerequisite_course_id ON public.university_course_prerequisites
FOR EACH ROW EXECUTE FUNCTION public.enforce_university_same_organization(
  'public.university_courses', 'course_id',
  'public.university_courses', 'prerequisite_course_id'
);

CREATE TRIGGER university_cohort_org_guard
BEFORE INSERT OR UPDATE OF organization_id, programme_id ON public.university_cohorts
FOR EACH ROW EXECUTE FUNCTION public.enforce_university_same_organization(
  'public.university_programmes', 'programme_id'
);

CREATE TRIGGER university_cohort_member_org_guard
BEFORE INSERT OR UPDATE OF organization_id, cohort_id ON public.university_cohort_members
FOR EACH ROW EXECUTE FUNCTION public.enforce_university_same_organization(
  'public.university_cohorts', 'cohort_id'
);

CREATE TRIGGER university_offering_org_guard
BEFORE INSERT OR UPDATE OF organization_id, course_id, term_id, cohort_id ON public.university_course_offerings
FOR EACH ROW EXECUTE FUNCTION public.enforce_university_same_organization(
  'public.university_courses', 'course_id',
  'public.university_academic_terms', 'term_id',
  'public.university_cohorts', 'cohort_id'
);

CREATE TRIGGER university_teaching_assignment_org_guard
BEFORE INSERT OR UPDATE OF organization_id, offering_id ON public.university_teaching_assignments
FOR EACH ROW EXECUTE FUNCTION public.enforce_university_same_organization(
  'public.university_course_offerings', 'offering_id'
);

CREATE TRIGGER university_enrolment_org_guard
BEFORE INSERT OR UPDATE OF organization_id, offering_id ON public.university_enrolments
FOR EACH ROW EXECUTE FUNCTION public.enforce_university_same_organization(
  'public.university_course_offerings', 'offering_id'
);

CREATE TRIGGER university_learning_outcome_org_guard
BEFORE INSERT OR UPDATE OF organization_id, programme_id, course_id ON public.university_learning_outcomes
FOR EACH ROW EXECUTE FUNCTION public.enforce_university_same_organization(
  'public.university_programmes', 'programme_id',
  'public.university_courses', 'course_id'
);

CREATE TRIGGER university_outcome_mapping_org_guard
BEFORE INSERT OR UPDATE OF organization_id, programme_outcome_id, course_outcome_id ON public.university_outcome_mappings
FOR EACH ROW EXECUTE FUNCTION public.enforce_university_same_organization(
  'public.university_learning_outcomes', 'programme_outcome_id',
  'public.university_learning_outcomes', 'course_outcome_id'
);

CREATE TRIGGER university_module_org_guard
BEFORE INSERT OR UPDATE OF organization_id, course_id ON public.university_modules
FOR EACH ROW EXECUTE FUNCTION public.enforce_university_same_organization(
  'public.university_courses', 'course_id'
);

CREATE TRIGGER university_lesson_org_guard
BEFORE INSERT OR UPDATE OF organization_id, module_id ON public.university_lessons
FOR EACH ROW EXECUTE FUNCTION public.enforce_university_same_organization(
  'public.university_modules', 'module_id'
);

CREATE TRIGGER university_assignment_org_guard
BEFORE INSERT OR UPDATE OF organization_id, offering_id, module_id ON public.university_assignments
FOR EACH ROW EXECUTE FUNCTION public.enforce_university_same_organization(
  'public.university_course_offerings', 'offering_id',
  'public.university_modules', 'module_id'
);

CREATE TRIGGER university_submission_org_guard
BEFORE INSERT OR UPDATE OF organization_id, assignment_id ON public.university_submissions
FOR EACH ROW EXECUTE FUNCTION public.enforce_university_same_organization(
  'public.university_assignments', 'assignment_id'
);

CREATE TRIGGER university_grade_item_org_guard
BEFORE INSERT OR UPDATE OF organization_id, offering_id, assignment_id ON public.university_grade_items
FOR EACH ROW EXECUTE FUNCTION public.enforce_university_same_organization(
  'public.university_course_offerings', 'offering_id',
  'public.university_assignments', 'assignment_id'
);

CREATE TRIGGER university_grade_org_guard
BEFORE INSERT OR UPDATE OF organization_id, grade_item_id, submission_id ON public.university_grades
FOR EACH ROW EXECUTE FUNCTION public.enforce_university_same_organization(
  'public.university_grade_items', 'grade_item_id',
  'public.university_submissions', 'submission_id'
);

CREATE TRIGGER university_attendance_session_org_guard
BEFORE INSERT OR UPDATE OF organization_id, offering_id ON public.university_attendance_sessions
FOR EACH ROW EXECUTE FUNCTION public.enforce_university_same_organization(
  'public.university_course_offerings', 'offering_id'
);

CREATE TRIGGER university_attendance_record_org_guard
BEFORE INSERT OR UPDATE OF organization_id, session_id ON public.university_attendance_records
FOR EACH ROW EXECUTE FUNCTION public.enforce_university_same_organization(
  'public.university_attendance_sessions', 'session_id'
);

CREATE TRIGGER university_announcement_org_guard
BEFORE INSERT OR UPDATE OF organization_id, offering_id ON public.university_announcements
FOR EACH ROW EXECUTE FUNCTION public.enforce_university_same_organization(
  'public.university_course_offerings', 'offering_id'
);

CREATE TRIGGER university_programme_registration_org_guard
BEFORE INSERT OR UPDATE OF organization_id, programme_id, cohort_id, entry_term_id, expected_completion_term_id
ON public.university_programme_registrations
FOR EACH ROW EXECUTE FUNCTION public.enforce_university_same_organization(
  'public.university_programmes', 'programme_id',
  'public.university_cohorts', 'cohort_id',
  'public.university_academic_terms', 'entry_term_id',
  'public.university_academic_terms', 'expected_completion_term_id'
);

CREATE TRIGGER university_advising_assignment_org_guard
BEFORE INSERT OR UPDATE OF organization_id, programme_registration_id ON public.university_advising_assignments
FOR EACH ROW EXECUTE FUNCTION public.enforce_university_same_organization(
  'public.university_programme_registrations', 'programme_registration_id'
);

CREATE TRIGGER university_advising_note_org_guard
BEFORE INSERT OR UPDATE OF organization_id, programme_registration_id ON public.university_advising_notes
FOR EACH ROW EXECUTE FUNCTION public.enforce_university_same_organization(
  'public.university_programme_registrations', 'programme_registration_id'
);

CREATE TRIGGER university_academic_standing_org_guard
BEFORE INSERT OR UPDATE OF organization_id, programme_registration_id, term_id ON public.university_academic_standing
FOR EACH ROW EXECUTE FUNCTION public.enforce_university_same_organization(
  'public.university_programme_registrations', 'programme_registration_id',
  'public.university_academic_terms', 'term_id'
);

CREATE TRIGGER university_recognized_credit_org_guard
BEFORE INSERT OR UPDATE OF organization_id, programme_registration_id, course_id ON public.university_recognized_credits
FOR EACH ROW EXECUTE FUNCTION public.enforce_university_same_organization(
  'public.university_programme_registrations', 'programme_registration_id',
  'public.university_courses', 'course_id'
);

CREATE TRIGGER university_progression_decision_org_guard
BEFORE INSERT OR UPDATE OF organization_id, programme_registration_id, term_id ON public.university_progression_decisions
FOR EACH ROW EXECUTE FUNCTION public.enforce_university_same_organization(
  'public.university_programme_registrations', 'programme_registration_id',
  'public.university_academic_terms', 'term_id'
);

CREATE TRIGGER university_completion_clearance_org_guard
BEFORE INSERT OR UPDATE OF organization_id, programme_registration_id ON public.university_completion_clearances
FOR EACH ROW EXECUTE FUNCTION public.enforce_university_same_organization(
  'public.university_programme_registrations', 'programme_registration_id'
);

CREATE TRIGGER university_lti_launch_org_guard
BEFORE INSERT OR UPDATE OF organization_id, connection_id ON public.university_lti_launches
FOR EACH ROW EXECUTE FUNCTION public.enforce_university_same_organization(
  'public.university_lms_connections', 'connection_id'
);

CREATE TRIGGER university_external_identity_org_guard
BEFORE INSERT OR UPDATE OF organization_id, connection_id ON public.university_external_identities
FOR EACH ROW EXECUTE FUNCTION public.enforce_university_same_organization(
  'public.university_lms_connections', 'connection_id'
);
