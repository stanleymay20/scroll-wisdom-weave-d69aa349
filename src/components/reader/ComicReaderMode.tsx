import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence, PanInfo } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  ChevronLeft, ChevronRight, Volume2, VolumeX, 
  Maximize2, Minimize2, Grid3X3, BookOpen, X
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * COMIC READER MODE
 * Immersive panel-by-panel reading experience with:
 * - Swipe/tap navigation
 * - Speech bubble highlighting
 * - TTS narration per panel
 * - Fullscreen mode
 * - Panel grid overview
 */

export interface ComicPanelData {
  panelNumber: number;
  imageUrl?: string;
  visualDescription: string;
  dialogues: {
    character: string;
    speech: string;
    bubbleType: 'speech' | 'thought' | 'shout' | 'whisper' | 'narration';
  }[];
  caption?: string;
}

interface ComicReaderModeProps {
  panels: ComicPanelData[];
  chapterTitle: string;
  bookTitle: string;
  onClose: () => void;
  onComplete?: () => void;
}

export function ComicReaderMode({ 
  panels, 
  chapterTitle, 
  bookTitle, 
  onClose,
  onComplete 
}: ComicReaderModeProps) {
  const [currentPanelIndex, setCurrentPanelIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const [isTTSEnabled, setIsTTSEnabled] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [highlightedDialogue, setHighlightedDialogue] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const currentPanel = panels[currentPanelIndex];
  const progress = ((currentPanelIndex + 1) / panels.length) * 100;

  // Navigate to next/previous panel
  const goToPanel = useCallback((index: number) => {
    if (index >= 0 && index < panels.length) {
      setCurrentPanelIndex(index);
      setHighlightedDialogue(null);
      
      // Check if completed
      if (index === panels.length - 1) {
        onComplete?.();
      }
    }
  }, [panels.length, onComplete]);

  const goNext = () => goToPanel(currentPanelIndex + 1);
  const goPrev = () => goToPanel(currentPanelIndex - 1);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        goNext();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goPrev();
      } else if (e.key === 'Escape') {
        if (isFullscreen) {
          setIsFullscreen(false);
        } else {
          onClose();
        }
      } else if (e.key === 'g') {
        setShowGrid(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentPanelIndex, isFullscreen, goNext, goPrev, onClose]);

  // Swipe handling
  const handleDragEnd = (_: any, info: PanInfo) => {
    const threshold = 50;
    if (info.offset.x < -threshold) {
      goNext();
    } else if (info.offset.x > threshold) {
      goPrev();
    }
  };

  // TTS for current panel
  const speakPanel = useCallback(() => {
    if (!currentPanel || !isTTSEnabled) return;
    
    // Cancel any ongoing speech
    window.speechSynthesis.cancel();
    
    const dialogues = currentPanel.dialogues || [];
    let speechIndex = 0;
    
    const speakNext = () => {
      if (speechIndex >= dialogues.length) {
        setIsSpeaking(false);
        setHighlightedDialogue(null);
        return;
      }
      
      const dialogue = dialogues[speechIndex];
      const text = `${dialogue.character} says: ${dialogue.speech}`;
      const utterance = new SpeechSynthesisUtterance(text);
      
      utterance.onstart = () => {
        setIsSpeaking(true);
        setHighlightedDialogue(speechIndex);
      };
      
      utterance.onend = () => {
        speechIndex++;
        setTimeout(speakNext, 300);
      };
      
      window.speechSynthesis.speak(utterance);
    };
    
    // Add caption first if present
    if (currentPanel.caption) {
      const captionUtterance = new SpeechSynthesisUtterance(currentPanel.caption);
      captionUtterance.onend = speakNext;
      window.speechSynthesis.speak(captionUtterance);
    } else {
      speakNext();
    }
  }, [currentPanel, isTTSEnabled]);

  // Auto-speak when panel changes and TTS is enabled
  useEffect(() => {
    if (isTTSEnabled) {
      speakPanel();
    }
    return () => {
      window.speechSynthesis.cancel();
    };
  }, [currentPanelIndex, isTTSEnabled, speakPanel]);

  // Toggle fullscreen
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      containerRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  // Get bubble style based on type
  const getBubbleStyle = (type: string, isHighlighted: boolean) => {
    const base = "px-3 py-2 rounded-xl max-w-[280px] text-sm transition-all duration-300";
    const highlight = isHighlighted ? "ring-2 ring-primary scale-105" : "";
    
    switch (type) {
      case 'thought':
        return cn(base, highlight, "bg-muted/80 border border-dashed border-muted-foreground/30 italic");
      case 'shout':
        return cn(base, highlight, "bg-destructive/20 border-2 border-destructive font-bold");
      case 'whisper':
        return cn(base, highlight, "bg-muted/50 text-muted-foreground text-xs");
      case 'narration':
        return cn(base, highlight, "bg-foreground/10 border border-foreground/20 text-center");
      default:
        return cn(base, highlight, "bg-background border border-border shadow-md");
    }
  };

  if (!panels.length) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-muted-foreground">No panels to display</p>
      </div>
    );
  }

  return (
    <div 
      ref={containerRef}
      className={cn(
        "fixed inset-0 z-50 bg-background flex flex-col",
        isFullscreen && "bg-black"
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-background/95 backdrop-blur">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
          <div>
            <h2 className="font-medium text-sm">{chapterTitle}</h2>
            <p className="text-xs text-muted-foreground">{bookTitle}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">
            {currentPanelIndex + 1} / {panels.length}
          </Badge>
          
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => setIsTTSEnabled(!isTTSEnabled)}
            className={isTTSEnabled ? "text-primary" : ""}
          >
            {isTTSEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </Button>
          
          <Button variant="ghost" size="icon" onClick={() => setShowGrid(!showGrid)}>
            <Grid3X3 className="h-4 w-4" />
          </Button>
          
          <Button variant="ghost" size="icon" onClick={toggleFullscreen}>
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1 bg-muted">
        <motion.div 
          className="h-full bg-primary"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>

      {/* Grid View */}
      <AnimatePresence>
        {showGrid && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-10 bg-background/95 backdrop-blur overflow-auto p-4"
            style={{ top: '60px' }}
          >
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
              {panels.map((panel, index) => (
                <motion.div
                  key={panel.panelNumber}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => {
                    goToPanel(index);
                    setShowGrid(false);
                  }}
                  className={cn(
                    "aspect-square rounded-lg border-2 cursor-pointer overflow-hidden relative",
                    index === currentPanelIndex ? "border-primary" : "border-border"
                  )}
                >
                  {panel.imageUrl ? (
                    <img 
                      src={panel.imageUrl} 
                      alt={`Panel ${panel.panelNumber}`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-muted flex items-center justify-center">
                      <BookOpen className="h-6 w-6 text-muted-foreground" />
                    </div>
                  )}
                  <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-xs text-center py-1">
                    Panel {panel.panelNumber}
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Panel View */}
      <div className="flex-1 relative overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={currentPanelIndex}
            initial={{ opacity: 0, x: 100 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -100 }}
            transition={{ duration: 0.2 }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.1}
            onDragEnd={handleDragEnd}
            className="absolute inset-0 flex flex-col items-center justify-center p-4"
          >
            {/* Panel Image */}
            <div className="relative max-w-3xl w-full max-h-[60vh] flex items-center justify-center">
              {currentPanel.imageUrl ? (
                <img 
                  src={currentPanel.imageUrl} 
                  alt={`Panel ${currentPanel.panelNumber}`}
                  className="max-w-full max-h-[60vh] object-contain rounded-lg shadow-2xl"
                />
              ) : (
                <div className="w-full aspect-video bg-muted rounded-lg flex items-center justify-center border border-border">
                  <div className="text-center p-6">
                    <BookOpen className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
                    <p className="text-sm text-muted-foreground max-w-md">
                      {currentPanel.visualDescription}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Caption */}
            {currentPanel.caption && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-4 px-4 py-2 bg-foreground/10 rounded-lg text-center max-w-lg"
              >
                <p className="text-sm italic">{currentPanel.caption}</p>
              </motion.div>
            )}

            {/* Dialogue Bubbles */}
            <div className="mt-4 flex flex-wrap gap-3 justify-center max-w-2xl">
              {currentPanel.dialogues?.map((dialogue, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: idx * 0.1 }}
                  onClick={() => {
                    if (isTTSEnabled) {
                      window.speechSynthesis.cancel();
                      const utterance = new SpeechSynthesisUtterance(dialogue.speech);
                      setHighlightedDialogue(idx);
                      utterance.onend = () => setHighlightedDialogue(null);
                      window.speechSynthesis.speak(utterance);
                    }
                  }}
                  className={cn(
                    getBubbleStyle(dialogue.bubbleType, highlightedDialogue === idx),
                    isTTSEnabled && "cursor-pointer hover:scale-105"
                  )}
                >
                  <p className="font-medium text-xs text-primary mb-1">{dialogue.character}</p>
                  <p>{dialogue.speech}</p>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </AnimatePresence>

        {/* Navigation Arrows */}
        <Button
          variant="ghost"
          size="icon"
          onClick={goPrev}
          disabled={currentPanelIndex === 0}
          className="absolute left-4 top-1/2 -translate-y-1/2 h-12 w-12 rounded-full bg-background/80 shadow-lg"
        >
          <ChevronLeft className="h-6 w-6" />
        </Button>
        
        <Button
          variant="ghost"
          size="icon"
          onClick={goNext}
          disabled={currentPanelIndex === panels.length - 1}
          className="absolute right-4 top-1/2 -translate-y-1/2 h-12 w-12 rounded-full bg-background/80 shadow-lg"
        >
          <ChevronRight className="h-6 w-6" />
        </Button>
      </div>

      {/* Footer with tap zones */}
      <div className="p-4 border-t border-border/50 bg-background/95 backdrop-blur">
        <div className="flex justify-center gap-2">
          {panels.map((_, idx) => (
            <button
              key={idx}
              onClick={() => goToPanel(idx)}
              className={cn(
                "w-2 h-2 rounded-full transition-all",
                idx === currentPanelIndex 
                  ? "w-6 bg-primary" 
                  : "bg-muted hover:bg-muted-foreground"
              )}
            />
          ))}
        </div>
        <p className="text-xs text-muted-foreground text-center mt-2">
          Swipe or use arrow keys to navigate • Press G for grid view
        </p>
      </div>
    </div>
  );
}

// Helper to parse comic content into panels
export function parseComicContentToPanels(content: string): ComicPanelData[] {
  const panels: ComicPanelData[] = [];
  
  // Split by [PANEL X] markers
  const panelSections = content.split(/\[PANEL\s*(\d+)\]/gi);
  
  for (let i = 1; i < panelSections.length; i += 2) {
    const panelNumber = parseInt(panelSections[i]);
    const section = panelSections[i + 1] || '';
    
    // Extract visual description
    const visualMatch = section.match(/(?:\*\*)?Visual:?(?:\*\*)?\s*([^\n]+(?:\n(?!Dialogue|Caption|-\s*[A-Z])[^\n]+)*)/i);
    const visualDescription = visualMatch ? visualMatch[1].trim() : '';
    
    // Extract dialogues
    const dialogues: ComicPanelData['dialogues'] = [];
    const dialogueMatches = section.matchAll(/-\s*\*?\*?([A-Z][A-Za-z_\s]+?)\*?\*?:\s*"?([^"\n]+)"?/gi);
    
    for (const match of dialogueMatches) {
      const character = match[1].trim().replace(/\*+/g, '');
      const speech = match[2].trim();
      
      let bubbleType: 'speech' | 'thought' | 'shout' | 'whisper' | 'narration' = 'speech';
      if (speech.includes('*') || speech.toLowerCase().includes('thinking')) {
        bubbleType = 'thought';
      } else if (speech.endsWith('!') || speech.toUpperCase() === speech) {
        bubbleType = 'shout';
      } else if (speech.toLowerCase().includes('whisper')) {
        bubbleType = 'whisper';
      } else if (character.toLowerCase().includes('narrator')) {
        bubbleType = 'narration';
      }
      
      dialogues.push({ character, speech, bubbleType });
    }
    
    // Extract caption
    const captionMatch = section.match(/(?:\*\*)?Caption:?(?:\*\*)?\s*"?([^"\n]+)"?/i);
    const caption = captionMatch ? captionMatch[1].trim() : undefined;
    
    // Extract image URL if present
    const imageMatch = section.match(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/);
    const imageUrl = imageMatch ? imageMatch[1] : undefined;
    
    panels.push({
      panelNumber,
      imageUrl,
      visualDescription,
      dialogues,
      caption,
    });
  }
  
  return panels;
}
