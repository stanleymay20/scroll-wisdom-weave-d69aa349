-- Ordered follow-up to ScrollUniversity academic integrity.
-- Adds concurrency serialization for grade weights, learner submission
-- immutability, and defensive grading-scheme parsing without duplicating the
-- broader 13400 academic-integrity migration.

CREATE OR REPLACE FUNCTION public.enforce_university_grade_weight_total()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_other_weight numeric(8,3);
BEGIN
  -- Concurrent grade-item edits for one offering must observe one another.
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.offering_id::text, 0));

  SELECT COALESCE(sum(weight_percent), 0)
  INTO v_other_weight
  FROM public.university_grade_items
  WHERE offering_id = NEW.offering_id
    AND id <> NEW.id;

  IF v_other_weight + NEW.weight_percent > 100.001 THEN
    RAISE EXCEPTION 'Grade item weights for an offering may not exceed 100%%'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

-- A learner may edit a draft or work explicitly returned for revision, but may
-- not silently replace a formally submitted/late/graded attempt.
CREATE OR REPLACE FUNCTION public.lock_university_submitted_work()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF (SELECT auth.uid()) = OLD.user_id
     AND OLD.status IN ('submitted','late','graded')
     AND (
       NEW.body IS DISTINCT FROM OLD.body
       OR NEW.attachment_refs IS DISTINCT FROM OLD.attachment_refs
       OR NEW.status IS DISTINCT FROM OLD.status
       OR NEW.assignment_id IS DISTINCT FROM OLD.assignment_id
       OR NEW.user_id IS DISTINCT FROM OLD.user_id
       OR NEW.attempt_number IS DISTINCT FROM OLD.attempt_number
     ) THEN
    RAISE EXCEPTION 'Submitted work is locked until it is returned for revision'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS university_submission_lock_guard ON public.university_submissions;
CREATE TRIGGER university_submission_lock_guard
BEFORE UPDATE ON public.university_submissions
FOR EACH ROW EXECUTE FUNCTION public.lock_university_submitted_work();

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
  v_item_count integer;
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

  IF COALESCE(v_scheme ->> 'pass_mark', '') ~ '^\d+(\.\d+)?$' THEN
    v_pass_mark := (v_scheme ->> 'pass_mark')::numeric;
  END IF;
  IF v_pass_mark < 0 OR v_pass_mark > 100 THEN
    RAISE EXCEPTION 'Institution pass_mark must be between 0 and 100'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*), COALESCE(sum(gi.weight_percent), 0)
  INTO v_item_count, v_weight_total
  FROM public.university_grade_items gi
  WHERE gi.offering_id = v_enrolment.offering_id
    AND gi.published;

  IF v_item_count = 0 THEN
    RAISE EXCEPTION 'Cannot finalize a course with no published grade items'
      USING ERRCODE = 'check_violation';
  END IF;

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

  v_derived_label := NULLIF(btrim(_grade_label), '');
  IF v_derived_label IS NULL AND jsonb_typeof(v_scheme -> 'bands') = 'array' THEN
    SELECT band ->> 'label'
    INTO v_derived_label
    FROM jsonb_array_elements(v_scheme -> 'bands') AS band
    WHERE COALESCE(band ->> 'min', '') ~ '^\d+(\.\d+)?$'
      AND v_percentage >= (band ->> 'min')::numeric
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
