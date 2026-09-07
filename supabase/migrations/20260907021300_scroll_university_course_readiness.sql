-- ScrollUniversity course catalogue/readiness control.
--
-- The product has two historically separate course domains: a legacy catalogue
-- (observed in production as public.courses) and the institution-owned
-- university_courses delivery model. This migration does not duplicate legacy
-- rows. Instead, it provides a source-agnostic bridge so one canonical
-- university course may be linked to one or more historical catalogue records,
-- and it derives operational readiness from actual teaching evidence.

CREATE TABLE IF NOT EXISTS public.university_course_catalog_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  university_course_id uuid NOT NULL REFERENCES public.university_courses(id) ON DELETE CASCADE,
  source_system text NOT NULL DEFAULT 'public.courses',
  source_record_id text NOT NULL,
  source_course_code text,
  source_title text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, source_system, source_record_id)
);

CREATE INDEX IF NOT EXISTS idx_university_course_catalog_links_course
  ON public.university_course_catalog_links(organization_id, university_course_id);

CREATE OR REPLACE FUNCTION public.validate_university_course_catalog_link()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_course_org uuid;
BEGIN
  SELECT organization_id INTO v_course_org
  FROM public.university_courses
  WHERE id = NEW.university_course_id;

  IF v_course_org IS NULL OR v_course_org <> NEW.organization_id THEN
    RAISE EXCEPTION 'Catalogue link must reference a university course in the same institution'
      USING ERRCODE = 'check_violation';
  END IF;

  NEW.source_system := btrim(NEW.source_system);
  NEW.source_record_id := btrim(NEW.source_record_id);
  NEW.source_course_code := NULLIF(btrim(COALESCE(NEW.source_course_code, '')), '');
  NEW.source_title := NULLIF(btrim(COALESCE(NEW.source_title, '')), '');

  IF NEW.source_system = '' OR NEW.source_record_id = '' THEN
    RAISE EXCEPTION 'Catalogue source system and source record id are required'
      USING ERRCODE = 'check_violation';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'validate_university_course_catalog_link_trigger'
      AND tgrelid = 'public.university_course_catalog_links'::regclass
  ) THEN
    CREATE TRIGGER validate_university_course_catalog_link_trigger
    BEFORE INSERT OR UPDATE ON public.university_course_catalog_links
    FOR EACH ROW EXECUTE FUNCTION public.validate_university_course_catalog_link();
  END IF;
END $$;

ALTER TABLE public.university_course_catalog_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.university_course_catalog_links FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.university_course_catalog_links TO authenticated;
GRANT ALL ON TABLE public.university_course_catalog_links TO service_role;

CREATE POLICY "Academic admins can view university catalogue links"
ON public.university_course_catalog_links FOR SELECT TO authenticated
USING (public.is_university_academic_admin((SELECT auth.uid()), organization_id));

CREATE POLICY "Academic admins can create university catalogue links"
ON public.university_course_catalog_links FOR INSERT TO authenticated
WITH CHECK (public.is_university_academic_admin((SELECT auth.uid()), organization_id));

CREATE POLICY "Academic admins can update university catalogue links"
ON public.university_course_catalog_links FOR UPDATE TO authenticated
USING (public.is_university_academic_admin((SELECT auth.uid()), organization_id))
WITH CHECK (public.is_university_academic_admin((SELECT auth.uid()), organization_id));

CREATE POLICY "Academic admins can remove university catalogue links"
ON public.university_course_catalog_links FOR DELETE TO authenticated
USING (public.is_university_academic_admin((SELECT auth.uid()), organization_id));

-- Content evidence is course-level. A lesson counts as substantive when it has
-- a non-zero learning duration and either authored/linked content or an
-- activity type that is meaningful without a static file attachment.
CREATE OR REPLACE VIEW public.university_course_content_evidence_v
WITH (security_invoker = true)
AS
SELECT
  c.organization_id,
  c.id AS course_id,
  count(DISTINCT m.id) FILTER (WHERE m.active) AS active_modules,
  count(DISTINCT l.id) FILTER (WHERE m.active) AS active_lessons,
  count(DISTINCT l.id) FILTER (
    WHERE m.active
      AND l.estimated_minutes > 0
      AND (
        l.source_book_id IS NOT NULL
        OR l.source_chapter_id IS NOT NULL
        OR NULLIF(btrim(COALESCE(l.external_url, '')), '') IS NOT NULL
        OR l.content <> '{}'::jsonb
        OR l.lesson_type IN ('live_session','lab','tutorial','discussion','quiz','project')
      )
  ) AS substantive_lessons,
  count(DISTINCT lo.id) FILTER (WHERE lo.active) AS active_course_outcomes
