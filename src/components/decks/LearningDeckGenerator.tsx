/**
 * VLD-1.0: Learning Deck Generator Component
 * 
 * UI for generating verified learning decks from book content.
 * Shows eligibility status, generation options, and full slide preview.
 */

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Presentation,
  Lock,
  Unlock,
  Download,
  Eye,
  Loader2,
  BookOpen,
  GraduationCap,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Users,
  FileText,
  ChevronRight,
  X,
  FileDown,
} from 'lucide-react';
import { exportToPowerPoint, downloadBlob } from '@/lib/exportLearningDeck';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { useToast } from '@/hooks/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';
import { useLearningDeckEligibility } from '@/hooks/useLearningDeckEligibility';
import { supabase } from '@/integrations/supabase/client';
import {
  DeckScope,
  TargetAudience,
  DeckTone,
  VLD_ELIGIBILITY,
  VLD_COPY,
  LearningDeck,
  DeckGenerationParams,
} from '@/lib/learningDeckContract';
import { cn } from '@/lib/utils';
import SlideViewer from './SlideViewer';

interface LearningDeckGeneratorProps {
  bookId: string;
  bookTitle: string;
  bookVersion?: string;
  userId: string | null;
  totalChapters: number;
  currentChapter?: number;
  contentHash?: string;
  className?: string;
  variant?: 'button' | 'card' | 'inline';
}

