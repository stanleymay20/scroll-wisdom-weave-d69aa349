import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  GraduationCap, Users, BookOpen, CalendarDays, Layers3, ClipboardCheck, BarChart3,
  Plus, Upload, Download, Award, Bell, School, RefreshCcw, UserRoundCheck, Target,
} from 'lucide-react';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { useUniversity } from '@/hooks/useUniversity';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { supabase } from '@/integrations/supabase/client';
import {
  downloadCsv,
  formatUniversityRole,
  parseUniversityRosterCsv,
  type UniversityGradebookRow,
} from '@/lib/university';

const db = supabase as any;
const fieldClass = 'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

function MetricCard({ icon: Icon, label, value, note }: { icon: typeof Users; label: string; value: number | string; note?: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-2 text-muted-foreground mb-1"><Icon className="h-4 w-4" /><span className="text-xs uppercase tracking-wide">{label}</span></div>
        <p className="text-3xl font-bold">{value}</p>
        {note && <p className="text-xs text-muted-foreground mt-1">{note}</p>}
      </CardContent>
    </Card>
  );
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground py-8 text-center">{children}</p>;
}

function CreateDialog({ title, trigger, children, onSave, saving }: {
  title: string;
  trigger: React.ReactNode;
  children: React.ReactNode;
  onSave: () => Promise<void>;
  saving: boolean;
}) {
  const [open, setOpen] = useState(false);
  const handleSave = async () => {
    await onSave();
    setOpen(false);
  };
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">{children}</div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button onClick={() => void handleSave()} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function University() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useSubscription();
  const university = useUniversity();
  const {
    activeOrg, activeOrgId, settingsExists, person, people, programmes, courses, terms, cohorts, offerings,
    teachingAssignments, enrolments, assignments, gradeItems, grades, gradebook, transcript, outcomes, modules,
    announcements, loading, error, universityRole, isAcademicAdmin, isStaff, isStudent, courseById, termById,
    offeringById, personByUserId, initializeUniversity, insert, provisionRoster, saveGrade, refresh,
  } = university;

  const [saving, setSaving] = useState(false);
  const [programme, setProgramme] = useState({ code: '', name: '', qualification_level: 'bachelor', total_credits: '120' });
  const [course, setCourse] = useState({ code: '', title: '', credits: '5', level: '1', delivery_mode: 'online' });
  const [term, setTerm] = useState({ code: '', name: '', academic_year: '', term_number: '1', starts_on: '', ends_on: '' });
  const [cohort, setCohort] = useState({ code: '', name: '', programme_id: '', intake_year: String(new Date().getFullYear()) });
  const [offering, setOffering] = useState({ course_id: '', term_id: '', cohort_id: '', section_code: 'A', capacity: '100' });
  const [curriculum, setCurriculum] = useState({ programme_id: '', course_id: '', year_number: '1', term_number: '1', sequence: '1', is_required: 'true' });
  const [outcome, setOutcome] = useState({ scope: 'course', parent_id: '', code: '', description: '', bloom_level: 'apply', competency_domain: '' });
  const [outcomeMap, setOutcomeMap] = useState({ programme_outcome_id: '', course_outcome_id: '', contribution_weight: '1' });
  const [moduleForm, setModuleForm] = useState({ course_id: '', code: '', title: '', sequence: '1', estimated_learning_hours: '2' });
  const [assignment, setAssignment] = useState({ offering_id: '', module_id: '', title: '', assignment_type: 'assignment', instructions: '', due_at: '', max_points: '100', source_book_id: '', source_chapter_id: '' });
  const [gradeItem, setGradeItem] = useState({ offering_id: '', name: '', category: 'coursework', max_points: '100', weight_percent: '20' });
  const [announcement, setAnnouncement] = useState({ offering_id: '', title: '', body: '', audience: 'all' });
  const [rosterText, setRosterText] = useState('email,display_name,role,student_number,staff_number\n');
  const [rosterResult, setRosterResult] = useState<string | null>(null);
  const [selectedGradeOffering, setSelectedGradeOffering] = useState('');
  const [selectedGradeItem, setSelectedGradeItem] = useState('');
  const [gradeDrafts, setGradeDrafts] = useState<Record<string, string>>({});
  const [books, setBooks] = useState<Array<{ id: string; title: string }>>([]);
  const [chapters, setChapters] = useState<Array<{ id: string; title: string; book_id: string }>>([]);

  useEffect(() => {
    document.title = activeOrg ? `${activeOrg.name} — ScrollUniversity` : 'ScrollUniversity';
  }, [activeOrg]);

  useEffect(() => {
    if (!activeOrgId) { setBooks([]); setChapters([]); return; }
    void (async () => {
      const [bookRes, chapterRes] = await Promise.all([
        db.from('books').select('id,title').eq('organization_id', activeOrgId).order('title').limit(500),
        db.from('chapters').select('id,title,book_id').limit(5000),
      ]);
      if (!bookRes.error) setBooks(bookRes.data || []);
      if (!chapterRes.error) setChapters(chapterRes.data || []);
    })();
  }, [activeOrgId]);

  const runSave = async (work: () => Promise<unknown>, success: string) => {
    setSaving(true);
    try {
      await work();
      toast({ title: success });
    } catch (e) {
      toast({ title: 'Could not save', description: e instanceof Error ? e.message : String(e), variant: 'destructive' });
      throw e;
    } finally {
      setSaving(false);
    }
  };

  const myTeachingOfferingIds = useMemo(() => new Set(
    teachingAssignments.filter((row) => row.user_id === user?.id).map((row) => row.offering_id),
  ), [teachingAssignments, user?.id]);
  const myEnrolments = useMemo(() => enrolments.filter((row) => row.user_id === user?.id), [enrolments, user?.id]);
  const myOfferingIds = useMemo(() => new Set(myEnrolments.map((row) => row.offering_id)), [myEnrolments]);
  const visibleStaffOfferings = isAcademicAdmin ? offerings : offerings.filter((row) => myTeachingOfferingIds.has(row.id));
  const visibleStudentOfferings = offerings.filter((row) => myOfferingIds.has(row.id));
  const upcomingAssignments = assignments.filter((row) => !row.due_at || new Date(row.due_at).getTime() >= Date.now());
  const studentAssignments = upcomingAssignments.filter((row) => myOfferingIds.has(row.offering_id));
  const gradeOfferingItems = gradeItems.filter((item) => item.offering_id === selectedGradeOffering);
  const gradeOfferingEnrolments = enrolments.filter((row) => row.offering_id === selectedGradeOffering && ['enrolled', 'completed'].includes(row.status));
  const selectedItem = gradeItems.find((item) => item.id === selectedGradeItem) || null;
  const selectedBookChapters = chapters.filter((chapter) => chapter.book_id === assignment.source_book_id);

  const exportGradebook = () => {
    const rows = gradebook.map((row: UniversityGradebookRow) => ({
      course_code: row.course_code,
      course_title: row.course_title,
      section: row.section_code,
      student_number: row.student_number || '',
      student_name: row.display_name || '',
      grade_item: row.grade_item_name,
      category: row.category,
      weight_percent: row.weight_percent,
      percentage: row.percentage ?? '',
      grade: row.grade_label || '',
      status: row.status,
    }));
    downloadCsv(`${activeOrg?.slug || 'university'}-gradebook.csv`, rows);
  };

  const exportTranscript = () => {
    downloadCsv(`${activeOrg?.slug || 'university'}-transcript.csv`, transcript.map((row) => ({
      student_number: row.student_number || '', student_name: row.display_name || '', academic_year: row.academic_year,
      term: row.term_name, course_code: row.course_code, course_title: row.course_title, credits: row.credits,
      percentage: row.final_percentage ?? '', grade: row.final_grade || '', credits_earned: row.credits_earned ?? '', status: row.enrolment_status,
    })));
  };

  const importRoster = async () => {
    const parsed = parseUniversityRosterCsv(rosterText);
    if (parsed.errors.length) {
      setRosterResult(parsed.errors.join('\n'));
      return;
    }
    setSaving(true);
    try {
      const result = await provisionRoster(parsed.rows.map((row) => ({
        email: row.email, display_name: row.displayName, role: row.role,
        student_number: row.studentNumber, staff_number: row.staffNumber,
      }))) as { succeeded?: number; invited?: number; failed?: number };
      setRosterResult(`Provisioned ${result?.succeeded ?? 0}; invited ${result?.invited ?? 0}; failed ${result?.failed ?? 0}.`);
      toast({ title: 'University roster processed' });
    } catch (e) {
      setRosterResult(e instanceof Error ? e.message : String(e));
    } finally { setSaving(false); }
  };

  const submitGrade = async (learnerId: string) => {
    if (!selectedItem) return;
    const value = Number(gradeDrafts[learnerId]);
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      toast({ title: 'Enter a percentage from 0 to 100', variant: 'destructive' });
      return;
    }
    await runSave(() => saveGrade(selectedItem, learnerId, value), 'Grade published');
  };

  if (!activeOrgId || !activeOrg) {
    return (
      <><Navbar /><main className="container mx-auto px-4 pt-24 pb-16 max-w-3xl"><Card><CardContent className="py-16 text-center">
        <School className="h-12 w-12 mx-auto text-primary mb-4" /><h1 className="text-3xl font-bold mb-2">Select an institution</h1>
        <p className="text-muted-foreground mb-6">ScrollUniversity uses an organization as its institutional home. Create or activate one first.</p>
        <Button onClick={() => navigate('/organizations')}>Manage organizations</Button>
      </CardContent></Card></main><Footer /></>
    );
  }

  if (loading) {
    return <><Navbar /><main className="container mx-auto px-4 pt-24 pb-16"><p className="text-sm text-muted-foreground">Loading ScrollUniversity…</p></main><Footer /></>;
  }

  if (error && !settingsExists) {
    return <><Navbar /><main className="container mx-auto px-4 pt-24 pb-16 max-w-3xl"><Alert variant="destructive"><AlertTitle>University schema is not deployed</AlertTitle><AlertDescription>{error}</AlertDescription></Alert></main><Footer /></>;
  }

  if (!settingsExists) {
    return (
      <><Navbar /><main className="container mx-auto px-4 pt-24 pb-16 max-w-3xl"><Card><CardHeader><CardTitle className="flex items-center gap-2"><GraduationCap className="h-6 w-6 text-primary" />Enable ScrollUniversity for {activeOrg.name}</CardTitle><CardDescription>Turn this organization into a full academic institution while preserving its existing library and learning data.</CardDescription></CardHeader><CardContent>
        {isAcademicAdmin || university.activeRole === 'owner' || university.activeRole === 'admin' ? (
          <Button disabled={saving} onClick={() => void runSave(initializeUniversity, 'ScrollUniversity enabled')}>{saving ? 'Enabling…' : 'Enable ScrollUniversity'}</Button>
        ) : <Alert><AlertTitle>Institution setup required</AlertTitle><AlertDescription>An organization owner or admin must enable ScrollUniversity.</AlertDescription></Alert>}
      </CardContent></Card></main><Footer /></>
    );
  }

  const roleLabel = universityRole ? formatUniversityRole(universityRole) : (university.activeRole ? formatUniversityRole(university.activeRole) : 'Member');

  return (
    <><Navbar /><main className="container mx-auto px-4 pt-24 pb-16 max-w-7xl">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-6">
        <div><div className="flex items-center gap-2"><GraduationCap className="h-8 w-8 text-primary" /><h1 className="text-3xl font-bold tracking-tight">ScrollUniversity</h1></div>
          <p className="text-muted-foreground mt-1">{activeOrg.name} · academic operations, teaching, assessment and student records.</p></div>
        <div className="flex items-center gap-2"><Badge>{roleLabel}</Badge><Button variant="outline" size="sm" onClick={() => void refresh()}><RefreshCcw className="h-4 w-4 mr-1" />Refresh</Button></div>
      </div>

      {error && <Alert variant="destructive" className="mb-6"><AlertTitle>Some university data could not load</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <MetricCard icon={BookOpen} label="Courses" value={courses.length} note={isStudent ? `${myEnrolments.length} enrolled` : `${offerings.length} offerings`} />
        <MetricCard icon={Users} label={isStudent ? 'Classmates & staff' : 'People'} value={people.length} />
        <MetricCard icon={ClipboardCheck} label="Assignments" value={isStudent ? studentAssignments.length : assignments.length} />
        <MetricCard icon={Target} label="Outcomes" value={outcomes.length} />
      </div>

      {isStudent && !isStaff ? (
        <Tabs defaultValue="courses" className="space-y-6">
          <TabsList className="flex flex-wrap h-auto"><TabsTrigger value="courses">My courses</TabsTrigger><TabsTrigger value="assignments">Assignments</TabsTrigger><TabsTrigger value="results">Results</TabsTrigger><TabsTrigger value="announcements">Announcements</TabsTrigger></TabsList>
          <TabsContent value="courses"><div className="grid md:grid-cols-2 gap-4">{visibleStudentOfferings.map((row) => { const c = courseById.get(row.course_id); const t = termById.get(row.term_id); return <Card key={row.id}><CardHeader><CardTitle>{c?.code} — {c?.title}</CardTitle><CardDescription>{t?.name} · Section {row.section_code}</CardDescription></CardHeader><CardContent className="flex gap-2"><Button asChild variant="outline"><Link to="/library">Course library</Link></Button><Button asChild><Link to="/dashboard/mastery">Mastery dashboard</Link></Button></CardContent></Card>; })}{visibleStudentOfferings.length === 0 && <Card className="md:col-span-2"><EmptyState>No active course enrolments.</EmptyState></Card>}</div></TabsContent>
          <TabsContent value="assignments"><Card><CardHeader><CardTitle>Upcoming assignments</CardTitle></CardHeader><CardContent>{studentAssignments.length ? <div className="divide-y">{studentAssignments.map((a) => <div key={a.id} className="py-3 flex justify-between gap-4"><div><p className="font-medium">{a.title}</p><p className="text-xs text-muted-foreground">{courseById.get(offeringById.get(a.offering_id)?.course_id || '')?.code} · {a.assignment_type}</p></div><div className="text-sm text-right">{a.due_at ? new Date(a.due_at).toLocaleString() : 'No deadline'}</div></div>)}</div> : <EmptyState>No upcoming assignments.</EmptyState>}</CardContent></Card></TabsContent>
          <TabsContent value="results"><Card><CardHeader><div className="flex justify-between gap-3"><div><CardTitle>Transcript</CardTitle><CardDescription>Your course results and earned credits.</CardDescription></div><Button variant="outline" size="sm" onClick={exportTranscript}><Download className="h-4 w-4 mr-1" />CSV</Button></div></CardHeader><CardContent>{transcript.length ? <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="py-2">Course</th><th>Term</th><th>Credits</th><th>%</th><th>Grade</th><th>Status</th></tr></thead><tbody>{transcript.map((r) => <tr key={`${r.offering_id}-${r.user_id}`} className="border-b"><td className="py-3"><span className="font-medium">{r.course_code}</span><br/><span className="text-xs text-muted-foreground">{r.course_title}</span></td><td>{r.term_name}</td><td>{r.credits_earned ?? r.credits}</td><td>{r.final_percentage ?? '—'}</td><td>{r.final_grade || '—'}</td><td>{r.enrolment_status}</td></tr>)}</tbody></table></div> : <EmptyState>No transcript records yet.</EmptyState>}</CardContent></Card></TabsContent>
          <TabsContent value="announcements"><Card><CardHeader><CardTitle>Announcements</CardTitle></CardHeader><CardContent>{announcements.length ? <div className="space-y-4">{announcements.map((a) => <div key={a.id} className="border rounded-lg p-4"><h3 className="font-semibold">{a.title}</h3><p className="text-sm mt-1 whitespace-pre-wrap">{a.body}</p></div>)}</div> : <EmptyState>No announcements.</EmptyState>}</CardContent></Card></TabsContent>
        </Tabs>
      ) : (
        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList className="flex flex-wrap h-auto"><TabsTrigger value="overview">Overview</TabsTrigger>{isAcademicAdmin && <><TabsTrigger value="curriculum">Curriculum</TabsTrigger><TabsTrigger value="delivery">Terms & cohorts</TabsTrigger><TabsTrigger value="people">People</TabsTrigger></>}<TabsTrigger value="assignments">Assignments</TabsTrigger><TabsTrigger value="gradebook">Gradebook</TabsTrigger><TabsTrigger value="outcomes">Outcomes</TabsTrigger><TabsTrigger value="announcements">Announcements</TabsTrigger></TabsList>

          <TabsContent value="overview" className="space-y-4"><div className="grid md:grid-cols-2 gap-4"><Card><CardHeader><CardTitle>Teaching portfolio</CardTitle><CardDescription>Course offerings you can manage.</CardDescription></CardHeader><CardContent>{visibleStaffOfferings.length ? <div className="space-y-3">{visibleStaffOfferings.slice(0, 8).map((o) => { const c = courseById.get(o.course_id); return <div key={o.id} className="flex items-center justify-between border rounded-lg p-3"><div><p className="font-medium">{c?.code} — {c?.title}</p><p className="text-xs text-muted-foreground">{termById.get(o.term_id)?.name} · Section {o.section_code}</p></div><Badge variant="outline">{o.enrolment_status}</Badge></div>; })}</div> : <EmptyState>No assigned course offerings.</EmptyState>}</CardContent></Card><Card><CardHeader><CardTitle>Learner signals</CardTitle><CardDescription>Use ScrollMastery for deep cognitive progress; ScrollUniversity keeps the institutional record.</CardDescription></CardHeader><CardContent><div className="space-y-3"><p className="text-sm">{enrolments.length} visible enrolments · {gradeItems.length} grade items · {assignments.length} assignments.</p><Button asChild variant="outline"><Link to="/dashboard/mastery"><BarChart3 className="h-4 w-4 mr-2" />Open mastery analytics</Link></Button></div></CardContent></Card></div></TabsContent>

          {isAcademicAdmin && <TabsContent value="curriculum" className="space-y-6"><div className="flex flex-wrap gap-2">
            <CreateDialog title="Create programme" saving={saving} trigger={<Button><Plus className="h-4 w-4 mr-1" />Programme</Button>} onSave={() => runSave(() => insert('university_programmes', { ...programme, total_credits: Number(programme.total_credits), status: 'active' }), 'Programme created')}><Label>Code</Label><Input value={programme.code} onChange={(e) => setProgramme({ ...programme, code: e.target.value })}/><Label>Name</Label><Input value={programme.name} onChange={(e) => setProgramme({ ...programme, name: e.target.value })}/><Label>Qualification</Label><select className={fieldClass} value={programme.qualification_level} onChange={(e) => setProgramme({ ...programme, qualification_level: e.target.value })}><option value="bachelor">Bachelor</option><option value="master">Master</option><option value="doctorate">Doctorate</option><option value="diploma">Diploma</option><option value="certificate">Certificate</option><option value="professional">Professional</option></select><Label>Total credits</Label><Input type="number" value={programme.total_credits} onChange={(e) => setProgramme({ ...programme, total_credits: e.target.value })}/></CreateDialog>
            <CreateDialog title="Create course" saving={saving} trigger={<Button variant="outline"><Plus className="h-4 w-4 mr-1" />Course</Button>} onSave={() => runSave(() => insert('university_courses', { ...course, credits: Number(course.credits), level: Number(course.level), status: 'active' }), 'Course created')}><Label>Code</Label><Input value={course.code} onChange={(e) => setCourse({ ...course, code: e.target.value })}/><Label>Title</Label><Input value={course.title} onChange={(e) => setCourse({ ...course, title: e.target.value })}/><Label>Credits</Label><Input type="number" value={course.credits} onChange={(e) => setCourse({ ...course, credits: e.target.value })}/><Label>Level</Label><Input type="number" value={course.level} onChange={(e) => setCourse({ ...course, level: e.target.value })}/><Label>Delivery</Label><select className={fieldClass} value={course.delivery_mode} onChange={(e) => setCourse({ ...course, delivery_mode: e.target.value })}><option value="online">Online</option><option value="in_person">In person</option><option value="hybrid">Hybrid</option><option value="self_paced">Self-paced</option></select></CreateDialog>
            <CreateDialog title="Map course into programme" saving={saving} trigger={<Button variant="outline"><Layers3 className="h-4 w-4 mr-1" />Map curriculum</Button>} onSave={() => runSave(() => insert('university_programme_courses', { programme_id: curriculum.programme_id, course_id: curriculum.course_id, year_number: Number(curriculum.year_number), term_number: Number(curriculum.term_number), sequence: Number(curriculum.sequence), is_required: curriculum.is_required === 'true' }), 'Curriculum mapped')}><Label>Programme</Label><select className={fieldClass} value={curriculum.programme_id} onChange={(e) => setCurriculum({ ...curriculum, programme_id: e.target.value })}><option value="">Select…</option>{programmes.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}</select><Label>Course</Label><select className={fieldClass} value={curriculum.course_id} onChange={(e) => setCurriculum({ ...curriculum, course_id: e.target.value })}><option value="">Select…</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.title}</option>)}</select><div className="grid grid-cols-3 gap-3"><div><Label>Year</Label><Input type="number" value={curriculum.year_number} onChange={(e) => setCurriculum({ ...curriculum, year_number: e.target.value })}/></div><div><Label>Term</Label><Input type="number" value={curriculum.term_number} onChange={(e) => setCurriculum({ ...curriculum, term_number: e.target.value })}/></div><div><Label>Sequence</Label><Input type="number" value={curriculum.sequence} onChange={(e) => setCurriculum({ ...curriculum, sequence: e.target.value })}/></div></div></CreateDialog>
          </div><div className="grid md:grid-cols-2 gap-4"><Card><CardHeader><CardTitle>Programmes</CardTitle></CardHeader><CardContent>{programmes.length ? programmes.map((p) => <div key={p.id} className="py-2 border-b"><span className="font-medium">{p.code}</span> — {p.name}<Badge variant="outline" className="ml-2">{p.qualification_level}</Badge></div>) : <EmptyState>No programmes.</EmptyState>}</CardContent></Card><Card><CardHeader><CardTitle>Course catalogue</CardTitle></CardHeader><CardContent>{courses.length ? courses.map((c) => <div key={c.id} className="py-2 border-b"><span className="font-medium">{c.code}</span> — {c.title}<span className="text-xs text-muted-foreground ml-2">{c.credits} cr</span></div>) : <EmptyState>No courses.</EmptyState>}</CardContent></Card></div></TabsContent>}

          {isAcademicAdmin && <TabsContent value="delivery" className="space-y-6"><div className="flex flex-wrap gap-2">
            <CreateDialog title="Create academic term" saving={saving} trigger={<Button><CalendarDays className="h-4 w-4 mr-1" />Term</Button>} onSave={() => runSave(() => insert('university_academic_terms', { ...term, term_number: Number(term.term_number), status: 'open' }), 'Academic term created')}><Label>Code</Label><Input value={term.code} onChange={(e) => setTerm({ ...term, code: e.target.value })}/><Label>Name</Label><Input value={term.name} onChange={(e) => setTerm({ ...term, name: e.target.value })}/><Label>Academic year</Label><Input placeholder="2026/27" value={term.academic_year} onChange={(e) => setTerm({ ...term, academic_year: e.target.value })}/><div className="grid grid-cols-2 gap-3"><div><Label>Starts</Label><Input type="date" value={term.starts_on} onChange={(e) => setTerm({ ...term, starts_on: e.target.value })}/></div><div><Label>Ends</Label><Input type="date" value={term.ends_on} onChange={(e) => setTerm({ ...term, ends_on: e.target.value })}/></div></div></CreateDialog>
            <CreateDialog title="Create cohort" saving={saving} trigger={<Button variant="outline"><Users className="h-4 w-4 mr-1" />Cohort</Button>} onSave={() => runSave(() => insert('university_cohorts', { code: cohort.code, name: cohort.name, programme_id: cohort.programme_id || null, intake_year: Number(cohort.intake_year), status: 'active' }), 'Cohort created')}><Label>Code</Label><Input value={cohort.code} onChange={(e) => setCohort({ ...cohort, code: e.target.value })}/><Label>Name</Label><Input value={cohort.name} onChange={(e) => setCohort({ ...cohort, name: e.target.value })}/><Label>Programme</Label><select className={fieldClass} value={cohort.programme_id} onChange={(e) => setCohort({ ...cohort, programme_id: e.target.value })}><option value="">None</option>{programmes.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}</select><Label>Intake year</Label><Input type="number" value={cohort.intake_year} onChange={(e) => setCohort({ ...cohort, intake_year: e.target.value })}/></CreateDialog>
            <CreateDialog title="Create course offering" saving={saving} trigger={<Button variant="outline"><BookOpen className="h-4 w-4 mr-1" />Course offering</Button>} onSave={() => runSave(() => insert('university_course_offerings', { course_id: offering.course_id, term_id: offering.term_id, cohort_id: offering.cohort_id || null, section_code: offering.section_code, capacity: Number(offering.capacity), enrolment_status: 'open' }), 'Course offering created')}><Label>Course</Label><select className={fieldClass} value={offering.course_id} onChange={(e) => setOffering({ ...offering, course_id: e.target.value })}><option value="">Select…</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.title}</option>)}</select><Label>Term</Label><select className={fieldClass} value={offering.term_id} onChange={(e) => setOffering({ ...offering, term_id: e.target.value })}><option value="">Select…</option>{terms.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select><Label>Cohort</Label><select className={fieldClass} value={offering.cohort_id} onChange={(e) => setOffering({ ...offering, cohort_id: e.target.value })}><option value="">None</option>{cohorts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select><div className="grid grid-cols-2 gap-3"><div><Label>Section</Label><Input value={offering.section_code} onChange={(e) => setOffering({ ...offering, section_code: e.target.value })}/></div><div><Label>Capacity</Label><Input type="number" value={offering.capacity} onChange={(e) => setOffering({ ...offering, capacity: e.target.value })}/></div></div></CreateDialog>
          </div><Card><CardHeader><CardTitle>Live delivery</CardTitle></CardHeader><CardContent>{offerings.length ? <div className="grid md:grid-cols-2 gap-3">{offerings.map((o) => <div key={o.id} className="border rounded-lg p-3"><p className="font-medium">{courseById.get(o.course_id)?.code} — {courseById.get(o.course_id)?.title}</p><p className="text-xs text-muted-foreground">{termById.get(o.term_id)?.name} · Section {o.section_code}</p></div>)}</div> : <EmptyState>No course offerings.</EmptyState>}</CardContent></Card></TabsContent>}

          {isAcademicAdmin && <TabsContent value="people" className="space-y-6"><div className="grid lg:grid-cols-2 gap-4"><Card><CardHeader><CardTitle>Bulk provision students & staff</CardTitle><CardDescription>CSV columns: email, display_name, role, student_number, staff_number. Up to 500 records per import.</CardDescription></CardHeader><CardContent className="space-y-3"><Textarea className="font-mono min-h-[220px]" value={rosterText} onChange={(e) => setRosterText(e.target.value)}/><Button disabled={saving} onClick={() => void importRoster()}><Upload className="h-4 w-4 mr-2" />Validate & provision</Button>{rosterResult && <pre className="text-xs whitespace-pre-wrap bg-muted rounded p-3">{rosterResult}</pre>}</CardContent></Card><Card><CardHeader><CardTitle>Directory</CardTitle><CardDescription>{people.length} institutional identities.</CardDescription></CardHeader><CardContent className="max-h-[420px] overflow-y-auto">{people.map((p) => <div key={p.id} className="flex justify-between gap-3 py-2 border-b"><div><p className="font-medium">{p.display_name || p.user_id}</p><p className="text-xs text-muted-foreground">{p.student_number || p.staff_number || p.user_id}</p></div><Badge variant="outline">{formatUniversityRole(p.university_role)}</Badge></div>)}</CardContent></Card></div></TabsContent>}

          <TabsContent value="assignments" className="space-y-6"><div className="flex flex-wrap gap-2">
            <CreateDialog title="Create assignment" saving={saving} trigger={<Button><Plus className="h-4 w-4 mr-1" />Assignment</Button>} onSave={() => runSave(() => insert('university_assignments', { offering_id: assignment.offering_id, module_id: assignment.module_id || null, title: assignment.title, assignment_type: assignment.assignment_type, instructions: assignment.instructions, due_at: assignment.due_at ? new Date(assignment.due_at).toISOString() : null, max_points: Number(assignment.max_points), source_book_id: assignment.source_book_id || null, source_chapter_id: assignment.source_chapter_id || null, published: true, created_by: user?.id }), 'Assignment published')}><Label>Course offering</Label><select className={fieldClass} value={assignment.offering_id} onChange={(e) => setAssignment({ ...assignment, offering_id: e.target.value })}><option value="">Select…</option>{visibleStaffOfferings.map((o) => <option key={o.id} value={o.id}>{courseById.get(o.course_id)?.code} · {termById.get(o.term_id)?.name} · {o.section_code}</option>)}</select><Label>Title</Label><Input value={assignment.title} onChange={(e) => setAssignment({ ...assignment, title: e.target.value })}/><Label>Type</Label><select className={fieldClass} value={assignment.assignment_type} onChange={(e) => setAssignment({ ...assignment, assignment_type: e.target.value })}><option value="assignment">Assignment</option><option value="quiz">Quiz</option><option value="exam">Exam</option><option value="essay">Essay</option><option value="project">Project</option><option value="lab">Lab</option><option value="presentation">Presentation</option><option value="mastery_check">Mastery check</option></select><Label>Instructions</Label><Textarea value={assignment.instructions} onChange={(e) => setAssignment({ ...assignment, instructions: e.target.value })}/><Label>Optional ScrollLibrary book</Label><select className={fieldClass} value={assignment.source_book_id} onChange={(e) => setAssignment({ ...assignment, source_book_id: e.target.value, source_chapter_id: '' })}><option value="">None</option>{books.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}</select>{assignment.source_book_id && <><Label>Book chapter</Label><select className={fieldClass} value={assignment.source_chapter_id} onChange={(e) => setAssignment({ ...assignment, source_chapter_id: e.target.value })}><option value="">Whole book / none</option>{selectedBookChapters.map((ch) => <option key={ch.id} value={ch.id}>{ch.title}</option>)}</select></>}<div className="grid grid-cols-2 gap-3"><div><Label>Due</Label><Input type="datetime-local" value={assignment.due_at} onChange={(e) => setAssignment({ ...assignment, due_at: e.target.value })}/></div><div><Label>Max points</Label><Input type="number" value={assignment.max_points} onChange={(e) => setAssignment({ ...assignment, max_points: e.target.value })}/></div></div></CreateDialog>
            <CreateDialog title="Create grade item" saving={saving} trigger={<Button variant="outline"><Award className="h-4 w-4 mr-1" />Grade item</Button>} onSave={() => runSave(() => insert('university_grade_items', { ...gradeItem, max_points: Number(gradeItem.max_points), weight_percent: Number(gradeItem.weight_percent), published: true }), 'Grade item created')}><Label>Course offering</Label><select className={fieldClass} value={gradeItem.offering_id} onChange={(e) => setGradeItem({ ...gradeItem, offering_id: e.target.value })}><option value="">Select…</option>{visibleStaffOfferings.map((o) => <option key={o.id} value={o.id}>{courseById.get(o.course_id)?.code} · {termById.get(o.term_id)?.name}</option>)}</select><Label>Name</Label><Input value={gradeItem.name} onChange={(e) => setGradeItem({ ...gradeItem, name: e.target.value })}/><div className="grid grid-cols-2 gap-3"><div><Label>Max points</Label><Input type="number" value={gradeItem.max_points} onChange={(e) => setGradeItem({ ...gradeItem, max_points: e.target.value })}/></div><div><Label>Weight %</Label><Input type="number" value={gradeItem.weight_percent} onChange={(e) => setGradeItem({ ...gradeItem, weight_percent: e.target.value })}/></div></div></CreateDialog>
          </div><Card><CardHeader><CardTitle>Assignments</CardTitle></CardHeader><CardContent>{assignments.length ? <div className="divide-y">{assignments.map((a) => <div key={a.id} className="py-3 flex justify-between gap-4"><div><p className="font-medium">{a.title}</p><p className="text-xs text-muted-foreground">{courseById.get(offeringById.get(a.offering_id)?.course_id || '')?.code} · {a.assignment_type}</p></div><Badge variant={a.published ? 'default' : 'outline'}>{a.published ? 'Published' : 'Draft'}</Badge></div>)}</div> : <EmptyState>No assignments.</EmptyState>}</CardContent></Card></TabsContent>

          <TabsContent value="gradebook" className="space-y-6"><div className="flex flex-wrap justify-between gap-3"><div className="flex flex-wrap gap-2"><select className={fieldClass + ' min-w-[240px]'} value={selectedGradeOffering} onChange={(e) => { setSelectedGradeOffering(e.target.value); setSelectedGradeItem(''); }}><option value="">Choose course offering…</option>{visibleStaffOfferings.map((o) => <option key={o.id} value={o.id}>{courseById.get(o.course_id)?.code} · {termById.get(o.term_id)?.name} · {o.section_code}</option>)}</select><select className={fieldClass + ' min-w-[220px]'} value={selectedGradeItem} onChange={(e) => setSelectedGradeItem(e.target.value)} disabled={!selectedGradeOffering}><option value="">Choose grade item…</option>{gradeOfferingItems.map((g) => <option key={g.id} value={g.id}>{g.name} ({g.weight_percent}%)</option>)}</select></div><Button variant="outline" onClick={exportGradebook}><Download className="h-4 w-4 mr-1" />Export gradebook</Button></div>
            <Card><CardHeader><CardTitle>Enter grades</CardTitle><CardDescription>Grades are private under RLS and become visible to each learner only after publication.</CardDescription></CardHeader><CardContent>{selectedItem ? (gradeOfferingEnrolments.length ? <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="py-2">Learner</th><th>Student no.</th><th>Current</th><th className="w-36">New %</th><th></th></tr></thead><tbody>{gradeOfferingEnrolments.map((e) => { const p = personByUserId.get(e.user_id); const existing = grades.find((g) => g.grade_item_id === selectedItem.id && g.user_id === e.user_id); return <tr key={e.id} className="border-b"><td className="py-3 font-medium">{p?.display_name || e.user_id}</td><td>{p?.student_number || '—'}</td><td>{existing?.percentage ?? '—'}</td><td><Input type="number" min="0" max="100" value={gradeDrafts[e.user_id] ?? ''} onChange={(ev) => setGradeDrafts({ ...gradeDrafts, [e.user_id]: ev.target.value })}/></td><td className="text-right"><Button size="sm" onClick={() => void submitGrade(e.user_id)} disabled={saving}>Publish</Button></td></tr>; })}</tbody></table></div> : <EmptyState>No enrolled learners in this offering.</EmptyState>) : <EmptyState>Select an offering and grade item.</EmptyState>}</CardContent></Card>
          </TabsContent>

          <TabsContent value="outcomes" className="space-y-6"><div className="flex flex-wrap gap-2">
            <CreateDialog title="Create learning outcome" saving={saving} trigger={<Button><Target className="h-4 w-4 mr-1" />Learning outcome</Button>} onSave={() => runSave(() => insert('university_learning_outcomes', { programme_id: outcome.scope === 'programme' ? outcome.parent_id : null, course_id: outcome.scope === 'course' ? outcome.parent_id : null, code: outcome.code, description: outcome.description, bloom_level: outcome.bloom_level, competency_domain: outcome.competency_domain || null, active: true }), 'Learning outcome created')}><Label>Scope</Label><select className={fieldClass} value={outcome.scope} onChange={(e) => setOutcome({ ...outcome, scope: e.target.value, parent_id: '' })}><option value="course">Course</option><option value="programme">Programme</option></select><Label>{outcome.scope === 'course' ? 'Course' : 'Programme'}</Label><select className={fieldClass} value={outcome.parent_id} onChange={(e) => setOutcome({ ...outcome, parent_id: e.target.value })}><option value="">Select…</option>{outcome.scope === 'course' ? courses.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.title}</option>) : programmes.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}</select><Label>Code</Label><Input value={outcome.code} onChange={(e) => setOutcome({ ...outcome, code: e.target.value })}/><Label>Description</Label><Textarea value={outcome.description} onChange={(e) => setOutcome({ ...outcome, description: e.target.value })}/><Label>Bloom level</Label><select className={fieldClass} value={outcome.bloom_level} onChange={(e) => setOutcome({ ...outcome, bloom_level: e.target.value })}>{['remember','understand','apply','analyze','evaluate','create'].map((b) => <option key={b} value={b}>{formatUniversityRole(b)}</option>)}</select></CreateDialog>
            {isAcademicAdmin && <CreateDialog title="Map programme outcome to course outcome" saving={saving} trigger={<Button variant="outline"><Layers3 className="h-4 w-4 mr-1" />Map outcomes</Button>} onSave={() => runSave(() => insert('university_outcome_mappings', { programme_outcome_id: outcomeMap.programme_outcome_id, course_outcome_id: outcomeMap.course_outcome_id, contribution_weight: Number(outcomeMap.contribution_weight) }), 'Outcome mapping created')}><Label>Programme outcome</Label><select className={fieldClass} value={outcomeMap.programme_outcome_id} onChange={(e) => setOutcomeMap({ ...outcomeMap, programme_outcome_id: e.target.value })}><option value="">Select…</option>{outcomes.filter((o) => o.programme_id).map((o) => <option key={o.id} value={o.id}>{o.code} — {o.description}</option>)}</select><Label>Course outcome</Label><select className={fieldClass} value={outcomeMap.course_outcome_id} onChange={(e) => setOutcomeMap({ ...outcomeMap, course_outcome_id: e.target.value })}><option value="">Select…</option>{outcomes.filter((o) => o.course_id).map((o) => <option key={o.id} value={o.id}>{o.code} — {o.description}</option>)}</select><Label>Contribution weight</Label><Input type="number" step="0.1" value={outcomeMap.contribution_weight} onChange={(e) => setOutcomeMap({ ...outcomeMap, contribution_weight: e.target.value })}/></CreateDialog>}
            <CreateDialog title="Create course module" saving={saving} trigger={<Button variant="outline"><Layers3 className="h-4 w-4 mr-1" />Module</Button>} onSave={() => runSave(() => insert('university_modules', { course_id: moduleForm.course_id, code: moduleForm.code || null, title: moduleForm.title, sequence: Number(moduleForm.sequence), estimated_learning_hours: Number(moduleForm.estimated_learning_hours), active: true }), 'Module created')}><Label>Course</Label><select className={fieldClass} value={moduleForm.course_id} onChange={(e) => setModuleForm({ ...moduleForm, course_id: e.target.value })}><option value="">Select…</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.code} — {c.title}</option>)}</select><Label>Code</Label><Input value={moduleForm.code} onChange={(e) => setModuleForm({ ...moduleForm, code: e.target.value })}/><Label>Title</Label><Input value={moduleForm.title} onChange={(e) => setModuleForm({ ...moduleForm, title: e.target.value })}/><div className="grid grid-cols-2 gap-3"><div><Label>Sequence</Label><Input type="number" value={moduleForm.sequence} onChange={(e) => setModuleForm({ ...moduleForm, sequence: e.target.value })}/></div><div><Label>Learning hours</Label><Input type="number" value={moduleForm.estimated_learning_hours} onChange={(e) => setModuleForm({ ...moduleForm, estimated_learning_hours: e.target.value })}/></div></div></CreateDialog>
          </div><div className="grid lg:grid-cols-2 gap-4"><Card><CardHeader><CardTitle>Learning outcomes</CardTitle></CardHeader><CardContent>{outcomes.length ? outcomes.map((o) => <div key={o.id} className="py-3 border-b"><div className="flex items-center gap-2"><Badge variant="outline">{o.code}</Badge><Badge variant="secondary">{o.bloom_level || 'unclassified'}</Badge></div><p className="text-sm mt-2">{o.description}</p></div>) : <EmptyState>No learning outcomes.</EmptyState>}</CardContent></Card><Card><CardHeader><CardTitle>Course modules</CardTitle></CardHeader><CardContent>{modules.length ? modules.map((m) => <div key={m.id} className="py-3 border-b"><p className="font-medium">{courseById.get(m.course_id)?.code} · {m.code ? `${m.code} — ` : ''}{m.title}</p><p className="text-xs text-muted-foreground">Sequence {m.sequence} · {m.estimated_learning_hours} learning hours</p></div>) : <EmptyState>No modules.</EmptyState>}</CardContent></Card></div></TabsContent>

          <TabsContent value="announcements" className="space-y-6"><CreateDialog title="Publish announcement" saving={saving} trigger={<Button><Bell className="h-4 w-4 mr-1" />Announcement</Button>} onSave={() => runSave(() => insert('university_announcements', { offering_id: announcement.offering_id || null, title: announcement.title, body: announcement.body, audience: announcement.audience, published_at: new Date().toISOString(), created_by: user?.id }), 'Announcement published')}><Label>Course offering (optional)</Label><select className={fieldClass} value={announcement.offering_id} onChange={(e) => setAnnouncement({ ...announcement, offering_id: e.target.value })}><option value="">Institution-wide</option>{visibleStaffOfferings.map((o) => <option key={o.id} value={o.id}>{courseById.get(o.course_id)?.code} · {termById.get(o.term_id)?.name}</option>)}</select><Label>Audience</Label><select className={fieldClass} value={announcement.audience} onChange={(e) => setAnnouncement({ ...announcement, audience: e.target.value })}><option value="all">All</option><option value="students">Students</option><option value="staff">Staff</option><option value="course">Course</option></select><Label>Title</Label><Input value={announcement.title} onChange={(e) => setAnnouncement({ ...announcement, title: e.target.value })}/><Label>Message</Label><Textarea value={announcement.body} onChange={(e) => setAnnouncement({ ...announcement, body: e.target.value })}/></CreateDialog><Card><CardHeader><CardTitle>Recent announcements</CardTitle></CardHeader><CardContent>{announcements.length ? announcements.map((a) => <div key={a.id} className="border rounded-lg p-4 mb-3"><div className="flex justify-between gap-3"><h3 className="font-semibold">{a.title}</h3><Badge variant="outline">{a.audience}</Badge></div><p className="text-sm mt-2 whitespace-pre-wrap">{a.body}</p></div>) : <EmptyState>No announcements.</EmptyState>}</CardContent></Card></TabsContent>
        </Tabs>
      )}

      <div className="mt-10 border-t pt-6 flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground"><span>Institution: {activeOrg.name} · Role: {roleLabel}</span><div className="flex gap-2"><Button asChild variant="ghost" size="sm"><Link to="/organizations">Organizations</Link></Button>{isStaff && <Button asChild variant="ghost" size="sm"><Link to="/organizations/analytics"><UserRoundCheck className="h-4 w-4 mr-1" />Institution analytics</Link></Button>}</div></div>
    </main><Footer /></>
  );
}
