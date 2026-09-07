import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ArrowLeft, BookOpen, Building2, GraduationCap, Megaphone, Palette, RefreshCcw, Target } from 'lucide-react';
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
import { useUniversityOperations } from '@/hooks/useUniversityOperations';
import { supabase } from '@/integrations/supabase/client';

const db = supabase as unknown as SupabaseClient;
const fieldClass = 'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

type SchoolType = 'faculty' | 'school' | 'department' | 'institute' | 'centre';
type LessonType = 'reading' | 'video' | 'audio' | 'live_session' | 'lab' | 'tutorial' | 'discussion' | 'quiz' | 'project' | 'external';

type UniversitySchool = {
  id: string;
  organization_id: string;
  parent_school_id: string | null;
  code: string;
  name: string;
  school_type: SchoolType;
  description: string | null;
  active: boolean;
};

type UniversityLesson = {
  id: string;
  organization_id: string;
  module_id: string;
  title: string;
  sequence: number;
  lesson_type: LessonType;
  source_book_id: string | null;
  source_chapter_id: string | null;
  external_url: string | null;
  required: boolean;
  estimated_minutes: number;
};

type OutcomeMapping = {
  id: string;
  programme_outcome_id: string;
  course_outcome_id: string;
  contribution_weight: number;
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><Label>{label}</Label>{children}</div>;
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return <Card><CardHeader><CardTitle>{title}</CardTitle>{description && <CardDescription>{description}</CardDescription>}</CardHeader><CardContent>{children}</CardContent></Card>;
}

