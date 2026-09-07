-- ScrollUniversity programme progress correctness fix.
-- The original view used SUM(DISTINCT credit_value), which under-counted a
-- programme whenever two completed required courses carried the same number of
-- credits. Deduplicate at the course level first, then sum every completed
-- required course exactly once.

CREATE OR REPLACE VIEW public.university_programme_progress_v
WITH (security_invoker = true)
AS
WITH curriculum_courses AS (
  SELECT
    pc.organization_id,
    pc.programme_id,
    pc.course_id,
    pc.is_required,
    COALESCE(pc.credits_override, c.credits) AS course_credits
  FROM public.university_programme_courses pc
  JOIN public.university_courses c ON c.id = pc.course_id
),
curriculum AS (
  SELECT
    organization_id,
    programme_id,
    count(*) FILTER (WHERE is_required) AS required_courses,
    COALESCE(sum(course_credits) FILTER (WHERE is_required), 0) AS required_credits
  FROM curriculum_courses
  GROUP BY organization_id, programme_id
),
completed_required_courses AS (
  SELECT DISTINCT
    r.id AS programme_registration_id,
    cc.course_id,
    cc.course_credits
  FROM public.university_programme_registrations r
  JOIN curriculum_courses cc
    ON cc.programme_id = r.programme_id
   AND cc.organization_id = r.organization_id
   AND cc.is_required
  JOIN public.university_course_offerings o
    ON o.course_id = cc.course_id
   AND o.organization_id = r.organization_id
  JOIN public.university_enrolments e
    ON e.offering_id = o.id
   AND e.organization_id = r.organization_id
   AND e.user_id = r.user_id
   AND e.status = 'completed'
),
completed AS (
  SELECT
    programme_registration_id,
    count(*) AS required_courses_completed,
    COALESCE(sum(course_credits), 0) AS institutional_credits_earned
  FROM completed_required_courses
  GROUP BY programme_registration_id
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
  ON p.organization_id = r.organization_id
 AND p.user_id = r.user_id
LEFT JOIN curriculum cu
  ON cu.organization_id = r.organization_id
 AND cu.programme_id = r.programme_id
LEFT JOIN completed co ON co.programme_registration_id = r.id
LEFT JOIN recognized rc ON rc.programme_registration_id = r.id;

REVOKE ALL ON TABLE public.university_programme_progress_v FROM anon, authenticated;
GRANT SELECT ON TABLE public.university_programme_progress_v TO authenticated;
GRANT ALL ON TABLE public.university_programme_progress_v TO service_role;