FROM public.university_courses c
LEFT JOIN public.university_modules m ON m.course_id = c.id
LEFT JOIN public.university_lessons l ON l.module_id = m.id
LEFT JOIN public.university_learning_outcomes lo ON lo.course_id = c.id
GROUP BY c.organization_id, c.id;

CREATE OR REPLACE VIEW public.university_offering_readiness_v
WITH (security_invoker = true)
AS
WITH teaching AS (
  SELECT
    offering_id,
    count(DISTINCT user_id) FILTER (WHERE teaching_role IN ('lead_lecturer','lecturer')) AS qualified_teaching_staff
  FROM public.university_teaching_assignments
  GROUP BY offering_id
),
assessment AS (
  SELECT
    offering_id,
    count(*) FILTER (WHERE published) AS published_assignments
  FROM public.university_assignments
  GROUP BY offering_id
),
grade_plan AS (
  SELECT
    offering_id,
    count(*) FILTER (WHERE published) AS published_grade_items,
    COALESCE(sum(weight_percent) FILTER (WHERE published), 0) AS published_weight_percent
  FROM public.university_grade_items
  GROUP BY offering_id
)
SELECT
  o.organization_id,
  o.id AS offering_id,
  o.course_id,
  c.code AS course_code,
  c.title AS course_title,
  o.section_code,
  o.enrolment_status,
  t.status AS term_status,
  COALESCE(ev.active_modules, 0) AS active_modules,
  COALESCE(ev.active_lessons, 0) AS active_lessons,
  COALESCE(ev.substantive_lessons, 0) AS substantive_lessons,
  COALESCE(ev.active_course_outcomes, 0) AS active_course_outcomes,
  COALESCE(te.qualified_teaching_staff, 0) AS qualified_teaching_staff,
  COALESCE(a.published_assignments, 0) AS published_assignments,
  COALESCE(gp.published_grade_items, 0) AS published_grade_items,
  COALESCE(gp.published_weight_percent, 0) AS published_weight_percent,
  (
    c.status = 'active'
    AND o.enrolment_status = 'open'
    AND t.status IN ('planned','open','in_progress')
    AND (t.enrolment_opens_at IS NULL OR now() >= t.enrolment_opens_at)
    AND (t.enrolment_closes_at IS NULL OR now() <= t.enrolment_closes_at)
    AND COALESCE(ev.active_modules, 0) > 0
    AND COALESCE(ev.substantive_lessons, 0) > 0
    AND COALESCE(ev.active_course_outcomes, 0) > 0
    AND COALESCE(te.qualified_teaching_staff, 0) > 0
    AND COALESCE(a.published_assignments, 0) > 0
    AND COALESCE(gp.published_grade_items, 0) > 0
    AND abs(COALESCE(gp.published_weight_percent, 0) - 100.000) <= 0.001
  ) AS is_enrollable,
  array_remove(ARRAY[
    CASE WHEN c.status <> 'active' THEN 'course_not_active' END,
    CASE WHEN o.enrolment_status <> 'open' THEN 'offering_not_open' END,
    CASE WHEN t.status NOT IN ('planned','open','in_progress') THEN 'term_not_available' END,
    CASE WHEN t.enrolment_opens_at IS NOT NULL AND now() < t.enrolment_opens_at THEN 'enrolment_window_not_open' END,
    CASE WHEN t.enrolment_closes_at IS NOT NULL AND now() > t.enrolment_closes_at THEN 'enrolment_window_closed' END,
    CASE WHEN COALESCE(ev.active_modules, 0) = 0 THEN 'no_active_modules' END,
    CASE WHEN COALESCE(ev.substantive_lessons, 0) = 0 THEN 'no_substantive_lessons' END,
    CASE WHEN COALESCE(ev.active_course_outcomes, 0) = 0 THEN 'no_course_learning_outcomes' END,
    CASE WHEN COALESCE(te.qualified_teaching_staff, 0) = 0 THEN 'no_lecturer_assigned' END,
    CASE WHEN COALESCE(a.published_assignments, 0) = 0 THEN 'no_published_assessments' END,
    CASE WHEN COALESCE(gp.published_grade_items, 0) = 0 THEN 'no_published_grade_plan' END,
    CASE WHEN COALESCE(gp.published_grade_items, 0) > 0 AND abs(COALESCE(gp.published_weight_percent, 0) - 100.000) > 0.001 THEN 'grade_weights_not_100_percent' END
  ], NULL) AS blockers
FROM public.university_course_offerings o
JOIN public.university_courses c ON c.id = o.course_id
JOIN public.university_academic_terms t ON t.id = o.term_id
LEFT JOIN public.university_course_content_evidence_v ev ON ev.course_id = c.id
LEFT JOIN teaching te ON te.offering_id = o.id
LEFT JOIN assessment a ON a.offering_id = o.id
LEFT JOIN grade_plan gp ON gp.offering_id = o.id;