export default function UniversityAcademicAdministration() {
  const { toast } = useToast();
  const university = useUniversity();
  const ops = useUniversityOperations(university.activeOrgId, university.refresh);
  const { activeOrg, activeOrgId, isAcademicAdmin, programmes, courses, offerings, modules, outcomes, announcements, insert, update } = university;
  const [schools, setSchools] = useState<UniversitySchool[]>([]);
  const [lessons, setLessons] = useState<UniversityLesson[]>([]);
  const [mappings, setMappings] = useState<OutcomeMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [school, setSchool] = useState({ code: '', name: '', school_type: 'faculty' as SchoolType, parent_school_id: '', description: '' });
  const [programmeSchool, setProgrammeSchool] = useState({ programme_id: '', school_id: '' });
  const [courseSchool, setCourseSchool] = useState({ course_id: '', school_id: '' });
  const [lesson, setLesson] = useState({ module_id: '', title: '', sequence: '1', lesson_type: 'reading' as LessonType, external_url: '', source_book_id: '', source_chapter_id: '', estimated_minutes: '30', required: true });
  const [mapping, setMapping] = useState({ programme_outcome_id: '', course_outcome_id: '', contribution_weight: '1' });
  const [announcement, setAnnouncement] = useState({ offering_id: '', title: '', body: '', audience: 'all', expires_at: '' });
  const [branding, setBranding] = useState({ display_name: '', short_name: '', logo_url: '', seal_url: '', primary_color: '', secondary_color: '', footer_text: '' });
  const [grading, setGrading] = useState({ pass_mark: '50', a_min: '70', b_min: '60', c_min: '50' });

  const refreshLocal = useCallback(async () => {
    if (!activeOrgId) {
      setSchools([]); setLessons([]); setMappings([]); setLoading(false); return;
    }
    setLoading(true); setError(null);
    try {
      const [schoolRes, lessonRes, mappingRes] = await Promise.all([
        db.from('university_schools').select('*').eq('organization_id', activeOrgId).order('code'),
        db.from('university_lessons').select('*').eq('organization_id', activeOrgId).order('module_id').order('sequence'),
        db.from('university_outcome_mappings').select('*').eq('organization_id', activeOrgId),
      ]);
      const firstError = [schoolRes, lessonRes, mappingRes].find((result) => result.error)?.error;
      if (firstError) throw firstError;
      setSchools((schoolRes.data || []) as UniversitySchool[]);
      setLessons((lessonRes.data || []) as UniversityLesson[]);
      setMappings((mappingRes.data || []) as OutcomeMapping[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load academic administration.');
    } finally {
      setLoading(false);
    }
  }, [activeOrgId]);

  useEffect(() => { void refreshLocal(); }, [refreshLocal]);

  useEffect(() => {
    const current = ops.settings?.branding || {};
    setBranding({
      display_name: typeof current.display_name === 'string' ? current.display_name : '',
      short_name: typeof current.short_name === 'string' ? current.short_name : '',
      logo_url: typeof current.logo_url === 'string' ? current.logo_url : '',
      seal_url: typeof current.seal_url === 'string' ? current.seal_url : '',
      primary_color: typeof current.primary_color === 'string' ? current.primary_color : '',
      secondary_color: typeof current.secondary_color === 'string' ? current.secondary_color : '',
      footer_text: typeof current.footer_text === 'string' ? current.footer_text : '',
    });
    const scheme = ops.settings?.grading_scheme || {};
    const pass = typeof scheme.pass_mark === 'number' ? scheme.pass_mark : 50;
    const bands = Array.isArray(scheme.bands) ? scheme.bands as Array<Record<string, unknown>> : [];
    const bandMin = (label: string, fallback: number) => {
      const band = bands.find((entry) => entry.label === label);
      return typeof band?.min === 'number' ? band.min : fallback;
    };
    setGrading({ pass_mark: String(pass), a_min: String(bandMin('A', 70)), b_min: String(bandMin('B', 60)), c_min: String(bandMin('C', 50)) });
  }, [ops.settings]);

  const run = async (work: () => Promise<unknown>, success: string) => {
    setBusy(true);
    try {
      await work();
      await Promise.all([refreshLocal(), university.refresh(), ops.refresh()]);
      toast({ title: success });
    } catch (err) {
      toast({ title: 'University administration failed', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const programmeOutcomes = useMemo(() => outcomes.filter((item) => item.programme_id), [outcomes]);
  const courseOutcomes = useMemo(() => outcomes.filter((item) => item.course_id), [outcomes]);
  const moduleById = useMemo(() => new Map(modules.map((item) => [item.id, item])), [modules]);
  const outcomeById = useMemo(() => new Map(outcomes.map((item) => [item.id, item])), [outcomes]);

  if (!activeOrgId || !activeOrg) {
    return <><Navbar /><main className="container mx-auto max-w-3xl px-4 pt-24 pb-16"><Section title="Select an institution"><Button asChild><Link to="/organizations">Choose organization</Link></Button></Section></main><Footer /></>;
  }

  if (!isAcademicAdmin) {
    return <><Navbar /><main className="container mx-auto max-w-3xl px-4 pt-24 pb-16"><Alert variant="destructive"><AlertTitle>Academic administrator access required</AlertTitle><AlertDescription>This workspace is restricted to chancellors, registrars, deans, programme leads and organization administrators.</AlertDescription></Alert><Button asChild variant="outline" className="mt-4"><Link to="/university"><ArrowLeft className="h-4 w-4 mr-1" />Back to ScrollUniversity</Link></Button></main><Footer /></>;
  }

  return <><Navbar /><main className="container mx-auto max-w-7xl px-4 pt-24 pb-16">
    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between mb-6">
      <div><div className="flex items-center gap-2"><GraduationCap className="h-8 w-8 text-primary"/><h1 className="text-3xl font-bold">Academic administration</h1></div><p className="text-muted-foreground">{activeOrg.name} · structure, curriculum delivery, academic policy and communications.</p></div>
      <div className="flex gap-2"><Button asChild variant="outline"><Link to="/university"><ArrowLeft className="h-4 w-4 mr-1"/>University hub</Link></Button><Button variant="outline" onClick={() => void refreshLocal()}><RefreshCcw className="h-4 w-4 mr-1"/>Refresh</Button></div>
    </div>
    {error && <Alert variant="destructive" className="mb-6"><AlertTitle>Administration data unavailable</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
    {loading ? <p>Loading academic administration…</p> : <Tabs defaultValue="structure" className="space-y-6">
      <TabsList className="flex flex-wrap h-auto"><TabsTrigger value="structure">Structure</TabsTrigger><TabsTrigger value="lessons">Lessons</TabsTrigger><TabsTrigger value="outcomes">Outcome alignment</TabsTrigger><TabsTrigger value="communications">Communications</TabsTrigger><TabsTrigger value="policy">Policy & brand</TabsTrigger></TabsList>

      <TabsContent value="structure" className="space-y-6">
        <div className="grid lg:grid-cols-2 gap-4">
          <Section title="Create faculty / school / department" description="Build the institution hierarchy used by programmes and courses."><div className="space-y-3">
            <div className="grid grid-cols-2 gap-3"><Field label="Code"><Input value={school.code} onChange={(e) => setSchool({ ...school, code: e.target.value })}/></Field><Field label="Type"><select className={fieldClass} value={school.school_type} onChange={(e) => setSchool({ ...school, school_type: e.target.value as SchoolType })}><option value="faculty">Faculty</option><option value="school">School</option><option value="department">Department</option><option value="institute">Institute</option><option value="centre">Centre</option></select></Field></div>
            <Field label="Name"><Input value={school.name} onChange={(e) => setSchool({ ...school, name: e.target.value })}/></Field>
            <Field label="Parent unit"><select className={fieldClass} value={school.parent_school_id} onChange={(e) => setSchool({ ...school, parent_school_id: e.target.value })}><option value="">Top level</option>{schools.map((item) => <option key={item.id} value={item.id}>{item.code} — {item.name}</option>)}</select></Field>
            <Field label="Description"><Textarea value={school.description} onChange={(e) => setSchool({ ...school, description: e.target.value })}/></Field>
            <Button disabled={busy || !school.code || !school.name} onClick={() => void run(() => insert('university_schools', { ...school, parent_school_id: school.parent_school_id || null, active: true }), 'Academic unit created')}><Building2 className="h-4 w-4 mr-1"/>Create unit</Button>
          </div></Section>
          <Section title="Academic hierarchy"><div className="space-y-2">{schools.length ? schools.map((item) => <div key={item.id} className="border rounded-lg p-3"><div className="flex items-center justify-between"><div><p className="font-medium">{item.code} — {item.name}</p><p className="text-xs text-muted-foreground">{item.school_type}{item.parent_school_id ? ` · parent ${schools.find((parent) => parent.id === item.parent_school_id)?.code || 'unit'}` : ''}</p></div><Badge variant="outline">{item.active ? 'active' : 'inactive'}</Badge></div></div>) : <p className="text-sm text-muted-foreground">No faculties or departments yet.</p>}</div></Section>
        </div>
        <div className="grid lg:grid-cols-2 gap-4">
          <Section title="Assign programme to academic unit"><div className="space-y-3"><Field label="Programme"><select className={fieldClass} value={programmeSchool.programme_id} onChange={(e) => setProgrammeSchool({ ...programmeSchool, programme_id: e.target.value })}><option value="">Select…</option>{programmes.map((item) => <option key={item.id} value={item.id}>{item.code} — {item.name}</option>)}</select></Field><Field label="Unit"><select className={fieldClass} value={programmeSchool.school_id} onChange={(e) => setProgrammeSchool({ ...programmeSchool, school_id: e.target.value })}><option value="">Select…</option>{schools.map((item) => <option key={item.id} value={item.id}>{item.code} — {item.name}</option>)}</select></Field><Button disabled={busy || !programmeSchool.programme_id || !programmeSchool.school_id} onClick={() => void run(() => update('university_programmes', programmeSchool.programme_id, { school_id: programmeSchool.school_id }), 'Programme assigned')}>Assign programme</Button></div></Section>
          <Section title="Assign course to academic unit"><div className="space-y-3"><Field label="Course"><select className={fieldClass} value={courseSchool.course_id} onChange={(e) => setCourseSchool({ ...courseSchool, course_id: e.target.value })}><option value="">Select…</option>{courses.map((item) => <option key={item.id} value={item.id}>{item.code} — {item.title}</option>)}</select></Field><Field label="Unit"><select className={fieldClass} value={courseSchool.school_id} onChange={(e) => setCourseSchool({ ...courseSchool, school_id: e.target.value })}><option value="">Select…</option>{schools.map((item) => <option key={item.id} value={item.id}>{item.code} — {item.name}</option>)}</select></Field><Button disabled={busy || !courseSchool.course_id || !courseSchool.school_id} onClick={() => void run(() => update('university_courses', courseSchool.course_id, { school_id: courseSchool.school_id }), 'Course assigned')}>Assign course</Button></div></Section>
        </div>
      </TabsContent>

      <TabsContent value="lessons" className="space-y-6">
        <Section title="Create lesson" description="Build taught learning activities inside the course-module structure and optionally link ScrollLibrary books/chapters."><div className="grid md:grid-cols-2 gap-3">
          <Field label="Module"><select className={fieldClass} value={lesson.module_id} onChange={(e) => setLesson({ ...lesson, module_id: e.target.value })}><option value="">Select…</option>{modules.map((item) => <option key={item.id} value={item.id}>{item.code || `M${item.sequence}`} — {item.title}</option>)}</select></Field>
          <Field label="Lesson type"><select className={fieldClass} value={lesson.lesson_type} onChange={(e) => setLesson({ ...lesson, lesson_type: e.target.value as LessonType })}>{['reading','video','audio','live_session','lab','tutorial','discussion','quiz','project','external'].map((type) => <option key={type} value={type}>{type.replace('_', ' ')}</option>)}</select></Field>
          <Field label="Title"><Input value={lesson.title} onChange={(e) => setLesson({ ...lesson, title: e.target.value })}/></Field>
          <Field label="Sequence"><Input type="number" min="1" value={lesson.sequence} onChange={(e) => setLesson({ ...lesson, sequence: e.target.value })}/></Field>
          <Field label="External URL"><Input value={lesson.external_url} onChange={(e) => setLesson({ ...lesson, external_url: e.target.value })} placeholder="Optional https://…"/></Field>
          <Field label="Estimated minutes"><Input type="number" min="0" value={lesson.estimated_minutes} onChange={(e) => setLesson({ ...lesson, estimated_minutes: e.target.value })}/></Field>
          <Field label="ScrollLibrary book ID"><Input value={lesson.source_book_id} onChange={(e) => setLesson({ ...lesson, source_book_id: e.target.value })} placeholder="Optional UUID"/></Field>
          <Field label="ScrollLibrary chapter ID"><Input value={lesson.source_chapter_id} onChange={(e) => setLesson({ ...lesson, source_chapter_id: e.target.value })} placeholder="Optional UUID"/></Field>
        </div><label className="flex items-center gap-2 text-sm mt-3"><input type="checkbox" checked={lesson.required} onChange={(e) => setLesson({ ...lesson, required: e.target.checked })}/> Required lesson</label><Button className="mt-3" disabled={busy || !lesson.module_id || !lesson.title} onClick={() => void run(() => insert('university_lessons', { ...lesson, sequence: Number(lesson.sequence), estimated_minutes: Number(lesson.estimated_minutes), external_url: lesson.external_url || null, source_book_id: lesson.source_book_id || null, source_chapter_id: lesson.source_chapter_id || null, content: {} }), 'Lesson created')}><BookOpen className="h-4 w-4 mr-1"/>Create lesson</Button></Section>
        <Section title="Lesson plan">{lessons.length ? <div className="space-y-2">{lessons.map((item) => <div key={item.id} className="border rounded-lg p-3 flex items-start justify-between gap-3"><div><p className="font-medium">{item.sequence}. {item.title}</p><p className="text-xs text-muted-foreground">{moduleById.get(item.module_id)?.title || 'Module'} · {item.lesson_type.replace('_', ' ')} · {item.estimated_minutes} min</p></div><Badge variant="outline">{item.required ? 'required' : 'optional'}</Badge></div>)}</div> : <p className="text-sm text-muted-foreground">No lessons yet.</p>}</Section>
      </TabsContent>

      <TabsContent value="outcomes" className="space-y-6">
        <Section title="Programme → course outcome alignment" description="Map institutional/programme learning outcomes to the course-level outcomes that deliver them."><div className="grid md:grid-cols-3 gap-3"><Field label="Programme outcome"><select className={fieldClass} value={mapping.programme_outcome_id} onChange={(e) => setMapping({ ...mapping, programme_outcome_id: e.target.value })}><option value="">Select…</option>{programmeOutcomes.map((item) => <option key={item.id} value={item.id}>{item.code} — {item.description}</option>)}</select></Field><Field label="Course outcome"><select className={fieldClass} value={mapping.course_outcome_id} onChange={(e) => setMapping({ ...mapping, course_outcome_id: e.target.value })}><option value="">Select…</option>{courseOutcomes.map((item) => <option key={item.id} value={item.id}>{item.code} — {item.description}</option>)}</select></Field><Field label="Contribution weight"><Input type="number" min="0.001" step="0.1" value={mapping.contribution_weight} onChange={(e) => setMapping({ ...mapping, contribution_weight: e.target.value })}/></Field></div><Button className="mt-3" disabled={busy || !mapping.programme_outcome_id || !mapping.course_outcome_id} onClick={() => void run(() => insert('university_outcome_mappings', { programme_outcome_id: mapping.programme_outcome_id, course_outcome_id: mapping.course_outcome_id, contribution_weight: Number(mapping.contribution_weight) }), 'Outcome mapping created')}><Target className="h-4 w-4 mr-1"/>Map outcomes</Button></Section>
        <Section title="Existing outcome mappings">{mappings.length ? <div className="space-y-2">{mappings.map((item) => <div key={item.id} className="border rounded-lg p-3"><p className="font-medium">{outcomeById.get(item.programme_outcome_id)?.code || 'Programme outcome'} → {outcomeById.get(item.course_outcome_id)?.code || 'Course outcome'}</p><p className="text-xs text-muted-foreground">Contribution weight {item.contribution_weight}</p></div>)}</div> : <p className="text-sm text-muted-foreground">No outcome mappings yet.</p>}</Section>
      </TabsContent>

      <TabsContent value="communications" className="space-y-6">
        <Section title="Publish announcement"><div className="space-y-3"><Field label="Title"><Input value={announcement.title} onChange={(e) => setAnnouncement({ ...announcement, title: e.target.value })}/></Field><Field label="Message"><Textarea className="min-h-32" value={announcement.body} onChange={(e) => setAnnouncement({ ...announcement, body: e.target.value })}/></Field><div className="grid md:grid-cols-3 gap-3"><Field label="Audience"><select className={fieldClass} value={announcement.audience} onChange={(e) => setAnnouncement({ ...announcement, audience: e.target.value })}><option value="all">Everyone</option><option value="students">Students</option><option value="staff">Staff</option><option value="course">Course</option></select></Field><Field label="Course offering"><select className={fieldClass} value={announcement.offering_id} onChange={(e) => setAnnouncement({ ...announcement, offering_id: e.target.value })}><option value="">Institution-wide</option>{offerings.map((item) => <option key={item.id} value={item.id}>{courses.find((course) => course.id === item.course_id)?.code || 'Course'} · {item.section_code}</option>)}</select></Field><Field label="Expires"><Input type="datetime-local" value={announcement.expires_at} onChange={(e) => setAnnouncement({ ...announcement, expires_at: e.target.value })}/></Field></div><Button disabled={busy || !announcement.title || !announcement.body} onClick={() => void run(() => insert('university_announcements', { offering_id: announcement.offering_id || null, title: announcement.title, body: announcement.body, audience: announcement.audience, published_at: new Date().toISOString(), expires_at: announcement.expires_at ? new Date(announcement.expires_at).toISOString() : null, created_by: university.person?.user_id }), 'Announcement published')}><Megaphone className="h-4 w-4 mr-1"/>Publish</Button></div></Section>
        <Section title="Published communications">{announcements.length ? <div className="space-y-2">{announcements.map((item) => <div key={item.id} className="border rounded-lg p-3"><div className="flex justify-between gap-3"><p className="font-medium">{item.title}</p><Badge variant="outline">{item.audience}</Badge></div><p className="text-sm whitespace-pre-wrap mt-2">{item.body}</p></div>)}</div> : <p className="text-sm text-muted-foreground">No announcements.</p>}</Section>
      </TabsContent>

      <TabsContent value="policy" className="space-y-6">
        <div className="grid lg:grid-cols-2 gap-4">
          <Section title="Grading policy" description="The pass mark and grade bands are enforced during course-result finalisation."><div className="grid grid-cols-2 gap-3"><Field label="Pass mark %"><Input type="number" min="0" max="100" value={grading.pass_mark} onChange={(e) => setGrading({ ...grading, pass_mark: e.target.value })}/></Field><Field label="A minimum"><Input type="number" min="0" max="100" value={grading.a_min} onChange={(e) => setGrading({ ...grading, a_min: e.target.value })}/></Field><Field label="B minimum"><Input type="number" min="0" max="100" value={grading.b_min} onChange={(e) => setGrading({ ...grading, b_min: e.target.value })}/></Field><Field label="C minimum"><Input type="number" min="0" max="100" value={grading.c_min} onChange={(e) => setGrading({ ...grading, c_min: e.target.value })}/></Field></div><Button className="mt-3" disabled={busy} onClick={() => void run(() => ops.saveSettings({ grading_scheme: { pass_mark: Number(grading.pass_mark), bands: [{ label: 'A', min: Number(grading.a_min) }, { label: 'B', min: Number(grading.b_min) }, { label: 'C', min: Number(grading.c_min) }, { label: 'F', min: 0 }] } }), 'Grading policy saved')}>Save grading policy</Button></Section>
          <Section title="Institution brand" description="Brand data is institution-scoped and can be used across student records and future institution templates."><div className="space-y-3"><div className="grid grid-cols-2 gap-3"><Field label="Display name"><Input value={branding.display_name} onChange={(e) => setBranding({ ...branding, display_name: e.target.value })}/></Field><Field label="Short name"><Input value={branding.short_name} onChange={(e) => setBranding({ ...branding, short_name: e.target.value })}/></Field></div><Field label="Logo URL"><Input value={branding.logo_url} onChange={(e) => setBranding({ ...branding, logo_url: e.target.value })}/></Field><Field label="Seal / crest URL"><Input value={branding.seal_url} onChange={(e) => setBranding({ ...branding, seal_url: e.target.value })}/></Field><div className="grid grid-cols-2 gap-3"><Field label="Primary colour"><Input value={branding.primary_color} onChange={(e) => setBranding({ ...branding, primary_color: e.target.value })} placeholder="#000000"/></Field><Field label="Secondary colour"><Input value={branding.secondary_color} onChange={(e) => setBranding({ ...branding, secondary_color: e.target.value })} placeholder="#ffffff"/></Field></div><Field label="Footer text"><Textarea value={branding.footer_text} onChange={(e) => setBranding({ ...branding, footer_text: e.target.value })}/></Field><Button disabled={busy} onClick={() => void run(() => ops.saveSettings({ branding }), 'Institution brand saved')}><Palette className="h-4 w-4 mr-1"/>Save brand</Button></div></Section>
        </div>
      </TabsContent>
    </Tabs>}
  </main><Footer /></>;
}
