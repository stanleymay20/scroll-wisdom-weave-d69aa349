-- ScrollUniversity authorization and Data API grants.
-- Every university table lives in the exposed public schema, so RLS is enabled
-- explicitly and anon access is revoked. Policies combine organization
-- membership, university roles, teaching assignments and student ownership.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'university_settings','university_people','university_schools','university_programmes',
    'university_academic_terms','university_courses','university_programme_courses',
    'university_course_prerequisites','university_cohorts','university_cohort_members',
    'university_course_offerings','university_teaching_assignments','university_enrolments',
    'university_learning_outcomes','university_outcome_mappings','university_modules',
    'university_lessons','university_assignments','university_submissions',
    'university_grade_items','university_grades','university_attendance_sessions',
    'university_attendance_records','university_announcements'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', t);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.is_university_academic_admin(_user_id uuid, _org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT public.is_org_admin(_user_id, _org_id)
    OR EXISTS (
      SELECT 1
      FROM public.university_people up
      WHERE up.organization_id = _org_id
        AND up.user_id = _user_id
        AND up.status = 'active'
        AND up.university_role IN ('chancellor','registrar','dean','programme_lead')
    );
$$;

CREATE OR REPLACE FUNCTION public.teaches_university_offering(_user_id uuid, _offering_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.university_teaching_assignments uta
    WHERE uta.offering_id = _offering_id
      AND uta.user_id = _user_id
      AND uta.teaching_role IN ('lead_lecturer','lecturer','teaching_assistant','grader')
  );
$$;

