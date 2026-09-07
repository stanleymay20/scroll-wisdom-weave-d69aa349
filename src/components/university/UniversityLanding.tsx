import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  CheckCircle2,
  GraduationCap,
  LibraryBig,
  Network,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
} from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const capabilities = [
  ['Programme architecture', 'Schools, programmes, terms, prerequisites, cohorts, course offerings and progression rules.', GraduationCap],
  ['Course delivery', 'Modules, lessons, learning resources, assignments, submissions, attendance and announcements.', BookOpen],
  ['Assessment & evidence', 'Weighted gradebooks, rubrics, learning outcomes, transcripts and mastery-oriented evidence.', Target],
  ['Academic operations', 'Role-aware workflows for students, lecturers, programme leaders, registrars and academic administrators.', Users],
  ['Institution controls', 'Tenant-isolated records, academic policy, verification workflows and authorization enforced at the database layer.', ShieldCheck],
  ['Interoperability', 'Controlled LMS integrations, LTI 1.3 workflows and reusable course-content delivery infrastructure.', Network],
] as const;

const journey = [
  ['01', 'Discover', 'Understand the programme, prerequisites, workload, outcomes and learning pathway before you begin.'],
  ['02', 'Learn', 'Move through structured lessons, readings, worked examples, activities and authentic course resources.'],
  ['03', 'Practice', 'Use exercises, labs, formative checks and feedback to turn exposure into durable understanding.'],
  ['04', 'Demonstrate', 'Submit assessed work, projects and evidence mapped to explicit course and programme outcomes.'],
  ['05', 'Progress', 'Track grades, attendance, standing, advising, recognized credit and completion readiness in one academic record.'],
] as const;