export function LearningDeckGenerator({
  bookId,
  bookTitle,
  bookVersion = '1.0',
  userId,
  totalChapters,
  currentChapter,
  contentHash = '',
  className,
  variant = 'button',
}: LearningDeckGeneratorProps) {
  const { t } = useLanguage();
  const { toast } = useToast();

  // Generation settings
  const [scope, setScope] = useState<DeckScope>(currentChapter ? 'chapter' : 'book');
  const [targetAudience, setTargetAudience] = useState<TargetAudience>('student');
  const [tone, setTone] = useState<DeckTone>('academic');
  const [maxSlides, setMaxSlides] = useState<number>(VLD_ELIGIBILITY.MAX_SLIDES_DEFAULT);
  const [includeVisuals, setIncludeVisuals] = useState(true);

  // UI state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedDeck, setGeneratedDeck] = useState<LearningDeck | null>(null);
  const [showViewer, setShowViewer] = useState(false);

  // Eligibility check
  const targetChapters = scope === 'chapter' && currentChapter ? [currentChapter] : undefined;
  const { eligibility, isLoading, refresh } = useLearningDeckEligibility({
    bookId,
    userId,
    totalChapters,
    scope,
    targetChapters,
  });

  const isEligible = eligibility?.isEligible ?? false;

  // Generate deck - always allowed for basic tier
  const handleGenerate = useCallback(async () => {
    // Basic tier is always eligible unless integrity flags
    if (eligibility?.hasIntegrityFlags) {
      toast({
        title: VLD_COPY.lockedTitle,
        description: eligibility?.reason || VLD_COPY.lockedDescription,
        variant: 'destructive',
      });
      return;
    }

    setIsGenerating(true);

    try {
      const params: DeckGenerationParams = {
        scope,
        chapterNumbers: targetChapters,
        targetAudience,
        tone,
        maxSlides,
        includeVisuals,
        certificationContext: {
          bookId,
          bookVersion,
          contentHash,
        },
      };

      const { data, error } = await supabase.functions.invoke('generate-learning-deck', {
        body: { 
          bookId, 
          params,
          bookTitle,
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setGeneratedDeck(data.deck);
      
      toast({
        title: 'Deck Generated!',
        description: `${data.deck.slides.length} slides created successfully.`,
      });
    } catch (err) {
      console.error('[VLD] Generation error:', err);
      toast({
        title: 'Generation Failed',
        description: err instanceof Error ? err.message : 'Could not generate deck',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  }, [
    isEligible, eligibility, scope, targetChapters, targetAudience, 
    tone, maxSlides, includeVisuals, bookId, bookVersion, contentHash, bookTitle, toast
  ]);

  // Export deck as PDF
  // Export deck as PowerPoint
  const [isExporting, setIsExporting] = useState(false);
  
  const handleExportPPTX = useCallback(async () => {
    if (!generatedDeck) return;
    setIsExporting(true);

    try {
      const blob = await exportToPowerPoint(generatedDeck, bookTitle);
      const filename = `${bookTitle.replace(/[^a-zA-Z0-9]/g, '_')}_LearningDeck.pptx`;
      downloadBlob(blob, filename);

      toast({ title: 'PowerPoint Exported', description: 'PPTX downloaded successfully.' });
    } catch (err) {
      console.error('[VLD] Export error:', err);
      toast({
        title: 'Export Failed',
        description: 'Could not export PowerPoint',
        variant: 'destructive',
      });
    } finally {
      setIsExporting(false);
    }
  }, [generatedDeck, bookTitle, toast]);

  // Render eligibility progress with two-tier display
  const renderEligibilityProgress = () => {
    if (!eligibility) return null;

    const readPercent = (eligibility.chaptersRead.length / eligibility.chaptersRequired.length) * 100;
    const quizPassPercent = eligibility.quizzesPassed 
      ? (eligibility.quizzesPassed.length / eligibility.quizzesRequired.length) * 100 
      : 0;

    return (
      <div className="space-y-3">
        {/* Current Tier Badge */}
        <div className="flex items-center gap-2">
          <Badge variant={eligibility.tier === 'premium' ? 'default' : 'secondary'}>
            {eligibility.tier === 'premium' ? '⭐ Premium Tier' : '📄 Basic Tier'}
          </Badge>
          {eligibility.tier === 'basic' && (
            <span className="text-xs text-muted-foreground">
              Complete requirements for premium certification deck
            </span>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="flex items-center gap-1.5">
              <BookOpen className="h-3.5 w-3.5" />
              Reading Progress
            </span>
            <span className="text-muted-foreground">
              {eligibility.chaptersRead.length}/{eligibility.chaptersRequired.length} chapters (80% needed for premium)
            </span>
          </div>
          <Progress value={readPercent} className="h-2" />
        </div>
        <div>
          <div className="flex items-center justify-between text-sm mb-1">
            <span className="flex items-center gap-1.5">
              <GraduationCap className="h-3.5 w-3.5" />
              Quizzes Passed
            </span>
            <span className="text-muted-foreground">
              {eligibility.quizzesPassed?.length || 0}/{eligibility.quizzesRequired.length} quizzes (70% needed for premium)
            </span>
          </div>
          <Progress value={quizPassPercent} className="h-2" />
        </div>
        
        {/* Premium blocker message */}
        {eligibility.premiumBlocker && (
          <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
            <AlertCircle className="h-3 w-3" />
            {eligibility.premiumBlocker}
          </p>
        )}
      </div>
    );
  };

  // Render the main trigger based on variant
  const renderTrigger = () => {
    const baseContent = (
      <>
        {isEligible ? (
          <Unlock className="h-4 w-4" />
        ) : (
          <Lock className="h-4 w-4" />
        )}
        <span>Generate Learning Deck</span>
        {isEligible && <Sparkles className="h-3 w-3" />}
      </>
    );

    if (variant === 'button') {
      return (
        <Button
          variant={isEligible ? 'hero' : 'outline'}
          className={cn('gap-2', className)}
          disabled={isLoading}
        >
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : baseContent}
        </Button>
      );
    }

    if (variant === 'card') {
      return (
        <div className={cn(
          'p-4 rounded-xl border transition-all cursor-pointer',
          isEligible 
            ? 'bg-gradient-to-r from-scroll-gold/10 to-primary/10 border-scroll-gold/30 hover:border-scroll-gold/60' 
            : 'bg-muted/30 border-border/50 hover:border-border',
          className
        )}>
          <div className="flex items-center gap-3">
            <div className={cn(
              'p-2 rounded-lg',
              isEligible ? 'bg-scroll-gold/20 text-scroll-gold' : 'bg-muted text-muted-foreground'
            )}>
              <Presentation className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <p className="font-medium">{VLD_COPY.title}</p>
              <p className="text-xs text-muted-foreground">{VLD_COPY.tagline}</p>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </div>
          {!isEligible && eligibility?.reason && (
            <p className="text-xs text-amber-600 mt-2">{eligibility.reason}</p>
          )}
        </div>
      );
    }

    // Inline variant
    return (
      <Button variant="ghost" size="sm" className={cn('gap-1.5 text-xs', className)}>
        {baseContent}
      </Button>
    );
  };

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogTrigger asChild>
        {renderTrigger()}
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Presentation className="h-5 w-5 text-scroll-gold" />
            {VLD_COPY.title}
          </DialogTitle>
          <DialogDescription>{VLD_COPY.description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Eligibility Status - Always show, always eligible for basic tier */}
          <div className={cn(
            'p-4 rounded-lg border',
            eligibility?.tier === 'premium'
              ? 'bg-scroll-gold/10 border-scroll-gold/30' 
              : 'bg-emerald-500/10 border-emerald-500/30'
          )}>
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              <span className="font-medium">
                {eligibility?.tier === 'premium' ? '⭐ Premium Deck Ready' : 'Basic Deck Ready'}
              </span>
            </div>
            {renderEligibilityProgress()}
          </div>

          {/* Generation Options - Always show since basic tier is always eligible */}
          <div className="space-y-4">
            {/* Scope */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Scope</Label>
                <Select value={scope} onValueChange={(v) => setScope(v as DeckScope)}>
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
                <Label>Target Audience</Label>
                <Select value={targetAudience} onValueChange={(v) => setTargetAudience(v as TargetAudience)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="student">Student</SelectItem>
                    <SelectItem value="lecturer">Lecturer</SelectItem>
                    <SelectItem value="employer">Employer</SelectItem>
                    <SelectItem value="peer-teaching">Peer Teaching</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tone</Label>
                <Select value={tone} onValueChange={(v) => setTone(v as DeckTone)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="academic">Academic</SelectItem>
                    <SelectItem value="simple">Simple</SelectItem>
                    <SelectItem value="visual">Visual-First</SelectItem>
                    <SelectItem value="children">Children-Friendly</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Max Slides: {maxSlides}</Label>
                <Slider
                  value={[maxSlides]}
                  onValueChange={([v]) => setMaxSlides(v)}
                  min={5}
                  max={eligibility?.tier === 'premium' ? VLD_ELIGIBILITY.PREMIUM_MAX_SLIDES : VLD_ELIGIBILITY.MAX_SLIDES_LIMIT}
                  step={1}
                  className="mt-3"
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="include-visuals" className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Include Visuals
              </Label>
              <Switch
                id="include-visuals"
                checked={includeVisuals}
                onCheckedChange={setIncludeVisuals}
              />
            </div>
          </div>

          {/* Generated Deck Preview */}
          {generatedDeck && !showViewer && (
            <div className="p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  Deck Ready
                </span>
                <Badge variant="secondary">{generatedDeck.slides.length} slides</Badge>
              </div>
              <p className="text-sm text-muted-foreground mb-3">
                Generated from {generatedDeck.metadata.chaptersCovered?.length || 'all'} chapter(s)
              </p>
              <div className="flex gap-2">
                <Button 
                  variant="default" 
                  size="sm" 
                  onClick={() => setShowViewer(true)} 
                  className="gap-1.5"
                >
                  <Eye className="h-3.5 w-3.5" />
                  View Slides
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleExportPPTX} 
                  className="gap-1.5"
                  disabled={isExporting}
                >
                  {isExporting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <FileDown className="h-3.5 w-3.5" />
                  )}
                  Export PPTX
                </Button>
              </div>
            </div>
          )}

          {/* Full Slide Viewer */}
          {generatedDeck && showViewer && (
            <SlideViewer 
              deck={generatedDeck} 
              onClose={() => setShowViewer(false)}
              className="min-h-[400px]"
            />
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setDialogOpen(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleGenerate}
            disabled={isGenerating}
            variant="hero"
            className="gap-2"
          >
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Generate {eligibility?.tier === 'premium' ? 'Premium' : 'Basic'} Deck
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Compact button for sidebar/floating actions
export function LearningDeckButton({
  onClick,
  isLocked,
  progress,
}: {
  onClick: () => void;
  isLocked: boolean;
  progress?: number;
}) {
  return (
    <Button
      onClick={onClick}
      variant={isLocked ? 'outline' : 'default'}
      size="sm"
      className={cn(
        'gap-2',
        isLocked && 'opacity-70'
      )}
      title={isLocked ? `Complete ${100 - (progress || 0)}% more to unlock` : 'Generate Learning Deck'}
    >
      {isLocked ? (
        <>
          <Lock className="h-4 w-4" />
          <span className="text-xs">🔒 {Math.round(progress || 0)}%</span>
        </>
      ) : (
        <>
          <Presentation className="h-4 w-4" />
          <span className="text-xs">Deck</span>
        </>
      )}
    </Button>
  );
}
