-- ScrollUniversity reporting surfaces. Views use security_invoker so the RLS
-- policies of the underlying tables remain authoritative for every caller.

CREATE OR REPLACE VIEW public.university_gradebook_v
WITH (security_invoker = true)
AS
SELECT
  g.organization_id,
  gi.offering_id,
  o.term_id,
  o.course_id,
  c.code AS course_code,
  c.title AS course_title,
  o.section_code,
  g.user_id,
  up.display_name,
  up.student_number,
  gi.id AS grade_item_id,
  gi.name AS grade_item_name,
  gi.category,
  gi.max_points,
  gi.weight_percent,
  gi.published AS grade_item_published,
  g.points,
  g.percentage,
  g.grade_label,
  g.feedback,
  g.status,
  g.graded_by,
  g.graded_at
FROM public.university_grades g
JOIN public.university_grade_items gi ON gi.id = g.grade_item_id
JOIN public.university_course_offerings o ON o.id = gi.offering_id
JOIN public.university_courses c ON c.id = o.course_id
LEFT JOIN public.university_people up
  ON up.organization_id = g.organization_id AND up.user_id = g.user_id;

CREATE OR REPLACE VIEW public.university_transcript_v
WITH (security_invoker = true)
AS
SELECT
  e.organization_id,
  e.user_id,
  up.display_name,
  up.student_number,
  e.offering_id,
  c.id AS course_id,
  c.code AS course_code,
  c.title AS course_title,
  c.credits,
  t.id AS term_id,
  t.code AS term_code,
  t.name AS term_name,
  t.academic_year,
  e.status AS enrolment_status,
  COALESCE(
    e.final_percentage,
    ROUND(
      SUM(CASE WHEN g.status = 'published' THEN g.percentage * gi.weight_percent ELSE 0 END)
      / NULLIF(SUM(CASE WHEN g.status = 'published' THEN gi.weight_percent ELSE 0 END), 0),
      2
    )
  ) AS final_percentage,
  e.final_grade,
  e.credits_earned,
  e.completed_at
FROM public.university_enrolments e
JOIN public.university_course_offerings o ON o.id = e.offering_id
JOIN public.university_courses c ON c.id = o.course_id
JOIN public.university_academic_terms t ON t.id = o.term_id
LEFT JOIN public.university_people up
  ON up.organization_id = e.organization_id AND up.user_id = e.user_id
LEFT JOIN public.university_grade_items gi ON gi.offering_id = e.offering_id
LEFT JOIN public.university_grades g
  ON g.grade_item_id = gi.id AND g.user_id = e.user_id
GROUP BY
  e.organization_id, e.user_id, up.display_name, up.student_number,
  e.offering_id, c.id, c.code, c.title, c.credits,
  t.id, t.code, t.name, t.academic_year,
  e.status, e.final_percentage, e.final_grade, e.credits_earned, e.completed_at;

CREATE OR REPLACE VIEW public.university_outcome_coverage_v
WITH (security_invoker = true)
AS
SELECT
  m.organization_id,
  po.programme_id,
  pc.course_id,
  po.id AS programme_outcome_id,
  po.code AS programme_outcome_code,
  po.description AS programme_outcome,
  co.id AS course_outcome_id,
  co.code AS course_outcome_code,
  co.description AS course_outcome,
  co.bloom_level,
  m.contribution_weight
FROM public.university_outcome_mappings m
JOIN public.university_learning_outcomes po ON po.id = m.programme_outcome_id
JOIN public.university_learning_outcomes co ON co.id = m.course_outcome_id
LEFT JOIN public.university_programme_courses pc
  ON pc.programme_id = po.programme_id AND pc.course_id = co.course_id;

CREATE OR REPLACE VIEW public.university_course_catalog_v
WITH (security_invoker = true)
AS
SELECT
  pc.organization_id,
  p.id AS programme_id,
  p.code AS programme_code,
  p.name AS programme_name,
  p.qualification_level,
  p.status AS programme_status,
  pc.year_number,
  pc.term_number,
  pc.sequence,
  pc.is_required,
  c.id AS course_id,
  c.code AS course_code,
  c.title AS course_title,
  COALESCE(pc.credits_override, c.credits) AS credits,
  c.delivery_mode,
  c.status AS course_status
FROM public.university_programme_courses pc
JOIN public.university_programmes p ON p.id = pc.programme_id
JOIN public.university_courses c ON c.id = pc.course_id;

REVOKE ALL ON TABLE public.university_gradebook_v FROM anon, authenticated;
REVOKE ALL ON TABLE public.university_transcript_v FROM anon, authenticated;
REVOKE ALL ON TABLE public.university_outcome_coverage_v FROM anon, authenticated;
REVOKE ALL ON TABLE public.university_course_catalog_v FROM anon, authenticated;
GRANT SELECT ON TABLE public.university_gradebook_v TO authenticated;
GRANT SELECT ON TABLE public.university_transcript_v TO authenticated;
GRANT SELECT ON TABLE public.university_outcome_coverage_v TO authenticated;
GRANT SELECT ON TABLE public.university_course_catalog_v TO authenticated;
GRANT ALL ON TABLE public.university_gradebook_v TO service_role;
GRANT ALL ON TABLE public.university_transcript_v TO service_role;
GRANT ALL ON TABLE public.university_outcome_coverage_v TO service_role;
GRANT ALL ON TABLE public.university_course_catalog_v TO service_role;

-- Keep enrolment final_percentage in sync when a grade becomes visible. The
-- trigger is server-owned and not directly executable by API roles.
CREATE OR REPLACE FUNCTION public.refresh_university_enrolment_grade()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_offering_id uuid;
  v_user_id uuid;
  v_percentage numeric(6,2);
BEGIN
  SELECT offering_id INTO v_offering_id
  FROM public.university_grade_items
  WHERE id = COALESCE(NEW.grade_item_id, OLD.grade_item_id);

  v_user_id := COALESCE(NEW.user_id, OLD.user_id);

  SELECT ROUND(
    SUM(CASE WHEN g.status = 'published' THEN g.percentage * gi.weight_percent ELSE 0 END)
    / NULLIF(SUM(CASE WHEN g.status = 'published' THEN gi.weight_percent ELSE 0 END), 0),
    2
  )
  INTO v_percentage
  FROM public.university_grade_items gi
  LEFT JOIN public.university_grades g
    ON g.grade_item_id = gi.id AND g.user_id = v_user_id
  WHERE gi.offering_id = v_offering_id;

  UPDATE public.university_enrolments
  SET final_percentage = v_percentage
  WHERE offering_id = v_offering_id AND user_id = v_user_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_university_enrolment_grade() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS refresh_university_enrolment_grade_on_grade ON public.university_grades;
CREATE TRIGGER refresh_university_enrolment_grade_on_grade
AFTER INSERT OR UPDATE OR DELETE ON public.university_grades
FOR EACH ROW EXECUTE FUNCTION public.refresh_university_enrolment_grade();
