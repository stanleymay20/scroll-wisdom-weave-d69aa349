-- ScrollUniversity academic core
-- Institution root = existing public.organizations. This migration adds the
-- university-specific academic, teaching, assessment and student-record layers.

CREATE TABLE IF NOT EXISTS public.university_settings (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  institution_type text NOT NULL DEFAULT 'university' CHECK (institution_type IN ('university','college','academy','training_provider','school','other')),
  academic_year_start_month integer NOT NULL DEFAULT 9 CHECK (academic_year_start_month BETWEEN 1 AND 12),
  timezone text NOT NULL DEFAULT 'UTC',
  locale text NOT NULL DEFAULT 'en',
  grading_scheme jsonb NOT NULL DEFAULT '{"pass_mark":50,"bands":[{"label":"A","min":70},{"label":"B","min":60},{"label":"C","min":50},{"label":"F","min":0}]}'::jsonb,
  branding jsonb NOT NULL DEFAULT '{}'::jsonb,
  public_catalog_enabled boolean NOT NULL DEFAULT false,
  lms_interop_enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.university_people (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  university_role text NOT NULL DEFAULT 'student' CHECK (university_role IN ('chancellor','registrar','dean','programme_lead','lecturer','teaching_assistant','advisor','student','auditor')),
  display_name text,
  student_number text,
  staff_number text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('invited','active','suspended','alumni','inactive')),
  external_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id),
  UNIQUE (organization_id, student_number),
  UNIQUE (organization_id, staff_number)
);

CREATE TABLE IF NOT EXISTS public.university_schools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  parent_school_id uuid REFERENCES public.university_schools(id) ON DELETE SET NULL,
  code text NOT NULL,
  name text NOT NULL,
  school_type text NOT NULL DEFAULT 'faculty' CHECK (school_type IN ('faculty','school','department','institute','centre')),
  description text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, code)
);

CREATE TABLE IF NOT EXISTS public.university_programmes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  school_id uuid REFERENCES public.university_schools(id) ON DELETE SET NULL,
  code text NOT NULL,
  name text NOT NULL,
  qualification_level text NOT NULL DEFAULT 'certificate' CHECK (qualification_level IN ('foundation','certificate','diploma','associate','bachelor','postgraduate_certificate','postgraduate_diploma','master','doctorate','professional','continuing_education')),
  duration_terms integer CHECK (duration_terms IS NULL OR duration_terms > 0),
  total_credits numeric(8,2) CHECK (total_credits IS NULL OR total_credits >= 0),
  description text,
  admissions_requirements text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','teach_out','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, code)
);

CREATE TABLE IF NOT EXISTS public.university_academic_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code text NOT NULL,
  name text NOT NULL,
  academic_year text NOT NULL,
  term_number integer NOT NULL DEFAULT 1 CHECK (term_number > 0),
  starts_on date NOT NULL,
  ends_on date NOT NULL,
  enrolment_opens_at timestamptz,
  enrolment_closes_at timestamptz,
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','open','in_progress','grading','closed','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (ends_on >= starts_on),
  UNIQUE (organization_id, code)
);

CREATE TABLE IF NOT EXISTS public.university_courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  school_id uuid REFERENCES public.university_schools(id) ON DELETE SET NULL,
  code text NOT NULL,
  title text NOT NULL,
  description text,
  credits numeric(6,2) NOT NULL DEFAULT 0 CHECK (credits >= 0),
  level integer CHECK (level IS NULL OR level >= 0),
  contact_hours numeric(7,2) NOT NULL DEFAULT 0 CHECK (contact_hours >= 0),
  independent_hours numeric(7,2) NOT NULL DEFAULT 0 CHECK (independent_hours >= 0),
  delivery_mode text NOT NULL DEFAULT 'online' CHECK (delivery_mode IN ('online','in_person','hybrid','self_paced')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','retired','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, code)
);