CREATE OR REPLACE FUNCTION public.manages_university_offering(_user_id uuid, _offering_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.university_course_offerings uco
    WHERE uco.id = _offering_id
      AND (
        public.is_university_academic_admin(_user_id, uco.organization_id)
        OR EXISTS (
          SELECT 1
          FROM public.university_teaching_assignments uta
          WHERE uta.offering_id = uco.id
            AND uta.user_id = _user_id
            AND uta.teaching_role IN ('lead_lecturer','lecturer','teaching_assistant')
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.is_university_enrolled(_user_id uuid, _offering_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.university_enrolments ue
    WHERE ue.offering_id = _offering_id
      AND ue.user_id = _user_id
      AND ue.status IN ('enrolled','completed')
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_university_academic_admin(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.teaches_university_offering(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.manages_university_offering(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_university_enrolled(uuid, uuid) TO authenticated;

-- Settings ------------------------------------------------------------------
CREATE POLICY "University members can view settings"
ON public.university_settings FOR SELECT TO authenticated
USING (public.is_org_member((SELECT auth.uid()), organization_id));

CREATE POLICY "Organization admins can create university settings"
ON public.university_settings FOR INSERT TO authenticated
WITH CHECK (public.is_org_admin((SELECT auth.uid()), organization_id));

CREATE POLICY "Organization admins can update university settings"
ON public.university_settings FOR UPDATE TO authenticated
USING (public.is_org_admin((SELECT auth.uid()), organization_id))
WITH CHECK (public.is_org_admin((SELECT auth.uid()), organization_id));

CREATE POLICY "Organization admins can delete university settings"
ON public.university_settings FOR DELETE TO authenticated
USING (public.is_org_admin((SELECT auth.uid()), organization_id));

-- People --------------------------------------------------------------------
CREATE POLICY "University members can view people directory"
ON public.university_people FOR SELECT TO authenticated
USING (public.is_org_member((SELECT auth.uid()), organization_id));

CREATE POLICY "Organization admins can add university people"
ON public.university_people FOR INSERT TO authenticated
WITH CHECK (public.is_org_admin((SELECT auth.uid()), organization_id));

CREATE POLICY "Organization admins can update university people"
ON public.university_people FOR UPDATE TO authenticated
USING (public.is_org_admin((SELECT auth.uid()), organization_id))
WITH CHECK (public.is_org_admin((SELECT auth.uid()), organization_id));

CREATE POLICY "Organization admins can remove university people"
ON public.university_people FOR DELETE TO authenticated
USING (public.is_org_admin((SELECT auth.uid()), organization_id));

-- Institution-controlled academic catalogue --------------------------------
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'university_schools','university_programmes','university_academic_terms',
    'university_courses','university_programme_courses','university_course_prerequisites',
    'university_cohorts','university_cohort_members','university_course_offerings',
    'university_teaching_assignments','university_enrolments','university_outcome_mappings'
  ]
  LOOP
    EXECUTE format(
      'CREATE POLICY "University members can view %1$s" ON public.%1$I FOR SELECT TO authenticated USING (public.is_org_member((SELECT auth.uid()), organization_id))', t
    );
    EXECUTE format(
      'CREATE POLICY "Academic admins can insert %1$s" ON public.%1$I FOR INSERT TO authenticated WITH CHECK (public.is_university_academic_admin((SELECT auth.uid()), organization_id))', t
    );
    EXECUTE format(
      'CREATE POLICY "Academic admins can update %1$s" ON public.%1$I FOR UPDATE TO authenticated USING (public.is_university_academic_admin((SELECT auth.uid()), organization_id)) WITH CHECK (public.is_university_academic_admin((SELECT auth.uid()), organization_id))', t
    );
    EXECUTE format(
      'CREATE POLICY "Academic admins can delete %1$s" ON public.%1$I FOR DELETE TO authenticated USING (public.is_university_academic_admin((SELECT auth.uid()), organization_id))', t
    );
  END LOOP;
END $$;

-- Student enrolments are sensitive: replace broad enrolment SELECT with a
-- restrictive policy set by removing the loop-created policy and defining
-- student/teacher/admin visibility explicitly.
DROP POLICY "University members can view university_enrolments" ON public.university_enrolments;
CREATE POLICY "Students can view their own enrolments"
ON public.university_enrolments FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()));
CREATE POLICY "Teaching staff can view their rosters"
ON public.university_enrolments FOR SELECT TO authenticated
USING (public.teaches_university_offering((SELECT auth.uid()), offering_id));
CREATE POLICY "Academic admins can view enrolments"
ON public.university_enrolments FOR SELECT TO authenticated
USING (public.is_university_academic_admin((SELECT auth.uid()), organization_id));

-- Cohort membership is similarly limited to the learner, staff and admins.
DROP POLICY "University members can view university_cohort_members" ON public.university_cohort_members;
CREATE POLICY "Students can view their own cohort membership"
ON public.university_cohort_members FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()));
CREATE POLICY "University staff can view cohort membership"
ON public.university_cohort_members FOR SELECT TO authenticated
USING (
  public.is_university_academic_admin((SELECT auth.uid()), organization_id)
  OR EXISTS (
    SELECT 1 FROM public.university_people up
    WHERE up.organization_id = university_cohort_members.organization_id
      AND up.user_id = (SELECT auth.uid())
      AND up.status = 'active'
      AND up.university_role IN ('lecturer','teaching_assistant','advisor')
  )
);

-- Learning outcomes ----------------------------------------------------------
CREATE POLICY "University members can view learning outcomes"
ON public.university_learning_outcomes FOR SELECT TO authenticated
USING (public.is_org_member((SELECT auth.uid()), organization_id));

CREATE POLICY "Academic staff can create learning outcomes"
ON public.university_learning_outcomes FOR INSERT TO authenticated
WITH CHECK (
  public.is_university_academic_admin((SELECT auth.uid()), organization_id)
  OR (
    course_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.university_course_offerings o
      WHERE o.course_id = university_learning_outcomes.course_id
        AND public.teaches_university_offering((SELECT auth.uid()), o.id)
    )
  )
);

CREATE POLICY "Academic staff can update learning outcomes"
ON public.university_learning_outcomes FOR UPDATE TO authenticated
USING (
  public.is_university_academic_admin((SELECT auth.uid()), organization_id)
  OR (
    course_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.university_course_offerings o
      WHERE o.course_id = university_learning_outcomes.course_id
        AND public.teaches_university_offering((SELECT auth.uid()), o.id)
    )
  )
)
WITH CHECK (
  public.is_university_academic_admin((SELECT auth.uid()), organization_id)
  OR (
    course_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.university_course_offerings o
      WHERE o.course_id = university_learning_outcomes.course_id
        AND public.teaches_university_offering((SELECT auth.uid()), o.id)
    )
  )
);

CREATE POLICY "Academic staff can delete learning outcomes"
ON public.university_learning_outcomes FOR DELETE TO authenticated
USING (
  public.is_university_academic_admin((SELECT auth.uid()), organization_id)
  OR (
    course_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.university_course_offerings o
      WHERE o.course_id = university_learning_outcomes.course_id
        AND public.teaches_university_offering((SELECT auth.uid()), o.id)
    )
  )
);

