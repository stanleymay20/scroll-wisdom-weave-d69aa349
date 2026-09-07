import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  BookOpenCheck,
  Building2,
  CalendarDays,
  GraduationCap,
  LayoutDashboard,
  LibraryBig,
  PlugZap,
  Route,
  Settings2,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
} from 'lucide-react';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useUniversity } from '@/hooks/useUniversity';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { formatUniversityRole } from '@/lib/university';

type WorkspaceLink = {
  title: string;
  description: string;
  href: string;
  icon: typeof LayoutDashboard;
  audience: 'all' | 'student' | 'staff' | 'admin';
};

const workspaceLinks: WorkspaceLink[] = [
  {
    title: 'Academic operations',
    description: 'Teaching, enrolments, assignments, attendance, grading and day-to-day delivery.',
    href: '/university?view=operations',
    icon: LayoutDashboard,
    audience: 'all',
  },
  {
    title: 'Course materials',
    description: 'Lessons, resources, learning activities, assessments and mastery-aligned study material.',
    href: '/university?view=materials',
    icon: BookOpen,
    audience: 'all',
  },
  {
    title: 'Programme progress',
    description: 'Registrations, advising, academic standing, recognized credit and completion readiness.',
    href: '/university?view=lifecycle',
    icon: Route,
    audience: 'all',
  },
  {
    title: 'Course governance',
    description: 'Catalogue quality, course-pack releases, curriculum evidence and controlled content status.',
    href: '/university?view=catalogue',
    icon: BookOpenCheck,
    audience: 'staff',
  },
  {
    title: 'Academic administration',
    description: 'Schools, programmes, terms, curriculum, outcomes, institutional policy and academic settings.',
    href: '/university?view=administration',
    icon: Settings2,
    audience: 'admin',
  },
  {
    title: 'LMS & interoperability',
    description: 'Institution verification, LTI 1.3 registration and controlled external learning integrations.',
    href: '/university?view=interoperability',
    icon: PlugZap,
    audience: 'admin',
  },
];

