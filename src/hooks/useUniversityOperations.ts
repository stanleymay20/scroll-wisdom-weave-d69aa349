import { useCallback, useEffect, useMemo, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { useSubscription } from '@/contexts/SubscriptionContext';

const db = supabase as unknown as SupabaseClient;
const OPERATIONS_PAGE_SIZE = 500;
const OPERATIONS_MAX_ROWS = 20_000;

async function fetchPagedInstitutionRows(
  table: string,
  organizationId: string,
  options?: { statusColumn?: string; statusValues?: string[] },
): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; from < OPERATIONS_MAX_ROWS; from += OPERATIONS_PAGE_SIZE) {
    let query = db.from(table)
      .select('*')
      .eq('organization_id', organizationId)
      .order('id', { ascending: true })
      .range(from, from + OPERATIONS_PAGE_SIZE - 1);
    if (options?.statusColumn && options.statusValues?.length) {
      query = query.in(options.statusColumn, options.statusValues);
    }
    const { data, error } = await query;
    if (error) throw error;
    const page = (data || []) as Record<string, unknown>[];
    rows.push(...page);
    if (page.length < OPERATIONS_PAGE_SIZE) return rows;
  }
  throw new Error(`${table} exceeded the guarded ${OPERATIONS_MAX_ROWS.toLocaleString()}-row operational load. Use a scoped report or offering workspace.`);
}

export interface UniversityCohortMember {
  id: string;
  organization_id: string;
  cohort_id: string;
  user_id: string;
  joined_on: string;
  left_on: string | null;
  status: string;
}

