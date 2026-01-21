/**
 * COMIC READER MODE (v2.0)
 * 
 * Age-adaptive, immersive panel-by-panel reading experience with:
 * - Swipe/tap navigation
 * - Age-appropriate UI styling (children/teen/adult)
 * - Learning highlights in panels
 * - Speech bubble highlighting
 * - TTS narration per panel
 * - Fullscreen mode
 * - Panel grid overview
 * - Certification progress tracking
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Volume2, VolumeX, 
  Maximize2, Minimize2, Grid3X3, BookOpen, X, Award
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ComicSubType } from "@/components/generate/ComicSubTypeSelector";
import { 
  ComicPanelData, 
  ComicReaderProps,
  AgeAdaptiveConfig,
  AGE_CONFIGS,
  getAgeGroupFromSubType,
  CertificationProgress,
} from "./comic/types";
import { PanelNavigator } from "./comic/PanelNavigator";
import { PanelView } from "./comic/PanelView";
import { ProgressIndicator, CertificationProgressOverlay } from "./comic/ProgressIndicator";

// Re-export types for backward compatibility
export type { ComicPanelData } from "./comic/types";

// Legacy props interface (backward compatible)
interface LegacyComicReaderProps {
  panels: ComicPanelData[];
  chapterTitle: string;
  bookTitle: string;
  onClose: () => void;
  onComplete?: () => void;
}

// New enhanced props
interface EnhancedComicReaderProps extends LegacyComicReaderProps {
  subType?: ComicSubType;
  onPanelChange?: (panelIndex: number) => void;
  learningObjectives?: string[];
  certificationProgress?: CertificationProgress;
}

export function ComicReaderMode({ 
  panels, 
  chapterTitle, 
  bookTitle, 
  subType = 'entertainment',
  onClose,
  onComplete,
  onPanelChange,
  certificationProgress,
}: EnhancedComicReaderProps) {
  // Age-adaptive config
  const ageGroup = getAgeGroupFromSubType(subType);
  const config: AgeAdaptiveConfig = AGE_CONFIGS[ageGroup];

  // State
  const [currentPanelIndex, setCurrentPanelIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showGrid, setShowGrid] = useState(false);
  const [isTTSEnabled, setIsTTSEnabled] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [highlightedDialogue, setHighlightedDialogue] = useState<number | null>(null);
  const [showCertProgress, setShowCertProgress] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  
  const currentPanel = panels[currentPanelIndex];
  const progress = ((currentPanelIndex + 1) / panels.length) * 100;

  // Navigate to panel
  const goToPanel = useCallback((index: number) => {
    if (index >= 0 && index < panels.length) {
      setCurrentPanelIndex(index);
      setHighlightedDialogue(null);
      onPanelChange?.(index);
      
      // Check if completed
      if (index === panels.length - 1) {
        onComplete?.();
      }
    }
  }, [panels.length, onComplete, onPanelChange]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        if (currentPanelIndex < panels.length - 1) {
          goToPanel(currentPanelIndex + 1);
        }
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        if (currentPanelIndex > 0) {
          goToPanel(currentPanelIndex - 1);
        }
      } else if (e.key === 'Escape') {
        if (isFullscreen) {
          setIsFullscreen(false);
        } else if (showGrid) {
          setShowGrid(false);
        } else {
          onClose();
        }
      } else if (e.key === 'g') {
        setShowGrid(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentPanelIndex, isFullscreen, showGrid, panels.length, goToPanel, onClose]);

  // TTS for current panel
  const speakPanel = useCallback(() => {
    if (!currentPanel || !isTTSEnabled) return;
    
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
    
    if (currentPanel.caption) {
      const captionUtterance = new SpeechSynthesisUtterance(currentPanel.caption);
      captionUtterance.onend = speakNext;
      window.speechSynthesis.speak(captionUtterance);
    } else {
      speakNext();
    }
  }, [currentPanel, isTTSEnabled]);

  // Speak single dialogue
  const speakDialogue = useCallback((index: number) => {
    if (!isTTSEnabled || !currentPanel?.dialogues?.[index]) return;
    
    window.speechSynthesis.cancel();
    const dialogue = currentPanel.dialogues[index];
    const utterance = new SpeechSynthesisUtterance(dialogue.speech);
    
    setHighlightedDialogue(index);
    utterance.onend = () => setHighlightedDialogue(null);
    window.speechSynthesis.speak(utterance);
  }, [currentPanel, isTTSEnabled]);

  // Auto-speak when panel changes
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

  // Get header/footer styling based on age
  const getHeaderClasses = () => {
    switch (config.ageGroup) {
      case 'children':
        return "bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950 dark:to-orange-950 border-b-2 border-amber-200";
      case 'teen':
        return "bg-background/95 backdrop-blur border-b border-border";
      default:
        return "bg-background/90 backdrop-blur-sm border-b border-border/50";
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
        "fixed inset-0 z-50 flex flex-col",
        isFullscreen ? "bg-black" : "bg-background"
      )}
    >
      {/* Header */}
      <div className={cn(
        "flex items-center justify-between px-4 py-3",
        getHeaderClasses()
      )}>
        <div className="flex items-center gap-3">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={onClose}
            className={config.ageGroup === 'children' ? "rounded-full" : ""}
          >
            <X className="h-5 w-5" />
          </Button>
          <div>
            <h2 className={cn(
              "font-medium",
              config.ageGroup === 'children' ? "text-base" : "text-sm"
            )}>
              {chapterTitle}
            </h2>
            <p className="text-xs text-muted-foreground">{bookTitle}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <Badge 
            variant={config.ageGroup === 'children' ? 'default' : 'secondary'} 
            className={cn(
              "text-xs",
              config.ageGroup === 'children' && "bg-amber-400 text-amber-900"
            )}
          >
            {config.ageGroup === 'children' ? '⭐ ' : ''}{currentPanelIndex + 1} / {panels.length}
          </Badge>
          
          {/* Certification progress toggle */}
          {certificationProgress?.isEligible && (
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => setShowCertProgress(!showCertProgress)}
              className={showCertProgress ? "text-green-500" : ""}
            >
              <Award className="h-4 w-4" />
            </Button>
          )}
          
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

      {/* Progress indicator */}
      <div className="py-2 px-4">
        <ProgressIndicator
          current={currentPanelIndex}
          total={panels.length}
          config={config}
          onNavigate={goToPanel}
        />
      </div>

      {/* Certification progress overlay */}
      {showCertProgress && certificationProgress && (
        <CertificationProgressOverlay
          objectivesCompleted={certificationProgress.objectivesCompleted}
          objectivesTotal={certificationProgress.objectivesTotal}
          quizScore={certificationProgress.quizScore}
          isEligible={certificationProgress.isEligible}
          ageGroup={config.ageGroup}
        />
      )}

      {/* Grid View */}
      <AnimatePresence>
        {showGrid && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-40 bg-background/95 backdrop-blur overflow-auto p-4"
            style={{ top: '100px' }}
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
                    "aspect-square cursor-pointer overflow-hidden relative",
                    config.ageGroup === 'children' 
                      ? "rounded-2xl border-3" 
                      : "rounded-lg border-2",
                    index === currentPanelIndex 
                      ? "border-primary ring-2 ring-primary/20" 
                      : "border-border"
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
                  <div className={cn(
                    "absolute bottom-0 left-0 right-0 text-white text-xs text-center py-1",
                    "bg-black/60"
                  )}>
                    {config.ageGroup === 'children' ? `⭐ ${panel.panelNumber}` : `Panel ${panel.panelNumber}`}
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Panel View with Navigator */}
      <PanelNavigator
        panels={panels}
        currentIndex={currentPanelIndex}
        onNavigate={goToPanel}
        config={config}
      >
        <PanelView
          panel={currentPanel}
          config={config}
          isTTSEnabled={isTTSEnabled}
          highlightedDialogue={highlightedDialogue}
          onSpeakDialogue={speakDialogue}
        />
      </PanelNavigator>

      {/* Footer */}
      <div className={cn(
        "p-4 border-t",
        config.ageGroup === 'children'
          ? "bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950 dark:to-orange-950 border-amber-200"
          : "bg-background/95 backdrop-blur border-border/50"
      )}>
        <p className={cn(
          "text-center text-muted-foreground",
          config.ageGroup === 'children' ? "text-sm" : "text-xs"
        )}>
          {config.ageGroup === 'children' 
            ? "👆 Swipe or tap arrows to read more!" 
            : "Swipe or use arrow keys to navigate • Press G for grid view"}
        </p>
      </div>
    </div>
  );
}

