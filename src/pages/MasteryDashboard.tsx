/**
 * Mastery Dashboard — /dashboard/mastery
 * 
 * Displays Bloom radar chart, progression trends, domain competency,
 * and exportable learning progression reports.
 */

import { useState, useEffect } from 'react';
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
import {
  Brain, TrendingUp, Download, Shield, Target,
  BarChart3, Award, ArrowLeft, AlertTriangle,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';
import {
  type BloomDistribution,
  type GrowthTrend,
  BLOOM_LEVELS,
} from '@/lib/masteryEngine';

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
}

const BLOOM_LABELS: Record<string, string> = {
  remember: 'Remember',
  understand: 'Understand',
  apply: 'Apply',
  analyze: 'Analyze',
  evaluate: 'Evaluate',
  create: 'Create',
};

const TREND_CONFIG: Record<string, { label: string; color: string; icon: typeof TrendingUp }> = {
  improving: { label: 'Improving', color: 'text-green-500', icon: TrendingUp },
  plateau: { label: 'Plateau', color: 'text-amber-500', icon: Target },
  declining: { label: 'Needs Attention', color: 'text-destructive', icon: AlertTriangle },
};

const STATUS_COLORS: Record<string, string> = {
  developing: 'hsl(var(--destructive))',
  proficient: 'hsl(var(--primary))',
  mastery: 'hsl(142, 76%, 36%)',
};

