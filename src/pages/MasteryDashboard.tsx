/**
 * Mastery Dashboard — /dashboard/mastery
 * 
 * Enhanced with: SRS stats, adaptive difficulty, streak heatmap,
 * weak area detection, Bloom radar, progression trends, certification gates.
 */

import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, BarChart, Bar, Cell,
} from 'recharts';
import { Navbar } from '@/components/layout/Navbar';
import { Footer } from '@/components/layout/Footer';
import { MobileLayout } from '@/components/layout/MobileLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import {
  Brain, TrendingUp, Download, Shield, Target,
  BarChart3, Award, ArrowLeft, AlertTriangle, Repeat,
  Zap, Calendar, Flame, BookOpen, ChevronUp, ChevronDown, Minus,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import { BLOOM_LEVELS, MASTERY_THRESHOLDS } from '@/lib/masteryEngine';
import { CertificationGateChecklist, type GateStatus } from '@/components/certificates/CertificationGateChecklist';
import { getSRSStats, type SRSCard } from '@/lib/spacedRepetition';
import { computeAdaptiveRecommendation, getDifficultyLabel, type PerformanceSnapshot } from '@/lib/adaptiveDifficulty';

interface CompetencyProfileRow {
  domain: string;
  remember_score: number;
  understand_score: number;
  apply_score: number;
  analyze_score: number;
  evaluate_score: number;
  create_score: number;
  growth_trend: string;
  total_attempts: number;
  last_updated: string;
}

interface LearningProgressRow {
  score: number;
  bloom_level: string;
  attempt_number: number;
  mastery_status: string;
  created_at: string;
  improvement_delta: number;
  suspicious_input_detected: boolean;
  coding_pass_rate: number | null;
  question_difficulty?: number;
  time_spent_seconds?: number;
  questions_answered?: number;
}

const BLOOM_LABELS: Record<string, string> = {
  remember: 'Remember', understand: 'Understand', apply: 'Apply',
  analyze: 'Analyze', evaluate: 'Evaluate', create: 'Create',
};

const TREND_CONFIG: Record<string, { label: string; color: string; icon: typeof TrendingUp }> = {
  improving: { label: 'Improving', color: 'text-green-500', icon: TrendingUp },
  plateau: { label: 'Plateau', color: 'text-amber-500', icon: Target },
  declining: { label: 'Needs Attention', color: 'text-destructive', icon: AlertTriangle },
};

const MASTERY_BADGE: Record<string, { label: string; className: string }> = {
  developing: { label: 'Developing', className: 'bg-destructive/10 text-destructive border-destructive/30' },
  proficient: { label: 'Proficient', className: 'bg-primary/10 text-primary border-primary/30' },
  mastery: { label: 'Mastery', className: 'bg-green-500/10 text-green-500 border-green-500/30' },
};

