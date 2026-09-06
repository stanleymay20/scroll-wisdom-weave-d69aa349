import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { useSubscription } from '@/contexts/SubscriptionContext';
import {
  isUniversityAcademicAdmin,
  isUniversityStaff,
  type UniversityAssignment,
  type UniversityCohort,
  type UniversityCourse,
  type UniversityEnrolment,
  type UniversityGradebookRow,
  type UniversityOffering,
  type UniversityPerson,
  type UniversityProgramme,
  type UniversityTerm,
} from '@/lib/university';

const db = supabase as any;

export interface UniversityOutcome {
  id: string;
  organization_id: string;
  programme_id: string | null;
  course_id: string | null;
  code: string;
  description: string;
  bloom_level: string | null;
  competency_domain: string | null;
  active: boolean;
}

export interface UniversityModule {
  id: string;
  organization_id: string;
  course_id: string;
  code: string | null;
  title: string;
  description: string | null;
  sequence: number;
  estimated_learning_hours: number;
  active: boolean;
}

export interface UniversityGradeItem {
  id: string;
  organization_id: string;
  offering_id: string;
  assignment_id: string | null;
  name: string;
  category: string;
  max_points: number;
  weight_percent: number;
  published: boolean;
}

export interface UniversityGrade {
  id: string;
  organization_id: string;
  grade_item_id: string;
  user_id: string;
  submission_id: string | null;
  points: number | null;
  percentage: number | null;
  grade_label: string | null;
  feedback: string | null;
  status: string;
  graded_by: string | null;
  graded_at: string | null;
}

export interface UniversityTeachingAssignment {
  id: string;
  organization_id: string;
  offering_id: string;
  user_id: string;
  teaching_role: string;
}

export interface UniversityAnnouncement {
  id: string;
  organization_id: string;
  offering_id: string | null;
  title: string;
  body: string;
  audience: string;
  published_at: string | null;
  expires_at: string | null;
  created_by: string;
}

export interface UniversityTranscriptRow {
  organization_id: string;
  user_id: string;
  display_name: string | null;
  student_number: string | null;
  offering_id: string;
  course_code: string;
  course_title: string;
  credits: number;
  term_code: string;
  term_name: string;
  academic_year: string;
  enrolment_status: string;
  final_percentage: number | null;
  final_grade: string | null;
  credits_earned: number | null;
}

