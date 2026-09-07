import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
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

const db = supabase as unknown as SupabaseClient;
const UNIVERSITY_PAGE_SIZE = 500;
const UNIVERSITY_MAX_ROWS_PER_RESOURCE = 20_000;

async function fetchInstitutionRows(table: string, organizationId: string): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; from < UNIVERSITY_MAX_ROWS_PER_RESOURCE; from += UNIVERSITY_PAGE_SIZE) {
    const { data, error } = await db.from(table)
      .select('*')
      .eq('organization_id', organizationId)
      .order('id', { ascending: true })
      .range(from, from + UNIVERSITY_PAGE_SIZE - 1);
    if (error) throw error;
    const page = (data || []) as Record<string, unknown>[];
    rows.push(...page);
    if (page.length < UNIVERSITY_PAGE_SIZE) return rows;
  }
  throw new Error(`${table} exceeded the guarded ${UNIVERSITY_MAX_ROWS_PER_RESOURCE.toLocaleString()}-row university load. Use a scoped workspace/report instead of loading the whole institution.`);
}

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
      const [settingsRes, personRes] = await Promise.all([
        db.from('university_settings').select('organization_id').eq('organization_id', activeOrgId).maybeSingle(),
        db.from('university_people').select('*').eq('organization_id', activeOrgId).eq('user_id', user.id).maybeSingle(),
      ]);
      if (settingsRes.error) throw settingsRes.error;
      if (personRes.error) throw personRes.error;

      const currentPerson = (personRes.data || null) as UniversityPerson | null;
      const currentRole = currentPerson?.university_role ?? null;
      const currentIsAcademicAdmin = isOrgAdmin || isUniversityAcademicAdmin(currentRole);
      const currentIsStaff = isOrgAdmin || isUniversityStaff(currentRole);
      setSettingsExists(!!settingsRes.data);
      setPerson(currentPerson);

      if (!currentIsStaff) {
        const enrolmentRes = await db.from('university_enrolments')
          .select('*')
          .eq('organization_id', activeOrgId)
          .eq('user_id', user.id)
          .order('enrolled_at', { ascending: false });
        if (enrolmentRes.error) throw enrolmentRes.error;
        const learnerEnrolments = (enrolmentRes.data || []) as UniversityEnrolment[];
        const offeringIds = [...new Set(learnerEnrolments.map((row) => row.offering_id))];

        const offeringRes = offeringIds.length
          ? await db.from('university_course_offerings').select('*').eq('organization_id', activeOrgId).in('id', offeringIds)
          : { data: [], error: null };
        if (offeringRes.error) throw offeringRes.error;
        const learnerOfferings = (offeringRes.data || []) as UniversityOffering[];
        const courseIds = [...new Set(learnerOfferings.map((row) => row.course_id))];
        const termIds = [...new Set(learnerOfferings.map((row) => row.term_id))];

        const [courseRes, termRes, assignmentRes, transcriptRes, announcementRes] = await Promise.all([
          courseIds.length
            ? db.from('university_courses').select('*').eq('organization_id', activeOrgId).in('id', courseIds)
            : Promise.resolve({ data: [], error: null }),
          termIds.length
            ? db.from('university_academic_terms').select('*').eq('organization_id', activeOrgId).in('id', termIds)
            : Promise.resolve({ data: [], error: null }),
          offeringIds.length
            ? db.from('university_assignments').select('*').eq('organization_id', activeOrgId).in('offering_id', offeringIds).eq('published', true).order('due_at')
            : Promise.resolve({ data: [], error: null }),
          db.from('university_transcript_v').select('*').eq('organization_id', activeOrgId).eq('user_id', user.id),
          offeringIds.length
            ? db.from('university_announcements').select('*').eq('organization_id', activeOrgId).or(`offering_id.is.null,offering_id.in.(${offeringIds.join(',')})`).order('created_at', { ascending: false }).limit(50)
            : db.from('university_announcements').select('*').eq('organization_id', activeOrgId).is('offering_id', null).order('created_at', { ascending: false }).limit(50),
        ]);
        const learnerError = [courseRes, termRes, assignmentRes, transcriptRes, announcementRes].find((result) => result.error)?.error;
        if (learnerError) throw learnerError;

        setPeople(currentPerson ? [currentPerson] : []);
        setProgrammes([]);
        setCourses((courseRes.data || []) as UniversityCourse[]);
        setTerms((termRes.data || []) as UniversityTerm[]);
        setCohorts([]);
        setOfferings(learnerOfferings);
        setTeachingAssignments([]);
        setEnrolments(learnerEnrolments);
        setAssignments((assignmentRes.data || []) as UniversityAssignment[]);
        setGradeItems([]);
        setGrades([]);
        setGradebook([]);
        setTranscript((transcriptRes.data || []) as UniversityTranscriptRow[]);
        setOutcomes([]);
        setModules([]);
        setAnnouncements((announcementRes.data || []) as UniversityAnnouncement[]);
        return;
      }

      const [
        peopleRows, programmeRows, courseRows, termRows, cohortRows, offeringRows, teachingRows,
        enrolmentRows, assignmentRows, gradeItemRows, outcomeRows, moduleRows,
        announcementRes,
      ] = await Promise.all([
        fetchInstitutionRows('university_people', activeOrgId),
        fetchInstitutionRows('university_programmes', activeOrgId),
        fetchInstitutionRows('university_courses', activeOrgId),
        fetchInstitutionRows('university_academic_terms', activeOrgId),
        fetchInstitutionRows('university_cohorts', activeOrgId),
        fetchInstitutionRows('university_course_offerings', activeOrgId),
        fetchInstitutionRows('university_teaching_assignments', activeOrgId),
        fetchInstitutionRows('university_enrolments', activeOrgId),
        fetchInstitutionRows('university_assignments', activeOrgId),
        fetchInstitutionRows('university_grade_items', activeOrgId),
        fetchInstitutionRows('university_learning_outcomes', activeOrgId),
        fetchInstitutionRows('university_modules', activeOrgId),
        db.from('university_announcements').select('*').eq('organization_id', activeOrgId).order('created_at', { ascending: false }).limit(50),
      ]);
      if (announcementRes.error) throw announcementRes.error;

      setPeople((peopleRows as unknown as UniversityPerson[]).sort((a, b) => (a.display_name || '').localeCompare(b.display_name || '')));
      setProgrammes((programmeRows as unknown as UniversityProgramme[]).sort((a, b) => a.code.localeCompare(b.code)));
      setCourses((courseRows as unknown as UniversityCourse[]).sort((a, b) => a.code.localeCompare(b.code)));
      setTerms((termRows as unknown as UniversityTerm[]).sort((a, b) => b.starts_on.localeCompare(a.starts_on)));
      setCohorts(cohortRows as unknown as UniversityCohort[]);
      setOfferings(offeringRows as unknown as UniversityOffering[]);
      setTeachingAssignments(teachingRows as unknown as UniversityTeachingAssignment[]);
      setEnrolments(enrolmentRows as unknown as UniversityEnrolment[]);
      setAssignments(assignmentRows as unknown as UniversityAssignment[]);
      setGradeItems(gradeItemRows as unknown as UniversityGradeItem[]);
      setGrades([]);
      setGradebook([]);
      setTranscript([]);
      setOutcomes((outcomeRows as unknown as UniversityOutcome[]).sort((a, b) => a.code.localeCompare(b.code)));
      setModules((moduleRows as unknown as UniversityModule[]).sort((a, b) => a.sequence - b.sequence));
      setAnnouncements((announcementRes.data || []) as UniversityAnnouncement[]);

      if (!currentIsAcademicAdmin) {
        // RLS remains the authority. This branch simply documents that non-admin
        // staff data above is limited by database policies, not client claims.
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load ScrollUniversity.');
    } finally {
      setLoading(false);
    }
  }, [activeOrgId, user, isOrgAdmin, clear]);

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
    const result = await db.from('university_grades')
      .upsert(payload, { onConflict: 'grade_item_id,user_id' })
      .select()
      .single();
    if (result.error) throw result.error;
    await refresh();
    return result.data;
  }, [activeOrgId, user, refresh]);

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