// Streak heatmap component
function StreakHeatmap({ sessions }: { sessions: { date: string; count: number }[] }) {
  const weeks = 12;
  const today = new Date();
  const grid: { date: string; count: number; day: number; week: number }[] = [];

  for (let i = weeks * 7 - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    const session = sessions.find(s => s.date === dateStr);
    const daysSinceStart = weeks * 7 - 1 - i;
    grid.push({
      date: dateStr,
      count: session?.count || 0,
      day: d.getDay(),
      week: Math.floor(daysSinceStart / 7),
    });
  }

  const getColor = (count: number) => {
    if (count === 0) return 'bg-muted/30';
    if (count === 1) return 'bg-primary/20';
    if (count <= 3) return 'bg-primary/40';
    if (count <= 5) return 'bg-primary/60';
    return 'bg-primary/80';
  };

  return (
    <div className="flex gap-0.5">
      {Array.from({ length: weeks }, (_, w) => (
        <div key={w} className="flex flex-col gap-0.5">
          {Array.from({ length: 7 }, (_, d) => {
            const cell = grid.find(g => g.week === w && g.day === d);
            return (
              <div
                key={d}
                className={cn("w-3 h-3 rounded-sm", getColor(cell?.count || 0))}
                title={cell ? `${cell.date}: ${cell.count} sessions` : ''}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

export default function MasteryDashboard() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<CompetencyProfileRow[]>([]);
  const [progressHistory, setProgressHistory] = useState<LearningProgressRow[]>([]);
  const [srsCards, setSrsCards] = useState<SRSCard[]>([]);
  const [streakData, setStreakData] = useState<{ date: string; count: number }[]>([]);
  const [currentStreak, setCurrentStreak] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/auth', { state: { redirectTo: '/dashboard/mastery' } });
        return;
      }
      setUserId(user.id);

      const [profileRes, progressRes, srsRes, sessionRes, streakRes] = await Promise.all([
        supabase.from('competency_profile').select('*').eq('user_id', user.id),
        supabase
          .from('learning_progress')
          .select('score, bloom_level, attempt_number, mastery_status, created_at, improvement_delta, suspicious_input_detected, coding_pass_rate, question_difficulty, time_spent_seconds, questions_answered')
          .eq('user_id', user.id)
          .order('created_at', { ascending: true })
          .limit(200),
        supabase
          .from('spaced_repetition_cards')
          .select('*')
          .eq('user_id', user.id)
          .limit(500),
        supabase
          .from('reading_sessions')
          .select('started_at')
          .eq('user_id', user.id)
          .order('started_at', { ascending: false })
          .limit(500),
        supabase
          .from('reading_streaks')
          .select('current_streak, longest_streak')
          .eq('user_id', user.id)
          .single(),
      ]);

      if (profileRes.data) setProfiles(profileRes.data as any);
      if (progressRes.data) setProgressHistory(progressRes.data as any);

      // Map SRS cards
      if (srsRes.data) {
        setSrsCards((srsRes.data as any[]).map((d: any) => ({
          id: d.id, userId: d.user_id, bookId: d.book_id, chapterId: d.chapter_id,
          question: d.question, answer: d.answer, bloomLevel: d.bloom_level,
          easeFactor: Number(d.ease_factor), intervalDays: d.interval_days,
          repetitions: d.repetitions, nextReviewAt: d.next_review_at,
          lastReviewedAt: d.last_reviewed_at, totalReviews: d.total_reviews,
          correctReviews: d.correct_reviews, streak: d.streak, createdAt: d.created_at,
        })));
      }

      // Aggregate session dates for heatmap
      if (sessionRes.data) {
        const dateCounts: Record<string, number> = {};
        for (const s of sessionRes.data) {
          const date = new Date(s.started_at).toISOString().split('T')[0];
          dateCounts[date] = (dateCounts[date] || 0) + 1;
        }
        // Also count learning_progress dates
        if (progressRes.data) {
          for (const p of progressRes.data as any[]) {
            const date = new Date(p.created_at).toISOString().split('T')[0];
            dateCounts[date] = (dateCounts[date] || 0) + 1;
          }
        }
        setStreakData(Object.entries(dateCounts).map(([date, count]) => ({ date, count })));
      }

      if (streakRes.data) {
        setCurrentStreak((streakRes.data as any).current_streak || 0);
      }

      setIsLoading(false);
    };
    init();
  }, [navigate]);

  // Computed data
  const srsStats = useMemo(() => getSRSStats(srsCards), [srsCards]);

  const adaptiveRec = useMemo(() => {
    const snapshots: PerformanceSnapshot[] = progressHistory.map(p => ({
      score: Number(p.score),
      bloomLevel: (p.bloom_level || 'remember') as any,
      difficulty: p.question_difficulty || 3,
      timeSpentSeconds: p.time_spent_seconds || 0,
      questionsAnswered: p.questions_answered || 0,
      createdAt: p.created_at,
    }));
    const currentDiff = snapshots.length > 0 ? snapshots[snapshots.length - 1].difficulty : 3;
    return computeAdaptiveRecommendation(snapshots, currentDiff);
  }, [progressHistory]);

  // Weak areas: bloom levels with avg < 60
  const weakAreas = useMemo(() => {
    const bloomScores: Record<string, { total: number; count: number }> = {};
    for (const p of progressHistory) {
      const bl = p.bloom_level;
      if (!bloomScores[bl]) bloomScores[bl] = { total: 0, count: 0 };
      bloomScores[bl].total += Number(p.score);
      bloomScores[bl].count++;
    }
    return Object.entries(bloomScores)
      .map(([level, data]) => ({ level, avg: Math.round(data.total / data.count), count: data.count }))
      .filter(d => d.avg < 60)
      .sort((a, b) => a.avg - b.avg);
  }, [progressHistory]);

  const getRadarData = () => {
    if (profiles.length === 0) {
      return BLOOM_LEVELS.map(l => ({ subject: BLOOM_LABELS[l], score: 0, fullMark: 100 }));
    }
    return BLOOM_LEVELS.map(level => {
      const key = `${level}_score` as keyof CompetencyProfileRow;
      const avg = profiles.reduce((sum, p) => sum + (Number(p[key]) || 0), 0) / profiles.length;
      return { subject: BLOOM_LABELS[level], score: Math.round(avg), fullMark: 100 };
    });
  };

  const getTrendData = () => {
    return progressHistory.map((p, i) => ({
      attempt: i + 1,
      score: Number(p.score),
      delta: Number(p.improvement_delta),
      date: new Date(p.created_at).toLocaleDateString(),
    }));
  };

  const getDomainData = () => {
    return profiles.map(p => {
      const scores = [
        Number(p.remember_score), Number(p.understand_score), Number(p.apply_score),
        Number(p.analyze_score), Number(p.evaluate_score), Number(p.create_score),
      ];
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      return { domain: p.domain.replace(/_/g, ' '), score: Math.round(avg), attempts: p.total_attempts, trend: p.growth_trend };
    });
  };

  const getIntegrityScore = () => {
    if (progressHistory.length === 0) return 100;
    const suspiciousCount = progressHistory.filter(p => p.suspicious_input_detected).length;
    return Math.round((1 - suspiciousCount / progressHistory.length) * 100);
  };

  const getMasteryClassification = () => {
    if (progressHistory.length === 0) return 'developing';
    const latestStatuses = progressHistory.slice(-10);
    const masteryCount = latestStatuses.filter(p => p.mastery_status === 'mastery').length;
    const proficientCount = latestStatuses.filter(p => p.mastery_status === 'proficient').length;
    if (masteryCount >= latestStatuses.length * 0.5) return 'mastery';
    if (proficientCount + masteryCount >= latestStatuses.length * 0.5) return 'proficient';
    return 'developing';
  };

  const getCertificationGates = (): GateStatus[] => {
    const overallAvg = progressHistory.length > 0
      ? progressHistory.reduce((s, p) => s + Number(p.score), 0) / progressHistory.length : 0;
    const bloomLevels = new Set(progressHistory.map(p => p.bloom_level));
    const applyAnalyze = progressHistory.filter(p => p.bloom_level === 'apply' || p.bloom_level === 'analyze');
    const applyAnalyzeAvg = applyAnalyze.length > 0
      ? applyAnalyze.reduce((s, p) => s + Number(p.score), 0) / applyAnalyze.length : 0;
    const hasEvaluate = progressHistory.some(p => p.bloom_level === 'evaluate' && Number(p.score) >= 60);
    const hasSuspicious = progressHistory.some(p => p.suspicious_input_detected);
    const recentScores = progressHistory.slice(-5).map(p => Number(p.score));
    const isDecline = recentScores.length >= 3 && recentScores[recentScores.length - 1] < recentScores[0] - 15;
    const codingAttempts = progressHistory.filter(p => p.coding_pass_rate !== null);
    const avgCodingRate = codingAttempts.length > 0
      ? codingAttempts.reduce((s, p) => s + Number(p.coding_pass_rate || 0), 0) / codingAttempts.length : 0;
    const scores = progressHistory.map(p => Number(p.score));
    const mean = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    const variance = scores.length > 0 ? scores.reduce((s, v) => s + (v - mean) ** 2, 0) / scores.length : 0;
    const volatility = Math.sqrt(variance);

    return [
      { label: 'Overall ≥ 80%', passed: overallAvg >= 80, detail: `Current: ${Math.round(overallAvg)}%` },
      { label: 'Apply + Analyze ≥ 70%', passed: applyAnalyzeAvg >= 70, detail: `Current: ${Math.round(applyAnalyzeAvg)}%` },
      { label: 'Evaluate success', passed: hasEvaluate, detail: 'Requires ≥1 successful Evaluate-level attempt' },
      { label: 'No declining trend', passed: !isDecline, detail: 'Recent scores are declining' },
      { label: '≥ 3 Bloom levels assessed', passed: bloomLevels.size >= 3, detail: `Current: ${bloomLevels.size} levels` },
      { label: '≥ 2 attempts', passed: progressHistory.length >= 2, detail: `Current: ${progressHistory.length} attempts` },
      { label: 'No suspicious flags', passed: !hasSuspicious, detail: 'Integrity review required' },
      { label: 'Stable volatility', passed: volatility < 25, detail: `Volatility: ${Math.round(volatility)}` },
      { label: 'Coding pass ≥ 60%', passed: codingAttempts.length === 0 || avgCodingRate >= 60, detail: codingAttempts.length === 0 ? 'No coding attempts yet' : `Current: ${Math.round(avgCodingRate)}%` },
    ];
  };

  const handleExportJSON = () => {
    const artifact = {
      exportedAt: new Date().toISOString(), userId,
      bloomDistribution: getRadarData(), progressHistory: getTrendData(),
      domainProfiles: getDomainData(), integrityScore: getIntegrityScore(),
      masteryClassification: getMasteryClassification(),
      certificationGates: getCertificationGates(),
      totalAttempts: progressHistory.length,
      srsStats, adaptiveRecommendation: adaptiveRec,
    };
    const blob = new Blob([JSON.stringify(artifact, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `mastery-report-${new Date().toISOString().split('T')[0]}.json`;
    a.click(); URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1 pt-24 pb-16">
          <div className="container mx-auto px-4 max-w-6xl space-y-6">
            <Skeleton className="h-10 w-64" />
            <div className="grid md:grid-cols-2 gap-6"><Skeleton className="h-80" /><Skeleton className="h-80" /></div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const radarData = getRadarData();
  const trendData = getTrendData();
  const domainData = getDomainData();
  const integrityScore = getIntegrityScore();
  const classification = getMasteryClassification();
  const badgeInfo = MASTERY_BADGE[classification] || MASTERY_BADGE.developing;
  const certGates = getCertificationGates();
  const hasSuspicious = progressHistory.some(p => p.suspicious_input_detected);

  const content = (
    <main className={cn("flex-1 pb-16", isMobile ? "pt-4 px-4" : "pt-24 container mx-auto px-4 max-w-6xl")}>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        {hasSuspicious && (
          <Alert variant="destructive" className="mb-6">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>Suspicious input detected in one or more attempts. These are excluded from certification.</AlertDescription>
          </Alert>
        )}

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-display font-bold text-gradient-gold">Mastery Dashboard</h1>
                <Badge variant="outline" className={cn("text-xs", badgeInfo.className)}>{badgeInfo.label}</Badge>
              </div>
              <p className="text-muted-foreground">Cognitive progression, SRS & adaptive analytics</p>
            </div>
          </div>
          <div className="flex gap-2 mt-4 md:mt-0">
            <Button variant="outline" onClick={handleExportJSON} className="gap-2">
              <Download className="h-4 w-4" />Export Report
            </Button>
          </div>
        </div>

        {/* Summary Cards — 6 columns */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-8">
          {[
            { icon: Brain, label: 'Bloom Levels', value: new Set(progressHistory.map(p => p.bloom_level)).size, color: 'text-primary' },
            { icon: BarChart3, label: 'Total Attempts', value: progressHistory.length, color: 'text-blue-400' },
            { icon: Flame, label: 'Current Streak', value: `${currentStreak}d`, color: 'text-orange-400' },
            { icon: Repeat, label: 'SRS Due', value: srsStats.due, color: srsStats.due > 0 ? 'text-amber-400' : 'text-green-400' },
            { icon: Award, label: 'Mastery Achieved', value: progressHistory.filter(p => p.mastery_status === 'mastery').length, color: 'text-scroll-gold' },
            { icon: Shield, label: 'Integrity', value: `${integrityScore}%`, color: integrityScore >= 90 ? 'text-green-400' : integrityScore >= 70 ? 'text-amber-400' : 'text-destructive' },
          ].map((stat) => (
            <Card key={stat.label} className="bg-gradient-card border-border/50">
              <CardContent className="p-3">
                <stat.icon className={cn("h-5 w-5 mb-1", stat.color)} />
                <p className="text-xl font-bold text-foreground">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* NEW: Adaptive Difficulty + SRS + Streak Row */}
        <div className="grid md:grid-cols-3 gap-4 mb-8">
          {/* Adaptive Difficulty */}
          <Card className="bg-gradient-card border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Zap className="h-4 w-4 text-amber-400" />
                Adaptive Difficulty
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-2xl font-bold">{getDifficultyLabel(adaptiveRec.recommendedDifficulty)}</span>
                <Badge variant="outline" className={cn("text-xs gap-1",
                  adaptiveRec.shouldEscalate ? 'text-green-500 border-green-500/30' :
                  adaptiveRec.shouldDeescalate ? 'text-amber-500 border-amber-500/30' :
                  'text-muted-foreground'
                )}>
                  {adaptiveRec.shouldEscalate ? <ChevronUp className="h-3 w-3" /> :
                   adaptiveRec.shouldDeescalate ? <ChevronDown className="h-3 w-3" /> :
                   <Minus className="h-3 w-3" />}
                  Level {adaptiveRec.recommendedDifficulty}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">{adaptiveRec.reason}</p>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Next Bloom:</span>
                <Badge variant="secondary" className="text-xs capitalize">{adaptiveRec.recommendedBloomLevel}</Badge>
              </div>
              {adaptiveRec.confidence > 0 && (
                <div>
                  <div className="flex justify-between text-xs text-muted-foreground mb-1">
                    <span>Confidence</span>
                    <span>{Math.round(adaptiveRec.confidence * 100)}%</span>
                  </div>
                  <Progress value={adaptiveRec.confidence * 100} className="h-1.5" />
                </div>
              )}
            </CardContent>
          </Card>

          {/* SRS Stats */}
          <Card className="bg-gradient-card border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Repeat className="h-4 w-4 text-primary" />
                Spaced Repetition
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="p-2 rounded-lg bg-muted/30">
                  <p className="text-lg font-bold">{srsStats.total}</p>
                  <p className="text-xs text-muted-foreground">Total Cards</p>
                </div>
                <div className="p-2 rounded-lg bg-muted/30">
                  <p className="text-lg font-bold text-amber-400">{srsStats.due}</p>
                  <p className="text-xs text-muted-foreground">Due Now</p>
                </div>
                <div className="p-2 rounded-lg bg-muted/30">
                  <p className="text-lg font-bold text-green-400">{srsStats.mature}</p>
                  <p className="text-xs text-muted-foreground">Mature</p>
                </div>
                <div className="p-2 rounded-lg bg-muted/30">
                  <p className="text-lg font-bold">{srsStats.retentionRate}%</p>
                  <p className="text-xs text-muted-foreground">Retention</p>
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs text-muted-foreground mb-1">
                  <span>Learning → Mature</span>
                  <span>{srsStats.learning} → {srsStats.young} → {srsStats.mature}</span>
                </div>
                <div className="flex gap-0.5 h-2 rounded-full overflow-hidden">
                  <div className="bg-amber-400/60" style={{ width: `${srsStats.total > 0 ? (srsStats.learning / srsStats.total) * 100 : 33}%` }} />
                  <div className="bg-primary/60" style={{ width: `${srsStats.total > 0 ? (srsStats.young / srsStats.total) * 100 : 34}%` }} />
                  <div className="bg-green-500/60" style={{ width: `${srsStats.total > 0 ? (srsStats.mature / srsStats.total) * 100 : 33}%` }} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Streak Heatmap */}
          <Card className="bg-gradient-card border-border/50">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Calendar className="h-4 w-4 text-green-400" />
                Activity (12 weeks)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <StreakHeatmap sessions={streakData} />
              <div className="flex items-center justify-between mt-3">
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <span>Less</span>
                  {[0, 1, 3, 5, 7].map(n => (
                    <div key={n} className={cn("w-2.5 h-2.5 rounded-sm",
                      n === 0 ? 'bg-muted/30' : n <= 1 ? 'bg-primary/20' : n <= 3 ? 'bg-primary/40' : n <= 5 ? 'bg-primary/60' : 'bg-primary/80'
                    )} />
                  ))}
                  <span>More</span>
                </div>
                <Badge variant="outline" className="text-xs gap-1">
                  <Flame className="h-3 w-3 text-orange-400" />
                  {currentStreak}d streak
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Weak Areas Alert */}
        {weakAreas.length > 0 && (
          <Card className="mb-8 border-amber-500/30 bg-amber-500/5">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium text-sm">Weak Areas Detected</p>
                  <p className="text-xs text-muted-foreground mb-2">These cognitive levels need focused practice:</p>
                  <div className="flex flex-wrap gap-2">
                    {weakAreas.map(w => (
                      <Badge key={w.level} variant="outline" className="text-xs border-amber-500/30 text-amber-600">
                        {BLOOM_LABELS[w.level] || w.level}: {w.avg}% avg ({w.count} attempts)
                      </Badge>
                    ))}
                  </div>
                  {adaptiveRec.focusAreas.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-2 italic">
                      💡 {adaptiveRec.focusAreas[0]}
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid lg:grid-cols-3 gap-6 mb-8">
          {/* Certification Gate Checklist */}
          <CertificationGateChecklist gates={certGates} />

          {/* Tabs */}
          <div className="lg:col-span-2">
            <Tabs defaultValue="bloom" className="space-y-6">
              <TabsList className="bg-muted/50">
                <TabsTrigger value="bloom" className="gap-2"><Brain className="h-4 w-4" />Bloom Radar</TabsTrigger>
                <TabsTrigger value="trends" className="gap-2"><TrendingUp className="h-4 w-4" />Trends</TabsTrigger>
                <TabsTrigger value="domains" className="gap-2"><BookOpen className="h-4 w-4" />Domains</TabsTrigger>
              </TabsList>

              {/* Bloom Radar */}
              <TabsContent value="bloom">
                <Card className="bg-gradient-card border-border/50">
                  <CardHeader>
                    <CardTitle>Cognitive Level Distribution</CardTitle>
                    <CardDescription>Your performance across Bloom's Taxonomy levels</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {progressHistory.length === 0 ? (
                      <div className="text-center py-12 text-muted-foreground">
                        <Brain className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>Complete assessments to see your Bloom distribution</p>
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height={350}>
                        <RadarChart data={radarData}>
                          <PolarGrid stroke="hsl(var(--border))" />
                          <PolarAngleAxis dataKey="subject" tick={{ fill: 'hsl(var(--foreground))', fontSize: 12 }} />
                          <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                          <Radar name="Score" dataKey="score" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.3} />
                        </RadarChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Trends */}
              <TabsContent value="trends">
                <Card className="bg-gradient-card border-border/50">
                  <CardHeader>
                    <CardTitle>Score Progression Over Time</CardTitle>
                    <CardDescription>Track improvement across assessment attempts</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {trendData.length === 0 ? (
                      <div className="text-center py-12 text-muted-foreground">
                        <TrendingUp className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>No progress data yet — take your first assessment</p>
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={trendData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                          <XAxis dataKey="attempt" />
                          <YAxis domain={[0, 100]} />
                          <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px' }} />
                          <Line type="monotone" dataKey="score" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Domains */}
              <TabsContent value="domains">
                <Card className="bg-gradient-card border-border/50">
                  <CardHeader>
                    <CardTitle>Domain Competency Map</CardTitle>
                    <CardDescription>Performance by subject area</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {domainData.length === 0 ? (
                      <div className="text-center py-12 text-muted-foreground">
                        <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p>No domain profiles yet — complete assessments to build your profile</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {domainData.map((d) => {
                          const trendInfo = TREND_CONFIG[d.trend] || TREND_CONFIG.plateau;
                          return (
                            <div key={d.domain} className="p-4 rounded-lg bg-muted/30 border border-border/50">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium capitalize">{d.domain}</span>
                                  <Badge variant="outline" className="text-xs">{d.attempts} attempts</Badge>
                                </div>
                                <div className={cn("flex items-center gap-1 text-sm", trendInfo.color)}>
                                  <trendInfo.icon className="h-3.5 w-3.5" />
                                  {trendInfo.label}
                                </div>
                              </div>
                              <div className="h-2 bg-muted rounded-full overflow-hidden">
                                <div className="h-full bg-primary transition-all duration-500 rounded-full" style={{ width: `${Math.min(d.score, 100)}%` }} />
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">{d.score}% average competency</p>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>

        <p className="text-xs text-muted-foreground text-center mt-8">
          This learning record documents demonstrated mastery within ScrollLibrary's structured AI-assisted curriculum.
          It does not constitute accredited academic credit.
        </p>
      </motion.div>
    </main>
  );

  if (isMobile) {
    return <MobileLayout>{content}</MobileLayout>;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      {content}
      <Footer />
    </div>
  );
}
