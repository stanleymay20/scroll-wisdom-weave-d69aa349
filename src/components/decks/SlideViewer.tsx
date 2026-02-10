/**
 * VLD-1.0: Slide Viewer Component
 * 
 * Displays learning deck slides with NotebookLM-quality layouts,
 * AI-generated visuals, speaker notes, "Explain this slide" feature,
 * TTS audio playback (browser + ElevenLabs for premium), and auto-play.
 */

import { useState, useCallback, forwardRef, useRef, useEffect } from 'react';
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
  Volume2,
  Pause,
  Play,
  Settings2,
  Sparkles,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { LearningDeck, SlideData, SlideLayout } from '@/lib/learningDeckContract';
import { InstructionalVisual } from './InstructionalVisual';

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

// ElevenLabs voice options for premium users
const ELEVENLABS_VOICES = [
  { id: 'rachel', name: 'Sarah (Warm)' },
  { id: 'adam', name: 'George (Authoritative)' },
  { id: 'bella', name: 'Laura (Friendly)' },
  { id: 'josh', name: 'Liam (Clear)' },
  { id: 'sam', name: 'Lily (Energetic)' },
] as const;

interface SlideViewerProps {
  deck: LearningDeck;
  onClose?: () => void;
  className?: string;
}

const SlideViewer = forwardRef<HTMLDivElement, SlideViewerProps>(
  ({ deck, onClose, className }, ref) => {
    const { toast } = useToast();
    const { tier } = useSubscription();
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [showNotes, setShowNotes] = useState(false);
    const [isExplaining, setIsExplaining] = useState(false);
    const [explanation, setExplanation] = useState<string | null>(null);
    
    // TTS Audio state
    const [isLoadingAudio, setIsLoadingAudio] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const currentSlideAudioRef = useRef<number>(-1);
    
    // Premium TTS settings
    const isPremiumUser = tier === 'premium' || tier === 'prophet_tier';
    const [useElevenLabs, setUseElevenLabs] = useState(isPremiumUser);
    const [elevenLabsVoice, setElevenLabsVoice] = useState<string>('sam');
    const [autoPlay, setAutoPlay] = useState(false);

    const currentSlide = deck.slides[currentIndex];
    const totalSlides = deck.slides.length;
    const LayoutIcon = layoutIcons[currentSlide?.layout || 'concept-text'];

    // Clean up audio on unmount
    useEffect(() => {
      return () => {
        if ('speechSynthesis' in window) {
          window.speechSynthesis.cancel();
        }
        if (audioRef.current) {
          audioRef.current.pause();
          audioRef.current = null;
        }
      };
    }, []);

    // Generate slide narration text
    const getSlideNarration = useCallback((slide: SlideData): string => {
      const parts = [slide.heading];
      if (slide.content?.length) {
        parts.push(...slide.content);
      }
      if (slide.speakerNotes) {
        parts.push(slide.speakerNotes);
      }
      return parts.join('. ');
    }, []);

    // Play with browser-native TTS
    const playBrowserTTS = useCallback((narration: string) => {
      if (!('speechSynthesis' in window)) {
        toast({
          title: 'Audio not supported',
          description: 'Your browser does not support text-to-speech.',
          variant: 'destructive',
        });
        return;
      }

      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(narration);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;

      utterance.onend = () => {
        setIsPlaying(false);
        // Auto-play next slide if enabled
        if (autoPlay && currentIndex < totalSlides - 1) {
          setTimeout(() => goTo(currentIndex + 1), 500);
        }
      };

      utterance.onerror = () => {
        setIsPlaying(false);
        setIsLoadingAudio(false);
      };

      window.speechSynthesis.speak(utterance);
      setIsPlaying(true);
      currentSlideAudioRef.current = currentIndex;
    }, [autoPlay, currentIndex, totalSlides, toast]);

    // Play with ElevenLabs TTS (premium)
    const playElevenLabsTTS = useCallback(async (narration: string) => {
      try {
        const { data, error } = await supabase.functions.invoke('elevenlabs-tts', {
          body: { text: narration, voice: elevenLabsVoice },
        });

        if (error) throw error;
        if (data?.requiresUpgrade) {
          toast({
            title: 'Premium Feature',
            description: 'ElevenLabs TTS requires Premium or Prophet tier.',
          });
          // Fall back to browser TTS
          playBrowserTTS(narration);
          return;
        }

        if (!data?.audioContent) {
          throw new Error('No audio content received');
        }

        // Create audio from base64
        const audioUrl = `data:audio/mpeg;base64,${data.audioContent}`;
        const audio = new Audio(audioUrl);
        audioRef.current = audio;

        audio.onended = () => {
          setIsPlaying(false);
          // Auto-play next slide if enabled
          if (autoPlay && currentIndex < totalSlides - 1) {
            setTimeout(() => goTo(currentIndex + 1), 500);
          }
        };

        audio.onerror = () => {
          setIsPlaying(false);
          toast({
            title: 'Audio Error',
            description: 'Failed to play audio. Trying browser TTS...',
          });
          playBrowserTTS(narration);
        };

        await audio.play();
        setIsPlaying(true);
        currentSlideAudioRef.current = currentIndex;
      } catch (err) {
        console.error('[SlideViewer] ElevenLabs TTS error:', err);
        // Fall back to browser TTS
        playBrowserTTS(narration);
      }
    }, [elevenLabsVoice, autoPlay, currentIndex, totalSlides, toast, playBrowserTTS]);

    // Play TTS for current slide
    const playSlideAudio = useCallback(async () => {
      if (!currentSlide || isLoadingAudio) return;
      
      // If already playing this slide with audio element, just resume
      if (audioRef.current && currentSlideAudioRef.current === currentIndex && audioRef.current.paused) {
        audioRef.current.play();
        setIsPlaying(true);
        return;
      }

      setIsLoadingAudio(true);
      
      try {
        const narration = getSlideNarration(currentSlide);
        
        if (useElevenLabs && isPremiumUser) {
          await playElevenLabsTTS(narration);
        } else {
          playBrowserTTS(narration);
        }
      } catch (err) {
        console.error('[SlideViewer] TTS error:', err);
        toast({
          title: 'Audio Failed',
          description: 'Could not play slide audio',
          variant: 'destructive',
        });
      } finally {
        setIsLoadingAudio(false);
      }
    }, [currentSlide, currentIndex, isLoadingAudio, getSlideNarration, useElevenLabs, isPremiumUser, playElevenLabsTTS, playBrowserTTS, toast]);

    // Stop audio playback
    const stopAudio = useCallback(() => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      if (audioRef.current) {
        audioRef.current.pause();
      }
      setIsPlaying(false);
    }, []);

    // Toggle audio
    const toggleAudio = useCallback(() => {
      if (isPlaying) {
        stopAudio();
      } else {
        playSlideAudio();
      }
    }, [isPlaying, stopAudio, playSlideAudio]);

    // Navigate slides
    const goTo = useCallback((index: number) => {
      if (index >= 0 && index < totalSlides) {
        stopAudio();
        setCurrentIndex(index);
        setExplanation(null);
        currentSlideAudioRef.current = -1;
      }
    }, [totalSlides, stopAudio]);

    // Auto-play effect when slide changes
    useEffect(() => {
      if (autoPlay && currentIndex >= 0 && !isPlaying && !isLoadingAudio) {
        const timer = setTimeout(() => {
          playSlideAudio();
        }, 300);
        return () => clearTimeout(timer);
      }
    }, [currentIndex, autoPlay]); // Only trigger on index change when autoPlay is on

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

    // Check if visual has a generated image
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
            {autoPlay && (
              <Badge variant="default" className="gap-1 text-xs bg-primary/80">
                <Play className="h-3 w-3" />
                Auto
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            {/* Audio Playback Button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleAudio}
              disabled={isLoadingAudio}
              className={cn(isPlaying && 'bg-primary/10 text-primary')}
              title={isPlaying ? 'Stop narration' : 'Play slide narration'}
            >
              {isLoadingAudio ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isPlaying ? (
                <Pause className="h-4 w-4" />
              ) : (
                <Volume2 className="h-4 w-4" />
              )}
            </Button>

            {/* Audio Settings Popover */}
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn((useElevenLabs || autoPlay) && 'bg-scroll-gold/10 text-scroll-gold')}
                  title="Audio Settings"
                >
                  <Settings2 className="h-4 w-4" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72" align="end">
                <div className="space-y-4">
                  <h4 className="font-medium text-sm">Audio Settings</h4>
                  
                  {/* Auto-play toggle */}
                  <div className="flex items-center justify-between">
                    <Label htmlFor="auto-play" className="text-sm">
                      Auto-play slides
                    </Label>
                    <Switch
                      id="auto-play"
                      checked={autoPlay}
                      onCheckedChange={setAutoPlay}
                    />
                  </div>
                  
                  {/* ElevenLabs toggle (premium only) */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="elevenlabs" className="text-sm">
                        ElevenLabs TTS
                      </Label>
                      {isPremiumUser ? (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-scroll-gold/10 text-scroll-gold border-scroll-gold/30">
                          <Sparkles className="h-2.5 w-2.5 mr-0.5" />
                          Premium
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          Upgrade
                        </Badge>
                      )}
                    </div>
                    <Switch
                      id="elevenlabs"
                      checked={useElevenLabs}
                      onCheckedChange={setUseElevenLabs}
                      disabled={!isPremiumUser}
                    />
                  </div>
                  
                  {/* Voice selector (when ElevenLabs enabled) */}
                  {useElevenLabs && isPremiumUser && (
                    <div className="space-y-2">
                      <Label className="text-sm">Voice</Label>
                      <div className="grid grid-cols-2 gap-1">
                        {ELEVENLABS_VOICES.map((voice) => (
                          <Button
                            key={voice.id}
                            variant={elevenLabsVoice === voice.id ? 'default' : 'outline'}
                            size="sm"
                            className="text-xs h-7"
                            onClick={() => setElevenLabsVoice(voice.id)}
                          >
                            {voice.name}
                          </Button>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {!isPremiumUser && (
                    <p className="text-xs text-muted-foreground">
                      Upgrade to Premium for high-quality ElevenLabs voices.
                    </p>
                  )}
                </div>
              </PopoverContent>
            </Popover>

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

                {/* Main Content Area */}
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
                      <div className="grid grid-cols-2 gap-6">
                        {currentSlide.content.map((item, i) => (
                          <div key={i} className="p-4 rounded-lg bg-background/50 border">
                            <p className="text-base">{item}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
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

                    {/* Visual placeholder */}
                    {!hasGeneratedVisual && currentSlide.visual && (
                      <div className="mt-6">
                        <InstructionalVisual
                          layout={currentSlide.layout}
                          heading={currentSlide.heading}
                          content={currentSlide.content}
                          visualType={currentSlide.visual.type}
                          visualDescription={currentSlide.visual.description}
                        />
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