CREATE OR REPLACE VIEW public.university_course_readiness_v
WITH (security_invoker = true)
AS
WITH offering_rollup AS (
  SELECT
    organization_id,
    course_id,
    count(*) FILTER (WHERE enrolment_status IN ('planned','open','waitlist')) AS scheduled_offerings,
    count(*) FILTER (WHERE is_enrollable) AS enrollable_offerings
  FROM public.university_offering_readiness_v
  GROUP BY organization_id, course_id
),
links AS (
  SELECT
    organization_id,
    university_course_id AS course_id,
    count(*) AS linked_catalog_records,
    array_agg(DISTINCT source_system ORDER BY source_system) AS source_systems
  FROM public.university_course_catalog_links
  GROUP BY organization_id, university_course_id
)
SELECT
  c.organization_id,
  c.id AS course_id,
  c.code,
  c.title,
  c.credits,
  c.status AS course_status,
  COALESCE(ev.active_modules, 0) AS active_modules,
  COALESCE(ev.active_lessons, 0) AS active_lessons,
  COALESCE(ev.substantive_lessons, 0) AS substantive_lessons,
  COALESCE(ev.active_course_outcomes, 0) AS active_course_outcomes,
  COALESCE(oroll.scheduled_offerings, 0) AS scheduled_offerings,
  COALESCE(oroll.enrollable_offerings, 0) AS enrollable_offerings,
  COALESCE(ln.linked_catalog_records, 0) AS linked_catalog_records,
  COALESCE(ln.source_systems, ARRAY[]::text[]) AS source_systems,
  CASE
    WHEN COALESCE(ev.active_modules, 0) = 0 THEN 'shell'
    WHEN COALESCE(ev.substantive_lessons, 0) = 0 OR COALESCE(ev.active_course_outcomes, 0) = 0 THEN 'in_development'
    WHEN COALESCE(oroll.enrollable_offerings, 0) > 0 THEN 'enrollable'
    WHEN COALESCE(oroll.scheduled_offerings, 0) > 0 THEN 'scheduled'
    ELSE 'teaching_ready'
  END AS readiness_status
FROM public.university_courses c
LEFT JOIN public.university_course_content_evidence_v ev ON ev.course_id = c.id
LEFT JOIN offering_rollup oroll
  ON oroll.organization_id = c.organization_id
 AND oroll.course_id = c.id
LEFT JOIN links ln
  ON ln.organization_id = c.organization_id
 AND ln.course_id = c.id;

REVOKE ALL ON TABLE public.university_course_content_evidence_v FROM anon, authenticated;
REVOKE ALL ON TABLE public.university_offering_readiness_v FROM anon, authenticated;
REVOKE ALL ON TABLE public.university_course_readiness_v FROM anon, authenticated;
GRANT SELECT ON TABLE public.university_course_content_evidence_v TO authenticated;
GRANT SELECT ON TABLE public.university_offering_readiness_v TO authenticated;
GRANT SELECT ON TABLE public.university_course_readiness_v TO authenticated;
GRANT ALL ON TABLE public.university_course_content_evidence_v TO service_role;
GRANT ALL ON TABLE public.university_offering_readiness_v TO service_role;
GRANT ALL ON TABLE public.university_course_readiness_v TO service_role;

-- Upgrade the existing concurrent-capacity guard so an enrolment cannot move to
-- status=enrolled until the target offering has real learning content, outcomes,
-- assigned teaching staff, published assessment and a complete 100% grade plan.
CREATE OR REPLACE FUNCTION public.enforce_university_offering_capacity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_capacity integer;
  v_enrolled integer;
  v_is_enrollable boolean;
  v_blockers text[];
BEGIN
  IF NEW.status <> 'enrolled' THEN
    RETURN NEW;
  END IF;

  SELECT capacity INTO v_capacity
  FROM public.university_course_offerings
  WHERE id = NEW.offering_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Course offering not found' USING ERRCODE = 'foreign_key_violation';
  END IF;

  SELECT is_enrollable, blockers
  INTO v_is_enrollable, v_blockers
  FROM public.university_offering_readiness_v
  WHERE offering_id = NEW.offering_id;

  IF NOT COALESCE(v_is_enrollable, false) THEN
    RAISE EXCEPTION 'Course offering is not ready for enrolment: %', array_to_string(COALESCE(v_blockers, ARRAY['readiness_evidence_unavailable']), ', ')
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_capacity IS NOT NULL THEN
    SELECT count(*) INTO v_enrolled
    FROM public.university_enrolments
    WHERE offering_id = NEW.offering_id
      AND status = 'enrolled'
      AND (TG_OP = 'INSERT' OR id <> NEW.id);

    IF v_enrolled >= v_capacity THEN
      RAISE EXCEPTION 'Course offering capacity of % has been reached', v_capacity
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