// Helper to parse comic content into panels (backward compatible)
export function parseComicContentToPanels(content: string): ComicPanelData[] {
  const panels: ComicPanelData[] = [];
  
  const panelSections = content.split(/\[PANEL\s*(\d+)\]/gi);
  
  for (let i = 1; i < panelSections.length; i += 2) {
    const panelNumber = parseInt(panelSections[i]);
    const section = panelSections[i + 1] || '';
    
    const visualMatch = section.match(/(?:\*\*)?Visual:?(?:\*\*)?\s*([^\n]+(?:\n(?!Dialogue|Caption|-\s*[A-Z])[^\n]+)*)/i);
    const visualDescription = visualMatch ? visualMatch[1].trim() : '';
    
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
    
    const captionMatch = section.match(/(?:\*\*)?Caption:?(?:\*\*)?\s*"?([^"\n]+)"?/i);
    const caption = captionMatch ? captionMatch[1].trim() : undefined;
    
    const imageMatch = section.match(/!\[.*?\]\((https?:\/\/[^\s)]+)\)/);
    const imageUrl = imageMatch ? imageMatch[1] : undefined;

    // Extract learning moment if present
    const learningMatch = section.match(/(?:\*\*)?Learning:?(?:\*\*)?\s*([^\n]+)/i);
    const learningMoment = learningMatch ? {
      objective: learningMatch[1].trim(),
      highlighted: true,
    } : undefined;
    
    panels.push({
      panelNumber,
      imageUrl,
      visualDescription,
      dialogues,
      caption,
      learningMoment,
    });
  }
  
  return panels;
}
