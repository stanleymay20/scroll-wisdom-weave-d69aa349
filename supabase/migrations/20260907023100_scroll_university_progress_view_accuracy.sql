-- Correct programme progress aggregation.
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
