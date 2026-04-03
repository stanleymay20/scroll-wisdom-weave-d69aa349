/**
 * Concept Matching Exercise
 * 
 * Interactive matching exercise: connect concepts to their definitions and examples.
 * Rendered as clickable cards with visual feedback.
 */

import { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Puzzle,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface MatchPair {
  concept: string;
  definition: string;
  example?: string;
}

interface ConceptMatcherProps {
  chapterContent: string;
  chapterTitle: string;
  bookTitle: string;
  onComplete?: (score: number) => void;
}

export function ConceptMatcher({
  chapterContent,
  chapterTitle,
  bookTitle,
  onComplete,
}: ConceptMatcherProps) {
  const { toast } = useToast();
  const [pairs, setPairs] = useState<MatchPair[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedConcept, setSelectedConcept] = useState<number | null>(null);
  const [matches, setMatches] = useState<Map<number, number>>(new Map());
  const [revealed, setRevealed] = useState(false);
  const [wrongMatch, setWrongMatch] = useState<{ concept: number; def: number } | null>(null);

  // Shuffle definitions independently
  const shuffledDefIndices = useMemo(() => {
    const indices = pairs.map((_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    return indices;
  }, [pairs]);

  const generatePairs = useCallback(async () => {
    setIsGenerating(true);
    setPairs([]);
    setMatches(new Map());
    setRevealed(false);
    setSelectedConcept(null);
    setWrongMatch(null);

    try {
      const { data, error } = await supabase.functions.invoke('interactive-qa', {
        body: {
          question: `Extract 5 key concept-definition pairs from the chapter "${chapterTitle}" from "${bookTitle}".

Return JSON array: [
  { "concept": "term", "definition": "concise definition", "example": "brief example" },
  ...
]

Chapter content: ${chapterContent.slice(0, 4000)}`,
          chapterContent: chapterContent.slice(0, 2000),
          bookTitle,
          mode: 'evaluate',
        },
      });

      if (error) throw error;
      const responseText = data?.answer || data?.response || '';
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (Array.isArray(parsed) && parsed.length >= 3) {
          setPairs(parsed.slice(0, 6));
        } else throw new Error('Not enough pairs');
      } else throw new Error('Parse failed');
    } catch (e) {
      console.error('[ConceptMatcher] Error:', e);
      toast({ title: 'Generation failed', variant: 'destructive' });
    } finally {
      setIsGenerating(false);
    }
  }, [chapterContent, chapterTitle, bookTitle, toast]);

  const handleConceptClick = (index: number) => {
    if (revealed || matches.has(index)) return;
    setSelectedConcept(index);
    setWrongMatch(null);
  };

  const handleDefClick = (shuffledIdx: number) => {
    if (revealed || selectedConcept === null) return;
    const actualDefIndex = shuffledDefIndices[shuffledIdx];
    
    // Check reverse — is this definition already matched?
    const alreadyMatched = Array.from(matches.values()).includes(actualDefIndex);
    if (alreadyMatched) return;

    if (actualDefIndex === selectedConcept) {
      // Correct match!
      const newMatches = new Map(matches);
      newMatches.set(selectedConcept, actualDefIndex);
      setMatches(newMatches);
      setSelectedConcept(null);

      if (newMatches.size === pairs.length) {
        setRevealed(true);
        const score = 100;
        onComplete?.(score);
        toast({ title: '🎉 All matched correctly!' });
      }
    } else {
      // Wrong match
      setWrongMatch({ concept: selectedConcept, def: shuffledIdx });
      setTimeout(() => {
        setWrongMatch(null);
        setSelectedConcept(null);
      }, 800);
    }
  };

  if (pairs.length === 0 && !isGenerating) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border border-border/50 bg-card/80 backdrop-blur-sm p-5 text-center space-y-4"
      >
        <div className="inline-flex p-3 rounded-full bg-purple-500/10">
          <Puzzle className="h-8 w-8 text-purple-500" />
        </div>
        <h3 className="text-lg font-semibold">Concept Matching</h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Match concepts to their definitions. Tests recall and understanding.
        </p>
        <Button onClick={generatePairs} className="gap-2">
          <Sparkles className="h-4 w-4" />
          Generate Exercise
        </Button>
      </motion.div>
    );
  }

  if (isGenerating) {
    return (
      <div className="rounded-xl border border-border/50 bg-card/80 p-8 text-center">
        <Loader2 className="h-8 w-8 animate-spin mx-auto mb-3 text-primary" />
        <p className="text-sm text-muted-foreground">Extracting concepts...</p>
      </div>
    );
  }

  const matchedCount = matches.size;
  const totalPairs = pairs.length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-border/50 bg-card/80 backdrop-blur-sm overflow-hidden"
    >
      <div className="p-4 border-b border-border/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Puzzle className="h-4 w-4 text-purple-500" />
          <span className="font-semibold text-sm">Concept Matching</span>
        </div>
        <Badge variant="outline" className="text-xs">
          {matchedCount}/{totalPairs} matched
        </Badge>
      </div>

      <div className="p-4 space-y-4">
        <p className="text-xs text-muted-foreground">
          Click a concept (left), then click its matching definition (right).
        </p>

        <div className="grid grid-cols-2 gap-3">
          {/* Concepts column */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground mb-1">Concepts</p>
            {pairs.map((pair, i) => {
              const isMatched = matches.has(i);
              const isSelected = selectedConcept === i;
              return (
                <motion.button
                  key={`c-${i}`}
                  onClick={() => handleConceptClick(i)}
                  className={cn(
                    "w-full text-left p-2.5 rounded-lg border text-sm transition-all",
                    isMatched && "bg-emerald-500/10 border-emerald-500/30 text-emerald-600",
                    isSelected && !isMatched && "bg-primary/10 border-primary/30 ring-2 ring-primary/20",
                    !isMatched && !isSelected && "bg-muted/30 border-border/50 hover:bg-muted/50 cursor-pointer",
                    isMatched && "cursor-default",
                  )}
                  whileTap={!isMatched ? { scale: 0.97 } : undefined}
                >
                  <span className="font-medium">{pair.concept}</span>
                  {isMatched && <CheckCircle2 className="h-3.5 w-3.5 inline ml-2 text-emerald-500" />}
                </motion.button>
              );
            })}
          </div>

          {/* Definitions column (shuffled) */}
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground mb-1">Definitions</p>
            {shuffledDefIndices.map((actualIdx, shuffledIdx) => {
              const isMatched = Array.from(matches.values()).includes(actualIdx);
              const isWrong = wrongMatch?.def === shuffledIdx;
              return (
                <motion.button
                  key={`d-${shuffledIdx}`}
                  onClick={() => handleDefClick(shuffledIdx)}
                  className={cn(
                    "w-full text-left p-2.5 rounded-lg border text-xs transition-all",
                    isMatched && "bg-emerald-500/10 border-emerald-500/30 text-emerald-600",
                    isWrong && "bg-destructive/10 border-destructive/30 animate-pulse",
                    !isMatched && !isWrong && selectedConcept !== null && "hover:bg-primary/5 hover:border-primary/20 cursor-pointer",
                    !isMatched && selectedConcept === null && "bg-muted/30 border-border/50",
                  )}
                  whileTap={!isMatched ? { scale: 0.97 } : undefined}
                  animate={isWrong ? { x: [0, -5, 5, -3, 3, 0] } : {}}
                >
                  {pairs[actualIdx].definition}
                  {isMatched && <CheckCircle2 className="h-3 w-3 inline ml-1 text-emerald-500" />}
                  {isWrong && <XCircle className="h-3 w-3 inline ml-1 text-destructive" />}
                </motion.button>
              );
            })}
          </div>
        </div>

        {revealed && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
            {pairs.some(p => p.example) && (
              <div className="bg-muted/30 rounded-lg p-3">
                <p className="text-xs font-medium mb-2">📝 Examples</p>
                {pairs.filter(p => p.example).map((p, i) => (
                  <p key={i} className="text-xs text-muted-foreground mb-1">
                    <strong>{p.concept}:</strong> {p.example}
                  </p>
                ))}
              </div>
            )}
            <Button onClick={generatePairs} variant="outline" className="w-full gap-2">
              <RotateCcw className="h-4 w-4" />
              New Exercise
            </Button>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