-- Modules and lessons ---------------------------------------------------------
CREATE POLICY "University members can view course modules"
ON public.university_modules FOR SELECT TO authenticated
USING (public.is_org_member((SELECT auth.uid()), organization_id));
CREATE POLICY "Course staff can create modules"
ON public.university_modules FOR INSERT TO authenticated
WITH CHECK (
  public.is_university_academic_admin((SELECT auth.uid()), organization_id)
  OR EXISTS (
    SELECT 1 FROM public.university_course_offerings o
    WHERE o.course_id = university_modules.course_id
      AND public.manages_university_offering((SELECT auth.uid()), o.id)
  )
);
CREATE POLICY "Course staff can update modules"
ON public.university_modules FOR UPDATE TO authenticated
USING (
  public.is_university_academic_admin((SELECT auth.uid()), organization_id)
  OR EXISTS (
    SELECT 1 FROM public.university_course_offerings o
    WHERE o.course_id = university_modules.course_id
      AND public.manages_university_offering((SELECT auth.uid()), o.id)
  )
)
WITH CHECK (
  public.is_university_academic_admin((SELECT auth.uid()), organization_id)
  OR EXISTS (
    SELECT 1 FROM public.university_course_offerings o
    WHERE o.course_id = university_modules.course_id
      AND public.manages_university_offering((SELECT auth.uid()), o.id)
  )
);
CREATE POLICY "Course staff can delete modules"
ON public.university_modules FOR DELETE TO authenticated
USING (
  public.is_university_academic_admin((SELECT auth.uid()), organization_id)
  OR EXISTS (
    SELECT 1 FROM public.university_course_offerings o
    WHERE o.course_id = university_modules.course_id
      AND public.manages_university_offering((SELECT auth.uid()), o.id)
  )
);

CREATE POLICY "University members can view lessons"
ON public.university_lessons FOR SELECT TO authenticated
USING (public.is_org_member((SELECT auth.uid()), organization_id));
CREATE POLICY "Course staff can create lessons"
ON public.university_lessons FOR INSERT TO authenticated
WITH CHECK (
  public.is_university_academic_admin((SELECT auth.uid()), organization_id)
  OR EXISTS (
    SELECT 1 FROM public.university_modules m
    JOIN public.university_course_offerings o ON o.course_id = m.course_id
    WHERE m.id = university_lessons.module_id
      AND public.manages_university_offering((SELECT auth.uid()), o.id)
  )
);
CREATE POLICY "Course staff can update lessons"
ON public.university_lessons FOR UPDATE TO authenticated
USING (
  public.is_university_academic_admin((SELECT auth.uid()), organization_id)
  OR EXISTS (
    SELECT 1 FROM public.university_modules m
    JOIN public.university_course_offerings o ON o.course_id = m.course_id
    WHERE m.id = university_lessons.module_id
      AND public.manages_university_offering((SELECT auth.uid()), o.id)
  )
)
WITH CHECK (
  public.is_university_academic_admin((SELECT auth.uid()), organization_id)
  OR EXISTS (
    SELECT 1 FROM public.university_modules m
    JOIN public.university_course_offerings o ON o.course_id = m.course_id
    WHERE m.id = university_lessons.module_id
      AND public.manages_university_offering((SELECT auth.uid()), o.id)
  )
);
CREATE POLICY "Course staff can delete lessons"
ON public.university_lessons FOR DELETE TO authenticated
USING (
  public.is_university_academic_admin((SELECT auth.uid()), organization_id)
  OR EXISTS (
    SELECT 1 FROM public.university_modules m
    JOIN public.university_course_offerings o ON o.course_id = m.course_id
    WHERE m.id = university_lessons.module_id
      AND public.manages_university_offering((SELECT auth.uid()), o.id)
  )
);

