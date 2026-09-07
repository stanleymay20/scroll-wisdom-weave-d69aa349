-- Harden ScrollUniversity lifecycle policies against RLS recursion.
-- Narrow SECURITY DEFINER predicates expose booleans only; callers receive no
-- underlying lifecycle rows beyond the policies that use these predicates.

CREATE OR REPLACE FUNCTION public.is_university_programme_registration_owner(
  _user_id uuid,
  _registration_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.university_programme_registrations r
    WHERE r.id = _registration_id
      AND r.user_id = _user_id
  );
$$;

CREATE OR REPLACE FUNCTION public.is_assigned_university_advisor(
  _user_id uuid,
  _registration_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.university_advising_assignments a
    WHERE a.programme_registration_id = _registration_id
      AND a.advisor_user_id = _user_id
      AND a.starts_on <= CURRENT_DATE
      AND (a.ends_on IS NULL OR a.ends_on >= CURRENT_DATE)
  );
$$;

REVOKE ALL ON FUNCTION public.is_university_programme_registration_owner(uuid, uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_assigned_university_advisor(uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_university_programme_registration_owner(uuid, uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_assigned_university_advisor(uuid, uuid)
  TO authenticated;

DROP POLICY IF EXISTS "Assigned advisors can view programme registrations"
  ON public.university_programme_registrations;
CREATE POLICY "Assigned advisors can view programme registrations"
ON public.university_programme_registrations FOR SELECT TO authenticated
USING (public.is_assigned_university_advisor((SELECT auth.uid()), id));

DROP POLICY IF EXISTS "Students can view own advisor assignment"
  ON public.university_advising_assignments;
CREATE POLICY "Students can view own advisor assignment"
ON public.university_advising_assignments FOR SELECT TO authenticated
USING (public.is_university_programme_registration_owner(
  (SELECT auth.uid()), programme_registration_id
));

DROP POLICY IF EXISTS "Students can view released advising notes"
  ON public.university_advising_notes;
CREATE POLICY "Students can view released advising notes"
ON public.university_advising_notes FOR SELECT TO authenticated
USING (
  student_visible
  AND public.is_university_programme_registration_owner(
    (SELECT auth.uid()), programme_registration_id
  )
);

DROP POLICY IF EXISTS "Assigned advisors can manage advising notes"
  ON public.university_advising_notes;
CREATE POLICY "Assigned advisors can manage advising notes"
ON public.university_advising_notes FOR ALL TO authenticated
USING (
  author_user_id = (SELECT auth.uid())
  OR public.is_university_academic_admin((SELECT auth.uid()), organization_id)
)
WITH CHECK (
  (
    author_user_id = (SELECT auth.uid())
    AND public.is_assigned_university_advisor(
      (SELECT auth.uid()), programme_registration_id
    )
  )
  OR public.is_university_academic_admin((SELECT auth.uid()), organization_id)
);

DROP POLICY IF EXISTS "Students can view own academic standing"
  ON public.university_academic_standing;
CREATE POLICY "Students can view own academic standing"
ON public.university_academic_standing FOR SELECT TO authenticated
USING (public.is_university_programme_registration_owner(
  (SELECT auth.uid()), programme_registration_id
));

DROP POLICY IF EXISTS "Assigned advisors can view academic standing"
  ON public.university_academic_standing;
CREATE POLICY "Assigned advisors can view academic standing"
ON public.university_academic_standing FOR SELECT TO authenticated
USING (public.is_assigned_university_advisor(
  (SELECT auth.uid()), programme_registration_id
));

DROP POLICY IF EXISTS "Students can view own recognized credit"
  ON public.university_recognized_credits;
CREATE POLICY "Students can view own recognized credit"
ON public.university_recognized_credits FOR SELECT TO authenticated
USING (public.is_university_programme_registration_owner(
  (SELECT auth.uid()), programme_registration_id
));

DROP POLICY IF EXISTS "Students can view own progression decisions"
  ON public.university_progression_decisions;
CREATE POLICY "Students can view own progression decisions"
ON public.university_progression_decisions FOR SELECT TO authenticated
USING (public.is_university_programme_registration_owner(
  (SELECT auth.uid()), programme_registration_id
));

DROP POLICY IF EXISTS "Students can view own completion clearance"
  ON public.university_completion_clearances;
CREATE POLICY "Students can view own completion clearance"
ON public.university_completion_clearances FOR SELECT TO authenticated
USING (public.is_university_programme_registration_owner(
  (SELECT auth.uid()), programme_registration_id
));