export interface UniversitySubmission {
  id: string;
  organization_id: string;
  assignment_id: string;
  user_id: string;
  attempt_number: number;
  body: string | null;
  attachment_refs: unknown[];
  submitted_at: string | null;
  status: string;
  integrity_metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface UniversityAttendanceSession {
  id: string;
  organization_id: string;
  offering_id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  location: string | null;
  delivery_url: string | null;
  created_by: string;
}

export interface UniversityAttendanceRecord {
  id: string;
  organization_id: string;
  session_id: string;
  user_id: string;
  status: 'present' | 'late' | 'absent' | 'excused' | 'remote';
  recorded_by: string | null;
  notes: string | null;
}

export interface UniversityAttendanceSummary {
  organization_id: string;
  offering_id: string;
  user_id: string;
  display_name: string | null;
  student_number: string | null;
  sessions_total: number;
  sessions_attended: number;
  sessions_absent: number;
  sessions_excused: number;
  attendance_percentage: number | null;
}

export interface UniversityLearnerProgress {
  organization_id: string;
  offering_id: string;
  user_id: string;
  display_name: string | null;
  student_number: string | null;
  course_code: string;
  course_title: string;
  term_code: string;
  term_name: string;
  enrolment_status: string;
  current_percentage: number | null;
  grade_items_total: number;
  grade_items_graded: number;
  assignments_total: number;
  assignments_submitted: number;
  assignments_outstanding: number;
  sessions_total: number;
  sessions_attended: number;
  sessions_absent: number;
  attendance_percentage: number | null;
  final_grade: string | null;
  credits_earned: number | null;
}

export interface UniversitySettingsRecord {
  organization_id: string;
  institution_type: string;
  academic_year_start_month: number;
  timezone: string;
  locale: string;
  grading_scheme: Record<string, unknown>;
  branding: Record<string, unknown>;
  public_catalog_enabled: boolean;
  lms_interop_enabled: boolean;
}

export function useUniversityOperations(activeOrgId: string | null, refreshUniversity?: () => Promise<void>) {
  const { user } = useSubscription();
  const [settings, setSettings] = useState<UniversitySettingsRecord | null>(null);
  const [cohortMembers, setCohortMembers] = useState<UniversityCohortMember[]>([]);
  const [submissions, setSubmissions] = useState<UniversitySubmission[]>([]);
  const [attendanceSessions, setAttendanceSessions] = useState<UniversityAttendanceSession[]>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<UniversityAttendanceRecord[]>([]);
  const [attendanceSummary, setAttendanceSummary] = useState<UniversityAttendanceSummary[]>([]);
  const [learnerProgress, setLearnerProgress] = useState<UniversityLearnerProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAttendanceSessionRecords = useCallback(async (sessionId: string) => {
    if (!activeOrgId || !sessionId) {
      setAttendanceRecords([]);
      return [] as UniversityAttendanceRecord[];
    }
    const { data, error: recordsError } = await db.from('university_attendance_records')
      .select('*')
      .eq('organization_id', activeOrgId)
      .eq('session_id', sessionId)
      .order('user_id');
    if (recordsError) throw recordsError;
    const records = (data || []) as UniversityAttendanceRecord[];
    setAttendanceRecords(records);
    return records;
  }, [activeOrgId]);

  const refresh = useCallback(async () => {
    if (!activeOrgId || !user) {
      setSettings(null);
      setCohortMembers([]);
      setSubmissions([]);
      setAttendanceSessions([]);
      setAttendanceRecords([]);
      setAttendanceSummary([]);
      setLearnerProgress([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [settingsRes, personRes] = await Promise.all([
        db.from('university_settings').select('*').eq('organization_id', activeOrgId).maybeSingle(),
        db.from('university_people').select('university_role').eq('organization_id', activeOrgId).eq('user_id', user.id).maybeSingle(),
      ]);
      if (settingsRes.error) throw settingsRes.error;
      if (personRes.error) throw personRes.error;
      setSettings((settingsRes.data || null) as UniversitySettingsRecord | null);
      setAttendanceRecords([]);

      const role = typeof personRes.data?.university_role === 'string' ? personRes.data.university_role : null;
      const learnerOnly = role === 'student';

      if (learnerOnly) {
        const [submissionsRes, summaryRes, progressRes] = await Promise.all([
          db.from('university_submissions').select('*').eq('organization_id', activeOrgId).eq('user_id', user.id).order('updated_at', { ascending: false }),
          db.from('university_attendance_summary_v').select('*').eq('organization_id', activeOrgId).eq('user_id', user.id),
          db.from('university_learner_progress_v').select('*').eq('organization_id', activeOrgId).eq('user_id', user.id),
        ]);
        const learnerError = [submissionsRes, summaryRes, progressRes].find((result) => result.error)?.error;
        if (learnerError) throw learnerError;
        setCohortMembers([]);
        setSubmissions((submissionsRes.data || []) as UniversitySubmission[]);
        setAttendanceSessions([]);
        setAttendanceSummary((summaryRes.data || []) as UniversityAttendanceSummary[]);
        setLearnerProgress((progressRes.data || []) as UniversityLearnerProgress[]);
        return;
      }

      const [cohortRows, submissionRows, sessionRows, summaryRows, progressRows] = await Promise.all([
        fetchPagedInstitutionRows('university_cohort_members', activeOrgId),
        fetchPagedInstitutionRows('university_submissions', activeOrgId, { statusColumn: 'status', statusValues: ['submitted', 'late'] }),
        fetchPagedInstitutionRows('university_attendance_sessions', activeOrgId),
        fetchPagedInstitutionRows('university_attendance_summary_v', activeOrgId),
        fetchPagedInstitutionRows('university_learner_progress_v', activeOrgId),
      ]);
      setCohortMembers(cohortRows as unknown as UniversityCohortMember[]);
      setSubmissions((submissionRows as unknown as UniversitySubmission[]).sort((a, b) => b.updated_at.localeCompare(a.updated_at)));
      setAttendanceSessions((sessionRows as unknown as UniversityAttendanceSession[]).sort((a, b) => b.starts_at.localeCompare(a.starts_at)));
      setAttendanceSummary(summaryRows as unknown as UniversityAttendanceSummary[]);
      setLearnerProgress(progressRows as unknown as UniversityLearnerProgress[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load university operations.');
    } finally {
      setLoading(false);
    }
  }, [activeOrgId, user]);

  useEffect(() => { void refresh(); }, [refresh]);

  const sync = useCallback(async () => {
    await Promise.all([refresh(), refreshUniversity?.()]);
  }, [refresh, refreshUniversity]);

  const saveSettings = useCallback(async (patch: Partial<UniversitySettingsRecord>) => {
    if (!activeOrgId) throw new Error('Select an active institution first.');
    const { data, error: updateError } = await db.from('university_settings')
      .update(patch)
      .eq('organization_id', activeOrgId)
      .select()
      .single();
    if (updateError) throw updateError;
    await sync();
    return data;
  }, [activeOrgId, sync]);

  const addTeachingAssignment = useCallback(async (offeringId: string, userId: string, teachingRole: string) => {
    if (!activeOrgId) throw new Error('Select an active institution first.');
    const { data, error: insertError } = await db.from('university_teaching_assignments')
      .insert({ organization_id: activeOrgId, offering_id: offeringId, user_id: userId, teaching_role: teachingRole })
      .select().single();
    if (insertError) throw insertError;
    await sync();
    return data;
  }, [activeOrgId, sync]);

  const removeTeachingAssignment = useCallback(async (id: string) => {
    const { error: deleteError } = await db.from('university_teaching_assignments').delete().eq('id', id);
    if (deleteError) throw deleteError;
    await sync();
  }, [sync]);

  const enrolLearner = useCallback(async (offeringId: string, userId: string, status = 'enrolled') => {
    if (!activeOrgId) throw new Error('Select an active institution first.');
    const { data, error: upsertError } = await db.from('university_enrolments')
      .upsert(
        { organization_id: activeOrgId, offering_id: offeringId, user_id: userId, status },
        { onConflict: 'offering_id,user_id' },
      )
      .select().single();
    if (upsertError) throw upsertError;
    await sync();
    return data;
  }, [activeOrgId, sync]);

  const setEnrolmentStatus = useCallback(async (id: string, status: string) => {
    const { data, error: updateError } = await db.from('university_enrolments')
      .update({ status }).eq('id', id).select().single();
    if (updateError) throw updateError;
    await sync();
    return data;
  }, [sync]);

  const addCohortMember = useCallback(async (cohortId: string, userId: string) => {
    if (!activeOrgId) throw new Error('Select an active institution first.');
    const { data, error: upsertError } = await db.from('university_cohort_members')
      .upsert(
        { organization_id: activeOrgId, cohort_id: cohortId, user_id: userId, status: 'active' },
        { onConflict: 'cohort_id,user_id' },
      )
      .select().single();
    if (upsertError) throw upsertError;
    await sync();
    return data;
  }, [activeOrgId, sync]);

  const createAttendanceSession = useCallback(async (payload: {
    offering_id: string;
    title: string;
    starts_at: string;
    ends_at?: string | null;
    location?: string | null;
    delivery_url?: string | null;
  }) => {
    if (!activeOrgId || !user) throw new Error('Authentication and an institution are required.');
    const { data, error: insertError } = await db.from('university_attendance_sessions')
      .insert({ ...payload, organization_id: activeOrgId, created_by: user.id })
      .select().single();
    if (insertError) throw insertError;
    await sync();
    return data;
  }, [activeOrgId, user, sync]);

  const recordAttendance = useCallback(async (
    sessionId: string,
    learnerId: string,
    status: UniversityAttendanceRecord['status'],
    notes = '',
  ) => {
    if (!activeOrgId || !user) throw new Error('Authentication and an institution are required.');
    const { data, error: upsertError } = await db.from('university_attendance_records')
      .upsert(
        {
          organization_id: activeOrgId,
          session_id: sessionId,
          user_id: learnerId,
          status,
          notes: notes || null,
          recorded_by: user.id,
        },
        { onConflict: 'session_id,user_id' },
      )
      .select().single();
    if (upsertError) throw upsertError;
    await sync();
    await loadAttendanceSessionRecords(sessionId);
    return data;
  }, [activeOrgId, user, sync, loadAttendanceSessionRecords]);

  const saveSubmission = useCallback(async (assignmentId: string, body: string, submit = false, dueAt?: string | null) => {
    if (!activeOrgId || !user) throw new Error('Authentication and an institution are required.');
    const now = new Date();
    const status = submit ? (dueAt && now.getTime() > new Date(dueAt).getTime() ? 'late' : 'submitted') : 'draft';
    const payload = {
      organization_id: activeOrgId,
      assignment_id: assignmentId,
      user_id: user.id,
      attempt_number: 1,
      body,
      submitted_at: submit ? now.toISOString() : null,
      status,
    };
    const result = await db.from('university_submissions')
      .upsert(payload, { onConflict: 'assignment_id,user_id,attempt_number' })
      .select()
      .single();
    if (result.error) throw result.error;
    await sync();
    return result.data;
  }, [activeOrgId, user, sync]);

  const finalizeEnrolment = useCallback(async (enrolmentId: string, gradeLabel?: string | null) => {
    const { data, error: rpcError } = await db.rpc('finalize_university_enrolment', {
      _enrolment_id: enrolmentId,
      _grade_label: gradeLabel || null,
    });
    if (rpcError) throw rpcError;
    await sync();
    return data;
  }, [sync]);

  const submissionsByAssignment = useMemo(() => {
    const map = new Map<string, UniversitySubmission[]>();
    submissions.forEach((submission) => {
      const list = map.get(submission.assignment_id) || [];
      list.push(submission);
      map.set(submission.assignment_id, list);
    });
    return map;
  }, [submissions]);

  const recordsBySession = useMemo(() => {
    const map = new Map<string, UniversityAttendanceRecord[]>();
    attendanceRecords.forEach((record) => {
      const list = map.get(record.session_id) || [];
      list.push(record);
      map.set(record.session_id, list);
    });
    return map;
  }, [attendanceRecords]);

  return {
    settings,
    cohortMembers,
    submissions,
    attendanceSessions,
    attendanceRecords,
    attendanceSummary,
    learnerProgress,
    loading,
    error,
    submissionsByAssignment,
    recordsBySession,
    refresh,
    loadAttendanceSessionRecords,
    saveSettings,
    addTeachingAssignment,
    removeTeachingAssignment,
    enrolLearner,
    setEnrolmentStatus,
    addCohortMember,
    createAttendanceSession,
    recordAttendance,
    saveSubmission,
    finalizeEnrolment,
  };
}