-- Assignments ----------------------------------------------------------------
CREATE POLICY "Enrolled students can view published assignments"
ON public.university_assignments FOR SELECT TO authenticated
USING (published AND public.is_university_enrolled((SELECT auth.uid()), offering_id));
CREATE POLICY "Course staff can view all assignments"
ON public.university_assignments FOR SELECT TO authenticated
USING (public.manages_university_offering((SELECT auth.uid()), offering_id));
CREATE POLICY "Course staff can create assignments"
ON public.university_assignments FOR INSERT TO authenticated
WITH CHECK (public.manages_university_offering((SELECT auth.uid()), offering_id) AND created_by = (SELECT auth.uid()));
CREATE POLICY "Course staff can update assignments"
ON public.university_assignments FOR UPDATE TO authenticated
USING (public.manages_university_offering((SELECT auth.uid()), offering_id))
WITH CHECK (public.manages_university_offering((SELECT auth.uid()), offering_id));
CREATE POLICY "Course staff can delete assignments"
ON public.university_assignments FOR DELETE TO authenticated
USING (public.manages_university_offering((SELECT auth.uid()), offering_id));

-- Submissions ----------------------------------------------------------------
CREATE POLICY "Students can view their own submissions"
ON public.university_submissions FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()));
CREATE POLICY "Course staff can view submissions"
ON public.university_submissions FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.university_assignments a
    WHERE a.id = university_submissions.assignment_id
      AND public.manages_university_offering((SELECT auth.uid()), a.offering_id)
  )
);
CREATE POLICY "Students can create their own submissions"
ON public.university_submissions FOR INSERT TO authenticated
WITH CHECK (
  user_id = (SELECT auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.university_assignments a
    WHERE a.id = university_submissions.assignment_id
      AND a.published
      AND public.is_university_enrolled((SELECT auth.uid()), a.offering_id)
  )
);
CREATE POLICY "Students can update draft submissions"
ON public.university_submissions FOR UPDATE TO authenticated
USING (user_id = (SELECT auth.uid()) AND status IN ('draft','returned','resubmission_required'))
WITH CHECK (user_id = (SELECT auth.uid()));

-- Grade items and grades ------------------------------------------------------
CREATE POLICY "Enrolled students can view published grade items"
ON public.university_grade_items FOR SELECT TO authenticated
USING (published AND public.is_university_enrolled((SELECT auth.uid()), offering_id));
CREATE POLICY "Course staff can view grade items"
ON public.university_grade_items FOR SELECT TO authenticated
USING (public.manages_university_offering((SELECT auth.uid()), offering_id));
CREATE POLICY "Course staff can create grade items"
ON public.university_grade_items FOR INSERT TO authenticated
WITH CHECK (public.manages_university_offering((SELECT auth.uid()), offering_id));
CREATE POLICY "Course staff can update grade items"
ON public.university_grade_items FOR UPDATE TO authenticated
USING (public.manages_university_offering((SELECT auth.uid()), offering_id))
WITH CHECK (public.manages_university_offering((SELECT auth.uid()), offering_id));
CREATE POLICY "Course staff can delete grade items"
ON public.university_grade_items FOR DELETE TO authenticated
USING (public.manages_university_offering((SELECT auth.uid()), offering_id));

CREATE POLICY "Students can view their published grades"
ON public.university_grades FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()) AND status = 'published');
CREATE POLICY "Course staff can view grades"
ON public.university_grades FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.university_grade_items gi
    WHERE gi.id = university_grades.grade_item_id
      AND public.manages_university_offering((SELECT auth.uid()), gi.offering_id)
  )
);
CREATE POLICY "Course staff can create grades"
ON public.university_grades FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.university_grade_items gi
    WHERE gi.id = university_grades.grade_item_id
      AND public.manages_university_offering((SELECT auth.uid()), gi.offering_id)
  )
);
CREATE POLICY "Course staff can update grades"
ON public.university_grades FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.university_grade_items gi
    WHERE gi.id = university_grades.grade_item_id
      AND public.manages_university_offering((SELECT auth.uid()), gi.offering_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.university_grade_items gi
    WHERE gi.id = university_grades.grade_item_id
      AND public.manages_university_offering((SELECT auth.uid()), gi.offering_id)
  )
);
CREATE POLICY "Course staff can delete grades"
ON public.university_grades FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.university_grade_items gi
    WHERE gi.id = university_grades.grade_item_id
      AND public.manages_university_offering((SELECT auth.uid()), gi.offering_id)
  )
);

