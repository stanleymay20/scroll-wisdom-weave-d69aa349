import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ArrowLeft, Award, BookCheck, BriefcaseBusiness, GraduationCap, RefreshCcw,
  ShieldCheck, UserCheck, UsersRound,
} from 'lucide-react';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useUniversity } from '@/hooks/useUniversity';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { supabase } from '@/integrations/supabase/client';

const db = supabase as unknown as SupabaseClient;
const selectClass = 'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm';

interface ProgrammeRegistration {
  id: string;
  organization_id: string;
  programme_id: string;
  user_id: string;
  cohort_id: string | null;
  entry_term_id: string | null;
  status: string;
  admitted_at: string;
  started_at: string | null;
  completed_at: string | null;
}

interface AdvisingAssignment {
  id: string;
  organization_id: string;
  programme_registration_id: string;
  advisor_user_id: string;
  starts_on: string;
  ends_on: string | null;
  is_primary: boolean;
}

interface AdvisingNote {
  id: string;
  programme_registration_id: string;
  author_user_id: string;
  note_type: string;
  note: string;
  student_visible: boolean;
  follow_up_on: string | null;
  created_at: string;
}

interface AcademicStanding {
  id: string;
  programme_registration_id: string;
  term_id: string;
  standing: string;
  credits_attempted: number;
  credits_earned: number;
  average_percentage: number | null;
  decision_notes: string | null;
  decided_at: string | null;
}

interface RecognizedCredit {
  id: string;
  programme_registration_id: string;
  course_id: string | null;
  external_course_code: string | null;
  external_course_title: string;
  source_institution: string | null;
  credits: number;
  equivalent_percentage: number | null;
  decision: string;
  reviewed_at: string | null;
}

interface ProgressionDecision {
  id: string;
  programme_registration_id: string;
  term_id: string | null;
  decision: string;
  rationale: string | null;
  decided_at: string;
}

interface CompletionClearance {
  id: string;
  programme_registration_id: string;
  status: string;
  academic_requirements_met: boolean;
  outstanding_requirements: unknown[];
  reviewed_at: string | null;
  notes: string | null;
}

interface ProgrammeProgress {
  organization_id: string;
  programme_registration_id: string;
  user_id: string;
  student_number: string | null;
  display_name: string | null;
  programme_id: string;
  programme_code: string;
  programme_name: string;
  programme_status: string;
  required_courses: number;
  required_courses_completed: number;
  required_credits: number;
  institutional_credits_earned: number;
  recognized_credits: number;
  total_recognized_progress_credits: number;
  academic_requirements_met: boolean;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}

function statusVariant(status: string): 'default' | 'secondary' | 'destructive' | 'outline' {
  if (['active', 'good', 'approved', 'eligible', 'completed', 'progress'].includes(status)) return 'default';
  if (['dismissed', 'suspension', 'rejected', 'revoked', 'held', 'withdraw'].includes(status)) return 'destructive';
  if (['warning', 'probation', 'review', 'pending', 'progress_with_conditions'].includes(status)) return 'secondary';
  return 'outline';
}

