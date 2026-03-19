/**
 * Flashcard Generator Component
 * 
 * Generates flashcards from book/chapter content using AI.
 * Supports different difficulty levels and categories.
 * Saves session results to learning_progress for certification.
 */

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Brain,
  Loader2,
  Sparkles,
  BookOpen,
  ChevronRight,
  Download,
  Eye,
  X,
  GraduationCap,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { FlashcardDeck, FlashcardViewer, Flashcard, FlashcardSessionResult } from './FlashcardDeck';
import { createLogger } from '@/lib/logger';

const logger = createLogger('FlashcardGenerator');

interface FlashcardGeneratorProps {
  bookId: string;
  bookTitle: string;
  currentChapter?: number;
  totalChapters: number;
  variant?: 'button' | 'inline';
  className?: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

type FlashcardScope = 'chapter' | 'book';
type FlashcardDifficulty = 'easy' | 'medium' | 'hard' | 'mixed';

export function FlashcardGenerator({
  bookId,
  bookTitle,
  currentChapter,
  totalChapters,
  variant = 'button',
  className,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: FlashcardGeneratorProps) {
  const { toast } = useToast();
  
  const [internalOpen, setInternalOpen] = useState(false);
  const dialogOpen = controlledOpen ?? internalOpen;
  const setDialogOpen = controlledOnOpenChange ?? setInternalOpen;
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedDeck, setGeneratedDeck] = useState<FlashcardDeck | null>(null);
  const [showViewer, setShowViewer] = useState(false);
  
  // Generation options
  const [scope, setScope] = useState<FlashcardScope>(currentChapter ? 'chapter' : 'book');
  const [difficulty, setDifficulty] = useState<FlashcardDifficulty>('mixed');
  const [cardCount, setCardCount] = useState(10);

  const handleGenerate = useCallback(async () => {
    setIsGenerating(true);

    try {
      const { data, error } = await supabase.functions.invoke('generate-learning-deck', {
        body: {
          bookId,
          bookTitle,
          type: 'flashcards',
          params: {
            scope,
            chapterNumbers: scope === 'chapter' && currentChapter ? [currentChapter] : undefined,
            cardCount,
            difficulty,
          },
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      // Transform AI response to flashcard format
      const cards: Flashcard[] = (data.cards || []).map((card: any, index: number) => ({
        id: `card-${index}`,
        front: card.question || card.front,
        back: card.answer || card.back,
        category: card.category || card.topic,
        difficulty: card.difficulty || 'medium',
      }));

      const deck: FlashcardDeck = {
        id: `deck-${Date.now()}`,
        title: `${bookTitle} - Flashcards`,
        description: scope === 'chapter' 
          ? `Chapter ${currentChapter} flashcards`
          : 'Full book flashcards',
        cards,
        createdAt: new Date().toISOString(),
        sourceBookId: bookId,
        sourceChapter: scope === 'chapter' ? currentChapter : undefined,
      };

      setGeneratedDeck(deck);
      toast({
        title: 'Flashcards Generated!',
        description: `${cards.length} cards ready for study.`,
      });
    } catch (err) {
      console.error('[Flashcards] Generation error:', err);
      toast({
        title: 'Generation Failed',
        description: err instanceof Error ? err.message : 'Could not generate flashcards',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  }, [bookId, bookTitle, scope, currentChapter, cardCount, difficulty, toast]);

  const renderTrigger = () => {
    if (variant === 'button') {
      return (
        <Button variant="outline" className={cn('gap-2', className)}>
          <Brain className="h-4 w-4" />
          Flashcards
          <Sparkles className="h-3 w-3" />
        </Button>
      );
    }

    return (
      <Button variant="ghost" size="sm" className={cn('gap-1.5 text-xs', className)}>
        <Brain className="h-4 w-4" />
        <span>Flashcards</span>
        <Sparkles className="h-3 w-3" />
      </Button>
    );
  };

  // If showing viewer, render fullscreen
  if (showViewer && generatedDeck) {
    return (
      <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm p-4">
        <FlashcardViewer
          deck={generatedDeck}
          onClose={() => setShowViewer(false)}
          className="max-w-2xl mx-auto h-full"
        />
      </div>
    );
  }

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogTrigger asChild>
        {renderTrigger()}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            Generate Flashcards
          </DialogTitle>
          <DialogDescription>
            Create flashcards from book content for quick memorization and review.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Generated deck preview */}
          {generatedDeck ? (
            <div className="space-y-4">
              <div className="p-4 rounded-lg bg-primary/10 border border-primary/30">
                <div className="flex items-center gap-2 mb-2">
                  <GraduationCap className="h-5 w-5 text-primary" />
                  <span className="font-medium">Deck Ready!</span>
                </div>
                <p className="text-sm text-muted-foreground">
                  {generatedDeck.cards.length} flashcards generated from {scope === 'chapter' ? `Chapter ${currentChapter}` : 'the full book'}.
                </p>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="default"
                  className="flex-1 gap-2"
                  onClick={() => {
                    setDialogOpen(false);
                    setShowViewer(true);
                  }}
                >
                  <Eye className="h-4 w-4" />
                  Start Studying
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setGeneratedDeck(null)}
                >
                  <Zap className="h-4 w-4 mr-1" />
                  New Deck
                </Button>
              </div>
            </div>
          ) : (
            <>
              {/* Scope selection */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Scope</Label>
                  <Select value={scope} onValueChange={(v) => setScope(v as FlashcardScope)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="chapter">Current Chapter</SelectItem>
                      <SelectItem value="book">Full Book</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Difficulty</Label>
                  <Select value={difficulty} onValueChange={(v) => setDifficulty(v as FlashcardDifficulty)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="easy">Easy</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="hard">Hard</SelectItem>
                      <SelectItem value="mixed">Mixed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Card count */}
              <div className="space-y-2">
                <Label>Number of Cards: {cardCount}</Label>
                <Slider
                  value={[cardCount]}
                  onValueChange={([v]) => setCardCount(v)}
                  min={5}
                  max={30}
                  step={1}
                  className="mt-2"
                />
              </div>

              {/* Generate button */}
              <Button
                variant="hero"
                className="w-full gap-2"
                onClick={handleGenerate}
                disabled={isGenerating}
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Generate Flashcards
                  </>
                )}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Compact button for inline use
export function FlashcardButton(props: FlashcardGeneratorProps) {
  return <FlashcardGenerator {...props} variant="inline" />;
}
