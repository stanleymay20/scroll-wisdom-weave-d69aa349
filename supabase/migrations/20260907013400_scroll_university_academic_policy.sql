-- ScrollUniversity academic-policy hardening.
-- Final results must follow each institution's grading policy, gradebooks must
-- have coherent weights, and submitted assessment work must respect the
-- configured assessment window.

-- ---------------------------------------------------------------------------
-- Grade-item weight integrity
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_university_grade_weight_total()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_total numeric;
BEGIN
  -- Serialize edits to one offering so concurrent grade-item writes cannot
  -- independently pass the same total-weight check.
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.offering_id::text, 0));

  SELECT COALESCE(sum(weight_percent), 0)
  INTO v_total
  FROM public.university_grade_items
  WHERE offering_id = NEW.offering_id
    AND id <> NEW.id;

  v_total := v_total + NEW.weight_percent;
  IF v_total > 100.001 THEN
    RAISE EXCEPTION 'Grade-item weights for an offering cannot exceed 100%% (new total: %)', v_total
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
-- Assessment submission-window and immutability policy
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_university_submission_policy()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_assignment public.university_assignments;
  v_now timestamptz := now();
BEGIN
  SELECT * INTO v_assignment
  FROM public.university_assignments
  WHERE id = NEW.assignment_id;

  IF v_assignment.id IS NULL THEN
    RAISE EXCEPTION 'Assignment not found' USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- A learner cannot silently replace work after formal submission or grading.
  -- Staff/service operations remain able to return or grade the record through
  -- the existing RLS policies.
  IF TG_OP = 'UPDATE'
     AND (SELECT auth.uid()) = OLD.user_id
     AND OLD.status IN ('submitted','late','graded')
     AND (
       NEW.body IS DISTINCT FROM OLD.body
       OR NEW.attachment_refs IS DISTINCT FROM OLD.attachment_refs
       OR NEW.status IS DISTINCT FROM OLD.status
     ) THEN
    RAISE EXCEPTION 'Submitted work is locked until it is returned for revision'
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.status IN ('submitted','late') THEN
    IF NOT v_assignment.published THEN
      RAISE EXCEPTION 'Assignment is not published' USING ERRCODE = 'check_violation';
    END IF;
    IF v_assignment.opens_at IS NOT NULL AND v_now < v_assignment.opens_at THEN
      RAISE EXCEPTION 'Assignment is not open yet' USING ERRCODE = 'check_violation';
    END IF;
    IF v_assignment.closes_at IS NOT NULL AND v_now > v_assignment.closes_at THEN
      RAISE EXCEPTION 'Assignment submission window is closed' USING ERRCODE = 'check_violation';
    END IF;
    IF v_assignment.due_at IS NOT NULL AND v_now > v_assignment.due_at THEN
      IF NOT v_assignment.allow_late THEN
        RAISE EXCEPTION 'Late submissions are not allowed for this assignment'
          USING ERRCODE = 'check_violation';
      END IF;
      NEW.status := 'late';
    ELSE
      NEW.status := 'submitted';
    END IF;
    NEW.submitted_at := COALESCE(NEW.submitted_at, v_now);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS university_submission_policy_guard ON public.university_submissions;
CREATE TRIGGER university_submission_policy_guard
BEFORE INSERT OR UPDATE ON public.university_submissions
FOR EACH ROW EXECUTE FUNCTION public.enforce_university_submission_policy();

-- ---------------------------------------------------------------------------
-- Institution-aware course-result finalisation
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
  v_grading_scheme jsonb;
  v_pass_mark numeric := 50;
  v_percentage numeric(6,2);
  v_grade_label text;
  v_item_count integer := 0;
  v_resolved_count integer := 0;
  v_total_weight numeric := 0;
  v_effective_weight numeric := 0;
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

  SELECT grading_scheme INTO v_grading_scheme
  FROM public.university_settings
  WHERE organization_id = v_enrolment.organization_id;

  IF COALESCE(v_grading_scheme->>'pass_mark', '') ~ '^\d+(\.\d+)?$' THEN
    v_pass_mark := (v_grading_scheme->>'pass_mark')::numeric;
  END IF;
  IF v_pass_mark < 0 OR v_pass_mark > 100 THEN
    RAISE EXCEPTION 'Institution pass_mark must be between 0 and 100'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*), COALESCE(sum(weight_percent), 0)
  INTO v_item_count, v_total_weight
  FROM public.university_grade_items
  WHERE offering_id = v_enrolment.offering_id
    AND published;

  IF v_item_count = 0 THEN
    RAISE EXCEPTION 'Cannot finalize a course with no published grade items'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_total_weight < 99.999 OR v_total_weight > 100.001 THEN
    RAISE EXCEPTION 'Published grade-item weights must total 100%% before finalisation (current total: %)', v_total_weight
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT
    count(*) FILTER (WHERE g.status IN ('published','excused')),
    COALESCE(sum(gi.weight_percent) FILTER (WHERE g.status = 'published'), 0),
    round(
      COALESCE(sum(g.percentage * gi.weight_percent) FILTER (WHERE g.status = 'published'), 0)
      / NULLIF(COALESCE(sum(gi.weight_percent) FILTER (WHERE g.status = 'published'), 0), 0),
      2
    )
  INTO v_resolved_count, v_effective_weight, v_percentage
  FROM public.university_grade_items gi
  LEFT JOIN public.university_grades g
    ON g.grade_item_id = gi.id
   AND g.user_id = v_enrolment.user_id
  WHERE gi.offering_id = v_enrolment.offering_id
    AND gi.published;

  IF v_resolved_count <> v_item_count THEN
    RAISE EXCEPTION 'Every published grade item must be published or excused before finalisation'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_effective_weight <= 0 OR v_percentage IS NULL THEN
    RAISE EXCEPTION 'No assessable published grade remains after excused items'
      USING ERRCODE = 'check_violation';
  END IF;

  v_grade_label := NULLIF(btrim(_grade_label), '');
  IF v_grade_label IS NULL AND jsonb_typeof(v_grading_scheme->'bands') = 'array' THEN
    SELECT band->>'label'
    INTO v_grade_label
    FROM jsonb_array_elements(v_grading_scheme->'bands') AS band
    WHERE COALESCE(band->>'min', '') ~ '^\d+(\.\d+)?$'
      AND v_percentage >= (band->>'min')::numeric
    ORDER BY (band->>'min')::numeric DESC
    LIMIT 1;
  END IF;

  UPDATE public.university_enrolments
  SET
    final_percentage = v_percentage,
    final_grade = v_grade_label,
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