export function useUniversity() {
  const { user } = useSubscription();
  const { activeOrg, activeOrgId, activeRole, isOrgAdmin, isLoading: orgLoading } = useOrganization();
  const [person, setPerson] = useState<UniversityPerson | null>(null);
  const [people, setPeople] = useState<UniversityPerson[]>([]);
  const [programmes, setProgrammes] = useState<UniversityProgramme[]>([]);
  const [courses, setCourses] = useState<UniversityCourse[]>([]);
  const [terms, setTerms] = useState<UniversityTerm[]>([]);
  const [cohorts, setCohorts] = useState<UniversityCohort[]>([]);
  const [offerings, setOfferings] = useState<UniversityOffering[]>([]);
  const [teachingAssignments, setTeachingAssignments] = useState<UniversityTeachingAssignment[]>([]);
  const [enrolments, setEnrolments] = useState<UniversityEnrolment[]>([]);
  const [assignments, setAssignments] = useState<UniversityAssignment[]>([]);
  const [gradeItems, setGradeItems] = useState<UniversityGradeItem[]>([]);
  const [grades, setGrades] = useState<UniversityGrade[]>([]);
  const [gradebook, setGradebook] = useState<UniversityGradebookRow[]>([]);
  const [transcript, setTranscript] = useState<UniversityTranscriptRow[]>([]);
  const [outcomes, setOutcomes] = useState<UniversityOutcome[]>([]);
  const [modules, setModules] = useState<UniversityModule[]>([]);
  const [announcements, setAnnouncements] = useState<UniversityAnnouncement[]>([]);
  const [settingsExists, setSettingsExists] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const clear = useCallback(() => {
    setPerson(null); setPeople([]); setProgrammes([]); setCourses([]); setTerms([]); setCohorts([]);
    setOfferings([]); setTeachingAssignments([]); setEnrolments([]); setAssignments([]); setGradeItems([]);
    setGrades([]); setGradebook([]); setTranscript([]); setOutcomes([]); setModules([]); setAnnouncements([]);
    setSettingsExists(false);
  }, []);

  const refresh = useCallback(async () => {
    if (!activeOrgId || !user) {
      clear();
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const results = await Promise.all([
        db.from('university_settings').select('organization_id').eq('organization_id', activeOrgId).maybeSingle(),
        db.from('university_people').select('*').eq('organization_id', activeOrgId).eq('user_id', user.id).maybeSingle(),
        db.from('university_people').select('*').eq('organization_id', activeOrgId).order('display_name'),
        db.from('university_programmes').select('*').eq('organization_id', activeOrgId).order('code'),
        db.from('university_courses').select('*').eq('organization_id', activeOrgId).order('code'),
        db.from('university_academic_terms').select('*').eq('organization_id', activeOrgId).order('starts_on', { ascending: false }),
        db.from('university_cohorts').select('*').eq('organization_id', activeOrgId).order('created_at', { ascending: false }),
        db.from('university_course_offerings').select('*').eq('organization_id', activeOrgId).order('created_at', { ascending: false }),
        db.from('university_teaching_assignments').select('*').eq('organization_id', activeOrgId),
        db.from('university_enrolments').select('*').eq('organization_id', activeOrgId).order('enrolled_at', { ascending: false }),
        db.from('university_assignments').select('*').eq('organization_id', activeOrgId).order('due_at', { ascending: true }),
        db.from('university_grade_items').select('*').eq('organization_id', activeOrgId).order('created_at'),
        db.from('university_grades').select('*').eq('organization_id', activeOrgId),
        db.from('university_gradebook_v').select('*').eq('organization_id', activeOrgId),
        db.from('university_transcript_v').select('*').eq('organization_id', activeOrgId),
        db.from('university_learning_outcomes').select('*').eq('organization_id', activeOrgId).order('code'),
        db.from('university_modules').select('*').eq('organization_id', activeOrgId).order('sequence'),
        db.from('university_announcements').select('*').eq('organization_id', activeOrgId).order('created_at', { ascending: false }).limit(50),
      ]);
      const firstError = results.find((result) => result.error)?.error;
      if (firstError) throw firstError;

      const [settingsRes, personRes, peopleRes, programmeRes, courseRes, termRes, cohortRes, offeringRes,
        teachingRes, enrolmentRes, assignmentRes, gradeItemRes, gradeRes, gradebookRes, transcriptRes,
        outcomeRes, moduleRes, announcementRes] = results;
      setSettingsExists(!!settingsRes.data);
      setPerson(personRes.data || null);
      setPeople(peopleRes.data || []);
      setProgrammes(programmeRes.data || []);
      setCourses(courseRes.data || []);
      setTerms(termRes.data || []);
      setCohorts(cohortRes.data || []);
      setOfferings(offeringRes.data || []);
      setTeachingAssignments(teachingRes.data || []);
      setEnrolments(enrolmentRes.data || []);
      setAssignments(assignmentRes.data || []);
      setGradeItems(gradeItemRes.data || []);
      setGrades(gradeRes.data || []);
      setGradebook(gradebookRes.data || []);
      setTranscript(transcriptRes.data || []);
      setOutcomes(outcomeRes.data || []);
      setModules(moduleRes.data || []);
      setAnnouncements(announcementRes.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load ScrollUniversity.');
    } finally {
      setLoading(false);
    }
  }, [activeOrgId, user, clear]);

  useEffect(() => { void refresh(); }, [refresh]);

  const universityRole = person?.university_role ?? null;
  const isAcademicAdmin = isOrgAdmin || isUniversityAcademicAdmin(universityRole);
  const isStaff = isOrgAdmin || isUniversityStaff(universityRole);
  const isStudent = universityRole === 'student';

  const initializeUniversity = useCallback(async () => {
    if (!activeOrgId || !user || !isOrgAdmin) throw new Error('Organization admin required.');
    const displayName = user.user_metadata?.full_name || user.email || 'Institution owner';
    const { error: settingsError } = await db.from('university_settings').upsert(
      { organization_id: activeOrgId }, { onConflict: 'organization_id' },
    );
    if (settingsError) throw settingsError;
    const { error: personError } = await db.from('university_people').upsert({
      organization_id: activeOrgId,
      user_id: user.id,
      university_role: 'chancellor',
      display_name: displayName,
      status: 'active',
    }, { onConflict: 'organization_id,user_id' });
    if (personError) throw personError;
    await refresh();
  }, [activeOrgId, user, isOrgAdmin, refresh]);

  const insert = useCallback(async (table: string, payload: Record<string, unknown>) => {
    if (!activeOrgId) throw new Error('Select an active institution first.');
    const { data, error: insertError } = await db.from(table)
      .insert({ ...payload, organization_id: activeOrgId }).select().single();
    if (insertError) throw insertError;
    await refresh();
    return data;
  }, [activeOrgId, refresh]);

  const update = useCallback(async (table: string, id: string, patch: Record<string, unknown>) => {
    const { data, error: updateError } = await db.from(table).update(patch).eq('id', id).select().single();
    if (updateError) throw updateError;
    await refresh();
    return data;
  }, [refresh]);

  const provisionRoster = useCallback(async (peopleToProvision: Array<Record<string, unknown>>) => {
    if (!activeOrgId) throw new Error('Select an active institution first.');
    const { data, error: invokeError } = await supabase.functions.invoke('university-provision-users', {
      body: { organization_id: activeOrgId, people: peopleToProvision },
    });
    if (invokeError) throw invokeError;
    await refresh();
    return data;
  }, [activeOrgId, refresh]);

  const saveGrade = useCallback(async (gradeItem: UniversityGradeItem, learnerId: string, percentage: number, feedback = '') => {
    if (!activeOrgId || !user) throw new Error('Authentication and an active institution are required.');
    const bounded = Math.max(0, Math.min(100, percentage));
    const points = Math.round((bounded / 100) * Number(gradeItem.max_points) * 100) / 100;
    const existing = grades.find((grade) => grade.grade_item_id === gradeItem.id && grade.user_id === learnerId);
    const payload = {
      organization_id: activeOrgId,
      grade_item_id: gradeItem.id,
      user_id: learnerId,
      points,
      percentage: bounded,
      feedback: feedback || null,
      status: 'published',
      graded_by: user.id,
      graded_at: new Date().toISOString(),
    };
    const result = existing
      ? await db.from('university_grades').update(payload).eq('id', existing.id).select().single()
      : await db.from('university_grades').insert(payload).select().single();
    if (result.error) throw result.error;
    await refresh();
    return result.data;
  }, [activeOrgId, user, grades, refresh]);

  const courseById = useMemo(() => new Map(courses.map((course) => [course.id, course])), [courses]);
  const termById = useMemo(() => new Map(terms.map((term) => [term.id, term])), [terms]);
  const offeringById = useMemo(() => new Map(offerings.map((offering) => [offering.id, offering])), [offerings]);
  const personByUserId = useMemo(() => new Map(people.map((entry) => [entry.user_id, entry])), [people]);

  return {
    activeOrg, activeOrgId, activeRole, orgLoading, settingsExists, person, people, programmes, courses,
    terms, cohorts, offerings, teachingAssignments, enrolments, assignments, gradeItems, grades, gradebook,
    transcript, outcomes, modules, announcements, loading, error, universityRole, isAcademicAdmin, isStaff,
    isStudent, courseById, termById, offeringById, personByUserId, refresh, initializeUniversity, insert,
    update, provisionRoster, saveGrade,
  };
}