export default function UniversityLanding() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-50 border-b bg-background/90 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4">
          <Link to="/university?view=about" className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground"><GraduationCap className="h-5 w-5" /></span>
            <span>ScrollUniversity</span>
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex" aria-label="ScrollUniversity landing navigation">
            <a href="#why" className="transition-colors hover:text-foreground">Why ScrollUniversity</a>
            <a href="#experience" className="transition-colors hover:text-foreground">Learning model</a>
            <a href="#institutions" className="transition-colors hover:text-foreground">For institutions</a>
            <a href="#faq" className="transition-colors hover:text-foreground">FAQ</a>
          </nav>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" className="hidden sm:inline-flex"><Link to="/">ScrollLibrary</Link></Button>
            <Button asChild><Link to="/university">Open workspace<ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden border-b">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_15%,hsl(var(--primary)/0.12),transparent_34%),radial-gradient(circle_at_85%_20%,hsl(var(--primary)/0.08),transparent_30%)]" />
        <div className="relative mx-auto grid max-w-7xl gap-12 px-4 py-20 md:py-28 lg:grid-cols-[1.05fr_.95fr] lg:items-center">
          <div>
            <Badge variant="secondary" className="mb-5"><Sparkles className="mr-1.5 h-3.5 w-3.5" />Institutional learning, built around evidence</Badge>
            <h1 className="max-w-4xl text-4xl font-semibold leading-tight tracking-[-0.035em] sm:text-5xl md:text-6xl">Learn deeply. Build mastery. <span className="text-primary">Prove what you know.</span></h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">ScrollUniversity brings curriculum, teaching, assessment, academic records and mastery evidence into one coherent university workspace—without reducing education to a collection of AI-generated lessons.</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild size="lg"><Link to="/university">Enter university workspace<ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
              <Button asChild size="lg" variant="outline"><a href="#experience">See how learning works</a></Button>
            </div>
            <div className="mt-8 grid max-w-2xl gap-3 text-sm text-muted-foreground sm:grid-cols-3">
              <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" />Role-aware learning</div>
              <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" />Outcome-aligned assessment</div>
              <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" />Institution-scoped records</div>
            </div>
          </div>

          <div className="relative">
            <div className="absolute -inset-8 -z-10 rounded-[2.5rem] bg-primary/5 blur-3xl" />
            <Card className="overflow-hidden border-border/70 shadow-2xl shadow-black/5">
              <CardHeader className="border-b bg-muted/30">
                <div className="flex items-center justify-between gap-4"><div><p className="text-xs font-medium uppercase tracking-[0.18em] text-primary">Student workspace</p><CardTitle className="mt-1">Your academic week</CardTitle></div><Badge variant="outline">Current term</Badge></div>
              </CardHeader>
              <CardContent className="space-y-4 p-5">
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">Courses</p><p className="mt-1 text-2xl font-semibold">4</p></div>
                  <div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">Due</p><p className="mt-1 text-2xl font-semibold">2</p></div>
                  <div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">Mastery</p><p className="mt-1 text-2xl font-semibold">78%</p></div>
                </div>
                <div className="rounded-2xl border p-4">
                  <div className="flex items-start justify-between gap-3"><div><p className="font-medium">Applied Data & AI</p><p className="mt-1 text-xs text-muted-foreground">Module 3 · Model evaluation and evidence</p></div><Badge>Continue</Badge></div>
                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full w-2/3 rounded-full bg-primary" /></div>
                  <div className="mt-3 flex justify-between text-xs text-muted-foreground"><span>6 of 9 learning activities</span><span>67%</span></div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border p-4"><BarChart3 className="h-5 w-5 text-primary" /><p className="mt-3 font-medium">Progress evidence</p><p className="mt-1 text-sm text-muted-foreground">Grades, attendance and outcome mastery stay connected.</p></div>
                  <div className="rounded-2xl border p-4"><LibraryBig className="h-5 w-5 text-primary" /><p className="mt-3 font-medium">Learning resources</p><p className="mt-1 text-sm text-muted-foreground">Course material can connect directly to the wider ScrollLibrary knowledge layer.</p></div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      <section id="why" className="mx-auto max-w-7xl px-4 py-20">
        <div className="max-w-3xl"><p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">Why ScrollUniversity</p><h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">A university operating layer, not another course gallery.</h2><p className="mt-4 text-lg leading-8 text-muted-foreground">The product is designed around the complete academic loop: curriculum → teaching → evidence → records → progression. AI can assist within that loop, but it does not replace institutional governance or academic judgement.</p></div>
        <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {capabilities.map(([title, description, Icon]) => <Card key={title} className="border-border/60 shadow-sm"><CardHeader><div className="mb-3 grid h-10 w-10 place-items-center rounded-xl bg-primary/10"><Icon className="h-5 w-5 text-primary" /></div><CardTitle className="text-lg">{title}</CardTitle><CardDescription className="leading-6">{description}</CardDescription></CardHeader></Card>)}
        </div>
      </section>

      <section id="experience" className="border-y bg-muted/25">
        <div className="mx-auto max-w-7xl px-4 py-20">
          <div className="grid gap-10 lg:grid-cols-[.85fr_1.15fr] lg:items-start">
            <div><p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">Learning model</p><h2 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">Designed for the whole learning journey.</h2><p className="mt-4 text-lg leading-8 text-muted-foreground">Students should always know what they are learning, why it matters, what evidence is expected and what to do next.</p></div>
            <div className="space-y-3">{journey.map(([number, title, description]) => <div key={number} className="grid grid-cols-[auto_1fr] gap-4 rounded-2xl border bg-background p-5 shadow-sm"><div className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-sm font-semibold text-primary-foreground">{number}</div><div><h3 className="font-semibold">{title}</h3><p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p></div></div>)}</div>
          </div>
        </div>
      </section>

      <section id="institutions" className="mx-auto max-w-7xl px-4 py-20">
        <div className="grid gap-8 lg:grid-cols-2 lg:items-center">
          <div><Badge variant="outline">For institutions</Badge><h2 className="mt-4 text-3xl font-semibold tracking-tight md:text-4xl">One academic system. Different responsibilities.</h2><p className="mt-4 text-lg leading-8 text-muted-foreground">Students see learning and progress. Lecturers see teaching and assessment. Academic leaders see curriculum and quality. Registrars see records and progression. Access follows institutional roles rather than subscription labels.</p><div className="mt-6 flex flex-wrap gap-2"><Badge variant="secondary">Student</Badge><Badge variant="secondary">Lecturer</Badge><Badge variant="secondary">Programme lead</Badge><Badge variant="secondary">Dean</Badge><Badge variant="secondary">Registrar</Badge><Badge variant="secondary">Advisor</Badge></div></div>
          <Card className="border-border/60 shadow-sm"><CardHeader><CardTitle>Institution-ready boundaries</CardTitle><CardDescription>Designed to keep product claims aligned with actual academic authority.</CardDescription></CardHeader><CardContent className="space-y-4 text-sm leading-6 text-muted-foreground"><div className="flex gap-3"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><p>University identity and records are scoped to institutional organization membership.</p></div><div className="flex gap-3"><Target className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><p>Programme and course outcomes can be mapped to learning and assessment evidence.</p></div><div className="flex gap-3"><GraduationCap className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><p>ScrollUniversity does not independently claim accreditation, legally confer degrees or guarantee transferable credit.</p></div></CardContent></Card>
        </div>
      </section>

      <section id="faq" className="border-t bg-muted/25">
        <div className="mx-auto max-w-4xl px-4 py-20"><p className="text-xs font-medium uppercase tracking-[0.2em] text-primary">FAQ</p><h2 className="mt-3 text-3xl font-semibold tracking-tight">What ScrollUniversity is—and is not.</h2><Accordion type="single" collapsible className="mt-8 rounded-2xl border bg-background px-5">
          <AccordionItem value="institution"><AccordionTrigger>Is ScrollUniversity the same as a student subscription?</AccordionTrigger><AccordionContent>No. Subscription determines product entitlement. University identity, roles, courses and records derive from institutional organization membership and the university academic model.</AccordionContent></AccordionItem>
          <AccordionItem value="degrees"><AccordionTrigger>Does ScrollUniversity award accredited degrees by itself?</AccordionTrigger><AccordionContent>No. The platform can manage programmes, coursework, progression and completion evidence, but regulated awards and accreditation require an institution with the relevant legal or regulatory authority.</AccordionContent></AccordionItem>
          <AccordionItem value="ai"><AccordionTrigger>Is the university simply an AI course generator?</AccordionTrigger><AccordionContent>No. AI can support content creation, tutoring and learning workflows, but the product is built around curriculum governance, source quality, assessment, records, academic integrity and human academic oversight.</AccordionContent></AccordionItem>
          <AccordionItem value="interop"><AccordionTrigger>Can it work with existing learning systems?</AccordionTrigger><AccordionContent>The University layer includes controlled interoperability foundations such as LTI 1.3 workflows and LMS connection management. Production claims remain limited to capabilities that have passed the platform’s release evidence gates.</AccordionContent></AccordionItem>
        </Accordion></div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-20"><div className="overflow-hidden rounded-[2rem] border bg-primary px-6 py-12 text-primary-foreground shadow-xl md:px-12"><div className="flex flex-col gap-8 md:flex-row md:items-center md:justify-between"><div className="max-w-3xl"><p className="text-sm font-medium text-primary-foreground/75">ScrollUniversity</p><h2 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">Education should end in evidence, not just content consumed.</h2><p className="mt-4 max-w-2xl text-primary-foreground/80">Bring learning, mastery, assessment and academic records into one controlled institutional experience.</p></div><Button asChild size="lg" variant="secondary"><Link to="/university">Open workspace<ArrowRight className="ml-2 h-4 w-4" /></Link></Button></div></div></section>

      <footer className="border-t"><div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2"><GraduationCap className="h-4 w-4" /><span>ScrollUniversity · a ScrollLibrary academic layer</span></div><div className="flex gap-4"><Link to="/privacy" className="hover:text-foreground">Privacy</Link><Link to="/terms" className="hover:text-foreground">Terms</Link><Link to="/" className="hover:text-foreground">ScrollLibrary</Link></div></div></footer>
    </main>
  );
}
