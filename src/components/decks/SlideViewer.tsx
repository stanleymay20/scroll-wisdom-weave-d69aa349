/**
 * VLD-1.0: Slide Viewer Component
 * 
 * Displays learning deck slides with NotebookLM-quality layouts,
 * AI-generated visuals, speaker notes, and "Explain this slide" feature.
 */

import { useState, useCallback, forwardRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  MessageSquare,
  Loader2,
  BookOpen,
  BarChart3,
  GitCompare,
  Lightbulb,
  CheckCircle2,
  StickyNote,
  X,
  ImageIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { LearningDeck, SlideData, SlideLayout } from '@/lib/learningDeckContract';

// Layout icon mapping
const layoutIcons: Record<string, typeof BookOpen> = {
  'title-visual': BookOpen,
  'learning-objectives': Lightbulb,
  'concept-text': BookOpen,
  'concept-visual': BarChart3,
  'diagram-focus': BarChart3,
  'comparison': GitCompare,
  'example-walkthrough': Lightbulb,
  'summary-proof': CheckCircle2,
};

// Layout background colors (semantic tokens)
const layoutStyles: Record<string, string> = {
  'title-visual': 'from-primary/20 to-scroll-gold/10',
  'learning-objectives': 'from-blue-500/10 to-cyan-500/10',
  'concept-text': 'from-background to-muted/30',
  'concept-visual': 'from-emerald-500/10 to-teal-500/10',
  'diagram-focus': 'from-purple-500/10 to-pink-500/10',
  'comparison': 'from-orange-500/10 to-amber-500/10',
  'example-walkthrough': 'from-indigo-500/10 to-blue-500/10',
  'summary-proof': 'from-scroll-gold/20 to-primary/10',
};

interface SlideViewerProps {
  deck: LearningDeck;
  onClose?: () => void;
  className?: string;
}

const SlideViewer = forwardRef<HTMLDivElement, SlideViewerProps>(
  ({ deck, onClose, className }, ref) => {
    const { toast } = useToast();
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [showNotes, setShowNotes] = useState(false);
    const [isExplaining, setIsExplaining] = useState(false);
    const [explanation, setExplanation] = useState<string | null>(null);

    const currentSlide = deck.slides[currentIndex];
    const totalSlides = deck.slides.length;
    const LayoutIcon = layoutIcons[currentSlide?.layout || 'concept-text'];

    // Navigate slides
    const goTo = useCallback((index: number) => {
      if (index >= 0 && index < totalSlides) {
        setCurrentIndex(index);
        setExplanation(null); // Clear explanation when changing slides
      }
    }, [totalSlides]);

    const goNext = useCallback(() => goTo(currentIndex + 1), [currentIndex, goTo]);
    const goPrev = useCallback(() => goTo(currentIndex - 1), [currentIndex, goTo]);

    // Keyboard navigation
    const handleKeyDown = useCallback((e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') goNext();
      if (e.key === 'ArrowLeft') goPrev();
      if (e.key === 'Escape') onClose?.();
    }, [goNext, goPrev, onClose]);

    // "Explain this slide" AI feature
    const explainSlide = useCallback(async () => {
      if (!currentSlide) return;
      
      setIsExplaining(true);
      try {
        const { data, error } = await supabase.functions.invoke('interactive-qa', {
          body: {
            type: 'explain',
            content: `Slide: ${currentSlide.heading}\n\nContent:\n${currentSlide.content.join('\n')}\n\nSource: ${currentSlide.sourceReference || 'Not specified'}`,
            context: `This is a slide from a learning deck about "${deck.title}". Explain this slide in plain, conversational language. Be helpful and clear. Keep it under 150 words.`,
          },
        });

        if (error) throw error;
        setExplanation(data?.response || 'Unable to generate explanation.');
      } catch (err) {
        console.error('[SlideViewer] Explain error:', err);
        toast({
          title: 'Explanation Failed',
          description: 'Could not explain this slide',
          variant: 'destructive',
        });
      } finally {
        setIsExplaining(false);
      }
    }, [currentSlide, deck.title, toast]);

    if (!currentSlide) return null;

    // Check if visual has a generated image (supports both url and imageUrl)
    const visualImageUrl = currentSlide.visual?.url || (currentSlide.visual as any)?.imageUrl;
    const hasGeneratedVisual = !!visualImageUrl;

    return (
      <div 
        ref={ref}
        className={cn(
          'flex flex-col bg-background rounded-xl border shadow-lg overflow-hidden',
          isFullscreen && 'fixed inset-0 z-50 rounded-none',
          className
        )}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b bg-muted/30">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="gap-1">
              <LayoutIcon className="h-3 w-3" />
              {currentSlide.layout.replace(/-/g, ' ')}
            </Badge>
            <span className="text-sm text-muted-foreground">
              {currentIndex + 1} / {totalSlides}
            </span>
            {hasGeneratedVisual && (
              <Badge variant="secondary" className="gap-1 text-xs">
                <ImageIcon className="h-3 w-3" />
                Visual
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowNotes(!showNotes)}
              className={cn(showNotes && 'bg-primary/10')}
              title="Speaker Notes"
            >
              <StickyNote className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsFullscreen(!isFullscreen)}
              title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            >
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>
            {onClose && (
              <Button variant="ghost" size="icon" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Slide Content */}
        <div className="flex-1 flex">
          <div className={cn(
            'flex-1 flex flex-col p-8 bg-gradient-to-br transition-all',
            layoutStyles[currentSlide.layout]
          )}>
            <AnimatePresence mode="wait">
              <motion.div
                key={currentIndex}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.2 }}
                className="flex-1 flex flex-col"
              >
                {/* Slide Heading */}
                <h2 className="text-2xl md:text-3xl font-bold mb-6 font-display">
                  {currentSlide.heading}
                </h2>

                {/* Main Content Area - Flexbox for visual + text */}
                <div className={cn(
                  'flex-1',
                  hasGeneratedVisual && 'grid grid-cols-1 md:grid-cols-2 gap-6'
                )}>
                  {/* AI-Generated Visual */}
                  {hasGeneratedVisual && (
                    <div className="flex items-center justify-center">
                      <motion.div
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="w-full max-w-md rounded-xl overflow-hidden shadow-lg border bg-white"
                      >
                        <img
                          src={visualImageUrl}
                          alt={currentSlide.visual!.description || currentSlide.visual!.alt || currentSlide.heading}
                          className="w-full h-auto object-contain"
                          style={{ maxHeight: isFullscreen ? '50vh' : '250px' }}
                        />
                        {currentSlide.visual?.description && (
                          <p className="text-xs text-muted-foreground p-2 text-center border-t bg-muted/30">
                            {currentSlide.visual.description.length > 80 
                              ? currentSlide.visual.description.slice(0, 80) + '...'
                              : currentSlide.visual.description}
                          </p>
                        )}
                      </motion.div>
                    </div>
                  )}

                  {/* Slide Content */}
                  <div className="flex flex-col justify-center">
                    {currentSlide.layout === 'comparison' ? (
                      // Comparison layout - two columns
                      <div className="grid grid-cols-2 gap-6">
                        {currentSlide.content.map((item, i) => (
                          <div key={i} className="p-4 rounded-lg bg-background/50 border">
                            <p className="text-base">{item}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      // Standard bullet layout
                      <ul className="space-y-3">
                        {currentSlide.content.map((bullet, i) => (
                          <motion.li
                            key={i}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.1 }}
                            className="flex items-start gap-3 text-lg"
                          >
                            <span className="w-2 h-2 rounded-full bg-primary mt-2 flex-shrink-0" />
                            <span>{bullet}</span>
                          </motion.li>
                        ))}
                      </ul>
                    )}

                    {/* Visual placeholder when no image but description exists */}
                    {!hasGeneratedVisual && currentSlide.visual && (
                      <div className="mt-6 p-4 rounded-lg bg-muted/50 border border-dashed">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <BarChart3 className="h-4 w-4" />
                          <span>Visual: {currentSlide.visual.description}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Source Reference */}
                {currentSlide.sourceReference && (
                  <p className="mt-auto pt-4 text-sm text-muted-foreground border-t border-border/50">
                    📖 Source: {currentSlide.sourceReference}
                  </p>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Speaker Notes Panel */}
          <AnimatePresence>
            {showNotes && (
              <motion.div
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 280, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                className="border-l bg-muted/20"
              >
                <ScrollArea className="h-full p-4">
                  <h4 className="font-medium text-sm mb-3 flex items-center gap-2">
                    <StickyNote className="h-4 w-4" />
                    Speaker Notes
                  </h4>
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {currentSlide.speakerNotes || 'No speaker notes for this slide.'}
                  </p>

                  {/* Explain this slide button */}
                  <div className="mt-6 pt-4 border-t">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={explainSlide}
                      disabled={isExplaining}
                      className="w-full gap-2"
                    >
                      {isExplaining ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <MessageSquare className="h-4 w-4" />
                      )}
                      Explain This Slide
                    </Button>
                    
                    {explanation && (
                      <div className="mt-3 p-3 rounded-lg bg-primary/5 border border-primary/20">
                        <p className="text-sm leading-relaxed">{explanation}</p>
                      </div>
                    )}
                  </div>
                </ScrollArea>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Navigation Footer */}
        <div className="flex items-center justify-between p-3 border-t bg-muted/30">
          <Button
            variant="ghost"
            onClick={goPrev}
            disabled={currentIndex === 0}
            className="gap-2"
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>

          {/* Slide dots */}
          <div className="flex gap-1.5">
            {deck.slides.map((_, i) => (
              <button
                key={i}
                onClick={() => goTo(i)}
                className={cn(
                  'w-2 h-2 rounded-full transition-all',
                  i === currentIndex 
                    ? 'bg-primary w-4' 
                    : 'bg-muted-foreground/30 hover:bg-muted-foreground/50'
                )}
              />
            ))}
          </div>

          <Button
            variant="ghost"
            onClick={goNext}
            disabled={currentIndex === totalSlides - 1}
            className="gap-2"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {/* Provenance Badge */}
        {currentSlide.type === 'summary-proof' && (
          <div className="absolute bottom-20 right-4 p-3 rounded-lg bg-scroll-gold/10 border border-scroll-gold/30 max-w-xs">
            <div className="flex items-center gap-2 text-xs text-scroll-gold-dark">
              <CheckCircle2 className="h-4 w-4" />
              <span className="font-medium">Verified Learning Deck</span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Generated after verified reading & assessment
            </p>
          </div>
        )}
      </div>
    );
  }
);

SlideViewer.displayName = 'SlideViewer';

export { SlideViewer };
export default SlideViewer;