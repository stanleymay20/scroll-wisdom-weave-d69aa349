/**
 * /cognition — Cognitive Trend Dashboard
 *
 * "Your brain over time." Pulls from existing tables only:
 *   - competency_profile          → Bloom radar (6 dimensions)
 *   - learner_concept_states      → mastery distribution & weakest concepts
 *   - reading_sessions            → focus minutes per day (last 14 days)
 *   - spaced_repetition_cards     → expected retention (FSRS forgetting curve)
 *   - reading_streaks             → streak headline
 *
 * Read-only, no schema changes. Designed to feel premium and instantly
 * legible — the user should walk away knowing exactly what got stronger
 * this week and where to push next.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Brain,
  Flame,
  Target,
  Timer,
  TrendingUp,
  Sparkles,
  Loader2,
  ArrowRight,
} from 'lucide-react';
import {
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  Radar,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  LineChart,
  Line,
  CartesianGrid,
} from 'recharts';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PageShell } from '@/components/ui/page-shell';
import { expectedRetention, recallProbability } from '@/lib/fsrs';

interface BloomRow {
  remember_score: number; understand_score: number; apply_score: number;
  analyze_score: number; evaluate_score: number; create_score: number;
  growth_trend: string; total_attempts: number;
}
interface ConceptRow {
  mastery_score: number;
  last_assessed_at: string | null;
  concept_nodes: { label: string } | null;
}
interface SessionRow { duration_seconds: number; started_at: string; }
interface SrsRow { interval_days: number; last_reviewed_at: string | null; }

const BLOOM_LABELS = [
  ['remember_score', 'Remember'],
  ['understand_score', 'Understand'],
  ['apply_score', 'Apply'],
  ['analyze_score', 'Analyze'],
  ['evaluate_score', 'Evaluate'],
  ['create_score', 'Create'],
] as const;

export default function Cognition() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [bloom, setBloom] = useState<BloomRow | null>(null);
  const [concepts, setConcepts] = useState<ConceptRow[]>([]);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [srs, setSrs] = useState<SrsRow[]>([]);
  const [streak, setStreak] = useState<number>(0);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      const userId = u.user?.id;
      if (!userId) { navigate('/auth', { state: { redirectTo: '/cognition' } }); return; }

      const since = new Date(Date.now() - 14 * 86_400_000).toISOString();
      const [bp, cs, rs, sc, st] = await Promise.all([
        supabase.from('competency_profile').select('*').eq('user_id', userId).maybeSingle(),
        supabase
          .from('learner_concept_states')
          .select('mastery_score, last_assessed_at, concept_nodes!inner(label)')
          .eq('user_id', userId)
          .order('mastery_score', { ascending: true })
          .limit(50),
        supabase
          .from('reading_sessions')
          .select('duration_seconds, started_at')
          .eq('user_id', userId)
          .gte('started_at', since)
          .order('started_at', { ascending: true }),
        supabase
          .from('spaced_repetition_cards')
          .select('interval_days, last_reviewed_at')
          .eq('user_id', userId)
          .limit(1000),
        supabase
          .from('reading_streaks')
          .select('current_streak')
          .eq('user_id', userId)
          .maybeSingle(),
      ]);

      if (!mounted) return;
      setBloom((bp.data as BloomRow) || null);
      setConcepts((cs.data as any) || []);
      setSessions((rs.data as SessionRow[]) || []);
      setSrs((sc.data as SrsRow[]) || []);
      setStreak((st.data as any)?.current_streak || 0);
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, [navigate]);

  // ── Derived data ────────────────────────────────────────────────────
  const radarData = useMemo(
    () =>
      BLOOM_LABELS.map(([key, label]) => ({
        dimension: label,
        score: bloom ? Math.round(Number((bloom as any)[key]) || 0) : 0,
      })),
    [bloom],
  );

  const focusByDay = useMemo(() => {
    const map = new Map<string, number>();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86_400_000);
      map.set(dayKey(d), 0);
    }
    sessions.forEach(s => {
      const k = dayKey(new Date(s.started_at));
      if (map.has(k)) map.set(k, (map.get(k) || 0) + (s.duration_seconds || 0) / 60);
    });
    return Array.from(map.entries()).map(([day, minutes]) => ({
      day: day.slice(5),
      minutes: Math.round(minutes),
    }));
  }, [sessions]);

  const totalFocusMin = focusByDay.reduce((s, d) => s + d.minutes, 0);

  const retentionToday = useMemo(
    () =>
      expectedRetention(
        srs.map(c => ({ stability: c.interval_days, lastReviewedAt: c.last_reviewed_at })),
      ),
    [srs],
  );

  // 14-day forward projection of retention with no further reviews — shows how the curve falls
  const retentionCurve = useMemo(() => {
    const points: Array<{ day: string; retention: number }> = [];
    for (let i = 0; i <= 14; i++) {
      const future = i;
      const sum = srs.reduce((acc, c) => {
        if (!c.last_reviewed_at || c.interval_days <= 0) return acc + 1;
        const days =
          (Date.now() - new Date(c.last_reviewed_at).getTime()) / 86_400_000 + future;
        return acc + recallProbability(Math.max(0, days), c.interval_days);
      }, 0);
      points.push({
        day: i === 0 ? 'today' : `+${i}d`,
        retention: srs.length === 0 ? 0 : Math.round((sum / srs.length) * 100),
      });
    }
    return points;
  }, [srs]);

  const weakest = concepts.slice(0, 5);
  const strongest = [...concepts].reverse().slice(0, 5);

  if (loading) {
    return (
      <PageShell pageName="cognition">
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </PageShell>
    );
  }

  const bloomAvg = Math.round(
    BLOOM_LABELS.reduce((s, [k]) => s + (Number((bloom as any)?.[k]) || 0), 0) / 6,
  );

  return (
    <PageShell pageName="cognition">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12 space-y-8">
        {/* ── Header ────────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="space-y-3"
        >
          <Badge variant="secondary" className="gap-1.5 w-fit">
            <Brain className="h-3 w-3" /> Cognitive Trend
          </Badge>
          <h1 className="text-3xl sm:text-4xl font-semibold text-foreground tracking-tight">
            Your brain, charted.
          </h1>
          <p className="text-sm text-muted-foreground max-w-2xl">
            Mastery, focus, and forecasted recall — measured from your real activity.
            No tracking pixels, no estimates. Just your reading, retrieval, and reflection.
          </p>
        </motion.div>

        {/* ── Headline tiles ────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <HeadlineTile icon={TrendingUp} label="Bloom average" value={`${bloomAvg}`} suffix=" / 100" tone="primary" />
          <HeadlineTile icon={Target} label="Expected recall" value={`${retentionToday}%`} hint="of due cards today" />
          <HeadlineTile icon={Timer} label="Focus (14d)" value={`${totalFocusMin}`} suffix=" min" />
          <HeadlineTile icon={Flame} label="Streak" value={`${streak}`} suffix=" days" tone="warm" />
        </div>

        {/* ── Bloom radar + retention curve ─────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="bg-card border-primary/10">
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-foreground">Bloom profile</h2>
                  <p className="text-xs text-muted-foreground">
                    Six cognitive dimensions, scored 0–100 from your assessments.
                  </p>
                </div>
                <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                  {bloom?.growth_trend || 'building'}
                </Badge>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="hsl(var(--border))" />
                    <PolarAngleAxis dataKey="dimension" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                    <Radar
                      dataKey="score"
                      stroke="hsl(var(--primary))"
                      fill="hsl(var(--primary))"
                      fillOpacity={0.25}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-card border-primary/10">
            <CardContent className="p-5 space-y-3">
              <div>
                <h2 className="text-base font-semibold text-foreground">Forecasted retention</h2>
                <p className="text-xs text-muted-foreground">
                  How well you'll remember everything you've learned, day by day —
                  using the FSRS forgetting curve.
                </p>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={retentionCurve} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                    <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="day" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                    <YAxis domain={[0, 100]} tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{
                        background: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                      formatter={(v: number) => [`${v}%`, 'recall']}
                    />
                    <Line
                      type="monotone"
                      dataKey="retention"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── Focus minutes per day ─────────────────────────────── */}
        <Card className="bg-card border-primary/10">
          <CardContent className="p-5 space-y-3">
            <div>
              <h2 className="text-base font-semibold text-foreground">Deep focus · last 14 days</h2>
              <p className="text-xs text-muted-foreground">
                Minutes spent in actual reading sessions, not idle pageviews.
              </p>
            </div>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={focusByDay} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="day" tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} />
                  <YAxis tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{
                      background: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(v: number) => [`${v} min`, 'focus']}
                  />
                  <Bar dataKey="minutes" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* ── Concept ladders ───────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ConceptList title="Push these next" items={weakest} accent="warn" />
          <ConceptList title="Strongest concepts" items={strongest} accent="ok" />
        </div>

        {/* ── CTA ───────────────────────────────────────────────── */}
        <Card className="bg-gradient-to-br from-primary/5 via-card to-accent/5 border-primary/10">
          <CardContent className="p-6 flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1 min-w-0">
              <h3 className="text-base font-semibold text-foreground">
                Today&apos;s session is the fastest way to move every line on this page.
              </h3>
              <p className="text-xs text-muted-foreground">
                15-minute Deep Study ritual · warm-up · focus · retrieval · reflection.
              </p>
            </div>
            <Button onClick={() => navigate('/study')} className="gap-2">
              Start session <ArrowRight className="h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}

