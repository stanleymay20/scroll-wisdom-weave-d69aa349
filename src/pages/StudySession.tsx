/**
 * /study — Deep Study Mode
 *
 * Orchestrates a daily 4-phase ritual: Warm-up → Focus → Retrieval → Reflection
 * → Cognitive Report. Builds the session plan from existing tables and walks
 * the user through it without leaving the page (focus block opens chapter in
 * a new tab so the timer keeps running here).
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, Sparkles, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { PageShell } from '@/components/ui/page-shell';
import { SessionWarmup } from '@/components/study/SessionWarmup';
import { SessionFocus } from '@/components/study/SessionFocus';
import { SessionRetrieval } from '@/components/study/SessionRetrieval';
import { SessionReflection } from '@/components/study/SessionReflection';
import { SessionReport } from '@/components/study/SessionReport';
import {
  buildSessionPlan,
  computeSessionReport,
  type SessionPlan,
  type SessionPhase,
  type SessionReport as SessionReportT,
} from '@/lib/studySessionEngine';

const PHASES: SessionPhase[] = ['intro', 'warmup', 'focus', 'retrieval', 'reflection', 'report'];
const PHASE_LABELS: Record<SessionPhase, string> = {
  intro: 'Today\'s plan',
  warmup: 'Warm-up',
  focus: 'Deep focus',
  retrieval: 'Retrieval',
  reflection: 'Reflection',
  report: 'Report',
};

export default function StudySession() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();

  const [plan, setPlan] = useState<SessionPlan | null>(null);
  const [phase, setPhase] = useState<SessionPhase>('intro');
  const [sessionStart] = useState(() => new Date());

  // Aggregated metrics across phases
  const [cardsReviewed, setCardsReviewed] = useState(0);
  const [focusMinutes, setFocusMinutes] = useState(0);
  const [retrievalScore, setRetrievalScore] = useState(0);
  const [weakConceptsTouched, setWeakConceptsTouched] = useState(0);
  const [reflectionScore, setReflectionScore] = useState<number | null>(null);
  const [report, setReport] = useState<SessionReportT | null>(null);

  useEffect(() => {
    if (!user?.id) return;
    let mounted = true;
    buildSessionPlan(user.id).then((p) => {
      if (mounted) setPlan(p);
    });
    return () => {
      mounted = false;
    };
  }, [user?.id]);

  useEffect(() => {
    if (!authLoading && !user) navigate('/auth');
  }, [authLoading, user, navigate]);

  // Skip warm-up if no due cards; skip focus/retrieval if no book
  const advance = (from: SessionPhase) => {
    if (!plan) return;
    let next: SessionPhase = from;
    const i = PHASES.indexOf(from);
    next = PHASES[i + 1];

    if (next === 'warmup' && plan.dueCardCount === 0) next = 'focus';
    if (next === 'focus' && !plan.bookId) next = 'retrieval';
    if (next === 'retrieval' && !plan.bookId && plan.weakConcepts.length === 0) next = 'reflection';

    setPhase(next);
  };

  // When entering "report", compute the summary
  useEffect(() => {
    if (phase !== 'report' || !user?.id) return;
    computeSessionReport(user.id, sessionStart, {
      cardsReviewed,
      focusMinutes,
      retrievalScore,
      reflectionScore,
      weakConceptsTouched,
    }).then(setReport);
  }, [phase, user?.id, sessionStart, cardsReviewed, focusMinutes, retrievalScore, reflectionScore, weakConceptsTouched]);

  const progress = useMemo(() => {
    const i = PHASES.indexOf(phase);
    return (i / (PHASES.length - 1)) * 100;
  }, [phase]);

  if (authLoading || !plan) {
    return (
      <PageShell>
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-6">
        {/* Header */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="gap-1.5">
              <Brain className="h-3 w-3" /> Deep Study Mode
            </Badge>
            <span className="text-xs text-muted-foreground">{PHASE_LABELS[phase]}</span>
          </div>
          <Progress value={progress} className="h-1" />
        </div>

        {/* Phase content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={phase}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            {phase === 'intro' && (
              <IntroPhase plan={plan} onStart={() => advance('intro')} />
            )}

            {phase === 'warmup' && user?.id && (
              <SessionWarmup
                userId={user.id}
                bookId={plan.bookId}
                targetCount={plan.warmupTargetCards}
                onComplete={(n) => {
                  setCardsReviewed(n);
                  advance('warmup');
                }}
              />
            )}

            {phase === 'focus' && (
              <SessionFocus
                bookId={plan.bookId}
                bookTitle={plan.bookTitle}
                resumeChapter={plan.resumeChapter}
                durationMinutes={plan.focusMinutes || 15}
                onComplete={(min) => {
                  setFocusMinutes(min);
                  advance('focus');
                }}
              />
            )}

            {phase === 'retrieval' && (
              <SessionRetrieval
                weakConcepts={plan.weakConcepts}
                onComplete={({ score, conceptsTouched }) => {
                  setRetrievalScore(score);
                  setWeakConceptsTouched(conceptsTouched);
                  advance('retrieval');
                }}
              />
            )}

            {phase === 'reflection' && (
              <SessionReflection
                bookTitle={plan.bookTitle}
                onComplete={(score) => {
                  setReflectionScore(score);
                  advance('reflection');
                }}
              />
            )}

            {phase === 'report' && report && (
              <SessionReport report={report} bookTitle={plan.bookTitle} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </PageShell>
  );
}

function IntroPhase({ plan, onStart }: { plan: SessionPlan; onStart: () => void }) {
  if (plan.isEmpty) {
    return (
      <Card className="bg-card border-primary/10">
        <CardContent className="p-6 sm:p-8 space-y-4 text-center">
          <Sparkles className="h-10 w-10 text-primary mx-auto" />
          <h1 className="text-2xl font-semibold text-foreground">Start with a book</h1>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Deep Study Mode tunes itself to whatever you&apos;re reading. Generate or open a book first,
            then come back to run today&apos;s session.
          </p>
          <div className="flex gap-2 justify-center pt-2">
            <Button asChild>
              <a href="/generate">Generate a book</a>
            </Button>
            <Button asChild variant="outline">
              <a href="/library">Browse library</a>
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const totalMin =
    (plan.dueCardCount > 0 ? plan.warmupMinutes : 0) +
    plan.focusMinutes +
    plan.retrievalMinutes +
    plan.reflectionMinutes;

  return (
    <Card className="bg-gradient-to-br from-primary/5 via-card to-accent/5 border-primary/10">
      <CardContent className="p-6 sm:p-8 space-y-5">
        <div className="space-y-2">
          <h1 className="text-2xl sm:text-3xl font-semibold text-foreground">
            Today&apos;s session · {totalMin} min
          </h1>
          <p className="text-sm text-muted-foreground">
            A deliberate loop that strengthens what you already know and surfaces what&apos;s shaky.
          </p>
        </div>

        <ul className="space-y-3">
          <PlanRow
            label="Warm-up"
            minutes={plan.dueCardCount > 0 ? plan.warmupMinutes : 0}
            detail={
              plan.dueCardCount > 0
                ? `${Math.min(3, plan.dueCardCount)} flashcard${plan.dueCardCount === 1 ? '' : 's'} due for review`
                : 'No cards due — skipping'
            }
            skipped={plan.dueCardCount === 0}
          />
          <PlanRow
            label="Deep focus"
            minutes={plan.focusMinutes}
            detail={
              plan.bookTitle
                ? `Continue "${plan.bookTitle}" · Ch. ${plan.resumeChapter}`
                : 'Continue your current chapter'
            }
          />
          <PlanRow
            label="Retrieval"
            minutes={plan.retrievalMinutes}
            detail={
              plan.weakConcepts.length > 0
                ? `Test ${plan.weakConcepts.length} weakest concept${plan.weakConcepts.length === 1 ? '' : 's'}`
                : 'Quick recall on key ideas'
            }
          />
          <PlanRow
            label="Reflection"
            minutes={plan.reflectionMinutes}
            detail="One short prompt — AI-graded"
          />
        </ul>

        <Button size="lg" onClick={onStart} className="w-full sm:w-auto gap-2">
          Begin session <Sparkles className="h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  );
}

function PlanRow({
  label,
  minutes,
  detail,
  skipped,
}: {
  label: string;
  minutes: number;
  detail: string;
  skipped?: boolean;
}) {
  return (
    <li className="flex items-start justify-between gap-4 py-2 border-b border-border/40 last:border-0">
      <div className="min-w-0">
        <div className={`text-sm font-medium ${skipped ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
          {label}
        </div>
        <div className="text-xs text-muted-foreground">{detail}</div>
      </div>
      <div className="text-xs tabular-nums text-muted-foreground shrink-0">
        {minutes > 0 ? `${minutes} min` : '—'}
      </div>
    </li>
  );
}
