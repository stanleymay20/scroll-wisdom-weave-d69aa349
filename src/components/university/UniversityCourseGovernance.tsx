import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ArrowLeft, BookOpenCheck, Link2, RefreshCcw, ShieldCheck } from 'lucide-react';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useUniversity } from '@/hooks/useUniversity';
import { supabase } from '@/integrations/supabase/client';

const db = supabase as unknown as SupabaseClient;

type ReadinessStatus = 'shell' | 'in_development' | 'teaching_ready' | 'scheduled' | 'enrollable';

type CourseReadiness = {
  organization_id: string;
  course_id: string;
  code: string;
  title: string;
  credits: number;
  course_status: string;
  active_modules: number;
  active_lessons: number;
  substantive_lessons: number;
  active_course_outcomes: number;
  scheduled_offerings: number;
  enrollable_offerings: number;
  linked_catalog_records: number;
  source_systems: string[];
  readiness_status: ReadinessStatus;
};

type OfferingReadiness = {
  organization_id: string;
  offering_id: string;
  course_id: string;
  course_code: string;
  course_title: string;
  section_code: string;
  enrolment_status: string;
  is_enrollable: boolean;
  blockers: string[];
};

const readinessLabel: Record<ReadinessStatus, string> = {
  shell: 'Shell',
  in_development: 'In development',
  teaching_ready: 'Teaching ready',
  scheduled: 'Scheduled — blocked',
  enrollable: 'Enrollable',
};

function Metric({ label, value, note }: { label: string; value: number; note?: string }) {
  return <Card><CardContent className="pt-5"><p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 text-3xl font-bold">{value}</p>{note && <p className="mt-1 text-xs text-muted-foreground">{note}</p>}</CardContent></Card>;
}

