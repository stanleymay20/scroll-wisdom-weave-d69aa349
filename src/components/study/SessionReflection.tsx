/**
 * SessionReflection — single open-prompt that gets AI-graded via the
 * existing grade-think-answer edge function. Falls back gracefully if the
 * edge call fails (treats it as a "good faith" reflection score of 3).
 */
import { useState } from 'react';
import { motion } from 'framer-motion';
import { PenLine, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';

interface SessionReflectionProps {
  bookTitle: string | null;
  onComplete: (score: number | null) => void;
}

const PROMPT = "What's one idea from today's session you want to remember tomorrow — and why does it matter to you?";

export function SessionReflection({ bookTitle, onComplete }: SessionReflectionProps) {
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (text.trim().length < 10) {
      onComplete(null);
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await supabase.functions.invoke('grade-think-answer', {
        body: {
          question: PROMPT,
          answer: text.trim(),
          bookTitle: bookTitle || 'Today\'s session',
          chapterTitle: 'Deep Study Reflection',
        },
      });
      const grade = typeof data?.grade === 'number' ? Math.max(1, Math.min(5, data.grade)) : 3;
      onComplete(grade);
    } catch {
      onComplete(3); // graceful fallback
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
    >
      <Card className="bg-card border-primary/10">
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
            <PenLine className="h-3.5 w-3.5" /> Reflection
          </div>
          <p className="text-base sm:text-lg text-foreground leading-relaxed">{PROMPT}</p>
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="A few sentences is enough…"
            rows={5}
            className="resize-none text-foreground caret-foreground"
            disabled={submitting}
          />
          <div className="flex items-center justify-between gap-3">
            <Button variant="ghost" onClick={() => onComplete(null)} disabled={submitting}>
              Skip
            </Button>
            <Button onClick={submit} disabled={submitting || text.trim().length < 10} className="gap-2">
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {submitting ? 'Scoring…' : 'Finish session'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
