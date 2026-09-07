import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BookOpen, CheckCircle2, ExternalLink, FileCheck2, RefreshCcw } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useUniversity } from '@/hooks/useUniversity';
import { useUniversityCourseContent } from '@/hooks/useUniversityCourseContent';

const selectClass = 'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

function safeExternalUrl(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function selfChecks(value: unknown): Array<{ q: string; a: string }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const row = item as Record<string, unknown>;
    return typeof row.q === 'string' && typeof row.a === 'string' ? [{ q: row.q, a: row.a }] : [];
  });
}

export default function UniversityCourseMaterials() {
  const university = useUniversity();
  const content = useUniversityCourseContent(university.activeOrgId);
  const [selectedCourseId, setSelectedCourseId] = useState('');

  const studentCourseIds = useMemo(() => {
    const ids = new Set<string>();
    if (!university.isStudent) return ids;
    for (const enrolment of university.enrolments) {
      if (!['enrolled', 'completed'].includes(enrolment.status)) continue;
      const offering = university.offeringById.get(enrolment.offering_id);
      if (offering) ids.add(offering.course_id);
    }
    return ids;
  }, [university.isStudent, university.enrolments, university.offeringById]);

  const accessibleCourses = useMemo(() => {
    if (!university.isStudent) return university.courses;
    return university.courses.filter((course) => studentCourseIds.has(course.id));
  }, [university.isStudent, university.courses, studentCourseIds]);

  useEffect(() => {
    if (!selectedCourseId || !accessibleCourses.some((course) => course.id === selectedCourseId)) {
      setSelectedCourseId(accessibleCourses[0]?.id || '');
    }
  }, [accessibleCourses, selectedCourseId]);

  const selectedCourse = university.courseById.get(selectedCourseId) || null;
  const modules = useMemo(
    () => university.modules.filter((module) => module.course_id === selectedCourseId).sort((a, b) => a.sequence - b.sequence),
    [university.modules, selectedCourseId],
  );
  const resources = content.resourcesByCourse.get(selectedCourseId) || [];
  const assessments = content.assessmentsByCourse.get(selectedCourseId) || [];
  const courseOutcomes = university.outcomes.filter((outcome) => outcome.course_id === selectedCourseId);
  const outcomeById = useMemo(() => new Map(university.outcomes.map((outcome) => [outcome.id, outcome])), [university.outcomes]);

  if (!university.activeOrgId || !university.activeOrg) {
    return <><Navbar /><main className="container mx-auto max-w-3xl px-4 pt-24 pb-16"><Card><CardHeader><CardTitle>Select an institution</CardTitle><CardDescription>Course materials are scoped to your active ScrollUniversity institution.</CardDescription></CardHeader><CardContent><Button asChild><Link to="/organizations">Choose organization</Link></Button></CardContent></Card></main><Footer /></>;
  }

  return <><Navbar /><main className="container mx-auto max-w-6xl px-4 pt-24 pb-16 space-y-6">
    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
      <div><div className="flex items-center gap-2"><BookOpen className="h-8 w-8 text-primary"/><h1 className="text-3xl font-bold">Course materials</h1></div><p className="text-muted-foreground">{university.activeOrg.name} · reviewed lessons, readings, activities and assessment expectations.</p></div>
      <div className="flex gap-2"><Button asChild variant="outline"><Link to="/university"><ArrowLeft className="h-4 w-4 mr-1"/>University hub</Link></Button><Button variant="outline" onClick={() => void Promise.all([university.refresh(), content.refresh()])}><RefreshCcw className="h-4 w-4 mr-1"/>Refresh</Button></div>
    </div>

    {(university.error || content.error) && <Alert variant="destructive"><AlertTitle>Course content unavailable</AlertTitle><AlertDescription>{university.error || content.error}</AlertDescription></Alert>}

    <Card><CardHeader><CardTitle>Choose course</CardTitle><CardDescription>{university.isStudent ? 'Only your enrolled or completed courses are listed.' : 'Academic staff can inspect course packs available to their institution.'}</CardDescription></CardHeader><CardContent>
      {accessibleCourses.length ? <select className={selectClass} value={selectedCourseId} onChange={(event) => setSelectedCourseId(event.target.value)}>{accessibleCourses.map((course) => <option key={course.id} value={course.id}>{course.code} — {course.title}</option>)}</select> : <p className="text-sm text-muted-foreground">No accessible courses are available yet.</p>}
    </CardContent></Card>

    {selectedCourse && <>
      <Card><CardHeader><div className="flex flex-wrap items-center gap-2"><CardTitle>{selectedCourse.code} — {selectedCourse.title}</CardTitle><Badge variant="outline">{selectedCourse.credits} credits</Badge><Badge variant="outline">Level {selectedCourse.level ?? '—'}</Badge></div><CardDescription>{selectedCourse.description || 'No course description has been published.'}</CardDescription></CardHeader><CardContent>
        <h3 className="font-semibold mb-2">Learning outcomes</h3><div className="grid md:grid-cols-2 gap-2">{courseOutcomes.map((outcome) => <div key={outcome.id} className="rounded-lg border p-3"><p className="font-medium text-sm">{outcome.code}</p><p className="text-sm text-muted-foreground">{outcome.description}</p></div>)}</div>
      </CardContent></Card>

      <div className="space-y-4">
        {modules.map((module) => <Card key={module.id}><CardHeader><div className="flex items-center justify-between gap-3"><div><CardTitle className="text-xl">{module.code || `Module ${module.sequence}`} — {module.title}</CardTitle><CardDescription>{Number(module.estimated_learning_hours || 0)} planned learning hours</CardDescription></div><Badge>{content.lessonsByModule.get(module.id)?.length || 0} lessons</Badge></div></CardHeader><CardContent className="space-y-4">
          {(content.lessonsByModule.get(module.id) || []).map((lesson) => {
            const body = lesson.content || {};
            const objectives = stringArray(body.objectives);
            const material = typeof body.teaching_material === 'string' ? body.teaching_material : '';
            const activity = typeof body.activity === 'string' ? body.activity : '';
            const checks = selfChecks(body.self_check);
            return <section key={lesson.id} className="rounded-xl border p-4 space-y-3">
              <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{lesson.sequence}. {lesson.title}</h3>{lesson.required && <Badge variant="secondary">Required</Badge>}<span className="text-xs text-muted-foreground">{lesson.estimated_minutes} min guided lesson</span></div>
              {objectives.length > 0 && <div><p className="text-sm font-medium">Lesson objectives</p><ul className="mt-1 list-disc pl-5 text-sm text-muted-foreground space-y-1">{objectives.map((objective) => <li key={objective}>{objective}</li>)}</ul></div>}
              {material && <div><p className="text-sm font-medium">Core teaching</p><p className="mt-1 text-sm leading-6">{material}</p></div>}
              {activity && <div className="rounded-lg bg-muted/50 p-3"><p className="text-sm font-medium">Learning activity</p><p className="text-sm text-muted-foreground mt-1">{activity}</p></div>}
              {checks.length > 0 && <div><p className="text-sm font-medium">Self-check</p><div className="mt-2 space-y-2">{checks.map((check, index) => <details key={`${lesson.id}-${index}`} className="rounded-lg border p-3"><summary className="cursor-pointer text-sm font-medium">{check.q}</summary><p className="mt-2 text-sm text-muted-foreground">{check.a}</p></details>)}</div></div>}
            </section>;
          })}
        </CardContent></Card>)}
      </div>

      <Card><CardHeader><CardTitle>Required & supplementary resources</CardTitle><CardDescription>External resources retain their own copyright and licence terms; ScrollUniversity stores provenance instead of copying protected material.</CardDescription></CardHeader><CardContent className="space-y-3">
        {resources.length ? resources.map((resource) => { const href = safeExternalUrl(resource.url); return <div key={resource.id} className="rounded-lg border p-3"><div className="flex flex-wrap items-center gap-2"><p className="font-medium">{resource.title}</p>{resource.required && <Badge>Required</Badge>}<Badge variant="outline">{resource.resource_type}</Badge></div>{resource.citation && <p className="text-sm text-muted-foreground mt-1">{resource.citation}</p>}<p className="text-xs text-muted-foreground mt-1">Provenance: {resource.provenance} · Rights: {resource.license_note}</p>{href && <Button asChild size="sm" variant="link" className="px-0 mt-1"><a href={href} target="_blank" rel="noreferrer">Open source <ExternalLink className="h-3 w-3 ml-1"/></a></Button>}</div>; }) : <p className="text-sm text-muted-foreground">No course resources have been installed.</p>}
      </CardContent></Card>

      <Card><CardHeader><CardTitle>Assessment plan</CardTitle><CardDescription>Reusable course assessment templates are instantiated into a specific offering by academic staff.</CardDescription></CardHeader><CardContent className="space-y-3">
        {assessments.length ? assessments.map((assessment) => {
          const mapped = content.assessmentOutcomes.filter((row) => row.assessment_template_id === assessment.id).map((row) => outcomeById.get(row.learning_outcome_id)).filter(Boolean);
          return <div key={assessment.id} className="rounded-lg border p-4 space-y-2"><div className="flex flex-wrap items-center gap-2"><FileCheck2 className="h-4 w-4"/><p className="font-medium">{assessment.code} — {assessment.title}</p><Badge variant="outline">{assessment.weight_percent}%</Badge></div><p className="text-sm">{assessment.instructions}</p><div className="flex flex-wrap gap-1">{mapped.map((outcome) => outcome && <Badge key={outcome.id} variant="secondary"><CheckCircle2 className="h-3 w-3 mr-1"/>{outcome.code}</Badge>)}</div><div className="text-xs text-muted-foreground">Rubric: {Object.entries(assessment.rubric || {}).map(([criterion, weight]) => `${criterion.replaceAll('_', ' ')} ${weight}%`).join(' · ')}</div></div>;
        }) : <p className="text-sm text-muted-foreground">No assessment templates have been installed.</p>}
      </CardContent></Card>
    </>}
  </main><Footer /></>;
}
