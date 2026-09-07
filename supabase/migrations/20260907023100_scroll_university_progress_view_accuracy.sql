-- Correct ScrollUniversity progress aggregation.
-- Count each curriculum course once per registration. SUM(DISTINCT credits)
-- incorrectly collapses different courses that happen to carry the same credit
-- value, while joining offerings directly can double-count repeated offerings.
CREATE OR REPLACE VIEW public.university_programme_progress_v
WITH (security_invoker = true)
AS
WITH curriculum AS (
  SELECT
    pc.organization_id,
    pc.programme_id,
    count(*) FILTER (WHERE pc.is_required) AS required_courses,
    COALESCE(
      sum(COALESCE(pc.credits_override, c.credits)) FILTER (WHERE pc.is_required),
      0
    ) AS required_credits
  FROM public.university_programme_courses pc
  JOIN public.university_courses c ON c.id = pc.course_id
  GROUP BY pc.organization_id, pc.programme_id
),
completed AS (
  SELECT
    r.id AS programme_registration_id,
    count(*) FILTER (
      WHERE pc.is_required
        AND EXISTS (
          SELECT 1
          FROM public.university_course_offerings o
          JOIN public.university_enrolments e
            ON e.offering_id = o.id
           AND e.user_id = r.user_id
           AND e.status = 'completed'
          WHERE o.course_id = pc.course_id
            AND o.organization_id = r.organization_id
        )
    ) AS required_courses_completed,
    COALESCE(
      sum(
        CASE
          WHEN pc.is_required
            AND EXISTS (
              SELECT 1
              FROM public.university_course_offerings o
              JOIN public.university_enrolments e
                ON e.offering_id = o.id
               AND e.user_id = r.user_id
               AND e.status = 'completed'
              WHERE o.course_id = pc.course_id
                AND o.organization_id = r.organization_id
            )
          THEN COALESCE(pc.credits_override, c.credits)
          ELSE 0
        END
      ),
      0
    ) AS institutional_credits_earned
  FROM public.university_programme_registrations r
  LEFT JOIN public.university_programme_courses pc
    ON pc.programme_id = r.programme_id
   AND pc.organization_id = r.organization_id
  LEFT JOIN public.university_courses c
    ON c.id = pc.course_id
   AND c.organization_id = r.organization_id
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
  COALESCE(co.institutional_credits_earned, 0) + COALESCE(rc.recognized_credits, 0)
    AS total_recognized_progress_credits,
  CASE
    WHEN COALESCE(cu.required_courses, 0) = COALESCE(co.required_courses_completed, 0)
     AND COALESCE(co.institutional_credits_earned, 0) + COALESCE(rc.recognized_credits, 0)
       >= COALESCE(cu.required_credits, pr.total_credits, 0)
    THEN true ELSE false
  END AS academic_requirements_met
FROM public.university_programme_registrations r
JOIN public.university_programmes pr
  ON pr.id = r.programme_id
 AND pr.organization_id = r.organization_id
JOIN public.university_people p
  ON p.organization_id = r.organization_id
 AND p.user_id = r.user_id
LEFT JOIN curriculum cu
  ON cu.programme_id = r.programme_id
 AND cu.organization_id = r.organization_id
LEFT JOIN completed co ON co.programme_registration_id = r.id
LEFT JOIN recognized rc ON rc.programme_registration_id = r.id;

-- Multiple submission attempts previously multiplied assignments_total because
-- assignments were joined directly to every attempt. Count each published
-- assignment once and only count submitted work for published assignments.
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
    ON g.grade_item_id = gi.id
   AND g.user_id = e.user_id
  GROUP BY e.organization_id, e.offering_id, e.user_id
),
submission_stats AS (
  SELECT
    e.organization_id,
    e.offering_id,
    e.user_id,
    count(DISTINCT a.id) FILTER (WHERE a.published) AS assignments_total,
    count(DISTINCT s.assignment_id) FILTER (
      WHERE a.published AND s.status IN ('submitted','late','graded')
    ) AS assignments_submitted
  FROM public.university_enrolments e
  LEFT JOIN public.university_assignments a ON a.offering_id = e.offering_id
  LEFT JOIN public.university_submissions s
    ON s.assignment_id = a.id
   AND s.user_id = e.user_id
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
JOIN public.university_course_offerings o
  ON o.id = e.offering_id
 AND o.organization_id = e.organization_id
JOIN public.university_courses c
  ON c.id = o.course_id
 AND c.organization_id = e.organization_id
JOIN public.university_academic_terms t
  ON t.id = o.term_id
 AND t.organization_id = e.organization_id
LEFT JOIN public.university_people up
  ON up.organization_id = e.organization_id
 AND up.user_id = e.user_id
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
