/**
 * Experiment Outcome Report — Internal admin dashboard
 * Shows per-variant comparisons for reading funnel metrics.
 */

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Navbar } from "@/components/layout/Navbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { RefreshCw, TrendingUp, TrendingDown, Minus } from "lucide-react";

interface VariantMetrics {
  variant: string;
  sampleSize: number;
  ch1Completed: number;
  ch2Started: number;
  returnWithin24h: number;
  bookCompleted: number;
  avgSectionsPerSession: number;
  quickLearnToReader: number;
}

interface ExperimentData {
  experiment: string;
  variants: VariantMetrics[];
}

function MetricCell({ control, treatment, label }: { control: number; treatment: number; label: string }) {
  const diff = treatment - control;
  const pctDiff = control > 0 ? ((diff / control) * 100).toFixed(1) : '—';
  const isPositive = diff > 0;
  const isNeutral = Math.abs(diff) < 0.5;

  return (
    <div className="text-center">
      <p className="text-xs text-muted-foreground mb-1">{label}</p>
      <div className="flex items-center justify-center gap-2">
        <span className="text-sm font-mono">{control.toFixed(1)}%</span>
        <span className="text-muted-foreground">→</span>
        <span className="text-sm font-mono font-semibold">{treatment.toFixed(1)}%</span>
      </div>
      <div className="flex items-center justify-center gap-1 mt-0.5">
        {isNeutral ? (
          <Minus className="h-3 w-3 text-muted-foreground" />
        ) : isPositive ? (
          <TrendingUp className="h-3 w-3 text-emerald-500" />
        ) : (
          <TrendingDown className="h-3 w-3 text-red-500" />
        )}
        <span className={`text-xs font-mono ${isNeutral ? 'text-muted-foreground' : isPositive ? 'text-emerald-500' : 'text-red-500'}`}>
          {isPositive ? '+' : ''}{pctDiff}%
        </span>
      </div>
    </div>
  );
}

export default function ExperimentReport() {
  const [experiments, setExperiments] = useState<ExperimentData[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch all experiment events
      const { data: events } = await supabase
        .from('pmf_events' as any)
        .select('event_type, metadata, user_id, created_at')
        .in('event_type', ['experiment_assigned', 'experiment_outcome', 'chapter_started', 'chapter_completed', 'book_completed', 'returned_within_24h', 'quicklearn_to_reader_click', 'section_completed', 'first_section_completed', 'chapter_1_completed', 'chapter_2_started'])
        .order('created_at', { ascending: false })
        .limit(1000);

      if (!events || events.length === 0) {
        setExperiments([]);
        setLoading(false);
        return;
      }

      // Build user → variant map per experiment
      const userVariants = new Map<string, Map<string, string>>(); // experiment → (userId → variant)
      const userEvents = new Map<string, Set<string>>(); // userId → set of event types

      for (const event of events) {
        const meta = event.metadata as any;
        const userId = event.user_id as string;

        if (event.event_type === 'experiment_assigned' && meta?.experiment && meta?.variant) {
          if (!userVariants.has(meta.experiment)) {
            userVariants.set(meta.experiment, new Map());
          }
          userVariants.get(meta.experiment)!.set(userId, meta.variant);
        }

        // Track user-level events
        if (!userEvents.has(userId)) userEvents.set(userId, new Set());
        userEvents.get(userId)!.add(event.event_type as string);

        // Also track experiment outcomes
        if (event.event_type === 'experiment_outcome' && meta?.outcome) {
          userEvents.get(userId)!.add(meta.outcome);
        }
      }

      // Calculate metrics per experiment per variant
      const experimentResults: ExperimentData[] = [];

      for (const [experiment, assignments] of userVariants.entries()) {
        const variants: VariantMetrics[] = [];

        for (const variant of ['control', 'treatment']) {
          const users = [...assignments.entries()]
            .filter(([, v]) => v === variant)
            .map(([uid]) => uid);

          if (users.length === 0) continue;

          const n = users.length;
          let ch1 = 0, ch2 = 0, ret24 = 0, bookDone = 0, qlConvert = 0, totalSections = 0;

          for (const uid of users) {
            const evts = userEvents.get(uid) || new Set();
            if (evts.has('chapter_1_completed') || evts.has('chapter_completed')) ch1++;
            if (evts.has('chapter_2_started')) ch2++;
            if (evts.has('returned_within_24h')) ret24++;
            if (evts.has('book_completed')) bookDone++;
            if (evts.has('quicklearn_to_reader_click')) qlConvert++;
            // Estimate sections from section_completed events
            if (evts.has('section_completed')) totalSections += 2; // rough estimate
          }

          variants.push({
            variant,
            sampleSize: n,
            ch1Completed: (ch1 / n) * 100,
            ch2Started: (ch2 / n) * 100,
            returnWithin24h: (ret24 / n) * 100,
            bookCompleted: (bookDone / n) * 100,
            avgSectionsPerSession: n > 0 ? totalSections / n : 0,
            quickLearnToReader: (qlConvert / n) * 100,
          });
        }

        if (variants.length > 0) {
          experimentResults.push({ experiment, variants });
        }
      }

      setExperiments(experimentResults);
      setLastRefresh(new Date());
    } catch (err) {
      console.error('[ExperimentReport] Failed to load:', err);
    }
    setLoading(false);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const control = (exp: ExperimentData) => exp.variants.find(v => v.variant === 'control');
  const treatment = (exp: ExperimentData) => exp.variants.find(v => v.variant === 'treatment');

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Experiment Report</h1>
            <p className="text-sm text-muted-foreground">
              Last refreshed: {lastRefresh.toLocaleTimeString()}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {experiments.length === 0 && !loading && (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              No experiment data yet. Experiments will appear here as users are assigned to variants.
            </CardContent>
          </Card>
        )}

        <div className="space-y-6">
          {experiments.map(exp => {
            const c = control(exp);
            const t = treatment(exp);

            return (
              <Card key={exp.experiment}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg font-semibold capitalize">
                      {exp.experiment.replace(/_/g, ' ')}
                    </CardTitle>
                    <div className="flex gap-2">
                      {c && (
                        <Badge variant="outline" className="text-xs">
                          Control: n={c.sampleSize}
                        </Badge>
                      )}
                      {t && (
                        <Badge variant="secondary" className="text-xs">
                          Treatment: n={t.sampleSize}
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {c && t ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                      <MetricCell control={c.ch1Completed} treatment={t.ch1Completed} label="Ch1 Completion" />
                      <MetricCell control={c.ch2Started} treatment={t.ch2Started} label="Ch2 Entry" />
                      <MetricCell control={c.returnWithin24h} treatment={t.returnWithin24h} label="24h Return" />
                      <MetricCell control={c.bookCompleted} treatment={t.bookCompleted} label="Book Complete" />
                      <MetricCell control={c.quickLearnToReader} treatment={t.quickLearnToReader} label="QL→Reader" />
                      <div className="text-center">
                        <p className="text-xs text-muted-foreground mb-1">Avg Sections/Session</p>
                        <div className="flex items-center justify-center gap-2">
                          <span className="text-sm font-mono">{c.avgSectionsPerSession.toFixed(1)}</span>
                          <span className="text-muted-foreground">→</span>
                          <span className="text-sm font-mono font-semibold">{t.avgSectionsPerSession.toFixed(1)}</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Waiting for both control and treatment data...
                    </p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </main>
    </div>
  );
}