CREATE TABLE IF NOT EXISTS public.university_programme_courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  programme_id uuid NOT NULL REFERENCES public.university_programmes(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.university_courses(id) ON DELETE CASCADE,
  year_number integer NOT NULL DEFAULT 1 CHECK (year_number > 0),
  term_number integer NOT NULL DEFAULT 1 CHECK (term_number > 0),
  is_required boolean NOT NULL DEFAULT true,
  credits_override numeric(6,2) CHECK (credits_override IS NULL OR credits_override >= 0),
  sequence integer NOT NULL DEFAULT 1 CHECK (sequence > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (programme_id, course_id)
);

CREATE TABLE IF NOT EXISTS public.university_course_prerequisites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.university_courses(id) ON DELETE CASCADE,
  prerequisite_course_id uuid NOT NULL REFERENCES public.university_courses(id) ON DELETE CASCADE,
  minimum_grade numeric(6,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (course_id <> prerequisite_course_id),
  UNIQUE (course_id, prerequisite_course_id)
);

CREATE TABLE IF NOT EXISTS public.university_cohorts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  programme_id uuid REFERENCES public.university_programmes(id) ON DELETE SET NULL,
  code text NOT NULL,
  name text NOT NULL,
  intake_year integer,
  starts_on date,
  expected_completion_on date,
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','active','completed','archived')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, code)
);

CREATE TABLE IF NOT EXISTS public.university_cohort_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  cohort_id uuid NOT NULL REFERENCES public.university_cohorts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  joined_on date NOT NULL DEFAULT CURRENT_DATE,
  left_on date,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','deferred','withdrawn','completed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (cohort_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.university_course_offerings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.university_courses(id) ON DELETE CASCADE,
  term_id uuid NOT NULL REFERENCES public.university_academic_terms(id) ON DELETE RESTRICT,
  cohort_id uuid REFERENCES public.university_cohorts(id) ON DELETE SET NULL,
  section_code text NOT NULL DEFAULT 'A',
  capacity integer CHECK (capacity IS NULL OR capacity > 0),
  enrolment_status text NOT NULL DEFAULT 'open' CHECK (enrolment_status IN ('planned','open','waitlist','closed','completed','cancelled')),
  starts_at timestamptz,
  ends_at timestamptz,
  delivery_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (course_id, term_id, section_code)
);

