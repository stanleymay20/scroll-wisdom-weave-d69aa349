-- Make learner submission identity, attempt numbering and evidence immutable.
-- This replaces the earlier guard while retaining its trigger.
CREATE OR REPLACE FUNCTION public.guard_university_student_submission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_next_attempt integer;
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

    IF NOT EXISTS (
      SELECT 1
      FROM public.university_assignments a
      JOIN public.university_enrolments e
        ON e.offering_id = a.offering_id
       AND e.user_id = v_uid
       AND e.status IN ('enrolled','completed')
      WHERE a.id = NEW.assignment_id
        AND a.organization_id = NEW.organization_id
        AND a.published
    ) THEN
      RAISE EXCEPTION 'Learner is not eligible to submit this assignment'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- Allocate attempts on the server and serialize concurrent inserts for the
    -- same learner/assignment so clients cannot forge or collide attempt IDs.
    PERFORM pg_advisory_xact_lock(
      hashtextextended(NEW.assignment_id::text || ':' || NEW.user_id::text, 0)
    );
    SELECT COALESCE(max(s.attempt_number), 0) + 1
      INTO v_next_attempt
    FROM public.university_submissions s
    WHERE s.assignment_id = NEW.assignment_id
      AND s.user_id = NEW.user_id;
    NEW.attempt_number := v_next_attempt;

    IF NEW.status = 'draft' THEN
      NEW.submitted_at := NULL;
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.assignment_id IS DISTINCT FROM OLD.assignment_id THEN
    RAISE EXCEPTION 'Learners cannot move a submission to another assignment'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.attempt_number IS DISTINCT FROM OLD.attempt_number THEN
    RAISE EXCEPTION 'Learners cannot change submission attempt numbers'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.integrity_metadata IS DISTINCT FROM OLD.integrity_metadata THEN
    RAISE EXCEPTION 'Learners cannot modify academic integrity metadata'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.status <> OLD.status AND NEW.status NOT IN ('submitted','late') THEN
    RAISE EXCEPTION 'Learners cannot transition a submission from % to %', OLD.status, NEW.status
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  IF NEW.status = OLD.status THEN
    NEW.submitted_at := OLD.submitted_at;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.university_assignments a
    JOIN public.university_enrolments e
      ON e.offering_id = a.offering_id
     AND e.user_id = v_uid
     AND e.status IN ('enrolled','completed')
    WHERE a.id = NEW.assignment_id
      AND a.organization_id = NEW.organization_id
      AND a.published
  ) THEN
    RAISE EXCEPTION 'Learner is not eligible to modify this assignment submission'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_university_student_submission() FROM PUBLIC, anon, authenticated;
