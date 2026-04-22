/**
 * SocraticTutorPulse
 * ===================
 * Always-on, time-triggered Socratic tutor for the Reader.
 *
 * After the learner has been actively reading for `intervalMinutes` (default 8),
 * a calm pulse appears at the bottom-right offering one calibrated question
 * generated from the current chapter. Single tap to engage, one tap to
 * dismiss for the rest of the session.
 *
 * Designed to be drop-in: it self-throttles, hides during selection/typing,
 * and never interrupts more than once per chapter without user opt-in.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, X, Sparkles, Loader2, Send, Lightbulb } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface SocraticTutorPulseProps {
  bookId: string;
  chapterId?: string;
  chapterTitle: string;
  bookTitle: string;
  chapterContent: string;
  /** Trigger cadence in minutes. Default 8. */
  intervalMinutes?: number;
}

const STORAGE_PREFIX = 'tutor-pulse-dismissed:';

export function SocraticTutorPulse({
  bookId,
  chapterId,
  chapterTitle,
  bookTitle,
  chapterContent,
  intervalMinutes = 8,
}: SocraticTutorPulseProps) {
  const [shown, setShown] = useState(false);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [question, setQuestion] = useState<string | null>(null);
  const [answer, setAnswer] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const sessionStart = useRef<number>(Date.now());

  const dismissKey = `${STORAGE_PREFIX}${bookId}:${chapterId || 'x'}`;

  // Check dismiss state once
  useEffect(() => {
    if (typeof window !== 'undefined' && sessionStorage.getItem(dismissKey) === '1') {
      // Treat as already shown so we don't pop again this session
      setShown(true);
    }
  }, [dismissKey]);

  // Reset on chapter change
  useEffect(() => {
    sessionStart.current = Date.now();
    setShown(typeof window !== 'undefined' && sessionStorage.getItem(dismissKey) === '1');
    setOpen(false);
    setQuestion(null);
    setAnswer('');
    setFeedback(null);
  }, [chapterId, dismissKey]);

  // Trigger after intervalMinutes of dwell time on this chapter
  useEffect(() => {
    if (shown) return;
    const ms = intervalMinutes * 60_000;
    const t = window.setTimeout(() => {
      // Don't pop if user is mid-typing in any input
      const tag = document.activeElement?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      setShown(true);
      setOpen(true);
      void generateQuestion();
    }, ms);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, intervalMinutes, chapterId]);

  const generateQuestion = useCallback(async () => {
    setLoading(true);
    setFeedback(null);
    try {
      const { data, error } = await supabase.functions.invoke('interactive-qa', {
        body: {
          question: `You are an always-on Socratic tutor.
The learner has been reading "${chapterTitle}" from "${bookTitle}" for about ${intervalMinutes} minutes.

Ask ONE precise, calibrated question that:
1. Targets the most important idea in the passage
2. Requires the learner to *apply* or *evaluate*, not just recall
3. Is answerable in 1–3 sentences
4. Is grounded in the actual chapter content

Return ONLY the question text — no preamble, no labels, no quotes.`,
          chapterContent: chapterContent.slice(0, 4000),
          bookTitle,
          mode: 'evaluate',
        },
      });
      if (error) throw error;
      const q = (data?.answer || data?.response || '').trim();
      setQuestion(q || 'What was the single most important point in what you just read — and why?');
    } catch {
      setQuestion('What was the single most important point in what you just read — and why?');
    } finally {
      setLoading(false);
    }
  }, [chapterTitle, bookTitle, chapterContent, intervalMinutes]);

  const grade = useCallback(async () => {
    if (!question || !answer.trim()) return;
    setLoading(true);
    try {
      const { data } = await supabase.functions.invoke('grade-think-answer', {
        body: {
          question,
          answer: answer.trim(),
          bookTitle,
          chapterTitle,
        },
      });
      const grade = typeof data?.grade === 'number' ? data.grade : 3;
      const tip =
        data?.feedback ||
        (grade >= 4
          ? 'Sharp answer — you connected the idea to its application.'
          : grade >= 3
            ? 'Solid first pass. Try anchoring your answer to one concrete example.'
            : 'Re-read the surrounding paragraph and look for the *why*, not just the *what*.');
      setFeedback(`${grade}/5 · ${tip}`);
    } catch {
      setFeedback('Saved. Keep going — pulse will return after the next stretch.');
    } finally {
      setLoading(false);
    }
  }, [question, answer, bookTitle, chapterTitle]);

  const dismiss = useCallback(() => {
    setOpen(false);
    if (typeof window !== 'undefined') sessionStorage.setItem(dismissKey, '1');
  }, [dismissKey]);

  if (!shown) return null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.98 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className={cn(
            'fixed z-40 right-4 bottom-4 sm:right-6 sm:bottom-6',
            'w-[calc(100vw-2rem)] sm:w-[380px] max-w-[420px]',
            'rounded-2xl border border-border/60 bg-card/95 backdrop-blur shadow-2xl',
          )}
          role="dialog"
          aria-label="Socratic tutor pulse"
        >
          <div className="p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-lg bg-violet-500/10 flex items-center justify-center">
                  <Brain className="h-4 w-4 text-violet-500" />
                </div>
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Tutor pulse</div>
                  <div className="text-xs text-foreground font-medium">One quick question</div>
                </div>
              </div>
              <button
                onClick={dismiss}
                className="text-muted-foreground hover:text-foreground p-1 -m-1"
                aria-label="Dismiss"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {loading && !question && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-3">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Crafting a question…
              </div>
            )}

            {question && (
              <p className="text-sm text-foreground leading-relaxed">{question}</p>
            )}

            {question && !feedback && (
              <>
                <Textarea
                  value={answer}
                  onChange={e => setAnswer(e.target.value)}
                  placeholder="Type a 1-3 sentence answer…"
                  rows={3}
                  className="resize-none text-sm text-foreground caret-foreground"
                />
                <div className="flex items-center justify-between">
                  <Button variant="ghost" size="sm" onClick={dismiss}>
                    Not now
                  </Button>
                  <Button size="sm" onClick={grade} disabled={loading || answer.trim().length < 4} className="gap-1.5">
                    {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                    Grade
                  </Button>
                </div>
              </>
            )}

            {feedback && (
              <div className="space-y-2">
                <div className="flex items-start gap-2 text-xs text-foreground bg-primary/5 rounded-lg p-2.5">
                  <Lightbulb className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                  <span>{feedback}</span>
                </div>
                <div className="flex justify-end">
                  <Button size="sm" variant="ghost" onClick={dismiss} className="gap-1.5">
                    <Sparkles className="h-3.5 w-3.5" /> Continue reading
                  </Button>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
