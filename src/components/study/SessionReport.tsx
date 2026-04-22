/**
 * SessionReport — the "you got smarter today" summary screen.
 * Pure presentational — receives a SessionReport object.
 */
import { motion } from 'framer-motion';
import { Sparkles, Brain, Target, Timer, TrendingUp, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useNavigate } from 'react-router-dom';
import type { SessionReport as SessionReportT } from '@/lib/studySessionEngine';

interface SessionReportProps {
  report: SessionReportT;
  bookTitle: string | null;
}

export function SessionReport({ report, bookTitle }: SessionReportProps) {
  const navigate = useNavigate();

  const stats = [
    { icon: TrendingUp, label: 'Mastery gained', value: `+${report.masteryDelta}` },
    { icon: Brain, label: 'Cards reviewed', value: report.cardsReviewed },
    { icon: Target, label: 'Concepts strengthened', value: report.conceptsStrengthened },
    { icon: Timer, label: 'Focus minutes', value: report.focusMinutes },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="space-y-6"
    >
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-primary/10 mb-2">
          <Sparkles className="h-7 w-7 text-primary" />
        </div>
        <h2 className="text-2xl sm:text-3xl font-semibold text-foreground">Session complete</h2>
        <p className="text-sm text-muted-foreground">
          {bookTitle ? `Worked on “${bookTitle}”` : 'Nice work — your daily brain workout is logged.'}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {stats.map(({ icon: Icon, label, value }) => (
          <Card key={label} className="bg-card border-primary/10">
            <CardContent className="p-4 flex items-start gap-3">
              <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Icon className="h-4.5 w-4.5 text-primary" />
              </div>
              <div className="min-w-0">
                <div className="text-2xl font-semibold text-foreground tabular-nums">{value}</div>
                <div className="text-xs text-muted-foreground">{label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {report.reflectionScore !== null && (
        <Card className="bg-gradient-to-br from-primary/5 to-accent/5 border-primary/10">
          <CardContent className="p-4 text-sm text-foreground">
            <span className="text-muted-foreground">Reflection quality:</span>{' '}
            <strong>{report.reflectionScore} / 5</strong>{' '}
            <span className="text-muted-foreground">
              {report.reflectionScore >= 4
                ? '— deep, well-articulated thinking.'
                : report.reflectionScore >= 3
                  ? '— solid; try one more concrete example tomorrow.'
                  : '— good first pass; the next session will sharpen it.'}
            </span>
          </CardContent>
        </Card>
      )}

      <div className="flex flex-wrap gap-3 justify-center">
        <Button onClick={() => navigate('/dashboard')} className="gap-2">
          Back to dashboard <ArrowRight className="h-4 w-4" />
        </Button>
        <Button variant="outline" onClick={() => navigate('/library')}>
          Browse library
        </Button>
      </div>
    </motion.div>
  );
}
