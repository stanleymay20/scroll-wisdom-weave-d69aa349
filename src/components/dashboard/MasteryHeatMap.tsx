/**
 * Mastery Heat Map — Visual chapter-by-chapter mastery display
 * 
 * Shows red → yellow → green heat map of mastery levels per chapter
 * with actionable focus recommendations.
 */

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Flame, BookOpen, Target } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';

interface ChapterMastery {
  chapterNumber: number;
  chapterTitle: string;
  quizScore: number;
  bloomLevel: string;
  attemptsCount: number;
  masteryLevel: 'none' | 'developing' | 'competent' | 'proficient' | 'mastery';
}

interface MasteryHeatMapProps {
  userId: string;
  bookId: string;
  totalChapters: number;
}

function getMasteryLevel(score: number, attempts: number): ChapterMastery['masteryLevel'] {
  if (attempts === 0) return 'none';
  if (score >= 90) return 'mastery';
  if (score >= 75) return 'proficient';
  if (score >= 55) return 'competent';
  return 'developing';
}

function getMasteryColor(level: ChapterMastery['masteryLevel']): string {
  switch (level) {
    case 'mastery': return 'bg-emerald-500 text-white';
    case 'proficient': return 'bg-emerald-400/80 text-white';
    case 'competent': return 'bg-amber-400 text-amber-900';
    case 'developing': return 'bg-red-400/80 text-white';
    case 'none': return 'bg-muted/40 text-muted-foreground';
  }
}

export function MasteryHeatMap({ userId, bookId, totalChapters }: MasteryHeatMapProps) {
  const [chapters, setChapters] = useState<ChapterMastery[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [chaptersRes, progressRes] = await Promise.all([
          supabase
            .from('chapters')
            .select('chapter_number, title')
            .eq('book_id', bookId)
            .order('chapter_number'),
          supabase
            .from('learning_progress')
            .select('chapter_id, score, bloom_level, created_at')
            .eq('user_id', userId)
            .eq('book_id', bookId),
        ]);

        const chapterData = chaptersRes.data || [];
        const progressData = progressRes.data || [];

        // Build chapter ID → progress map
        const chapterProgressMap = new Map<string, { scores: number[]; blooms: string[] }>();
        for (const p of progressData) {
          if (!p.chapter_id) continue;
          if (!chapterProgressMap.has(p.chapter_id)) {
            chapterProgressMap.set(p.chapter_id, { scores: [], blooms: [] });
          }
          const entry = chapterProgressMap.get(p.chapter_id)!;
          entry.scores.push(Number(p.score));
          entry.blooms.push(p.bloom_level);
        }

        // Also get chapter IDs
        const chapterIdsRes = await supabase
          .from('chapters')
          .select('id, chapter_number')
          .eq('book_id', bookId);
        
        const chapterIdMap = new Map((chapterIdsRes.data || []).map(c => [c.chapter_number, c.id]));

        const masteryData: ChapterMastery[] = chapterData.map(ch => {
          const chId = chapterIdMap.get(ch.chapter_number);
          const progress = chId ? chapterProgressMap.get(chId) : undefined;
          const avgScore = progress && progress.scores.length > 0
            ? progress.scores.reduce((a, b) => a + b, 0) / progress.scores.length
            : 0;
          const highestBloom = progress?.blooms.length 
            ? progress.blooms[progress.blooms.length - 1] 
            : 'none';

          return {
            chapterNumber: ch.chapter_number,
            chapterTitle: ch.title,
            quizScore: Math.round(avgScore),
            bloomLevel: highestBloom,
            attemptsCount: progress?.scores.length || 0,
            masteryLevel: getMasteryLevel(avgScore, progress?.scores.length || 0),
          };
        });

        setChapters(masteryData);
      } catch (e) {
        console.error('[MasteryHeatMap] Error:', e);
      } finally {
        setIsLoading(false);
      }
    };

    if (userId && bookId) fetchData();
  }, [userId, bookId]);

  if (isLoading || chapters.length === 0) return null;

  const weakChapters = chapters.filter(c => c.masteryLevel === 'developing' || c.masteryLevel === 'none');
  const masteredCount = chapters.filter(c => c.masteryLevel === 'mastery' || c.masteryLevel === 'proficient').length;
  const overallMastery = Math.round((masteredCount / chapters.length) * 100);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-border/50 bg-card/80 backdrop-blur-sm p-4 space-y-4"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Flame className="h-4 w-4 text-orange-500" />
          <span className="font-semibold text-sm">Mastery Heat Map</span>
        </div>
        <Badge variant="outline" className="text-xs">
          {overallMastery}% mastered
        </Badge>
      </div>

      {/* Heat map grid */}
      <div className="grid grid-cols-5 sm:grid-cols-8 md:grid-cols-10 gap-1.5">
        {chapters.map((ch, i) => (
          <motion.div
            key={ch.chapterNumber}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.02 }}
            className={cn(
              "aspect-square rounded-md flex items-center justify-center text-xs font-bold cursor-default transition-transform hover:scale-110",
              getMasteryColor(ch.masteryLevel),
            )}
            title={`Ch ${ch.chapterNumber}: ${ch.chapterTitle} — ${ch.quizScore}% (${ch.attemptsCount} attempts)`}
          >
            {ch.chapterNumber}
          </motion.div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-muted/40" /> None</div>
        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-red-400/80" /> Developing</div>
        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-amber-400" /> Competent</div>
        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-emerald-400/80" /> Proficient</div>
        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-emerald-500" /> Mastery</div>
      </div>

      {/* Focus recommendation */}
      {weakChapters.length > 0 && (
        <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-3">
          <p className="text-xs font-medium text-amber-600 flex items-center gap-1 mb-1">
            <Target className="h-3 w-3" /> Focus Areas
          </p>
          <p className="text-xs text-muted-foreground">
            {weakChapters.slice(0, 3).map(c => `Ch ${c.chapterNumber}`).join(', ')} need more practice
          </p>
        </div>
      )}
    </motion.div>
  );
}