function humanizeBlocker(value: string): string {
  return value.split('_').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

export default function UniversityCourseGovernance() {
  const { toast } = useToast();
  const university = useUniversity();
  const { activeOrg, activeOrgId, isAcademicAdmin, courses } = university;
  const [rows, setRows] = useState<CourseReadiness[]>([]);
  const [offerings, setOfferings] = useState<OfferingReadiness[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkForm, setLinkForm] = useState({
    university_course_id: '',
    source_system: 'public.courses',
    source_record_id: '',
    source_course_code: '',
    source_title: '',
  });

  const refresh = useCallback(async () => {
    if (!activeOrgId) {
      setRows([]);
      setOfferings([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const [courseRes, offeringRes] = await Promise.all([
        db.from('university_course_readiness_v')
          .select('*')
          .eq('organization_id', activeOrgId)
          .order('code'),
        db.from('university_offering_readiness_v')
          .select('organization_id,offering_id,course_id,course_code,course_title,section_code,enrolment_status,is_enrollable,blockers')
          .eq('organization_id', activeOrgId)
          .order('course_code'),
      ]);
      if (courseRes.error) throw courseRes.error;
      if (offeringRes.error) throw offeringRes.error;
      setRows((courseRes.data || []) as CourseReadiness[]);
      setOfferings((offeringRes.data || []) as OfferingReadiness[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load course readiness evidence.');
    } finally {
      setLoading(false);
    }
  }, [activeOrgId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const counts = useMemo(() => rows.reduce<Record<ReadinessStatus, number>>((acc, row) => {
    acc[row.readiness_status] += 1;
    return acc;
  }, { shell: 0, in_development: 0, teaching_ready: 0, scheduled: 0, enrollable: 0 }), [rows]);

  const blockedOfferings = useMemo(() => offerings.filter((row) => !row.is_enrollable), [offerings]);

  const createLink = async () => {
    if (!activeOrgId || !linkForm.university_course_id || !linkForm.source_record_id.trim()) return;
    setBusy(true);
    try {
      const { error: insertError } = await db.from('university_course_catalog_links').insert({
        organization_id: activeOrgId,
        university_course_id: linkForm.university_course_id,
        source_system: linkForm.source_system.trim(),
        source_record_id: linkForm.source_record_id.trim(),
        source_course_code: linkForm.source_course_code.trim() || null,
        source_title: linkForm.source_title.trim() || null,
      });
      if (insertError) throw insertError;
      setLinkForm({ university_course_id: '', source_system: 'public.courses', source_record_id: '', source_course_code: '', source_title: '' });
      await refresh();
      toast({ title: 'Catalogue record linked to canonical university course' });
    } catch (err) {
      toast({ title: 'Catalogue link failed', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  if (!activeOrgId || !activeOrg) {
    return <><Navbar /><main className="container mx-auto max-w-3xl px-4 pt-24 pb-16"><Alert><AlertTitle>Select an institution</AlertTitle><AlertDescription>Course governance is institution-scoped.</AlertDescription></Alert><Button asChild variant="outline" className="mt-4"><Link to="/organizations">Choose organization</Link></Button></main><Footer /></>;
  }

  if (!isAcademicAdmin) {
    return <><Navbar /><main className="container mx-auto max-w-3xl px-4 pt-24 pb-16"><Alert variant="destructive"><AlertTitle>Academic administrator access required</AlertTitle><AlertDescription>Course readiness and legacy-catalogue reconciliation are restricted to academic administrators.</AlertDescription></Alert><Button asChild variant="outline" className="mt-4"><Link to="/university"><ArrowLeft className="mr-1 h-4 w-4"/>University hub</Link></Button></main><Footer /></>;
  }

  return <><Navbar /><main className="container mx-auto max-w-7xl px-4 pt-24 pb-16">
    <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
      <div><div className="flex items-center gap-2"><BookOpenCheck className="h-8 w-8 text-primary"/><h1 className="text-3xl font-bold">Course governance</h1></div><p className="mt-1 text-muted-foreground">{activeOrg.name} · evidence-based catalogue readiness and canonical course identity.</p></div>
      <div className="flex gap-2"><Button asChild variant="outline"><Link to="/university"><ArrowLeft className="mr-1 h-4 w-4"/>University hub</Link></Button><Button variant="outline" onClick={() => void refresh()}><RefreshCcw className="mr-1 h-4 w-4"/>Refresh</Button></div>
    </div>

    <Alert className="mb-6"><ShieldCheck className="h-4 w-4"/><AlertTitle>Readiness is evidence, not a marketing label</AlertTitle><AlertDescription>A course becomes enrollable only when the database can prove substantive teaching content, learning outcomes, assigned teaching staff, published assessment, a complete grade plan, an open enrolment window and available capacity. Legacy catalogue records should be linked to one canonical university course instead of copied into a second catalogue.</AlertDescription></Alert>

    {error && <Alert variant="destructive" className="mb-6"><AlertTitle>Readiness evidence unavailable</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}

    <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-5">
      <Metric label="Shells" value={counts.shell} note="No active modules" />
      <Metric label="Developing" value={counts.in_development} note="Content/outcomes incomplete" />
      <Metric label="Teaching ready" value={counts.teaching_ready} note="Content ready; not scheduled" />
      <Metric label="Scheduled blocked" value={counts.scheduled} note="Offering has blockers" />
      <Metric label="Enrollable" value={counts.enrollable} note="All operational gates pass" />
    </div>

    <Card className="mb-8"><CardHeader><CardTitle>Canonical catalogue bridge</CardTitle><CardDescription>Link a historical or external catalogue record to the institution-owned course that now represents it. Multiple historical duplicates may point to the same canonical course.</CardDescription></CardHeader><CardContent className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
      <div><Label>Canonical course</Label><select className="mt-1 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={linkForm.university_course_id} onChange={(e) => setLinkForm({ ...linkForm, university_course_id: e.target.value })}><option value="">Select…</option>{courses.map((course) => <option key={course.id} value={course.id}>{course.code} — {course.title}</option>)}</select></div>
      <div><Label>Source system</Label><Input className="mt-1" value={linkForm.source_system} onChange={(e) => setLinkForm({ ...linkForm, source_system: e.target.value })}/></div>
      <div><Label>Source record ID</Label><Input className="mt-1" value={linkForm.source_record_id} onChange={(e) => setLinkForm({ ...linkForm, source_record_id: e.target.value })}/></div>
      <div><Label>Source code</Label><Input className="mt-1" value={linkForm.source_course_code} onChange={(e) => setLinkForm({ ...linkForm, source_course_code: e.target.value })}/></div>
      <div><Label>Source title</Label><Input className="mt-1" value={linkForm.source_title} onChange={(e) => setLinkForm({ ...linkForm, source_title: e.target.value })}/><Button className="mt-3 w-full" disabled={busy || !linkForm.university_course_id || !linkForm.source_record_id.trim()} onClick={() => void createLink()}><Link2 className="mr-1 h-4 w-4"/>Link record</Button></div>
    </CardContent></Card>

    <Card className="mb-8"><CardHeader><CardTitle>Canonical courses</CardTitle><CardDescription>Operational state is calculated from university teaching records. Shells and in-development courses are never equivalent to enrollable courses.</CardDescription></CardHeader><CardContent>{loading ? <p>Loading readiness evidence…</p> : rows.length ? <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="py-2 pr-3">Course</th><th className="pr-3">Readiness</th><th className="pr-3">Modules</th><th className="pr-3">Lessons</th><th className="pr-3">Outcomes</th><th className="pr-3">Offerings</th><th>Legacy links</th></tr></thead><tbody>{rows.map((row) => <tr key={row.course_id} className="border-b align-top"><td className="py-3 pr-3"><p className="font-medium">{row.code} — {row.title}</p><p className="text-xs text-muted-foreground">{row.credits} credits · {row.course_status}</p></td><td className="pr-3"><Badge variant={row.readiness_status === 'enrollable' ? 'default' : 'outline'}>{readinessLabel[row.readiness_status]}</Badge></td><td className="pr-3">{row.active_modules}</td><td className="pr-3">{row.substantive_lessons}/{row.active_lessons}</td><td className="pr-3">{row.active_course_outcomes}</td><td className="pr-3">{row.enrollable_offerings}/{row.scheduled_offerings}</td><td>{row.linked_catalog_records}</td></tr>)}</tbody></table></div> : <p className="py-6 text-center text-sm text-muted-foreground">No institution-owned courses yet.</p>}</CardContent></Card>

    <Card><CardHeader><CardTitle>Offering blockers</CardTitle><CardDescription>Scheduled offerings remain non-enrollable until every academic and operational gate is satisfied.</CardDescription></CardHeader><CardContent>{loading ? <p>Loading offering evidence…</p> : blockedOfferings.length ? <div className="space-y-3">{blockedOfferings.map((row) => <div key={row.offering_id} className="rounded-lg border p-3"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-medium">{row.course_code} — {row.course_title} · {row.section_code}</p><Badge variant="outline">{row.enrolment_status}</Badge></div><div className="mt-2 flex flex-wrap gap-2">{row.blockers.map((blocker) => <Badge key={blocker} variant="secondary">{humanizeBlocker(blocker)}</Badge>)}</div></div>)}</div> : <p className="py-6 text-center text-sm text-muted-foreground">No blocked offerings.</p>}</CardContent></Card>
  </main><Footer /></>;
}