-- Attendance -----------------------------------------------------------------
CREATE POLICY "Enrolled students can view attendance sessions"
ON public.university_attendance_sessions FOR SELECT TO authenticated
USING (public.is_university_enrolled((SELECT auth.uid()), offering_id));
CREATE POLICY "Course staff can view attendance sessions"
ON public.university_attendance_sessions FOR SELECT TO authenticated
USING (public.manages_university_offering((SELECT auth.uid()), offering_id));
CREATE POLICY "Course staff can create attendance sessions"
ON public.university_attendance_sessions FOR INSERT TO authenticated
WITH CHECK (public.manages_university_offering((SELECT auth.uid()), offering_id) AND created_by = (SELECT auth.uid()));
CREATE POLICY "Course staff can update attendance sessions"
ON public.university_attendance_sessions FOR UPDATE TO authenticated
USING (public.manages_university_offering((SELECT auth.uid()), offering_id))
WITH CHECK (public.manages_university_offering((SELECT auth.uid()), offering_id));
CREATE POLICY "Course staff can delete attendance sessions"
ON public.university_attendance_sessions FOR DELETE TO authenticated
USING (public.manages_university_offering((SELECT auth.uid()), offering_id));

CREATE POLICY "Students can view their own attendance"
ON public.university_attendance_records FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()));
CREATE POLICY "Course staff can view attendance records"
ON public.university_attendance_records FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.university_attendance_sessions s
    WHERE s.id = university_attendance_records.session_id
      AND public.manages_university_offering((SELECT auth.uid()), s.offering_id)
  )
);
CREATE POLICY "Course staff can create attendance records"
ON public.university_attendance_records FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.university_attendance_sessions s
    WHERE s.id = university_attendance_records.session_id
      AND public.manages_university_offering((SELECT auth.uid()), s.offering_id)
  )
);
CREATE POLICY "Course staff can update attendance records"
ON public.university_attendance_records FOR UPDATE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.university_attendance_sessions s
    WHERE s.id = university_attendance_records.session_id
      AND public.manages_university_offering((SELECT auth.uid()), s.offering_id)
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.university_attendance_sessions s
    WHERE s.id = university_attendance_records.session_id
      AND public.manages_university_offering((SELECT auth.uid()), s.offering_id)
  )
);
CREATE POLICY "Course staff can delete attendance records"
ON public.university_attendance_records FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.university_attendance_sessions s
    WHERE s.id = university_attendance_records.session_id
      AND public.manages_university_offering((SELECT auth.uid()), s.offering_id)
  )
);

-- Announcements ---------------------------------------------------------------
CREATE POLICY "University members can view published announcements"
ON public.university_announcements FOR SELECT TO authenticated
USING (
  public.is_org_member((SELECT auth.uid()), organization_id)
  AND published_at IS NOT NULL
  AND published_at <= now()
  AND (expires_at IS NULL OR expires_at > now())
);
CREATE POLICY "University staff can view draft announcements"
ON public.university_announcements FOR SELECT TO authenticated
USING (
  public.is_university_academic_admin((SELECT auth.uid()), organization_id)
  OR (offering_id IS NOT NULL AND public.manages_university_offering((SELECT auth.uid()), offering_id))
);
CREATE POLICY "University staff can create announcements"
ON public.university_announcements FOR INSERT TO authenticated
WITH CHECK (
  created_by = (SELECT auth.uid())
  AND (
    public.is_university_academic_admin((SELECT auth.uid()), organization_id)
    OR (offering_id IS NOT NULL AND public.manages_university_offering((SELECT auth.uid()), offering_id))
  )
);
CREATE POLICY "University staff can update announcements"
ON public.university_announcements FOR UPDATE TO authenticated
USING (
  public.is_university_academic_admin((SELECT auth.uid()), organization_id)
  OR (offering_id IS NOT NULL AND public.manages_university_offering((SELECT auth.uid()), offering_id))
)
WITH CHECK (
  public.is_university_academic_admin((SELECT auth.uid()), organization_id)
  OR (offering_id IS NOT NULL AND public.manages_university_offering((SELECT auth.uid()), offering_id))
);
CREATE POLICY "University staff can delete announcements"
ON public.university_announcements FOR DELETE TO authenticated
USING (
  public.is_university_academic_admin((SELECT auth.uid()), organization_id)
  OR (offering_id IS NOT NULL AND public.manages_university_offering((SELECT auth.uid()), offering_id))
);