function Metric({ icon: Icon, label, value, note }: { icon: typeof Users; label: string; value: string | number; note: string }) {
  return (
    <Card className="border-border/60 shadow-sm">
      <CardContent className="flex items-start gap-3 p-5">
        <div className="rounded-xl border bg-muted/50 p-2.5"><Icon className="h-5 w-5 text-primary" /></div>
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
          <p className="mt-1 text-xs text-muted-foreground">{note}</p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function UniversityWorkspaceHome() {
  const university = useUniversity();
  const { user } = useSubscription();
  const {
    activeOrg,
    activeOrgId,
    settingsExists,
    universityRole,
    activeRole,
    isAcademicAdmin,
    isStaff,
    isStudent,
    people,
    programmes,
    courses,
    offerings,
    enrolments,
    assignments,
    announcements,
    loading,
    error,
    initializeUniversity,
  } = university;

  const myEnrolments = useMemo(
    () => enrolments.filter((enrolment) => enrolment.user_id === user?.id && ['enrolled', 'completed'].includes(enrolment.status)),
    [enrolments, user?.id],
  );

  const visibleLinks = useMemo(() => workspaceLinks.filter((item) => {
    if (item.audience === 'all') return true;
    if (item.audience === 'admin') return isAcademicAdmin;
    if (item.audience === 'staff') return isStaff || isAcademicAdmin;
    return isStudent;
  }), [isAcademicAdmin, isStaff, isStudent]);

  const roleLabel = formatUniversityRole(universityRole || activeRole || 'member');
  const activePeople = people.filter((person) => person.status !== 'inactive').length;
  const currentOfferings = offerings.filter((offering) => offering.status !== 'cancelled').length;

  if (!activeOrgId || !activeOrg) {
    return (
      <><Navbar /><main className="min-h-[75vh] bg-muted/20 px-4 pb-20 pt-28">
        <Card className="mx-auto max-w-2xl border-border/60 shadow-sm">
          <CardHeader><CardTitle>Select an institution</CardTitle><CardDescription>ScrollUniversity is organization-scoped so academic identity, access and records stay tenant-isolated.</CardDescription></CardHeader>
          <CardContent><Button asChild><Link to="/organizations"><Building2 className="mr-2 h-4 w-4" />Choose organization</Link></Button></CardContent>
        </Card>
      </main><Footer /></>
    );
  }

  if (loading) {
    return <><Navbar /><main className="min-h-[75vh] bg-muted/20 px-4 pb-20 pt-28"><div className="mx-auto max-w-7xl text-sm text-muted-foreground">Loading ScrollUniversity workspace…</div></main><Footer /></>;
  }

  if (!settingsExists) {
    return (
      <><Navbar /><main className="min-h-[75vh] bg-muted/20 px-4 pb-20 pt-28">
        <Card className="mx-auto max-w-2xl border-border/60 shadow-sm">
          <CardHeader><Badge className="w-fit">Institution setup</Badge><CardTitle className="text-2xl">Enable ScrollUniversity for {activeOrg.name}</CardTitle><CardDescription>This creates the institution layer without changing the organization’s existing library data.</CardDescription></CardHeader>
          <CardContent><Button onClick={() => void initializeUniversity()}><GraduationCap className="mr-2 h-4 w-4" />Enable ScrollUniversity</Button></CardContent>
        </Card>
      </main><Footer /></>
    );
  }

  return (
    <><Navbar />
      <main className="min-h-screen bg-muted/20 pb-20 pt-20">
        <section className="border-b bg-background">
          <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-10 md:flex-row md:items-end md:justify-between">
            <div className="max-w-3xl">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Badge variant="secondary"><ShieldCheck className="mr-1 h-3.5 w-3.5" />{roleLabel}</Badge>
                <Badge variant="outline">{activeOrg.name}</Badge>
              </div>
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-primary/10 p-3"><GraduationCap className="h-8 w-8 text-primary" /></div>
                <div><h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Your university workspace</h1><p className="mt-2 text-base text-muted-foreground">One calm entry point for learning, teaching, curriculum, records and institutional operations.</p></div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline"><Link to="/university?view=about">About ScrollUniversity</Link></Button>
              <Button asChild><Link to="/university?view=operations">Open academic operations<ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
            </div>
          </div>
        </section>

        <div className="mx-auto max-w-7xl space-y-8 px-4 py-8">
          {error && <Alert variant="destructive"><AlertTitle>Some university data could not load</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}

          <section aria-labelledby="university-overview-heading">
            <div className="mb-4 flex items-end justify-between gap-4"><div><p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">Overview</p><h2 id="university-overview-heading" className="mt-1 text-xl font-semibold">Institution at a glance</h2></div></div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Metric icon={Users} label="Academic people" value={activePeople} note="Active university identities" />
              <Metric icon={LibraryBig} label="Courses" value={courses.length} note={`${programmes.length} programmes`} />
              <Metric icon={CalendarDays} label="Offerings" value={currentOfferings} note="Planned or active delivery" />
              <Metric icon={Target} label={isStudent && !isStaff ? 'My courses' : 'Assignments'} value={isStudent && !isStaff ? myEnrolments.length : assignments.length} note={isStudent && !isStaff ? 'Current enrolments' : `${announcements.length} announcements`} />
            </div>
          </section>

          <section aria-labelledby="workspace-heading">
            <div className="mb-4"><p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">Workspace</p><h2 id="workspace-heading" className="mt-1 text-xl font-semibold">Go where the work is</h2><p className="mt-1 text-sm text-muted-foreground">Navigation adapts to your university role instead of exposing every administrative surface to everyone.</p></div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {visibleLinks.map((item) => {
                const Icon = item.icon;
                return (
                  <Link key={item.href} to={item.href} className="group rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
                    <Card className="h-full border-border/60 shadow-sm transition-all group-hover:-translate-y-0.5 group-hover:border-primary/30 group-hover:shadow-md">
                      <CardHeader>
                        <div className="mb-3 flex items-center justify-between"><div className="rounded-xl bg-primary/10 p-2.5"><Icon className="h-5 w-5 text-primary" /></div><ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-foreground" /></div>
                        <CardTitle className="text-lg">{item.title}</CardTitle><CardDescription className="leading-6">{item.description}</CardDescription>
                      </CardHeader>
                    </Card>
                  </Link>
                );
              })}
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <Card className="border-border/60 shadow-sm">
              <CardHeader><div className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" /><CardTitle>Learning architecture</CardTitle></div><CardDescription>ScrollUniversity connects formal course delivery to ScrollLibrary content and ScrollMastery evidence without pretending that a subscription tier is an institution.</CardDescription></CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border p-4"><BookOpen className="h-5 w-5 text-primary" /><p className="mt-3 font-medium">Learn</p><p className="mt-1 text-sm text-muted-foreground">Lessons, readings, activities and assessments.</p></div>
                <div className="rounded-xl border p-4"><Target className="h-5 w-5 text-primary" /><p className="mt-3 font-medium">Master</p><p className="mt-1 text-sm text-muted-foreground">Progress and outcome evidence across real coursework.</p></div>
                <div className="rounded-xl border p-4"><ShieldCheck className="h-5 w-5 text-primary" /><p className="mt-3 font-medium">Prove</p><p className="mt-1 text-sm text-muted-foreground">Controlled records, provenance and institutional governance.</p></div>
              </CardContent>
            </Card>
            <Card className="border-border/60 shadow-sm">
              <CardHeader><CardTitle>Academic authority</CardTitle><CardDescription>Important release boundary</CardDescription></CardHeader>
              <CardContent><p className="text-sm leading-6 text-muted-foreground">ScrollUniversity can manage programmes, learning progress and completion records. External accreditation, regulated awards and transferable academic credit require authority from the relevant institution or regulator.</p></CardContent>
            </Card>
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