function HeadlineTile({
  icon: Icon,
  label,
  value,
  suffix,
  hint,
  tone,
}: {
  icon: typeof Brain;
  label: string;
  value: string | number;
  suffix?: string;
  hint?: string;
  tone?: 'primary' | 'warm';
}) {
  return (
    <Card className="bg-card border-primary/10">
      <CardContent className="p-4 space-y-1.5">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Icon className={`h-3.5 w-3.5 ${tone === 'warm' ? 'text-amber-500' : 'text-primary'}`} />
          {label}
        </div>
        <div className="text-2xl font-semibold text-foreground tabular-nums">
          {value}
          {suffix && <span className="text-sm text-muted-foreground font-normal">{suffix}</span>}
        </div>
        {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
      </CardContent>
    </Card>
  );
}

function ConceptList({
  title,
  items,
  accent,
}: {
  title: string;
  items: ConceptRow[];
  accent: 'warn' | 'ok';
}) {
  return (
    <Card className="bg-card border-primary/10">
      <CardContent className="p-5 space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className={`h-3.5 w-3.5 ${accent === 'ok' ? 'text-emerald-500' : 'text-amber-500'}`} />
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        </div>
        {items.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Not enough data yet — finish a chapter and a quiz to populate this.
          </p>
        )}
        <ul className="space-y-2">
          {items.map((c, i) => {
            const pct = Math.round(Number(c.mastery_score) * 100);
            return (
              <li key={i} className="flex items-center justify-between gap-3">
                <span className="text-sm text-foreground truncate">
                  {c.concept_nodes?.label || 'Concept'}
                </span>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="h-1.5 w-20 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full ${accent === 'ok' ? 'bg-emerald-500' : 'bg-amber-500'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-muted-foreground tabular-nums w-8 text-right">
                    {pct}%
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}

function dayKey(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