export default function MasteryDashboard() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<CompetencyProfileRow[]>([]);
  const [progressHistory, setProgressHistory] = useState<LearningProgressRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/auth', { state: { redirectTo: '/dashboard/mastery' } });
        return;
      }
      setUserId(user.id);

      const [profileRes, progressRes] = await Promise.all([
        supabase
          .from('competency_profile')
          .select('*')
          .eq('user_id', user.id),
        supabase
          .from('learning_progress')
          .select('score, bloom_level, attempt_number, mastery_status, created_at, improvement_delta')
          .eq('user_id', user.id)
          .order('created_at', { ascending: true })
          .limit(200),
      ]);

      if (profileRes.data) setProfiles(profileRes.data as any);
      if (progressRes.data) setProgressHistory(progressRes.data as any);
      setIsLoading(false);
    };
    init();
  }, [navigate]);

  // Aggregate bloom data for radar chart
  const getRadarData = () => {
    if (profiles.length === 0) {
      return BLOOM_LEVELS.map(l => ({ subject: BLOOM_LABELS[l], score: 0, fullMark: 100 }));
    }
    // Average across domains
    return BLOOM_LEVELS.map(level => {
      const key = `${level}_score` as keyof CompetencyProfileRow;
      const avg = profiles.reduce((sum, p) => sum + (Number(p[key]) || 0), 0) / profiles.length;
      return { subject: BLOOM_LABELS[level], score: Math.round(avg), fullMark: 100 };
    });
  };

  // Trend data for line chart
  const getTrendData = () => {
    return progressHistory.map((p, i) => ({
      attempt: i + 1,
      score: Number(p.score),
      delta: Number(p.improvement_delta),
      date: new Date(p.created_at).toLocaleDateString(),
    }));
  };

  // Domain heatmap data
  const getDomainData = () => {
    return profiles.map(p => {
      const scores = [
        Number(p.remember_score), Number(p.understand_score), Number(p.apply_score),
        Number(p.analyze_score), Number(p.evaluate_score), Number(p.create_score),
      ];
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      return {
        domain: p.domain.replace(/_/g, ' '),
        score: Math.round(avg),
        attempts: p.total_attempts,
        trend: p.growth_trend,
      };
    });
  };

  const handleExportJSON = () => {
    const artifact = {
      exportedAt: new Date().toISOString(),
      userId,
      bloomDistribution: getRadarData(),
      progressHistory: getTrendData(),
      domainProfiles: getDomainData(),
      totalAttempts: progressHistory.length,
    };
    const blob = new Blob([JSON.stringify(artifact, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `mastery-report-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex flex-col">
        <Navbar />
        <main className="flex-1 pt-24 pb-16">
          <div className="container mx-auto px-4 max-w-6xl space-y-6">
            <Skeleton className="h-10 w-64" />
            <div className="grid md:grid-cols-2 gap-6">
              <Skeleton className="h-80" />
              <Skeleton className="h-80" />
            </div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const radarData = getRadarData();
  const trendData = getTrendData();
  const domainData = getDomainData();

  const content = (
    <main className={cn(
      "flex-1 pb-16",
      isMobile ? "pt-4 px-4" : "pt-24 container mx-auto px-4 max-w-6xl"
    )}>
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate('/dashboard')}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-display font-bold text-gradient-gold">Mastery Dashboard</h1>
              <p className="text-muted-foreground">Cognitive progression & competency analysis</p>
            </div>
          </div>
          <div className="flex gap-2 mt-4 md:mt-0">
            <Button variant="outline" onClick={handleExportJSON} className="gap-2">
              <Download className="h-4 w-4" />
              Export Report
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { icon: Brain, label: 'Bloom Levels', value: new Set(progressHistory.map(p => p.bloom_level)).size, color: 'text-primary' },
            { icon: BarChart3, label: 'Total Attempts', value: progressHistory.length, color: 'text-blue-400' },
            { icon: Target, label: 'Domains Tracked', value: profiles.length, color: 'text-green-400' },
            { icon: Award, label: 'Mastery Achieved', value: progressHistory.filter(p => p.mastery_status === 'mastery').length, color: 'text-scroll-gold' },
          ].map((stat) => (
            <Card key={stat.label} className="bg-gradient-card border-border/50">
              <CardContent className="p-4">
                <stat.icon className={cn("h-6 w-6 mb-2", stat.color)} />
                <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Tabs defaultValue="bloom" className="space-y-6">
          <TabsList className="bg-muted/50">
            <TabsTrigger value="bloom" className="gap-2">
              <Brain className="h-4 w-4" />
              Bloom Radar
            </TabsTrigger>
            <TabsTrigger value="trends" className="gap-2">
              <TrendingUp className="h-4 w-4" />
              Progress Trends
            </TabsTrigger>
            <TabsTrigger value="domains" className="gap-2">
              <Shield className="h-4 w-4" />
              Domain Competency
            </TabsTrigger>
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
                  <ResponsiveContainer width="100%" height={400}>
                    <RadarChart data={radarData}>
                      <PolarGrid stroke="hsl(var(--border))" />
                      <PolarAngleAxis dataKey="subject" tick={{ fill: 'hsl(var(--foreground))', fontSize: 12 }} />
                      <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                      <Radar
                        name="Score"
                        dataKey="score"
                        stroke="hsl(var(--primary))"
                        fill="hsl(var(--primary))"
                        fillOpacity={0.3}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Progress Trends */}
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
                  <ResponsiveContainer width="100%" height={350}>
                    <LineChart data={trendData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="attempt" label={{ value: 'Attempt', position: 'insideBottomRight', offset: -5 }} />
                      <YAxis domain={[0, 100]} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px',
                        }}
                      />
                      <Line type="monotone" dataKey="score" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Domain Competency */}
          <TabsContent value="domains">
            <Card className="bg-gradient-card border-border/50">
              <CardHeader>
                <CardTitle>Domain Competency Map</CardTitle>
                <CardDescription>Performance by subject area</CardDescription>
              </CardHeader>
              <CardContent>
                {domainData.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
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
                              <Badge variant="outline" className="text-xs">
                                {d.attempts} attempts
                              </Badge>
                            </div>
                            <div className={cn("flex items-center gap-1 text-sm", trendInfo.color)}>
                              <trendInfo.icon className="h-3.5 w-3.5" />
                              {trendInfo.label}
                            </div>
                          </div>
                          <div className="h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary transition-all duration-500 rounded-full"
                              style={{ width: `${Math.min(d.score, 100)}%` }}
                            />
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

        {/* Institutional disclaimer */}
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
