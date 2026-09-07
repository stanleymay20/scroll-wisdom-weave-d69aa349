-- ScrollUniversity operational hardening and reporting.
-- Tighten directory privacy, enforce offering capacity, and expose role-safe
-- learner/attendance reporting without weakening underlying RLS.

-- ---------------------------------------------------------------------------
-- People directory privacy
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "University members can view people directory" ON public.university_people;

CREATE OR REPLACE FUNCTION public.can_view_university_person(
  _viewer_id uuid,
  _organization_id uuid,
  _target_user_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    _viewer_id = _target_user_id
    OR public.is_org_admin(_viewer_id, _organization_id)
    OR EXISTS (
      SELECT 1
      FROM public.university_people viewer
      WHERE viewer.organization_id = _organization_id
        AND viewer.user_id = _viewer_id
        AND viewer.status = 'active'
        AND viewer.university_role IN ('chancellor','registrar','dean','programme_lead','advisor','auditor')
    )
    OR EXISTS (
      SELECT 1
      FROM public.university_teaching_assignments ta
      JOIN public.university_enrolments e ON e.offering_id = ta.offering_id
      WHERE ta.user_id = _viewer_id
        AND e.user_id = _target_user_id
        AND e.organization_id = _organization_id
        AND ta.teaching_role IN ('lead_lecturer','lecturer','teaching_assistant','grader')
    )
    OR EXISTS (
      SELECT 1
      FROM public.university_teaching_assignments ta
      JOIN public.university_enrolments e ON e.offering_id = ta.offering_id
      WHERE e.user_id = _viewer_id
        AND ta.user_id = _target_user_id
        AND e.organization_id = _organization_id
        AND e.status IN ('enrolled','completed')
    );
$$;

REVOKE ALL ON FUNCTION public.can_view_university_person(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_university_person(uuid, uuid, uuid) TO authenticated;

CREATE POLICY "University people are visible by academic relationship"
ON public.university_people FOR SELECT TO authenticated
USING (
  public.can_view_university_person(
    (SELECT auth.uid()), organization_id, user_id
  )
);

-- ---------------------------------------------------------------------------
-- Capacity enforcement
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
  WHERE id = NEW.offering_id;

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

DROP TRIGGER IF EXISTS university_enrolment_capacity_guard ON public.university_enrolments;
CREATE TRIGGER university_enrolment_capacity_guard
BEFORE INSERT OR UPDATE OF offering_id, status ON public.university_enrolments
FOR EACH ROW EXECUTE FUNCTION public.enforce_university_offering_capacity();

CREATE INDEX IF NOT EXISTS idx_university_enrolments_offering_status
  ON public.university_enrolments(offering_id, status);
CREATE INDEX IF NOT EXISTS idx_university_submissions_assignment_status
  ON public.university_submissions(assignment_id, status, submitted_at);
CREATE INDEX IF NOT EXISTS idx_university_attendance_records_session_status
  ON public.university_attendance_records(session_id, status);

-- ---------------------------------------------------------------------------
-- Operational reporting surfaces
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.university_attendance_summary_v
WITH (security_invoker = true)
AS
SELECT
  e.organization_id,
  e.offering_id,
  e.user_id,
  up.display_name,
  up.student_number,
  count(s.id) AS sessions_total,
  count(ar.id) FILTER (WHERE ar.status IN ('present','late','remote')) AS sessions_attended,
  count(ar.id) FILTER (WHERE ar.status = 'absent') AS sessions_absent,
  count(ar.id) FILTER (WHERE ar.status = 'excused') AS sessions_excused,
  CASE
    WHEN count(s.id) = 0 THEN NULL
    ELSE round(
      100.0 * count(ar.id) FILTER (WHERE ar.status IN ('present','late','remote'))
      / count(s.id),
      2
    )
  END AS attendance_percentage
FROM public.university_enrolments e
LEFT JOIN public.university_people up
  ON up.organization_id = e.organization_id AND up.user_id = e.user_id
LEFT JOIN public.university_attendance_sessions s
  ON s.offering_id = e.offering_id
LEFT JOIN public.university_attendance_records ar
  ON ar.session_id = s.id AND ar.user_id = e.user_id
WHERE e.status IN ('enrolled','completed')
GROUP BY e.organization_id, e.offering_id, e.user_id, up.display_name, up.student_number;

CREATE OR REPLACE VIEW public.university_learner_progress_v
WITH (security_invoker = true)
AS
WITH grade_stats AS (
  SELECT
    e.organization_id,
    e.offering_id,
    e.user_id,
    count(gi.id) FILTER (WHERE gi.published) AS grade_items_total,
    count(g.id) FILTER (WHERE g.status = 'published') AS grade_items_graded,
    round(
      SUM(CASE WHEN g.status = 'published' THEN g.percentage * gi.weight_percent ELSE 0 END)
      / NULLIF(SUM(CASE WHEN g.status = 'published' THEN gi.weight_percent ELSE 0 END), 0),
      2
    ) AS weighted_percentage
  FROM public.university_enrolments e
  LEFT JOIN public.university_grade_items gi ON gi.offering_id = e.offering_id
  LEFT JOIN public.university_grades g
    ON g.grade_item_id = gi.id AND g.user_id = e.user_id
  GROUP BY e.organization_id, e.offering_id, e.user_id
),
submission_stats AS (
  SELECT
    e.organization_id,
    e.offering_id,
    e.user_id,
    count(a.id) FILTER (WHERE a.published) AS assignments_total,
    count(DISTINCT s.assignment_id) FILTER (WHERE s.status IN ('submitted','late','graded')) AS assignments_submitted
  FROM public.university_enrolments e
  LEFT JOIN public.university_assignments a ON a.offering_id = e.offering_id
  LEFT JOIN public.university_submissions s
    ON s.assignment_id = a.id AND s.user_id = e.user_id
  GROUP BY e.organization_id, e.offering_id, e.user_id
)
SELECT
  e.organization_id,
  e.offering_id,
  e.user_id,
  up.display_name,
  up.student_number,
  c.code AS course_code,
  c.title AS course_title,
  t.code AS term_code,
  t.name AS term_name,
  e.status AS enrolment_status,
  COALESCE(e.final_percentage, gs.weighted_percentage) AS current_percentage,
  gs.grade_items_total,
  gs.grade_items_graded,
  ss.assignments_total,
  ss.assignments_submitted,
  GREATEST(ss.assignments_total - ss.assignments_submitted, 0) AS assignments_outstanding,
  ats.sessions_total,
  ats.sessions_attended,
  ats.sessions_absent,
  ats.attendance_percentage,
  e.final_grade,
  e.credits_earned
FROM public.university_enrolments e
JOIN public.university_course_offerings o ON o.id = e.offering_id
JOIN public.university_courses c ON c.id = o.course_id
JOIN public.university_academic_terms t ON t.id = o.term_id
LEFT JOIN public.university_people up
  ON up.organization_id = e.organization_id AND up.user_id = e.user_id
LEFT JOIN grade_stats gs
  ON gs.organization_id = e.organization_id
 AND gs.offering_id = e.offering_id
 AND gs.user_id = e.user_id
LEFT JOIN submission_stats ss
  ON ss.organization_id = e.organization_id
 AND ss.offering_id = e.offering_id
 AND ss.user_id = e.user_id
LEFT JOIN public.university_attendance_summary_v ats
  ON ats.organization_id = e.organization_id
 AND ats.offering_id = e.offering_id
 AND ats.user_id = e.user_id;

REVOKE ALL ON TABLE public.university_attendance_summary_v FROM anon, authenticated;
REVOKE ALL ON TABLE public.university_learner_progress_v FROM anon, authenticated;
GRANT SELECT ON TABLE public.university_attendance_summary_v TO authenticated;
GRANT SELECT ON TABLE public.university_learner_progress_v TO authenticated;
GRANT ALL ON TABLE public.university_attendance_summary_v TO service_role;
GRANT ALL ON TABLE public.university_learner_progress_v TO service_role;

-- ---------------------------------------------------------------------------
-- Controlled course-result finalisation
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
  v_percentage numeric(6,2);
BEGIN
  SELECT * INTO v_enrolment
  FROM public.university_enrolments
  WHERE id = _enrolment_id;

  IF v_enrolment.id IS NULL THEN
    RAISE EXCEPTION 'Enrolment not found' USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT public.manages_university_offering((SELECT auth.uid()), v_enrolment.offering_id) THEN
    RAISE EXCEPTION 'Not authorized to finalize this enrolment' USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT c.* INTO v_course
  FROM public.university_course_offerings o
  JOIN public.university_courses c ON c.id = o.course_id
  WHERE o.id = v_enrolment.offering_id;

  SELECT round(
    SUM(CASE WHEN g.status = 'published' THEN g.percentage * gi.weight_percent ELSE 0 END)
    / NULLIF(SUM(CASE WHEN g.status = 'published' THEN gi.weight_percent ELSE 0 END), 0),
    2
  ) INTO v_percentage
  FROM public.university_grade_items gi
  LEFT JOIN public.university_grades g
    ON g.grade_item_id = gi.id AND g.user_id = v_enrolment.user_id
  WHERE gi.offering_id = v_enrolment.offering_id
    AND gi.published;

  UPDATE public.university_enrolments
  SET
    final_percentage = v_percentage,
    final_grade = COALESCE(_grade_label, final_grade),
    credits_earned = CASE WHEN v_percentage IS NOT NULL AND v_percentage >= 50 THEN v_course.credits ELSE 0 END,
    status = CASE WHEN v_percentage IS NOT NULL AND v_percentage >= 50 THEN 'completed' ELSE 'failed' END,
    completed_at = now()
  WHERE id = _enrolment_id
  RETURNING * INTO v_enrolment;

  RETURN v_enrolment;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_university_enrolment(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_university_enrolment(uuid, text) TO authenticated;