CREATE TABLE IF NOT EXISTS public.university_teaching_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  offering_id uuid NOT NULL REFERENCES public.university_course_offerings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  teaching_role text NOT NULL DEFAULT 'lecturer' CHECK (teaching_role IN ('lead_lecturer','lecturer','teaching_assistant','grader','observer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (offering_id, user_id, teaching_role)
);

CREATE TABLE IF NOT EXISTS public.university_enrolments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  offering_id uuid NOT NULL REFERENCES public.university_course_offerings(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'enrolled' CHECK (status IN ('invited','waitlisted','enrolled','completed','failed','withdrawn','deferred')),
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  final_percentage numeric(6,2) CHECK (final_percentage IS NULL OR (final_percentage >= 0 AND final_percentage <= 100)),
  final_grade text,
  credits_earned numeric(6,2) CHECK (credits_earned IS NULL OR credits_earned >= 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (offering_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.university_learning_outcomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  programme_id uuid REFERENCES public.university_programmes(id) ON DELETE CASCADE,
  course_id uuid REFERENCES public.university_courses(id) ON DELETE CASCADE,
  code text NOT NULL,
  description text NOT NULL,
  bloom_level text CHECK (bloom_level IS NULL OR bloom_level IN ('remember','understand','apply','analyze','evaluate','create')),
  competency_domain text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((programme_id IS NOT NULL AND course_id IS NULL) OR (programme_id IS NULL AND course_id IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS public.university_outcome_mappings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  programme_outcome_id uuid NOT NULL REFERENCES public.university_learning_outcomes(id) ON DELETE CASCADE,
  course_outcome_id uuid NOT NULL REFERENCES public.university_learning_outcomes(id) ON DELETE CASCADE,
  contribution_weight numeric(6,3) NOT NULL DEFAULT 1 CHECK (contribution_weight > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (programme_outcome_id, course_outcome_id)
);

CREATE TABLE IF NOT EXISTS public.university_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.university_courses(id) ON DELETE CASCADE,
  code text,
  title text NOT NULL,
  description text,
  sequence integer NOT NULL DEFAULT 1 CHECK (sequence > 0),
  estimated_learning_hours numeric(7,2) NOT NULL DEFAULT 0 CHECK (estimated_learning_hours >= 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (course_id, sequence)
);

CREATE TABLE IF NOT EXISTS public.university_lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  module_id uuid NOT NULL REFERENCES public.university_modules(id) ON DELETE CASCADE,
  title text NOT NULL,
  sequence integer NOT NULL DEFAULT 1 CHECK (sequence > 0),
  lesson_type text NOT NULL DEFAULT 'reading' CHECK (lesson_type IN ('reading','video','audio','live_session','lab','tutorial','discussion','quiz','project','external')),
  source_book_id uuid REFERENCES public.books(id) ON DELETE SET NULL,
  source_chapter_id uuid REFERENCES public.chapters(id) ON DELETE SET NULL,
  external_url text,
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  required boolean NOT NULL DEFAULT true,
  estimated_minutes integer NOT NULL DEFAULT 0 CHECK (estimated_minutes >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (module_id, sequence)
);

CREATE TABLE IF NOT EXISTS public.university_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  offering_id uuid NOT NULL REFERENCES public.university_course_offerings(id) ON DELETE CASCADE,
  module_id uuid REFERENCES public.university_modules(id) ON DELETE SET NULL,
  title text NOT NULL,
  instructions text NOT NULL DEFAULT '',
  assignment_type text NOT NULL DEFAULT 'assignment' CHECK (assignment_type IN ('assignment','quiz','exam','essay','project','lab','presentation','discussion','mastery_check')),
  source_book_id uuid REFERENCES public.books(id) ON DELETE SET NULL,
  source_chapter_id uuid REFERENCES public.chapters(id) ON DELETE SET NULL,
  opens_at timestamptz,
  due_at timestamptz,
  closes_at timestamptz,
  max_points numeric(8,2) NOT NULL DEFAULT 100 CHECK (max_points > 0),
  rubric jsonb NOT NULL DEFAULT '{}'::jsonb,
  allow_late boolean NOT NULL DEFAULT false,
  published boolean NOT NULL DEFAULT false,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.university_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  assignment_id uuid NOT NULL REFERENCES public.university_assignments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  attempt_number integer NOT NULL DEFAULT 1 CHECK (attempt_number > 0),
  body text,
  attachment_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  submitted_at timestamptz,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','late','returned','graded','resubmission_required')),
  integrity_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assignment_id, user_id, attempt_number)
);

CREATE TABLE IF NOT EXISTS public.university_grade_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  offering_id uuid NOT NULL REFERENCES public.university_course_offerings(id) ON DELETE CASCADE,
  assignment_id uuid REFERENCES public.university_assignments(id) ON DELETE SET NULL,
  name text NOT NULL,
  category text NOT NULL DEFAULT 'coursework',
  max_points numeric(8,2) NOT NULL DEFAULT 100 CHECK (max_points > 0),
  weight_percent numeric(6,3) NOT NULL DEFAULT 0 CHECK (weight_percent >= 0 AND weight_percent <= 100),
  published boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.university_grades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  grade_item_id uuid NOT NULL REFERENCES public.university_grade_items(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  submission_id uuid REFERENCES public.university_submissions(id) ON DELETE SET NULL,
  points numeric(9,3) CHECK (points IS NULL OR points >= 0),
  percentage numeric(6,2) CHECK (percentage IS NULL OR (percentage >= 0 AND percentage <= 100)),
  grade_label text,
  feedback text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','excused','missing','incomplete')),
  graded_by uuid,
  graded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (grade_item_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.university_attendance_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  offering_id uuid NOT NULL REFERENCES public.university_course_offerings(id) ON DELETE CASCADE,
  title text NOT NULL,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  location text,
  delivery_url text,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.university_attendance_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.university_attendance_sessions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'present' CHECK (status IN ('present','late','absent','excused','remote')),
  recorded_by uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.university_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  offering_id uuid REFERENCES public.university_course_offerings(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  audience text NOT NULL DEFAULT 'all' CHECK (audience IN ('all','students','staff','course')),
  published_at timestamptz,
  expires_at timestamptz,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Supporting indexes for RLS predicates, rosters, dashboards and gradebooks.
CREATE INDEX IF NOT EXISTS idx_university_people_org_user ON public.university_people(organization_id, user_id);
CREATE INDEX IF NOT EXISTS idx_university_people_org_role ON public.university_people(organization_id, university_role);
CREATE INDEX IF NOT EXISTS idx_university_schools_org ON public.university_schools(organization_id);
CREATE INDEX IF NOT EXISTS idx_university_programmes_org ON public.university_programmes(organization_id);
CREATE INDEX IF NOT EXISTS idx_university_terms_org_dates ON public.university_academic_terms(organization_id, starts_on, ends_on);
CREATE INDEX IF NOT EXISTS idx_university_courses_org ON public.university_courses(organization_id);
CREATE INDEX IF NOT EXISTS idx_university_programme_courses_programme ON public.university_programme_courses(programme_id, year_number, term_number, sequence);
CREATE INDEX IF NOT EXISTS idx_university_cohorts_org_programme ON public.university_cohorts(organization_id, programme_id);
CREATE INDEX IF NOT EXISTS idx_university_cohort_members_user ON public.university_cohort_members(user_id, cohort_id);
CREATE INDEX IF NOT EXISTS idx_university_offerings_term_course ON public.university_course_offerings(term_id, course_id);
CREATE INDEX IF NOT EXISTS idx_university_teaching_user ON public.university_teaching_assignments(user_id, offering_id);
CREATE INDEX IF NOT EXISTS idx_university_enrolments_user ON public.university_enrolments(user_id, offering_id);
CREATE INDEX IF NOT EXISTS idx_university_outcomes_course ON public.university_learning_outcomes(course_id);
CREATE INDEX IF NOT EXISTS idx_university_outcomes_programme ON public.university_learning_outcomes(programme_id);
CREATE INDEX IF NOT EXISTS idx_university_modules_course ON public.university_modules(course_id, sequence);
CREATE INDEX IF NOT EXISTS idx_university_lessons_module ON public.university_lessons(module_id, sequence);
CREATE INDEX IF NOT EXISTS idx_university_assignments_offering_due ON public.university_assignments(offering_id, due_at);
CREATE INDEX IF NOT EXISTS idx_university_submissions_user_assignment ON public.university_submissions(user_id, assignment_id);
CREATE INDEX IF NOT EXISTS idx_university_grade_items_offering ON public.university_grade_items(offering_id);
CREATE INDEX IF NOT EXISTS idx_university_grades_user ON public.university_grades(user_id, grade_item_id);
CREATE INDEX IF NOT EXISTS idx_university_attendance_sessions_offering ON public.university_attendance_sessions(offering_id, starts_at);
CREATE INDEX IF NOT EXISTS idx_university_attendance_records_user ON public.university_attendance_records(user_id, session_id);
CREATE INDEX IF NOT EXISTS idx_university_announcements_org_published ON public.university_announcements(organization_id, published_at DESC);

-- Reuse the repository's standard updated_at trigger where applicable.
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'university_settings','university_people','university_schools','university_programmes',
    'university_academic_terms','university_courses','university_cohorts','university_course_offerings',
    'university_modules','university_lessons','university_assignments','university_submissions',
    'university_grade_items','university_grades','university_attendance_records','university_announcements'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS update_%I_updated_at ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER update_%I_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()', t, t);
  END LOOP;
END $$;