export default function UniversityStudentLifecycle() {
  const { toast } = useToast();
  const { user } = useSubscription();
  const university = useUniversity();
  const {
    activeOrg, activeOrgId, people, programmes, cohorts, terms, courses,
    universityRole, isAcademicAdmin, personByUserId,
  } = university;
  const isAdvisor = universityRole === 'advisor';
  const isStudent = universityRole === 'student';
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [registrations, setRegistrations] = useState<ProgrammeRegistration[]>([]);
  const [advisors, setAdvisors] = useState<AdvisingAssignment[]>([]);
  const [notes, setNotes] = useState<AdvisingNote[]>([]);
  const [standings, setStandings] = useState<AcademicStanding[]>([]);
  const [recognizedCredits, setRecognizedCredits] = useState<RecognizedCredit[]>([]);
  const [progression, setProgression] = useState<ProgressionDecision[]>([]);
  const [clearances, setClearances] = useState<CompletionClearance[]>([]);
  const [progress, setProgress] = useState<ProgrammeProgress[]>([]);
  const [registrationForm, setRegistrationForm] = useState({ user_id: '', programme_id: '', cohort_id: '', entry_term_id: '' });
  const [advisorForm, setAdvisorForm] = useState({ programme_registration_id: '', advisor_user_id: '' });
  const [noteForm, setNoteForm] = useState({ programme_registration_id: '', note_type: 'academic', note: '', follow_up_on: '', student_visible: false });
  const [standingForm, setStandingForm] = useState({ programme_registration_id: '', term_id: '', standing: 'good', credits_attempted: '0', credits_earned: '0', average_percentage: '', decision_notes: '' });
  const [creditForm, setCreditForm] = useState({ programme_registration_id: '', course_id: '', external_course_code: '', external_course_title: '', source_institution: '', credits: '', equivalent_percentage: '', decision: 'approved' });
  const [progressionForm, setProgressionForm] = useState({ programme_registration_id: '', term_id: '', decision: 'progress', rationale: '' });

  const refresh = useCallback(async () => {
    if (!activeOrgId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const results = await Promise.all([
        db.from('university_programme_registrations').select('*').eq('organization_id', activeOrgId).order('created_at', { ascending: false }),
        db.from('university_advising_assignments').select('*').eq('organization_id', activeOrgId).order('created_at', { ascending: false }),
        db.from('university_advising_notes').select('*').eq('organization_id', activeOrgId).order('created_at', { ascending: false }).limit(200),
        db.from('university_academic_standing').select('*').eq('organization_id', activeOrgId).order('created_at', { ascending: false }),
        db.from('university_recognized_credits').select('*').eq('organization_id', activeOrgId).order('created_at', { ascending: false }),
        db.from('university_progression_decisions').select('*').eq('organization_id', activeOrgId).order('decided_at', { ascending: false }),
        db.from('university_completion_clearances').select('*').eq('organization_id', activeOrgId),
        db.from('university_programme_progress_v').select('*').eq('organization_id', activeOrgId),
      ]);
      const firstError = results.find((result) => result.error)?.error;
      if (firstError) throw firstError;
      setRegistrations((results[0].data || []) as ProgrammeRegistration[]);
      setAdvisors((results[1].data || []) as AdvisingAssignment[]);
      setNotes((results[2].data || []) as AdvisingNote[]);
      setStandings((results[3].data || []) as AcademicStanding[]);
      setRecognizedCredits((results[4].data || []) as RecognizedCredit[]);
      setProgression((results[5].data || []) as ProgressionDecision[]);
      setClearances((results[6].data || []) as CompletionClearance[]);
      setProgress((results[7].data || []) as ProgrammeProgress[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load student lifecycle records.');
    } finally {
      setLoading(false);
    }
  }, [activeOrgId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const run = async (work: () => Promise<void>, success: string) => {
    setBusy(true);
    try {
      await work();
      await refresh();
      toast({ title: success });
    } catch (err) {
      toast({ title: 'Academic lifecycle operation failed', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const insert = async (table: string, payload: Record<string, unknown>) => {
    if (!activeOrgId) throw new Error('Select an active institution first.');
    const { error: insertError } = await db.from(table).insert({ ...payload, organization_id: activeOrgId });
    if (insertError) throw insertError;
  };

  const studentPeople = people.filter((entry) => entry.university_role === 'student' && ['active', 'invited'].includes(entry.status));
  const advisorPeople = people.filter((entry) => ['advisor', 'lecturer', 'programme_lead', 'dean', 'registrar', 'chancellor'].includes(entry.university_role) && entry.status === 'active');
  const registrationById = useMemo(() => new Map(registrations.map((row) => [row.id, row])), [registrations]);
  const progressByRegistration = useMemo(() => new Map(progress.map((row) => [row.programme_registration_id, row])), [progress]);
  const myProgress = isStudent ? progress.filter((row) => row.user_id === user?.id) : progress;

  const saveRegistration = async () => {
    if (!registrationForm.user_id || !registrationForm.programme_id) throw new Error('Student and programme are required.');
    await insert('university_programme_registrations', {
      user_id: registrationForm.user_id,
      programme_id: registrationForm.programme_id,
      cohort_id: registrationForm.cohort_id || null,
      entry_term_id: registrationForm.entry_term_id || null,
      status: 'active',
      started_at: new Date().toISOString(),
    });
  };

  const saveAdvisor = async () => {
    if (!advisorForm.programme_registration_id || !advisorForm.advisor_user_id) throw new Error('Programme registration and advisor are required.');
    await insert('university_advising_assignments', {
      programme_registration_id: advisorForm.programme_registration_id,
      advisor_user_id: advisorForm.advisor_user_id,
      is_primary: true,
    });
  };

  const saveNote = async () => {
    if (!user || !noteForm.programme_registration_id || !noteForm.note.trim()) throw new Error('Registration and note are required.');
    await insert('university_advising_notes', {
      programme_registration_id: noteForm.programme_registration_id,
      author_user_id: user.id,
      note_type: noteForm.note_type,
      note: noteForm.note.trim(),
      follow_up_on: noteForm.follow_up_on || null,
      student_visible: noteForm.student_visible,
    });
    setNoteForm({ ...noteForm, note: '', follow_up_on: '' });
  };

  const saveStanding = async () => {
    if (!user || !standingForm.programme_registration_id || !standingForm.term_id) throw new Error('Registration and term are required.');
    const average = standingForm.average_percentage === '' ? null : Number(standingForm.average_percentage);
    const { error: upsertError } = await db.from('university_academic_standing').upsert({
      organization_id: activeOrgId,
      programme_registration_id: standingForm.programme_registration_id,
      term_id: standingForm.term_id,
      standing: standingForm.standing,
      credits_attempted: Number(standingForm.credits_attempted),
      credits_earned: Number(standingForm.credits_earned),
      average_percentage: average,
      decision_notes: standingForm.decision_notes.trim() || null,
      decided_by: user.id,
      decided_at: new Date().toISOString(),
    }, { onConflict: 'programme_registration_id,term_id' });
    if (upsertError) throw upsertError;
  };

  const saveCredit = async () => {
    if (!user || !creditForm.programme_registration_id || !creditForm.external_course_title.trim() || !creditForm.credits) {
      throw new Error('Registration, recognized course title and credits are required.');
    }
    await insert('university_recognized_credits', {
      programme_registration_id: creditForm.programme_registration_id,
      course_id: creditForm.course_id || null,
      external_course_code: creditForm.external_course_code.trim() || null,
      external_course_title: creditForm.external_course_title.trim(),
      source_institution: creditForm.source_institution.trim() || null,
      credits: Number(creditForm.credits),
      equivalent_percentage: creditForm.equivalent_percentage === '' ? null : Number(creditForm.equivalent_percentage),
      decision: creditForm.decision,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    });
  };

  const saveProgression = async () => {
    if (!user || !progressionForm.programme_registration_id) throw new Error('Programme registration is required.');
    await insert('university_progression_decisions', {
      programme_registration_id: progressionForm.programme_registration_id,
      term_id: progressionForm.term_id || null,
      decision: progressionForm.decision,
      rationale: progressionForm.rationale.trim() || null,
      decided_by: user.id,
    });
  };

  const syncCompletion = async (registrationId: string) => {
    if (!user || !activeOrgId) throw new Error('Authentication and institution are required.');
    const row = progressByRegistration.get(registrationId);
    if (!row) throw new Error('Programme progress is unavailable.');
    const outstanding: string[] = [];
    if (row.required_courses_completed < row.required_courses) {
      outstanding.push(`${row.required_courses - row.required_courses_completed} required course(s) incomplete`);
    }
    if (row.total_recognized_progress_credits < row.required_credits) {
      outstanding.push(`${row.required_credits - row.total_recognized_progress_credits} credit(s) outstanding`);
    }
    const { error: upsertError } = await db.from('university_completion_clearances').upsert({
      organization_id: activeOrgId,
      programme_registration_id: registrationId,
      status: row.academic_requirements_met ? 'eligible' : 'not_ready',
      academic_requirements_met: row.academic_requirements_met,
      outstanding_requirements: outstanding,
      reviewed_by: user.id,
      reviewed_at: new Date().toISOString(),
    }, { onConflict: 'programme_registration_id' });
    if (upsertError) throw upsertError;
  };

  if (!activeOrgId || !activeOrg) {
    return <><Navbar/><main className="container mx-auto max-w-3xl px-4 pt-24 pb-16"><Alert><AlertTitle>Select an institution</AlertTitle><AlertDescription>Student lifecycle records belong to an active institution.</AlertDescription></Alert><Button asChild className="mt-4"><Link to="/organizations">Choose institution</Link></Button></main><Footer/></>;
  }

  if (!isAcademicAdmin && !isAdvisor && !isStudent) {
    return <><Navbar/><main className="container mx-auto max-w-3xl px-4 pt-24 pb-16"><Alert><AlertTitle>Lifecycle access is role-specific</AlertTitle><AlertDescription>This workspace is for students, assigned academic advisors and academic administrators.</AlertDescription></Alert><Button asChild variant="outline" className="mt-4"><Link to="/university"><ArrowLeft className="h-4 w-4 mr-1"/>University hub</Link></Button></main><Footer/></>;
  }

  return (
    <><Navbar/><main className="container mx-auto max-w-7xl px-4 pt-24 pb-16">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between mb-6">
        <div><div className="flex items-center gap-2"><GraduationCap className="h-8 w-8 text-primary"/><h1 className="text-3xl font-bold">Student lifecycle</h1></div><p className="text-muted-foreground">{activeOrg.name} · programme progress, advising, standing and completion readiness.</p></div>
        <div className="flex gap-2"><Button asChild variant="outline"><Link to="/university"><ArrowLeft className="h-4 w-4 mr-1"/>University hub</Link></Button><Button variant="outline" onClick={() => void refresh()}><RefreshCcw className="h-4 w-4 mr-1"/>Refresh</Button></div>
      </div>
      {error && <Alert variant="destructive" className="mb-6"><AlertTitle>Lifecycle data unavailable</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
      {loading ? <p>Loading lifecycle records…</p> : <Tabs defaultValue="progress" className="space-y-6">
        <TabsList className="flex flex-wrap h-auto"><TabsTrigger value="progress">Programme progress</TabsTrigger><TabsTrigger value="advising">Advising</TabsTrigger><TabsTrigger value="standing">Standing</TabsTrigger><TabsTrigger value="credit">Recognized credit</TabsTrigger><TabsTrigger value="decisions">Progression</TabsTrigger>{isAcademicAdmin && <TabsTrigger value="registrar">Registrar</TabsTrigger>}</TabsList>

        <TabsContent value="progress" className="space-y-4">
          {myProgress.length ? myProgress.map((row) => {
            const percent = row.required_credits > 0 ? Math.min(100, Math.round((row.total_recognized_progress_credits / row.required_credits) * 100)) : 0;
            const clearance = clearances.find((item) => item.programme_registration_id === row.programme_registration_id);
            return <Card key={row.programme_registration_id}><CardHeader><div className="flex flex-wrap items-start justify-between gap-3"><div><CardTitle>{row.programme_code} — {row.programme_name}</CardTitle><CardDescription>{row.display_name || 'Student'}{row.student_number ? ` · ${row.student_number}` : ''}</CardDescription></div><div className="flex gap-2"><Badge variant={statusVariant(row.programme_status)}>{row.programme_status}</Badge><Badge variant={row.academic_requirements_met ? 'default' : 'outline'}>{row.academic_requirements_met ? 'Academic requirements met' : 'In progress'}</Badge></div></div></CardHeader><CardContent className="space-y-4"><div><div className="flex justify-between text-sm"><span>Progress credits</span><span>{row.total_recognized_progress_credits}/{row.required_credits} · {percent}%</span></div><div className="h-2 rounded-full bg-muted overflow-hidden mt-2"><div className="h-full bg-primary" style={{ width: `${percent}%` }}/></div></div><div className="grid sm:grid-cols-3 gap-3 text-sm"><div className="rounded border p-3"><p className="text-muted-foreground">Required courses</p><p className="text-xl font-semibold">{row.required_courses_completed}/{row.required_courses}</p></div><div className="rounded border p-3"><p className="text-muted-foreground">Institution credits</p><p className="text-xl font-semibold">{row.institutional_credits_earned}</p></div><div className="rounded border p-3"><p className="text-muted-foreground">Recognized credits</p><p className="text-xl font-semibold">{row.recognized_credits}</p></div></div>{clearance && <Alert><Award className="h-4 w-4"/><AlertTitle>Completion clearance: {clearance.status}</AlertTitle><AlertDescription>{clearance.academic_requirements_met ? 'Academic curriculum requirements are recorded as met.' : `${clearance.outstanding_requirements.length} requirement item(s) remain.`}</AlertDescription></Alert>}{isAcademicAdmin && <Button size="sm" variant="outline" disabled={busy} onClick={() => void run(() => syncCompletion(row.programme_registration_id), 'Completion readiness recalculated')}><BookCheck className="h-4 w-4 mr-1"/>Recalculate completion</Button>}</CardContent></Card>;
          }) : <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No programme progress record is visible for this role yet.</CardContent></Card>}
        </TabsContent>

        <TabsContent value="advising" className="space-y-4">
          <div className="grid lg:grid-cols-2 gap-4"><Card><CardHeader><CardTitle>Advisor relationships</CardTitle></CardHeader><CardContent className="space-y-2">{advisors.length ? advisors.map((row) => { const registration = registrationById.get(row.programme_registration_id); const learner = registration ? personByUserId.get(registration.user_id) : undefined; const advisor = personByUserId.get(row.advisor_user_id); return <div key={row.id} className="rounded border p-3 text-sm"><p className="font-medium">{learner?.display_name || 'Student'} → {advisor?.display_name || 'Advisor'}</p><p className="text-xs text-muted-foreground">{row.is_primary ? 'Primary advisor' : 'Advisor'} · from {row.starts_on}{row.ends_on ? ` to ${row.ends_on}` : ''}</p></div>; }) : <p className="text-sm text-muted-foreground">No advisor assignment visible.</p>}</CardContent></Card><Card><CardHeader><CardTitle>Advising notes</CardTitle><CardDescription>Students only see notes explicitly released to them.</CardDescription></CardHeader><CardContent className="space-y-2">{notes.length ? notes.map((row) => <div key={row.id} className="rounded border p-3"><div className="flex justify-between gap-2"><Badge variant="outline">{row.note_type}</Badge>{row.student_visible && <Badge variant="secondary">Student visible</Badge>}</div><p className="text-sm mt-2 whitespace-pre-wrap">{row.note}</p>{row.follow_up_on && <p className="text-xs text-muted-foreground mt-2">Follow-up: {row.follow_up_on}</p>}</div>) : <p className="text-sm text-muted-foreground">No advising notes visible.</p>}</CardContent></Card></div>
          {(isAdvisor || isAcademicAdmin) && <Card><CardHeader><CardTitle>Add advising note</CardTitle></CardHeader><CardContent className="grid md:grid-cols-2 gap-3"><Field label="Programme registration"><select className={selectClass} value={noteForm.programme_registration_id} onChange={(e) => setNoteForm({ ...noteForm, programme_registration_id: e.target.value })}><option value="">Select…</option>{registrations.map((row) => <option key={row.id} value={row.id}>{personByUserId.get(row.user_id)?.display_name || row.user_id} · {programmes.find((p) => p.id === row.programme_id)?.code}</option>)}</select></Field><Field label="Note type"><select className={selectClass} value={noteForm.note_type} onChange={(e) => setNoteForm({ ...noteForm, note_type: e.target.value })}><option value="academic">Academic</option><option value="progress">Progress</option><option value="wellbeing_referral">Wellbeing referral</option><option value="career">Career</option><option value="administrative">Administrative</option></select></Field><div className="md:col-span-2"><Field label="Note"><Textarea value={noteForm.note} onChange={(e) => setNoteForm({ ...noteForm, note: e.target.value })}/></Field></div><Field label="Follow-up date"><Input type="date" value={noteForm.follow_up_on} onChange={(e) => setNoteForm({ ...noteForm, follow_up_on: e.target.value })}/></Field><label className="flex items-center gap-2 text-sm self-end pb-2"><input type="checkbox" checked={noteForm.student_visible} onChange={(e) => setNoteForm({ ...noteForm, student_visible: e.target.checked })}/>Release note to student</label><div className="md:col-span-2"><Button disabled={busy} onClick={() => void run(saveNote, 'Advising note recorded')}><UserCheck className="h-4 w-4 mr-1"/>Save advising note</Button></div></CardContent></Card>}
        </TabsContent>

        <TabsContent value="standing"><Card><CardHeader><CardTitle>Academic standing history</CardTitle></CardHeader><CardContent className="space-y-2">{standings.length ? standings.map((row) => <div key={row.id} className="rounded border p-3 flex flex-wrap justify-between gap-3 text-sm"><div><p className="font-medium">{personByUserId.get(registrationById.get(row.programme_registration_id)?.user_id || '')?.display_name || 'Student'} · {terms.find((term) => term.id === row.term_id)?.name || 'Term'}</p><p className="text-xs text-muted-foreground">Credits {row.credits_earned}/{row.credits_attempted}{row.average_percentage === null ? '' : ` · ${row.average_percentage}%`}</p>{row.decision_notes && <p className="mt-1">{row.decision_notes}</p>}</div><Badge variant={statusVariant(row.standing)}>{row.standing}</Badge></div>) : <p className="text-sm text-muted-foreground">No academic standing decisions yet.</p>}</CardContent></Card>{isAcademicAdmin && <Card className="mt-4"><CardHeader><CardTitle>Record academic standing</CardTitle></CardHeader><CardContent className="grid md:grid-cols-3 gap-3"><Field label="Registration"><select className={selectClass} value={standingForm.programme_registration_id} onChange={(e) => setStandingForm({ ...standingForm, programme_registration_id: e.target.value })}><option value="">Select…</option>{registrations.map((row) => <option key={row.id} value={row.id}>{personByUserId.get(row.user_id)?.display_name || row.user_id}</option>)}</select></Field><Field label="Term"><select className={selectClass} value={standingForm.term_id} onChange={(e) => setStandingForm({ ...standingForm, term_id: e.target.value })}><option value="">Select…</option>{terms.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></Field><Field label="Standing"><select className={selectClass} value={standingForm.standing} onChange={(e) => setStandingForm({ ...standingForm, standing: e.target.value })}><option value="good">Good</option><option value="warning">Warning</option><option value="probation">Probation</option><option value="suspension">Suspension</option><option value="dismissed">Dismissed</option><option value="completed">Completed</option></select></Field><Field label="Credits attempted"><Input type="number" min="0" value={standingForm.credits_attempted} onChange={(e) => setStandingForm({ ...standingForm, credits_attempted: e.target.value })}/></Field><Field label="Credits earned"><Input type="number" min="0" value={standingForm.credits_earned} onChange={(e) => setStandingForm({ ...standingForm, credits_earned: e.target.value })}/></Field><Field label="Average %"><Input type="number" min="0" max="100" value={standingForm.average_percentage} onChange={(e) => setStandingForm({ ...standingForm, average_percentage: e.target.value })}/></Field><div className="md:col-span-3"><Field label="Decision notes"><Textarea value={standingForm.decision_notes} onChange={(e) => setStandingForm({ ...standingForm, decision_notes: e.target.value })}/></Field></div><div className="md:col-span-3"><Button disabled={busy} onClick={() => void run(saveStanding, 'Academic standing recorded')}>Save standing</Button></div></CardContent></Card>}</TabsContent>

        <TabsContent value="credit"><Card><CardHeader><CardTitle>Recognized / transfer credit</CardTitle></CardHeader><CardContent className="space-y-2">{recognizedCredits.length ? recognizedCredits.map((row) => <div key={row.id} className="rounded border p-3 flex justify-between gap-3 text-sm"><div><p className="font-medium">{row.external_course_code ? `${row.external_course_code} — ` : ''}{row.external_course_title}</p><p className="text-xs text-muted-foreground">{row.source_institution || 'External learning'} · {row.credits} credits{row.equivalent_percentage === null ? '' : ` · ${row.equivalent_percentage}% equivalent`}</p></div><Badge variant={statusVariant(row.decision)}>{row.decision}</Badge></div>) : <p className="text-sm text-muted-foreground">No recognized credits recorded.</p>}</CardContent></Card>{isAcademicAdmin && <Card className="mt-4"><CardHeader><CardTitle>Record recognized learning</CardTitle></CardHeader><CardContent className="grid md:grid-cols-2 gap-3"><Field label="Registration"><select className={selectClass} value={creditForm.programme_registration_id} onChange={(e) => setCreditForm({ ...creditForm, programme_registration_id: e.target.value })}><option value="">Select…</option>{registrations.map((row) => <option key={row.id} value={row.id}>{personByUserId.get(row.user_id)?.display_name || row.user_id}</option>)}</select></Field><Field label="Mapped course (optional)"><select className={selectClass} value={creditForm.course_id} onChange={(e) => setCreditForm({ ...creditForm, course_id: e.target.value })}><option value="">No direct course mapping</option>{courses.map((row) => <option key={row.id} value={row.id}>{row.code} — {row.title}</option>)}</select></Field><Field label="External course code"><Input value={creditForm.external_course_code} onChange={(e) => setCreditForm({ ...creditForm, external_course_code: e.target.value })}/></Field><Field label="External course title"><Input value={creditForm.external_course_title} onChange={(e) => setCreditForm({ ...creditForm, external_course_title: e.target.value })}/></Field><Field label="Source institution"><Input value={creditForm.source_institution} onChange={(e) => setCreditForm({ ...creditForm, source_institution: e.target.value })}/></Field><Field label="Credits"><Input type="number" min="0.01" step="0.5" value={creditForm.credits} onChange={(e) => setCreditForm({ ...creditForm, credits: e.target.value })}/></Field><Field label="Equivalent %"><Input type="number" min="0" max="100" value={creditForm.equivalent_percentage} onChange={(e) => setCreditForm({ ...creditForm, equivalent_percentage: e.target.value })}/></Field><Field label="Decision"><select className={selectClass} value={creditForm.decision} onChange={(e) => setCreditForm({ ...creditForm, decision: e.target.value })}><option value="approved">Approved</option><option value="pending">Pending</option><option value="rejected">Rejected</option></select></Field><div className="md:col-span-2"><Button disabled={busy} onClick={() => void run(saveCredit, 'Recognized credit recorded')}>Save recognized credit</Button></div></CardContent></Card>}</TabsContent>

        <TabsContent value="decisions"><Card><CardHeader><CardTitle>Progression decisions</CardTitle></CardHeader><CardContent className="space-y-2">{progression.length ? progression.map((row) => <div key={row.id} className="rounded border p-3 flex justify-between gap-3 text-sm"><div><p className="font-medium">{personByUserId.get(registrationById.get(row.programme_registration_id)?.user_id || '')?.display_name || 'Student'} · {row.decision}</p>{row.rationale && <p className="mt-1">{row.rationale}</p>}<p className="text-xs text-muted-foreground mt-1">{new Date(row.decided_at).toLocaleString()}</p></div><Badge variant={statusVariant(row.decision)}>{row.decision}</Badge></div>) : <p className="text-sm text-muted-foreground">No progression decisions recorded.</p>}</CardContent></Card>{isAcademicAdmin && <Card className="mt-4"><CardHeader><CardTitle>Record progression decision</CardTitle></CardHeader><CardContent className="grid md:grid-cols-2 gap-3"><Field label="Registration"><select className={selectClass} value={progressionForm.programme_registration_id} onChange={(e) => setProgressionForm({ ...progressionForm, programme_registration_id: e.target.value })}><option value="">Select…</option>{registrations.map((row) => <option key={row.id} value={row.id}>{personByUserId.get(row.user_id)?.display_name || row.user_id}</option>)}</select></Field><Field label="Term"><select className={selectClass} value={progressionForm.term_id} onChange={(e) => setProgressionForm({ ...progressionForm, term_id: e.target.value })}><option value="">No term</option>{terms.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></Field><Field label="Decision"><select className={selectClass} value={progressionForm.decision} onChange={(e) => setProgressionForm({ ...progressionForm, decision: e.target.value })}><option value="progress">Progress</option><option value="progress_with_conditions">Progress with conditions</option><option value="repeat">Repeat</option><option value="defer">Defer</option><option value="leave">Leave</option><option value="withdraw">Withdraw</option><option value="complete">Complete</option><option value="dismiss">Dismiss</option></select></Field><div className="md:col-span-2"><Field label="Rationale"><Textarea value={progressionForm.rationale} onChange={(e) => setProgressionForm({ ...progressionForm, rationale: e.target.value })}/></Field></div><div className="md:col-span-2"><Button disabled={busy} onClick={() => void run(saveProgression, 'Progression decision recorded')}>Record decision</Button></div></CardContent></Card>}</TabsContent>

        {isAcademicAdmin && <TabsContent value="registrar" className="space-y-4"><div className="grid lg:grid-cols-2 gap-4"><Card><CardHeader><CardTitle className="flex items-center gap-2"><UsersRound className="h-5 w-5"/>Register student in programme</CardTitle></CardHeader><CardContent className="space-y-3"><Field label="Student"><select className={selectClass} value={registrationForm.user_id} onChange={(e) => setRegistrationForm({ ...registrationForm, user_id: e.target.value })}><option value="">Select…</option>{studentPeople.map((row) => <option key={row.user_id} value={row.user_id}>{row.display_name || row.user_id}{row.student_number ? ` · ${row.student_number}` : ''}</option>)}</select></Field><Field label="Programme"><select className={selectClass} value={registrationForm.programme_id} onChange={(e) => setRegistrationForm({ ...registrationForm, programme_id: e.target.value })}><option value="">Select…</option>{programmes.map((row) => <option key={row.id} value={row.id}>{row.code} — {row.name}</option>)}</select></Field><Field label="Cohort"><select className={selectClass} value={registrationForm.cohort_id} onChange={(e) => setRegistrationForm({ ...registrationForm, cohort_id: e.target.value })}><option value="">None</option>{cohorts.filter((row) => !registrationForm.programme_id || row.programme_id === registrationForm.programme_id).map((row) => <option key={row.id} value={row.id}>{row.code} — {row.name}</option>)}</select></Field><Field label="Entry term"><select className={selectClass} value={registrationForm.entry_term_id} onChange={(e) => setRegistrationForm({ ...registrationForm, entry_term_id: e.target.value })}><option value="">None</option>{terms.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></Field><Button disabled={busy} onClick={() => void run(saveRegistration, 'Student registered in programme')}><BriefcaseBusiness className="h-4 w-4 mr-1"/>Register student</Button></CardContent></Card><Card><CardHeader><CardTitle className="flex items-center gap-2"><UserCheck className="h-5 w-5"/>Assign academic advisor</CardTitle></CardHeader><CardContent className="space-y-3"><Field label="Programme registration"><select className={selectClass} value={advisorForm.programme_registration_id} onChange={(e) => setAdvisorForm({ ...advisorForm, programme_registration_id: e.target.value })}><option value="">Select…</option>{registrations.map((row) => <option key={row.id} value={row.id}>{personByUserId.get(row.user_id)?.display_name || row.user_id} · {programmes.find((p) => p.id === row.programme_id)?.code}</option>)}</select></Field><Field label="Advisor"><select className={selectClass} value={advisorForm.advisor_user_id} onChange={(e) => setAdvisorForm({ ...advisorForm, advisor_user_id: e.target.value })}><option value="">Select…</option>{advisorPeople.map((row) => <option key={row.user_id} value={row.user_id}>{row.display_name || row.user_id} · {row.university_role}</option>)}</select></Field><Button disabled={busy} onClick={() => void run(saveAdvisor, 'Academic advisor assigned')}><ShieldCheck className="h-4 w-4 mr-1"/>Assign advisor</Button></CardContent></Card></div></TabsContent>}
      </Tabs>}
    </main><Footer/></>
  );
}
