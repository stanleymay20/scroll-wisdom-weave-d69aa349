/**
 * CONTRACT 5 (ENHANCED) - Reader Page
 * CONTRACT 5B-3: Reader Entry Speed
 * 
 * Rule 5.2: Reader UI must be screen-safe
 * - No horizontal overflow
 * - Safe area insets respected
 * - Floating actions auto-hide while scrolling
 * - Controls never overlap text
 * 
 * Rule 5B-3: Reader Entry Speed (≤100ms)
 * - Instant shell rendering
 * - Cache-primed entry from route state
 * - Progressive hydration
 * - Zero layout shift
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  ChevronLeft, 
  ChevronRight, 
  BookOpen, 
  Settings, 
  Bookmark,
  X,
  Home,
  Flag,
  Volume2,
  Brain,
  BookMarked,
  Palette,
  MoreVertical,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { TTSMiniPlayer } from "@/components/audio/TTSMiniPlayer";
import { ReportContentDialog } from "@/components/legal/ReportContentDialog";
import { ContentDisclaimer } from "@/components/legal/ContentDisclaimer";
import { CognitiveLevelSelector, COGNITIVE_LEVELS } from "@/components/reader/CognitiveLevelSelector";
import { GuidedReadingMode, CognitiveLevelIndicator } from "@/components/reader/GuidedReadingMode";
import { DeepResearchPanel } from "@/components/academic/DeepResearchPanel";
import { AcademicModeIndicator } from "@/components/academic/AcademicModeIndicator";
import { AcademicDisclaimer } from "@/components/academic/AcademicDisclaimer";
import { InteractiveQA } from "@/components/reader/InteractiveQA";
import { VoiceConversation } from "@/components/reader/VoiceConversation";
import { TextHighlighter } from "@/components/reader/TextHighlighter";
import { QuizMode } from "@/components/reader/QuizMode";
import { MarkdownRenderer } from "@/components/reader/MarkdownRenderer";
import { ReaderSkeleton } from "@/components/reader/ReaderSkeleton";
import { CodePlayground } from "@/components/reader/CodePlayground";

import { PreviouslyInBookCard, ReadingSessionTimer, DirectTextEditor } from "@/components/reader";
import { ReaderToolsSheet } from "@/components/reader/ReaderToolsSheet";
import { ChapterVideoGenerator } from "@/components/reader/ChapterVideoGenerator";
import { FlashcardGenerator } from "@/components/decks/FlashcardGenerator";
import { LearningDeckGenerator } from "@/components/decks/LearningDeckGenerator";
import { CitationStyle, AcademicSource } from "@/lib/citations";
import { useLanguage } from "@/contexts/LanguageContext";
import { useSettings } from "@/contexts/SettingsContext";
import { usePagePerformance } from "@/lib/performance";
import { useReaderData } from "@/hooks/useReaderData";
import { useReadingSession } from "@/hooks/useReadingSession";
import { useAutoScroll } from "@/hooks/useAutoScroll";
import { useAudioSync } from "@/hooks/useAudioSync";
import { cn } from "@/lib/utils";
import { useQuizGating } from "@/hooks/useQuizGating";
import { useCompetencyProgress } from "@/hooks/useCompetencyProgress";
import { CompetencyLearningPanel } from "@/components/reader/CompetencyLearningPanel";
import { AdaptiveLearningPath } from "@/components/reader/AdaptiveLearningPath";
import { PresenceAvatars } from "@/components/reader/PresenceAvatars";
import { useEditorPresence } from "@/hooks/useCollaboration";
import { KnowledgeGraphPanel } from "@/components/reader/KnowledgeGraphPanel";
import { computeAdaptiveRecommendation, defaultLearnerState, type AdaptiveRecommendation } from "@/lib/adaptiveLearningEngine";
import { ReflectionPause } from "@/components/reader/GuidedReadingMode";
import { useGamification } from "@/hooks/useGamification";
import { GamificationBar, RewardPopup, ChapterHookScreen, StreakAlert, CuriosityGap, AICompanion, saveLastSession, StuckReaderRescue, ChapterOneSummary } from "@/components/gamification";
import { trackFunnelEvent, trackChapterExit, trackSectionCompleted, resetSessionCounters, getSessionStats } from "@/lib/readingFunnel";
import { createInterruptionState, activateInterruption, deactivateInterruption, canShow, isOverBudget } from "@/lib/interruptionManager";
import { isFeatureEnabled, type ExperimentId } from "@/lib/experimentFramework";
import { saveResumeState, getResumeState, findCurrentParagraphAnchor, restorePosition, flushResumeState, type ResumeState } from "@/lib/resumeEngine";
import { loadReaderProfile, classifyReader, getInterventionConfig, recordBookOpened, recordChapterCompleted, recordBookCompleted, syncStreakFromGamification } from "@/lib/readerSegmentation";
import { requestInterruptionSlot, isInDeepFlow, getLastInterruptionTime } from "@/lib/calmnessRules";
import { SectionCompletionTracker, type CompletionResult } from "@/lib/sectionCompletion";

interface BookData {
  id: string;
  title: string;
  total_chapters: number | null;
  language: string | null;
}

interface ChapterData {
  id: string;
  chapter_number: number;
  title: string;
  content: string | null;
  word_count: number | null;
  academic_mode?: boolean;
  citation_style?: string;
  chapter_references?: any[];
  research_metadata?: any;
}

// Reading theme presets
const READING_THEMES = {
  default: { bg: 'bg-secondary', text: 'text-foreground/90', name: 'Default' },
  sepia: { bg: 'bg-amber-50', text: 'text-amber-900', name: 'Sepia' },
  dark: { bg: 'bg-zinc-950', text: 'text-zinc-100', name: 'Dark' },
  cream: { bg: 'bg-orange-50', text: 'text-stone-800', name: 'Cream' },
  mint: { bg: 'bg-emerald-50', text: 'text-emerald-900', name: 'Mint' },
  night: { bg: 'bg-slate-900', text: 'text-slate-100', name: 'Night Blue' },
} as const;

type ReadingTheme = keyof typeof READING_THEMES;

export default function Reader() {
  const { t } = useLanguage();
  const { settings, updateSettings } = useSettings();
  const { bookId, chapterId } = useParams();
  const navigate = useNavigate();
  
  // PERFORMANCE: Track TTI
  usePagePerformance('Reader');
  const contentRef = useRef<HTMLDivElement>(null);


  const currentChapter = parseInt(chapterId || "1");
  
  // CONTRACT 5B-3: Single source of truth for reader data
  const {
    book,
    chapter: rawChapter,
    previewContent,
    loadState,
    isLoading,
    isOnline,
    resumePosition,
    userId,
  } = useReaderData({ bookId, chapterNumber: currentChapter });
  
  // Local override for chapter content after direct edits (avoids mutating state)
  const [chapterContentOverride, setChapterContentOverride] = useState<{ content: string; wordCount: number } | null>(null);
  
  // Reset override when chapter changes
  useEffect(() => {
    setChapterContentOverride(null);
  }, [currentChapter, bookId]);
  
  // Merge override into chapter data
  const chapter = useMemo(() => {
    if (!rawChapter) return null;
    if (!chapterContentOverride) return rawChapter;
    return {
      ...rawChapter,
      content: chapterContentOverride.content,
      word_count: chapterContentOverride.wordCount,
    };
  }, [rawChapter, chapterContentOverride]);
  
  // CONTRACT 5: Quiz Gating - chapters must be read before quizzes unlock
  const quizGating = useQuizGating({
    bookId: bookId || '',
    chapterNumber: currentChapter,
    userId,
  });

  // Competency-Verified CPD Engine
  const competency = useCompetencyProgress({
    bookId: bookId || '',
    chapterNumber: currentChapter,
    userId,
  });
  
  // Collaborative editing presence
  const { editorsOnChapter } = useEditorPresence(
    bookId, chapter?.id, userId, undefined, undefined
  );

  // Reading session tracking with weekly goals
  const {
    formattedTime,
    elapsedSeconds,
    weeklyProgress,
    updateWeeklyGoal,
    endSession,
  } = useReadingSession(bookId || '', chapter?.id || null);
  
  // Track TTS playing state for auto-scroll
  const [isTTSPlaying, setIsTTSPlaying] = useState(false);
  // Track audio element and cumulative time for sentence sync
  // Use REFS directly to avoid React state round-trip lag causing sync drift
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);
  const ttsCumulativeTimeRef = useRef(0);
  const [ttsEstimatedDuration, setTtsEstimatedDuration] = useState(0);
  const [chunkPlaybackInfo, setChunkPlaybackInfo] = useState<{ chunkIndex: number; chunkWordCounts: number[] } | null>(null);
  const [ttsPlaybackSpeed, setTtsPlaybackSpeed] = useState(1);
  
  // Auto-scroll is defined after wordCount is available (line ~312)
  
  const [fontSize, setFontSize] = useState(18);
  const [readingTheme, setReadingTheme] = useState<ReadingTheme>('default');
  const [showSettings, setShowSettings] = useState(false);
  const [showTTS, setShowTTS] = useState(true); // TTS mini-player visible by default
  const [showLevelSelector, setShowLevelSelector] = useState(false);
  const [showReferences, setShowReferences] = useState(false);
  const [selectedTextForTTS, setSelectedTextForTTS] = useState("");

  // Close overlay panels but preserve TTS state (TTS is independent)
  const closeTopPanels = useCallback(() => {
    setShowSettings(false);
    setShowLevelSelector(false);
    setShowReferences(false);
  }, []);

  // Open exclusive panels (settings, level, refs) - TTS is independent and persists
  const openExclusive = useCallback(
    (panel: "settings" | "level" | "refs") => {
      setShowSettings(panel === "settings");
      setShowLevelSelector(panel === "level");
      setShowReferences(panel === "refs");
    },
    []
  );

  // Cognitive level and reading progress — persisted per-book
  const cognitiveLevelKey = bookId ? `scroll_cognitive_${bookId}` : null;
  const [cognitiveLevel, setCognitiveLevelRaw] = useState(() => {
    if (cognitiveLevelKey) {
      try {
        const saved = localStorage.getItem(cognitiveLevelKey);
        if (saved && ["familiarisation", "functional", "applied", "analytical", "mastery"].includes(saved)) {
          return saved;
        }
      } catch { /* noop */ }
    }
    return "functional";
  });
  const setCognitiveLevel = useCallback((level: string) => {
    setCognitiveLevelRaw(level);
    if (cognitiveLevelKey) {
      try { localStorage.setItem(cognitiveLevelKey, level); } catch { /* noop */ }
    }
  }, [cognitiveLevelKey]);
  const [readingProgress, setReadingProgress] = useState(0);
  const [guidedModeActive, setGuidedModeActive] = useState(true);
  const [showQA, setShowQA] = useState(false);
  const [showVoiceAI, setShowVoiceAI] = useState(false);
  const [showQuiz, setShowQuiz] = useState(false);
  const [showPlayground, setShowPlayground] = useState(false);
  const [showChapterVideo, setShowChapterVideo] = useState(false);
  
  const [showDirectEditor, setShowDirectEditor] = useState(false);
  const [highlightedText, setHighlightedText] = useState("");
  const [isBookOwner, setIsBookOwner] = useState(false);
  const [showFlashcardDialog, setShowFlashcardDialog] = useState(false);
  const [showLearningDeckDialog, setShowLearningDeckDialog] = useState(false);
  const [showKnowledgeGraph, setShowKnowledgeGraph] = useState(false);
  
  // CONTRACT 5 - Rule 5.4: Track if TTS should resume after voice conversation
  const [shouldResumeTTS, setShouldResumeTTS] = useState(false);
  const [showReflectionPause, setShowReflectionPause] = useState(false);
  const [reflectionDismissedAt, setReflectionDismissedAt] = useState<number>(0);
  
  // AUTO-CONTINUE: Use settings from context
  const autoContinueAudio = settings.tts_auto_continue;
  const [pendingAutoPlay, setPendingAutoPlay] = useState(false);

  // === ADAPTIVE LEARNING ENGINE ===
  // Compute real-time recommendations from learner state
  const adaptiveRec: AdaptiveRecommendation = useMemo(() => {
    const chaptersTotal = book?.total_chapters || 1;
    const state = defaultLearnerState({
      chapterProgress: readingProgress,
      chaptersCompleted: Math.max(0, currentChapter - 1),
      totalChapters: chaptersTotal,
      cognitiveLevel,
      complexityLevel: 'intermediate',
      studySpeed: 'normal',
      avgQuizScore: competency.progress?.competencyScore ?? 0,
      totalAttempts: competency.progress?.competencyCheckPassed ? 1 : 0,
      timeSpentSeconds: 0,
    });
    return computeAdaptiveRecommendation(state);
  }, [readingProgress, currentChapter, book?.total_chapters, cognitiveLevel, competency.progress]);

  // === GAMIFICATION ENGINE ===
  const gamification = useGamification();
  const [hookDismissed, setHookDismissed] = useState(false);
  
  // === INTERRUPTION MANAGER ===
  const interruptionRef = useRef(createInterruptionState());
  const lastInterruptionTimeRef = useRef(0);
  
  // === AI COMPANION VISIBILITY (computed once per milestone, not per render) ===
  const [aiCompanionAllowed, setAiCompanionAllowed] = useState(true);
  
  // === SECTION COMPLETION TRACKER ===
  const sectionTrackerRef = useRef<SectionCompletionTracker | null>(null);
  
  // === READER SEGMENTATION ===
  const readerSegment = useMemo(() => {
    const profile = loadReaderProfile();
    return classifyReader(profile);
  }, []);
  const interventionConfig = useMemo(() => getInterventionConfig(readerSegment), [readerSegment]);
  
  // Sync streak from gamification into segmentation
  useEffect(() => {
    syncStreakFromGamification(gamification.state.streakCurrent);
  }, [gamification.state.streakCurrent]);
  
  // === EXPERIMENT FRAMEWORK ===
  const showHookScreen = isFeatureEnabled('hook_screen');
  const showAICompanion = isFeatureEnabled('ai_companion');
  const showGamBar = isFeatureEnabled('visible_gamification_bar');
  const showCh1Summary = currentChapter === 1 && isFeatureEnabled('ch1_summary_first');
  const [ch1SummaryDismissed, setCh1SummaryDismissed] = useState(false);
  
  // === RESUME ENGINE ===
  const hasRestoredRef = useRef(false);
  
  // Save resume state on scroll (throttled by resume engine)
  const saveCurrentResumeState = useCallback(() => {
    if (!bookId) return;
    const anchor = findCurrentParagraphAnchor(contentRef.current);
    saveResumeState({
      bookId,
      chapterNumber: currentChapter,
      sectionIndex: 0,
      lastParagraphAnchor: anchor,
      scrollOffset: window.scrollY,
      readingMode: guidedModeActive ? 'guided' : 'default',
      audioChunkIndex: null,
      audioVoice: null,
      readingTheme,
      fontSize,
      updatedAt: Date.now(),
    });
  }, [bookId, currentChapter, guidedModeActive, readingTheme, fontSize]);
  
  // Restore position on mount
  useEffect(() => {
    if (!bookId || hasRestoredRef.current || !contentRef.current || !chapter?.content) return;
    hasRestoredRef.current = true;
    
    const saved = getResumeState(bookId, currentChapter);
    if (saved) {
      // Use requestAnimationFrame to ensure DOM is painted
      requestAnimationFrame(() => {
        restorePosition(contentRef.current, saved);
      });
    }
  }, [bookId, currentChapter, chapter?.content]);
  
  // Reset restore flag on chapter change
  useEffect(() => {
    hasRestoredRef.current = false;
  }, [currentChapter]);
  
  // Flush resume state on unmount AND save on visibility change
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        saveCurrentResumeState();
        flushResumeState();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      flushResumeState();
    };
  }, [saveCurrentResumeState]);
  
  // Track book opened for segmentation
  useEffect(() => {
    if (bookId) recordBookOpened();
  }, [bookId]);
  
  // === FUNNEL ANALYTICS ===
  // Track chapter_started on mount
  useEffect(() => {
    resetSessionCounters();
    if (bookId) {
      trackFunnelEvent('chapter_started', { bookId, chapterNumber: currentChapter });
    }
  }, [bookId, currentChapter]);
  
  // Track chapter exit on unmount — use ref to avoid stale closure
  const readingProgressRef = useRef(readingProgress);
  readingProgressRef.current = readingProgress;
  
  useEffect(() => {
    return () => {
      if (bookId) {
        trackChapterExit(bookId, currentChapter, readingProgressRef.current);
      }
    };
  }, [bookId, currentChapter]); // eslint-disable-line react-hooks/exhaustive-deps
  
  // Reset hook screen on chapter change
  useEffect(() => {
    setHookDismissed(false);
  }, [currentChapter]);
  
  // Award XP on chapter completion (reading progress reaches 95%+)
  const chapterRewardedRef = useRef(false);
  useEffect(() => {
    if (readingProgress >= 95 && !chapterRewardedRef.current) {
      chapterRewardedRef.current = true;
      gamification.completeChapter();
      trackFunnelEvent('chapter_completed', { bookId, chapterNumber: currentChapter });
      recordChapterCompleted(currentChapter);
      
      // Track Ch1 specifically for experiments
      if (currentChapter === 1) {
        trackFunnelEvent('chapter_1_completed' as any, { bookId });
      }
      // Check if book is complete
      if (currentChapter === (book?.total_chapters || 0)) {
        trackFunnelEvent('book_completed', { bookId });
        recordBookCompleted();
      }
    }
  }, [readingProgress]); // eslint-disable-line react-hooks/exhaustive-deps
  
  // Reset chapter reward tracking on chapter change
  useEffect(() => {
    chapterRewardedRef.current = false;
  }, [currentChapter]);

  // Update interruption state
  useEffect(() => {
    const s = interruptionRef.current;
    if (!hookDismissed && showHookScreen && chapter) activateInterruption(s, 'hook_screen');
    else deactivateInterruption(s, 'hook_screen');
    
    if (gamification.streakBroken) activateInterruption(s, 'streak_recovery');
    else deactivateInterruption(s, 'streak_recovery');
    
    if (gamification.achievementReward) activateInterruption(s, 'achievement');
    else deactivateInterruption(s, 'achievement');
    
    if (gamification.leveledUp) activateInterruption(s, 'level_milestone');
    else deactivateInterruption(s, 'level_milestone');
    
    if (gamification.lastReward) activateInterruption(s, 'reward_popup');
    else deactivateInterruption(s, 'reward_popup');
  }, [hookDismissed, showHookScreen, chapter, gamification.streakBroken, gamification.achievementReward, gamification.leveledUp, gamification.lastReward]);

  // AI companion frequency: decide ONCE per chapter, not per render
  useEffect(() => {
    setAiCompanionAllowed(Math.random() < interventionConfig.aiCompanionFrequency);
  }, [currentChapter, interventionConfig.aiCompanionFrequency]);

  // Show reflection prompt when engine recommends it (once per progress threshold)
  useEffect(() => {
    if (adaptiveRec.showReflection && readingProgress >= 95 && reflectionDismissedAt < 95) {
      setShowReflectionPause(true);
    }
    if (adaptiveRec.showRecap && readingProgress >= 48 && readingProgress <= 52 && reflectionDismissedAt < 48) {
      setShowReflectionPause(true);
    }
  }, [adaptiveRec.showReflection, adaptiveRec.showRecap, readingProgress, reflectionDismissedAt]);

  // Reset pendingAutoPlay after it's been consumed (when chapter content loads)
  useEffect(() => {
    if (pendingAutoPlay) {
      const timer = setTimeout(() => setPendingAutoPlay(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [pendingAutoPlay]);

  const { toast } = useToast();
  const lastSavedProgress = useRef<number>(-1); // -1 = not yet initialized from DB
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dbProgressLoaded = useRef(false);

  // Initialize lastSavedProgress from database on mount (prevents overwriting higher values)
  useEffect(() => {
    if (!userId || !bookId || dbProgressLoaded.current) return;
    
    const loadExistingProgress = async () => {
      try {
        const { data } = await supabase
          .from("user_library")
          .select("progress_percent")
          .eq("user_id", userId)
          .eq("book_id", bookId)
          .single();
        
        if (data?.progress_percent != null) {
          lastSavedProgress.current = Number(data.progress_percent);
        } else {
          lastSavedProgress.current = 0;
        }
      } catch {
        lastSavedProgress.current = 0;
      }
      dbProgressLoaded.current = true;
    };
    
    loadExistingProgress();
  }, [userId, bookId]);

  // Save reading progress to database with debounce (optimized)
  // CRITICAL: Never save a LOWER value than what's already stored
  const saveProgress = useCallback(async (chapterNum: number, progressPercent: number, showToast = false) => {
    if (!userId || !bookId) return;
    // Don't save until we know the existing progress
    if (lastSavedProgress.current < 0) return;
    
    const roundedProgress = Math.round(progressPercent);
    
    // NEVER decrease progress — completed books must stay at 100%
    if (roundedProgress <= lastSavedProgress.current) return;
    
    // Skip if progress hasn't changed significantly (< 5%) unless forcing save
    if (!showToast && Math.abs(roundedProgress - lastSavedProgress.current) < 5) return;
    
    try {
      const { error } = await supabase
        .from("user_library")
        .update({
          last_read_chapter: chapterNum,
          progress_percent: roundedProgress
        })
        .eq("user_id", userId)
        .eq("book_id", bookId);
      
      if (!error) {
        lastSavedProgress.current = roundedProgress;
        
        if (showToast) {
          toast({
            title: "Progress saved",
            description: `Chapter ${chapterNum} • ${roundedProgress}% complete`,
            duration: 2000,
          });
        }
      } else {
        console.error("[Reader] Progress save error:", error);
      }
    } catch (error) {
      console.error("Error saving progress:", error);
    }
  }, [userId, bookId, toast]);

  // Check book ownership
  useEffect(() => {
    const checkOwnership = async () => {
      if (!bookId || !userId) {
        setIsBookOwner(false);
        return;
      }
      try {
        const { data } = await supabase
          .from('books')
          .select('user_id, creator_id')
          .eq('id', bookId)
          .single();
        setIsBookOwner(data?.user_id === userId || data?.creator_id === userId);
      } catch {
        setIsBookOwner(false);
      }
    };
    checkOwnership();
  }, [bookId, userId]);

  // Save last session for re-engagement banner
  useEffect(() => {
    if (book && chapter && bookId) {
      saveLastSession({
        bookId,
        bookTitle: book.title,
        chapterNumber: currentChapter,
        chapterTitle: chapter.title,
        progress: readingProgress,
      });
    }
  }, [book, chapter, bookId, currentChapter, readingProgress]);

  // Reset reading progress on chapter change
  useEffect(() => {
    setReadingProgress(0);
  }, [currentChapter]);

  // Save progress immediately on chapter open (ensures progress > 0 for "in progress" tracking)
  // saveProgress already prevents decreasing, so this is safe
  useEffect(() => {
    if (userId && bookId && book?.total_chapters && currentChapter > 0 && dbProgressLoaded.current) {
      const completedChapters = currentChapter - 1;
      const overallProgress = ((completedChapters) / book.total_chapters) * 100;
      // Minimum 1% so the book shows as "in progress" even on chapter 1
      const minProgress = Math.max(overallProgress, 1);
      saveProgress(currentChapter, minProgress, false);
    }
  }, [userId, bookId, currentChapter, book?.total_chapters]); // eslint-disable-line react-hooks/exhaustive-deps

  // Save progress when chapter changes or user leaves - with toast
  useEffect(() => {
    // Save on chapter change (when user navigates away)
    return () => {
      if (userId && bookId && book?.total_chapters) {
        // Clear any pending save timeout
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
        }
        
        // Calculate overall book progress: (completed chapters + current chapter progress) / total
        const completedChapters = currentChapter - 1;
        const currentChapterContribution = readingProgress / 100;
        const overallProgress = ((completedChapters + currentChapterContribution) / book.total_chapters) * 100;
        // Ensure 100% is saved when last chapter is fully read
        const isBookComplete = currentChapter === book.total_chapters && readingProgress >= 95;
        const finalProgress = isBookComplete ? 100 : overallProgress;
        saveProgress(currentChapter, finalProgress, true); // Show toast on exit
      }
    };
  }, [userId, bookId, currentChapter, readingProgress, book?.total_chapters, saveProgress]);

  // Track scroll progress with THROTTLE for performance (fires max every 100ms)
  // Auto-save DEBOUNCED at 5s after scroll stops, only if ≥10% change
  const scrollThrottleRef = useRef<number>(0);
  
  const handleScroll = useCallback(() => {
    // THROTTLE: Skip if less than 100ms since last execution
    const now = Date.now();
    if (now - scrollThrottleRef.current < 100) return;
    scrollThrottleRef.current = now;
    
    if (!contentRef.current) return;
    
    const element = contentRef.current;
    const scrollTop = window.scrollY - element.offsetTop + window.innerHeight;
    const scrollHeight = element.scrollHeight;
    const progress = Math.min(100, Math.max(0, (scrollTop / scrollHeight) * 100));
    
    setReadingProgress(progress);
    
    // CONTRACT 5: Update quiz gating progress
    quizGating.updateReadProgress(progress);
    
    // DEBOUNCED auto-save - only after 5 seconds of no scrolling
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    saveTimeoutRef.current = setTimeout(() => {
      if (userId && bookId && book?.total_chapters) {
        const completedChapters = currentChapter - 1;
        const currentChapterContribution = progress / 100;
        const overallProgress = ((completedChapters + currentChapterContribution) / book.total_chapters) * 100;
        // Force-save completion immediately when user finishes last chapter
        const isBookComplete = currentChapter === book.total_chapters && progress >= 95;
        const finalProgress = isBookComplete ? 100 : overallProgress;
        saveProgress(currentChapter, finalProgress, isBookComplete); // Show toast on completion
      }
      // Save resume state alongside progress
      saveCurrentResumeState();
    }, 5000);
  }, [userId, bookId, book?.total_chapters, currentChapter, saveProgress, quizGating, saveCurrentResumeState]);

  useEffect(() => {
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  const totalChapters = book?.total_chapters || 1;
  const wordCount = chapter?.word_count || 0;
  const estimatedReadingTime = Math.ceil(wordCount / 200); // 200 wpm average

  // Auto-scroll synchronized with audio playback
  // DISABLED when sentence-level sync is active to prevent competing scroll systems
  const { isAutoScrolling, toggleAutoScroll, resetScroll } = useAutoScroll({
    isPlaying: false, // Disabled — useAudioSync handles scrolling
    contentRef,
    estimatedDurationMs: wordCount > 0 ? (wordCount / 150) * 60 * 1000 : 60000,
    enabled: false, // Disabled — useAudioSync is the sole scroll driver
  });

  // Sentence-level audio synchronization
  // Compute TTS preamble word offset ("Chapter X: Title.\n\n" words not in DOM)
  const ttsPreambleOffset = useMemo(() => {
    if (!chapter?.title) return 0;
    const preamble = `Chapter ${currentChapter}: ${chapter.title}.`;
    return preamble.split(/\s+/).filter(Boolean).length;
  }, [currentChapter, chapter?.title]);

  const audioSync = useAudioSync({
    chapterContent: chapter?.content || null,
    isPlaying: isTTSPlaying,
    contentRef,
    cumulativeTimeRef: ttsCumulativeTimeRef,
    audioRef: ttsAudioRef as React.RefObject<HTMLAudioElement>,
    estimatedDurationSec: ttsEstimatedDuration > 0 ? ttsEstimatedDuration : undefined,
    wordCount,
    chunkPlaybackInfo,
    ttsWordOffset: ttsPreambleOffset,
    playbackSpeed: ttsPlaybackSpeed,
  });

  // Audio highlighting is now handled directly in useAudioSync via DOM manipulation
  // for reliable mobile sync (bypasses React render cycle throttling)

  // Helper function to extract ALL code blocks from chapter content for playground
  const extractCodeFromChapter = (content: string): string => {
    const allBlocks: string[] = [];
    
    // Try structured code blocks first [CODE_BLOCK]
    const structuredMatches = content.matchAll(/\[CODE_BLOCK\][\s\S]*?code:\s*```[\w]*\n([\s\S]*?)```/g);
    for (const match of structuredMatches) {
      allBlocks.push(match[1].trim());
    }
    
    // Try standard markdown code blocks (skip if already found structured ones)
    if (allBlocks.length === 0) {
      const codeBlockMatches = content.matchAll(/```[\w]*\n([\s\S]*?)```/g);
      for (const match of codeBlockMatches) {
        allBlocks.push(match[1].trim());
      }
    }
    
    if (allBlocks.length > 0) {
      return allBlocks.join('\n\n// --- Next Code Block ---\n\n');
    }
    
    return '// No code examples found in this chapter\n// Try writing your own code here!';
  };

  // Helper function to detect the programming language from chapter content
  const detectLanguageFromChapter = (content: string): string => {
    // Try structured code blocks first
    const structuredLang = content.match(/\[CODE_BLOCK\][\s\S]*?language:\s*(\w+)/);
    if (structuredLang) return structuredLang[1].toLowerCase();
    
    // Try standard markdown code blocks
    const codeBlockLang = content.match(/```(\w+)\n/);
    if (codeBlockLang) return codeBlockLang[1].toLowerCase();
    
    // Fallback detection based on content
    if (/\bdef\s+\w+\s*\(/.test(content) || /\bprint\s*\(/.test(content)) return 'python';
    if (/\bfunction\s+\w+\s*\(/.test(content) || /\bconst\s+\w+\s*=/.test(content)) return 'javascript';
    if (/\bpublic\s+class\b/.test(content)) return 'java';
    
    return 'javascript';
  };

  // Check if chapter has code content (for showing playground button)
  const hasCodeContent = (content: string | null | undefined): boolean => {
    if (!content) return false;
    return content.includes('[CODE_BLOCK]') || 
           content.includes('```') || 
           /\bdef\s+\w+\s*\(|\bfunction\s+\w+\s*\(|\bclass\s+\w+/.test(content);
  };

  // CONTRACT 5B-3: Show skeleton with cached data for instant render
  if (loadState === 'skeleton' || loadState === 'offline-empty') {
    return (
      <ReaderSkeleton 
        chapterTitle={chapter?.title}
        chapterNumber={currentChapter}
        totalChapters={book?.total_chapters || undefined}
        bookTitle={book?.title}
        contentPreview={previewContent || undefined}
        isOffline={loadState === 'offline-empty'}
      />
    );
  }

  // Render a single dialogue line as a speech bubble
  const renderSpeechBubble = (character: string, speech: string, key: string) => {
    // Determine bubble color based on character name hash
    const charColors = [
      'bg-blue-500/20 border-blue-500/50',
      'bg-purple-500/20 border-purple-500/50', 
      'bg-emerald-500/20 border-emerald-500/50',
      'bg-amber-500/20 border-amber-500/50',
      'bg-rose-500/20 border-rose-500/50',
      'bg-cyan-500/20 border-cyan-500/50',
    ];
    const colorIndex = character.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % charColors.length;
    const bubbleColor = charColors[colorIndex];
    
    return (
      <div key={key} className={`relative my-3 p-4 rounded-2xl border-2 ${bubbleColor} max-w-[85%] ${colorIndex % 2 === 0 ? 'ml-auto' : 'mr-auto'}`}>
        <span className="absolute -top-3 left-4 px-2 py-0.5 bg-background text-xs font-bold uppercase tracking-wide text-foreground/70 rounded">
          {character}
        </span>
        <p className="text-foreground leading-relaxed pt-1">{speech}</p>
        {/* Speech bubble tail */}
        <div className={`absolute -bottom-2 ${colorIndex % 2 === 0 ? 'right-6' : 'left-6'} w-4 h-4 rotate-45 ${bubbleColor.split(' ')[0]} border-b-2 border-r-2 ${bubbleColor.split(' ')[1]}`} />
      </div>
    );
  };

  // Parse dialogue lines and return speech bubbles
  const parseDialogueBlock = (text: string, baseKey: number) => {
    const lines = text.split('\n').filter(l => l.trim());
    const elements: React.ReactNode[] = [];
    
    lines.forEach((line, idx) => {
      // Match: - CHARACTER: "text" or CHARACTER: "text"
      const dialogueMatch = line.match(/^-?\s*([A-Z][A-Za-z0-9_\s-]+):\s*[""]([^""]+)[""]/);
      if (dialogueMatch) {
        elements.push(renderSpeechBubble(dialogueMatch[1].trim(), dialogueMatch[2].trim(), `${baseKey}-dialogue-${idx}`));
      }
    });
    
    return elements.length > 0 ? elements : null;
  };

  // Strip duplicate chapter title/number from AI-generated content
  // The Reader UI already shows "Chapter X" + title as <h2>/<h3>, so remove from content
  const stripDuplicateTitle = (content: string, title: string): string => {
    let cleaned = content;
    // Strip leading lines that are chapter number headings or title headings (with optional bold **)
    // Loop to remove multiple consecutive heading lines (e.g. "## **Chapter 1**\n## **Title**\n")
    let changed = true;
    while (changed) {
      changed = false;
      // Match heading lines like: ## **Chapter 1** or ## Chapter 1: Title or ## **Title**
      const headingMatch = cleaned.match(/^\s*#{1,3}\s*\**\s*(?:Chapter\s+\d+[:\s\-–—]*)?[^]*?\**\s*\n/i);
      if (headingMatch) {
        const line = headingMatch[0].replace(/[#*\s\n]/g, '').toLowerCase();
        const titleClean = title.replace(/[#*\s]/g, '').toLowerCase();
        const isChapterLine = /chapter\s*\d+/i.test(headingMatch[0]);
        const isTitleLine = titleClean.length > 3 && line.includes(titleClean);
        if (isChapterLine || isTitleLine) {
          cleaned = cleaned.slice(headingMatch[0].length);
          changed = true;
        }
      }
    }
    return cleaned;
  };

  const renderContent = () => {
    if (!chapter?.content) {
      return (
        <div className="text-center py-12">
          <p className="text-muted-foreground">{t('reader.contentGenerating')}</p>
        </div>
      );
    }

    const displayContent = stripDuplicateTitle(chapter.content, chapter.title || '');

    // Check if this is comic content (contains base64 images or panel markers)
    const isComicContent = displayContent.includes('![Panel') || displayContent.includes('Panel 1') || displayContent.includes('[PANEL');

    // For non-comic content, use MarkdownRenderer for proper table/code rendering
    if (!isComicContent) {
      return <MarkdownRenderer content={displayContent} className={currentTheme.text} />;
    }

    // Comic content rendering with speech bubbles
    return displayContent.split('\n\n').map((paragraph, index) => {
      // Handle comic page headers
      if (paragraph.startsWith('## Page') || paragraph.match(/^Page\s+\d+/i)) {
        return (
          <h4 key={index} className="text-xl sm:text-2xl font-display font-bold text-primary mt-8 sm:mt-12 mb-4 sm:mb-6 text-center">
            {paragraph.replace(/^##\s*/, '')}
          </h4>
        );
      }
      // Handle panel markers
      if (paragraph.match(/^(?:\[PANEL\s*\d+\]|Panel\s+\d+)/i)) {
        return (
          <div key={index} className="text-center my-6">
            <Badge variant="outline" className="text-sm px-4 py-1 border-primary/50 text-primary">
              {paragraph.match(/(?:\[PANEL\s*\d+\]|Panel\s+\d+)/i)?.[0] || paragraph}
            </Badge>
          </div>
        );
      }
      // Handle comic images (base64 or URL)
      if (paragraph.startsWith('![')) {
        const imgMatch = paragraph.match(/!\[([^\]]*)\]\(([^)]+)\)/);
        if (imgMatch) {
          return (
            <div key={index} className="my-6 sm:my-8 flex justify-center comic-panel">
              <img 
                src={imgMatch[2]} 
                alt={imgMatch[1]} 
                className="w-full max-w-sm sm:max-w-md md:max-w-lg lg:max-w-xl rounded-xl shadow-2xl"
                style={{ aspectRatio: '1/1', objectFit: 'cover' }}
              />
            </div>
          );
        }
      }
      // Handle dialogue blocks with speech bubbles (for comic content)
      if (paragraph.includes('Dialogue:') || paragraph.match(/-?\s*[A-Z][A-Za-z0-9_\s-]+:\s*[""][^""]+[""]/)) {
        const dialogueBubbles = parseDialogueBlock(paragraph, index);
        if (dialogueBubbles) {
          return (
            <div key={index} className="my-6 space-y-2">
              {dialogueBubbles}
            </div>
          );
        }
      }
      // Handle comic captions (blockquotes)
      if (paragraph.startsWith('>')) {
        return (
          <div key={index} className="comic-caption text-center text-xl sm:text-2xl font-medium text-foreground my-4 sm:my-6 px-6 sm:px-12 py-4 bg-primary/10 rounded-xl border border-primary/30 max-w-md mx-auto">
            {paragraph.replace(/^>\s*/, '')}
          </div>
        );
      }
      // Handle captions (Caption: text)
      if (paragraph.match(/^Caption:\s*/i)) {
        return (
          <div key={index} className="comic-caption text-center text-lg italic text-foreground/80 my-4 px-8 py-3 bg-muted/30 rounded-lg border border-border/50 max-w-md mx-auto">
            {paragraph.replace(/^Caption:\s*/i, '')}
          </div>
        );
      }
      // Handle section dividers
      if (paragraph === '---') {
        return <hr key={index} className="my-6 sm:my-8 border-border/50" />;
      }
      if (paragraph.startsWith('## ')) {
        return (
          <h4 key={index} className="text-xl sm:text-2xl font-display font-bold text-primary mt-8 sm:mt-12 mb-4 sm:mb-6">
            {paragraph.replace('## ', '')}
          </h4>
        );
      }
      if (paragraph.startsWith('### ')) {
        return (
          <h5 key={index} className="text-lg sm:text-xl font-display font-semibold text-foreground/90 mt-6 sm:mt-8 mb-3 sm:mb-4">
            {paragraph.replace('### ', '')}
          </h5>
        );
      }
      // Handle Visual: descriptions in comics (show as scene description)
      if (paragraph.match(/^Visual:\s*/i)) {
        return (
          <div key={index} className="my-4 p-4 bg-muted/20 rounded-lg border-l-4 border-primary/50 text-sm text-foreground/70 italic">
            <span className="font-semibold text-foreground/90 not-italic">Scene: </span>
            {paragraph.replace(/^Visual:\s*/i, '')}
          </div>
        );
      }
      if (paragraph.startsWith('- ')) {
        return (
          <ul key={index} className="list-disc list-inside mb-4 space-y-2 text-sm sm:text-base">
            {paragraph.split('\n').map((item, i) => (
              <li key={i} className="text-foreground/80">{item.replace('- ', '')}</li>
            ))}
          </ul>
        );
      }
      // Handle italic text in comic content
      if (paragraph.startsWith('*[Illustration:')) {
        return (
          <div key={index} className="text-center text-muted-foreground italic my-4 p-4 bg-muted/20 rounded-lg text-sm">
            {paragraph.replace(/^\*|\*$/g, '')}
          </div>
        );
      }
      if (paragraph.startsWith('*') && paragraph.endsWith('*')) {
        return (
          <p key={index} className="text-center text-muted-foreground italic my-4 text-sm sm:text-base">
            {paragraph.replace(/^\*|\*$/g, '')}
          </p>
        );
      }
      return (
        <p key={index} className="mb-4 sm:mb-6 leading-relaxed text-sm sm:text-base">
          {paragraph}
        </p>
      );
    });
  };

  const currentTheme = READING_THEMES[readingTheme];

  return (
    <div className={`min-h-screen ${currentTheme.bg} transition-colors duration-300 overflow-x-hidden safe-all`}>
      {/* CONTRACT 5.2: Header with HARD safe area inset - never overlaps system UI */}
      <header 
        className="fixed top-0 left-0 right-0 z-50 bg-background/90 backdrop-blur-xl border-b border-border/50"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="container mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => navigate(`/book/${bookId}`)}
            >
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <div className="hidden sm:block">
              <h1 className="text-sm font-medium line-clamp-1">
                {book?.title || "Loading..."}
              </h1>
              <p className="text-xs text-muted-foreground">
                Chapter {currentChapter} of {totalChapters}
              </p>
            </div>
            {/* Reading Session Timer - compact on mobile */}
            <ReadingSessionTimer
              formattedTime={formattedTime}
              elapsedSeconds={elapsedSeconds}
              weeklyProgress={weeklyProgress}
              onUpdateGoal={updateWeeklyGoal}
              compact
            />
            {/* Gamification Bar — experiment-controlled */}
            {showGamBar && (
              <GamificationBar
                state={gamification.state}
                xpProgress={gamification.xpProgress}
                streakStatus={gamification.streakStatus}
                compact
              />
            )}
          </div>

          {/* Collaborative presence */}
          {editorsOnChapter.length > 0 && (
            <div className="hidden sm:flex items-center">
              <PresenceAvatars editors={editorsOnChapter} />
            </div>
          )}
          
          <div className="flex items-center gap-1 sm:gap-2">
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => {
                setShowTTS(!showTTS);
              }}
              className={showTTS ? "text-primary" : ""}
              title="Toggle Audio Player"
            >
              <Volume2 className="h-5 w-5" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon"
              onClick={() => {
                if (showSettings) {
                  setShowSettings(false);
                  return;
                }
                openExclusive('settings');
                setShowQA(false);
                setShowQuiz(false);
              }}
            >
              <Settings className="h-5 w-5" />
            </Button>
            {/* Overflow menu — low-frequency actions */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
                  <MoreVertical className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={() => {
                  if (showLevelSelector) {
                    setShowLevelSelector(false);
                    return;
                  }
                  openExclusive('level');
                  setShowQA(false);
                  setShowQuiz(false);
                }}>
                  <Brain className="h-4 w-4 mr-2" />
                  Cognitive Level
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => {
                  if (showReferences) {
                    setShowReferences(false);
                    return;
                  }
                  openExclusive('refs');
                  setShowQA(false);
                  setShowQuiz(false);
                }}>
                  <BookMarked className="h-4 w-4 mr-2" />
                  Citations & References
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Bookmark className="h-4 w-4 mr-2" />
                  Bookmark
                </DropdownMenuItem>
                <ReportContentDialog 
                  contentType="chapter" 
                  contentId={chapter?.id || ""} 
                  contentTitle={chapter?.title}
                  trigger={
                    <DropdownMenuItem onSelect={(e) => e.preventDefault()}>
                      <Flag className="h-4 w-4 mr-2" />
                      Report Content
                    </DropdownMenuItem>
                  }
                />
                <DropdownMenuItem onClick={() => navigate("/")}>
                  <Home className="h-4 w-4 mr-2" />
                  Back to Home
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* CONTRACT 5.2: Guided Reading Progress Bar - offset for safe area */}
      {guidedModeActive && chapter?.content && (
        <div 
          className="fixed left-0 right-0 z-40"
          style={{ top: "calc(env(safe-area-inset-top) + 3.5rem)" }}
        >
          <GuidedReadingMode
            cognitiveLevel={cognitiveLevel}
            currentProgress={readingProgress}
            chapterNumber={currentChapter}
            totalChapters={totalChapters}
            wordCount={wordCount}
          />
        </div>
      )}

      {/* Settings Panel */}
      {showSettings && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed top-14 right-4 z-50 bg-card rounded-lg border border-border shadow-lg p-4 w-64"
        >
          <div className="flex items-center justify-between mb-4">
            <span className="font-medium">{t('reader.settings')}</span>
            <Button variant="ghost" size="icon" onClick={() => setShowSettings(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-muted-foreground mb-2 block">
                {t('reader.fontSize')}: {fontSize}px
              </label>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">A</span>
                <input
                  type="range"
                  min="14"
                  max="24"
                  value={fontSize}
                  onChange={(e) => setFontSize(parseInt(e.target.value))}
                  className="w-full accent-primary"
                />
                <span className="text-lg text-muted-foreground font-bold">A</span>
              </div>
            </div>
            
            {/* Reading Theme Selection */}
            <div>
              <label className="text-sm text-muted-foreground mb-2 block flex items-center gap-2">
                <Palette className="h-4 w-4" />
                {t('reader.readingTheme')}
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(Object.keys(READING_THEMES) as ReadingTheme[]).map((theme) => (
                  <button
                    key={theme}
                    onClick={() => setReadingTheme(theme)}
                    className={`p-2 rounded-md text-xs font-medium transition-all ${
                      readingTheme === theme 
                        ? 'ring-2 ring-primary ring-offset-1' 
                        : 'hover:opacity-80'
                    } ${READING_THEMES[theme].bg} ${READING_THEMES[theme].text}`}
                  >
                    {READING_THEMES[theme].name}
                  </button>
                ))}
              </div>
            </div>

            {/* Screen Ratio */}
            <div>
              <label className="text-sm text-muted-foreground mb-2 block">Screen Ratio</label>
              <div className="grid grid-cols-4 gap-1.5">
                {([
                  { key: 'narrow' as const, label: 'Focus', icon: '▐▌' },
                  { key: 'normal' as const, label: 'Normal', icon: '▐██▌' },
                  { key: 'wide' as const, label: 'Wide', icon: '▐████▌' },
                  { key: 'full' as const, label: 'Full', icon: '▐██████▌' },
                ] as const).map(({ key, label, icon }) => (
                  <button
                    key={key}
                    onClick={() => updateSettings({ reading_width: key })}
                    className={cn(
                      "flex flex-col items-center gap-0.5 p-1.5 rounded-md text-[10px] font-medium transition-all border",
                      settings.reading_width === key
                        ? 'ring-2 ring-primary ring-offset-1 bg-primary/10 border-primary/30'
                        : 'bg-muted/30 border-border/30 hover:bg-muted/50'
                    )}
                  >
                    <span className="text-[8px] opacity-50 font-mono leading-none">{icon}</span>
                    <span>{label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Line Spacing */}
            <div>
              <label className="text-sm text-muted-foreground mb-2 block">
                Line Spacing: {settings.line_spacing === 'compact' ? 'Compact' : settings.line_spacing === 'relaxed' ? 'Relaxed' : settings.line_spacing === 'spacious' ? 'Spacious' : 'Normal'}
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {([
                  { key: 'compact' as const, label: 'Compact' },
                  { key: 'normal' as const, label: 'Normal' },
                  { key: 'relaxed' as const, label: 'Relaxed' },
                  { key: 'spacious' as const, label: 'Spacious' },
                ] as const).map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => updateSettings({ line_spacing: key })}
                    className={cn(
                      "p-1.5 rounded-md text-[10px] font-medium transition-all border",
                      settings.line_spacing === key
                        ? 'ring-2 ring-primary ring-offset-1 bg-primary/10 border-primary/30'
                        : 'bg-muted/30 border-border/30 hover:bg-muted/50'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{t('reader.guidedMode')}</span>
              <Button
                variant={guidedModeActive ? "default" : "outline"}
                size="sm"
                onClick={() => setGuidedModeActive(!guidedModeActive)}
              >
                {guidedModeActive ? t('reader.on') : t('reader.off')}
              </Button>
            </div>
            
            {/* Sync scrolling with audio (sentence-level) */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Sync scrolling with audio</span>
              <Button
                variant={audioSync.isSyncEnabled ? "default" : "outline"}
                size="sm"
                onClick={audioSync.toggleSync}
              >
                {audioSync.isSyncEnabled ? 'On' : 'Off'}
              </Button>
            </div>

            {/* Legacy auto-scroll */}
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Auto-scroll (linear)</span>
              <Button
                variant={isAutoScrolling ? "default" : "outline"}
                size="sm"
                onClick={toggleAutoScroll}
                disabled={!isTTSPlaying}
                title={isTTSPlaying ? "Toggle auto-scroll" : "Start audio to enable"}
              >
                {isAutoScrolling ? 'On' : 'Off'}
              </Button>
            </div>
          </div>
        </motion.div>
      )}

      {/* Cognitive Level Selector Panel */}
      <AnimatePresence>
        {showLevelSelector && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="fixed top-14 left-4 right-4 md:left-auto md:right-4 md:w-96 z-50"
          >
            <CognitiveLevelSelector
              selectedLevel={cognitiveLevel}
              onSelectLevel={setCognitiveLevel}
              estimatedReadingTime={estimatedReadingTime}
              onStartReading={() => setShowLevelSelector(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* CONTRACT 5.2: TTS Mini Player - respects safe areas, z-50 to always stay on top */}
      <AnimatePresence>
        {showTTS && chapter?.content && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed z-50"
            style={{ 
              bottom: "calc(env(safe-area-inset-bottom) + 1.5rem)",
              left: "1rem",
              right: "1rem",
              maxWidth: "24rem",
              marginLeft: "auto",
              marginRight: "auto"
            }}
          >
            <TTSMiniPlayer
              chapterText={`Chapter ${currentChapter}: ${chapter.title}.\n\n${stripDuplicateTitle(chapter.content || '', chapter.title || '')}`}
              selectedText={selectedTextForTTS}
              language={book?.language || "en"}
              stopKey={`${bookId}-${currentChapter}`}
              title={`${book?.title} - ${chapter.title}`}
              author="ScrollLibrary"
              bookId={bookId}
              chapterId={chapter.id}
              onClose={() => setShowTTS(false)}
              onInterrupt={() => {
                setShowVoiceAI(true);
                setShouldResumeTTS(true);
              }}
              autoContinue={autoContinueAudio}
              autoPlay={pendingAutoPlay}
              currentChapter={currentChapter}
              totalChapters={totalChapters}
              onPlayingChange={setIsTTSPlaying}
              onAudioRefChange={(el) => { ttsAudioRef.current = el; }}
              onCumulativeTimeChange={(secs) => { ttsCumulativeTimeRef.current = secs; }}
              onEstimatedDurationChange={setTtsEstimatedDuration}
               onChunkPlaybackInfo={setChunkPlaybackInfo}
               onPlaybackSpeedChange={setTtsPlaybackSpeed}
               adaptiveSpeed={guidedModeActive ? adaptiveRec.playbackSpeed : undefined}
               onChapterComplete={async () => {
                // AUTO-CONTINUE: Navigate to next chapter when audio finishes
                if (currentChapter < totalChapters) {
                  console.log("[Reader] Audio complete - advancing to next chapter");
                  
                  // Save progress for current chapter
                  if (userId && book?.total_chapters) {
                    const overallProgress = (currentChapter / book.total_chapters) * 100;
                    await saveProgress(currentChapter, overallProgress);
                  }
                  
                  // Set flag to auto-play next chapter
                  setPendingAutoPlay(true);
                  
                  // Navigate to next chapter
                  window.scrollTo({ top: 0, behavior: 'instant' });
                  navigate(`/read/${bookId}/${currentChapter + 1}`, { replace: true });
                  
                  toast({
                    title: "Chapter complete",
                    description: `Continuing to Chapter ${currentChapter + 1}...`,
                    duration: 2000,
                  });
                } else {
                  // Book complete - save 100% progress
                  if (userId && book?.total_chapters) {
                    await saveProgress(currentChapter, 100, true);
                  }
                  toast({
                    title: "🎉 Book complete!",
                    description: "You've finished listening to all chapters.",
                    duration: 4000,
                  });
                }
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ADAPTIVE: Reflection/Recap pause overlay */}
      <ReflectionPause
        isActive={showReflectionPause && guidedModeActive}
        onContinue={() => {
          setShowReflectionPause(false);
          setReflectionDismissedAt(readingProgress);
        }}
        prompt={adaptiveRec.recapPrompt || adaptiveRec.reflectionPrompt || 'Take a moment to reflect on what you\'ve read so far.'}
      />

      {/* ADAPTIVE: Suggest review banner when struggling */}
      {guidedModeActive && adaptiveRec.suggestReview && readingProgress < 20 && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="fixed top-16 left-4 right-4 z-30 max-w-md mx-auto"
        >
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 text-sm text-amber-700 dark:text-amber-300 flex items-center gap-2">
            <Brain className="h-4 w-4 shrink-0" />
            <span>Consider reviewing the previous chapter before continuing — your quiz scores suggest some concepts need reinforcement.</span>
            <Button variant="ghost" size="sm" className="shrink-0 h-7 text-xs" onClick={() => {
              if (currentChapter > 1) navigate(`/read/${bookId}/${currentChapter - 1}`);
            }}>Review</Button>
          </div>
        </motion.div>
      )}


      <AnimatePresence>
        {showReferences && chapter?.chapter_references && (
          <DeepResearchPanel
            isOpen={showReferences}
            onClose={() => setShowReferences(false)}
            sources={(chapter.chapter_references || []).map((ref: any) => ({
              id: ref.id || `ref-${Math.random()}`,
              title: ref.title || 'Unknown',
              authors: ref.authors || (ref.author ? [ref.author] : ['Unknown']),
              year: ref.year || new Date().getFullYear(),
              type: ref.type || 'article',
              doi: ref.doi,
              url: ref.url || ref.sourceUrl,
              journal: ref.journal,
              publisher: ref.publisher,
              abstract: ref.abstract,
              citationCount: ref.citationCount,
              verified: ref.verified ?? !!ref.doi,
              database: ref.database || 'Unknown',
              peerReviewed: ref.peerReviewed ?? !!ref.doi,
            } as AcademicSource))}
            metadata={{
              totalSources: chapter.chapter_references?.length || 0,
              verifiedSources: (chapter.chapter_references || []).filter((r: any) => r.doi || r.verified).length,
              peerReviewedSources: (chapter.chapter_references || []).filter((r: any) => r.peerReviewed).length,
              databasesCovered: [...new Set((chapter.chapter_references || []).map((r: any) => r.database || 'Unknown'))] as string[],
              researchDate: chapter.research_metadata?.research_date || new Date().toISOString(),
              confidenceScore: chapter.research_metadata?.confidence_score || 'moderate',
              topicCoverage: chapter.research_metadata?.topic_coverage || 50,
            }}
            citationStyle={(chapter?.citation_style || 'APA') as CitationStyle}
          />
        )}
      </AnimatePresence>

      {/* CONTRACT 5.2: Content area with HARD safe area padding - NEVER touches system UI */}
      <main 
        className="pb-24 overflow-x-hidden"
        style={{ 
          paddingTop: guidedModeActive 
            ? "var(--reader-content-top-guided, calc(env(safe-area-inset-top) + 7rem))" 
            : "var(--reader-content-top, calc(env(safe-area-inset-top) + 5rem))",
          paddingBottom: "calc(env(safe-area-inset-bottom) + 6rem)",
        }}
      >
        <article 
          className={cn(
            "mx-auto px-4 overflow-x-hidden transition-all duration-300",
            settings.reading_width === 'narrow' && "max-w-xl",
            settings.reading_width === 'normal' && "max-w-3xl",
            settings.reading_width === 'wide' && "max-w-5xl",
            settings.reading_width === 'full' && "max-w-full px-6",
            !settings.reading_width && "max-w-3xl",
          )}
          style={{
            ['--reader-line-height' as string]: settings.line_spacing === 'compact' ? '1.4' 
              : settings.line_spacing === 'relaxed' ? '2.0' 
              : settings.line_spacing === 'spacious' ? '2.4' 
              : '1.7',
          }}
          ref={contentRef}
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6 }}
          >
            {/* Academic Mode Indicator */}
            {chapter?.academic_mode && (
              <AcademicModeIndicator 
                isAcademicMode={true} 
                citationStyle={chapter?.citation_style || 'APA'} 
                className="mb-4"
              />
            )}

            {/* AI Disclaimer */}
            {chapter?.academic_mode ? (
              <AcademicDisclaimer variant="compact" className="mb-6" />
            ) : (
              <ContentDisclaimer type="ai" className="mb-6" />
            )}

            {/* Chapter 1 Summary-First (experiment-controlled) */}
            {showCh1Summary && !ch1SummaryDismissed && chapter?.content && (
              <ChapterOneSummary
                chapterTitle={chapter.title}
                chapterContent={chapter.content}
                bookTitle={book?.title}
                wordCount={wordCount}
                onDismiss={() => setCh1SummaryDismissed(true)}
              />
            )}
            {/* Previously in this book - Context for returning readers */}
            {bookId && currentChapter > 1 && (
              <PreviouslyInBookCard
                bookId={bookId}
                currentChapter={currentChapter}
                bookTitle={book?.title}
              />
            )}

            <h2 className={`font-display text-3xl md:text-4xl font-bold mb-2 ${readingTheme === 'default' ? 'text-gradient-gold' : currentTheme.text}`}>
              {t('reader.chapter')} {currentChapter}
            </h2>
            <h3 className={`font-display text-xl md:text-2xl mb-8 ${currentTheme.text} opacity-80`}>
              {chapter?.title || "Loading..."}
            </h3>
            
            {/* Word count and time estimate */}
            <div className={`flex items-center gap-4 mb-8 text-sm ${currentTheme.text} opacity-60`}>
              <span>{wordCount.toLocaleString()} {t('reader.words')}</span>
              <span>•</span>
              <span>~{estimatedReadingTime} {t('reader.minRead')}</span>
            </div>
            
            <TextHighlighter onAskAboutSelection={(text) => {
              // Update TTS selection text
              setSelectedTextForTTS(text);
              setHighlightedText(text);
              closeTopPanels();
              setShowQuiz(false);
              // Voice conversation merged into Ask AI
              setShowQA(true);
              // Show TTS player if hidden
              setShowTTS(true);
            }}>
              <div 
                className={cn(
                  "reading-content relative",
                  currentTheme.text,
                  settings.reading_width === 'wide' && "reading-content-wide",
                  settings.reading_width === 'full' && "reading-content-full",
                )}
                style={{ fontSize: `${fontSize}px`, fontFamily: 'var(--reader-font-family, inherit)' }}
                onMouseUp={() => {
                  // Capture selected text for TTS
                  const selection = window.getSelection();
                  if (selection && selection.toString().trim().length > 10) {
                    setSelectedTextForTTS(selection.toString().trim());
                  }
                }}
              >
                {renderContent()}
              </div>

              {/* "Follow Audio" button when user scrolls away */}
              {audioSync.isUserScrolledAway && isTTSPlaying && audioSync.isSyncEnabled && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 10 }}
                  className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40"
                >
                  <Button
                    size="sm"
                    onClick={audioSync.followAudio}
                    className="shadow-lg gap-2 bg-primary text-primary-foreground"
                  >
                    <Volume2 className="h-4 w-4" />
                    Follow Audio
                  </Button>
                </motion.div>
              )}
            </TextHighlighter>

            {/* Adaptive Learning Path — personalized difficulty */}
            {guidedModeActive && bookId && (
              <div className="mt-6 mb-4">
                <AdaptiveLearningPath
                  userId={userId}
                  bookId={bookId}
                  chapterId={chapter?.id}
                  onStartQuiz={(difficulty) => {
                    setShowQuiz(true);
                  }}
                />
              </div>
            )}

            {/* Competency Learning Panel — Kolb's 4-Phase Cycle */}
            {guidedModeActive && chapter?.content && (
              <div className="mt-4 mb-12">
                <CompetencyLearningPanel
                  progress={competency.progress}
                  chapterContent={chapter.content}
                  chapterTitle={chapter.title}
                  bookTitle={book?.title || ''}
                  bookId={bookId || ''}
                  chapterId={chapter.id}
                  onCompleteConceptPhase={competency.completeConceptPhase}
                  onSubmitReflection={competency.submitReflection}
                  onSubmitApplication={competency.submitApplication}
                  onCompleteCompetencyCheck={competency.completeCompetencyCheck}
                  isSaving={competency.isSaving}
                />
              </div>
            )}
          </motion.div>
        </article>
      </main>

      {/* CONTRACT 5.2: Floating Cognitive Level Indicator - respects safe areas & auto-hides */}
      {/* FIXED: z-20 to stay below action buttons but above content */}
      <AnimatePresence>
        {guidedModeActive && !showLevelSelector && !showQA && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed z-20"
            style={{ 
              bottom: "calc(env(safe-area-inset-bottom) + 5rem)",
              left: "50%",
              transform: "translateX(-50%)"
            }}
          >
            <CognitiveLevelIndicator
              level={cognitiveLevel}
              progress={readingProgress}
              onClick={() => setShowLevelSelector(true)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Single "Tools" FAB → Bottom Sheet with all reader actions */}
      {chapter?.content && !showQA && !showQuiz && (
        <ReaderToolsSheet
          isQuizUnlocked={quizGating.isQuizUnlocked}
          quizProgress={quizGating.readProgress}
          hasCodeContent={hasCodeContent(chapter.content)}
          hasComicContent={false}
          isBookOwner={isBookOwner}
          onVoiceClick={() => {
            closeTopPanels();
            setShowQuiz(false);
            setShowQA(false);
            setShowVoiceAI(true);
          }}
          onQuizClick={() => {
            closeTopPanels();
            setShowQA(false);
            setShowVoiceAI(false);
            setShowQuiz(true);
          }}
          onQAClick={() => {
            closeTopPanels();
            setShowQuiz(false);
            setShowVoiceAI(false);
            setShowQA(true);
          }}
          onPlaygroundClick={() => {
            closeTopPanels();
            setShowPlayground(true);
          }}
          onComicModeClick={() => {}}
          onEditClick={() => setShowDirectEditor(true)}
          onLearningDeckClick={() => {
            setShowLearningDeckDialog(true);
          }}
          onFlashcardsClick={() => {
            setShowFlashcardDialog(true);
          }}
          onVideoClick={() => {
            closeTopPanels();
            setShowChapterVideo(true);
          }}
          onKnowledgeGraphClick={() => {
            closeTopPanels();
            setShowQuiz(false);
            setShowQA(false);
            setShowVoiceAI(false);
            setShowPlayground(false);
            setShowChapterVideo(false);
            setShowKnowledgeGraph(true);
          }}
        />
      )}

      {/* Quiz Mode */}
      {chapter?.content && (
        <QuizMode
          isOpen={showQuiz}
          onClose={() => setShowQuiz(false)}
          chapterContent={chapter.content}
          chapterTitle={chapter.title}
          bookTitle={book?.title || ""}
          bookId={bookId || ""}
          chapterId={chapter.id}
          adaptiveBloomLevel={guidedModeActive ? adaptiveRec.bloomLevel : undefined}
          adaptiveDifficultyOverride={guidedModeActive ? adaptiveRec.quizDifficulty : undefined}
        />
      )}

      {/* Ask AI Panel — text-first Q&A */}
      {chapter?.content && (
        <InteractiveQA
          isOpen={showQA}
          onClose={() => { setShowQA(false); setHighlightedText(""); }}
          chapterContent={chapter.content}
          chapterTitle={chapter.title}
          bookTitle={book?.title || ""}
          bookId={bookId}
          chapterId={chapter.id}
          highlightedText={highlightedText}
          onClearHighlight={() => setHighlightedText("")}
          cognitiveLevel={cognitiveLevel}
        />
      )}

      {/* Dedicated Voice AI */}
      {showVoiceAI && chapter?.content && book && (
        <VoiceConversation
          chapterContent={chapter.content}
          chapterTitle={chapter.title}
          bookTitle={book.title}
          cognitiveLevel={cognitiveLevel}
          bookId={bookId || ""}
          chapterId={chapter.id}
          onClose={() => setShowVoiceAI(false)}
          onResumeTTS={shouldResumeTTS ? () => {
            setShowVoiceAI(false);
            setShouldResumeTTS(false);
            setShowTTS(true);
          } : undefined}
        />
      )}

      {/* Code Playground */}
      {chapter?.content && (
        <CodePlayground
          isOpen={showPlayground}
          onClose={() => setShowPlayground(false)}
          initialCode={extractCodeFromChapter(chapter.content)}
          initialLanguage={detectLanguageFromChapter(chapter.content)}
          title={`Code Playground - ${chapter.title}`}
        />
      )}

      {/* Chapter Video Generator */}
      {showChapterVideo && chapter?.content && book && (
        <ChapterVideoGenerator
          bookId={bookId || ""}
          bookTitle={book.title}
          bookType={(book as any).book_type || "standard"}
          chapterTitle={chapter.title}
          chapterContent={chapter.content}
          chapterNumber={currentChapter}
          language={book.language || "en"}
          onClose={() => setShowChapterVideo(false)}
        />
      )}

      {/* Direct Text Editor for book owners */}
      {showDirectEditor && chapter?.content && (
        <DirectTextEditor
          chapterId={chapter.id}
          content={chapter.content}
          isOwner={isBookOwner}
          onSave={(newContent) => {
            setShowDirectEditor(false);
            setChapterContentOverride({
              content: newContent,
              wordCount: newContent.split(/\s+/).filter((w: string) => w.length > 0).length,
            });
            toast({
              title: "Content updated",
              description: "Your edits are now visible.",
              duration: 2000,
            });
          }}
          onCancel={() => setShowDirectEditor(false)}
        />
      )}

      {/* Flashcard Generator (controlled from Tools sheet) */}
      {bookId && book && (
        <FlashcardGenerator
          bookId={bookId}
          bookTitle={book.title}
          currentChapter={currentChapter}
          totalChapters={totalChapters}
          open={showFlashcardDialog}
          onOpenChange={setShowFlashcardDialog}
          variant="inline"
          className="hidden"
        />
      )}

      {/* Learning Deck Generator (controlled from Tools sheet) */}
      {bookId && book && (
        <LearningDeckGenerator
          bookId={bookId}
          bookTitle={book.title}
          userId={userId}
          totalChapters={totalChapters}
          currentChapter={currentChapter}
          open={showLearningDeckDialog}
          onOpenChange={setShowLearningDeckDialog}
          variant="inline"
          className="hidden"
        />
      )}

      {/* Knowledge Graph — Cognitive Assimilation Interface */}
      {chapter?.content && (
        <KnowledgeGraphPanel
          isOpen={showKnowledgeGraph}
          onClose={() => setShowKnowledgeGraph(false)}
          chapterContent={chapter.content}
          chapterTitle={chapter.title}
          bookTitle={book?.title || ''}
          chapterNumber={currentChapter}
          bookId={bookId}
        />
      )}


      {/* CONTRACT 5.2: Navigation Footer with HARD safe area inset - NEVER overlaps home indicator */}
      <footer 
        className="fixed bottom-0 left-0 right-0 bg-background/90 backdrop-blur-xl border-t border-border/50"
        style={{ 
          paddingBottom: "calc(env(safe-area-inset-bottom) + 0.5rem)",
          paddingLeft: "env(safe-area-inset-left)",
          paddingRight: "env(safe-area-inset-right)",
        }}
      >
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Button
            variant="ghost"
            onClick={async () => {
              // Save progress before navigating
              if (userId && book?.total_chapters) {
                const completedChapters = currentChapter - 1;
                const currentChapterContribution = readingProgress / 100;
                const overallProgress = ((completedChapters + currentChapterContribution) / book.total_chapters) * 100;
                const isBookComplete = currentChapter === book.total_chapters && readingProgress >= 95;
                await saveProgress(currentChapter, isBookComplete ? 100 : overallProgress);
              }
              // Scroll to top for new chapter
              window.scrollTo({ top: 0, behavior: 'instant' });
              navigate(`/read/${bookId}/${currentChapter - 1}`, { replace: true });
            }}
            disabled={currentChapter <= 1}
            className="gap-2"
          >
            <ChevronLeft className="h-4 w-4" />
            {t('reader.previous')}
          </Button>
          
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-primary" />
            <span className="text-sm text-muted-foreground">
              {currentChapter} / {totalChapters}
            </span>
          </div>

          <Button
            variant="ghost"
            onClick={async () => {
              // Save progress before navigating (mark current chapter as complete)
              if (userId && book?.total_chapters) {
                const overallProgress = (currentChapter / book.total_chapters) * 100;
                await saveProgress(currentChapter, overallProgress);
              }
              // Scroll to top for new chapter
              window.scrollTo({ top: 0, behavior: 'instant' });
              navigate(`/read/${bookId}/${currentChapter + 1}`, { replace: true });
            }}
            disabled={currentChapter >= totalChapters}
            className="gap-2"
          >
            {t('reader.next')}
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </footer>

      {/* === GAMIFICATION OVERLAYS (Interruption-managed + calmness budget) === */}
      
      {/* Hook Screen — highest priority */}
      {showHookScreen && chapter && !hookDismissed && (
        <ChapterHookScreen
          chapterNumber={currentChapter}
          chapterTitle={chapter.title}
          wordCount={chapter.word_count || 500}
          onStart={() => setHookDismissed(true)}
          bookTitle={book?.title}
          totalChapters={book?.total_chapters || undefined}
          userLevel={gamification.state.level}
        />
      )}
      
      {/* Streak Recovery — second priority, gated by calmness budget */}
      {canShow(interruptionRef.current, 'streak_recovery') && 
       !isOverBudget(interruptionRef.current, interventionConfig.maxInterruptionsPerSession) &&
       requestInterruptionSlot(interventionConfig.maxInterruptionsPerSession) && (
        <StreakAlert
          streakBroken={gamification.streakBroken}
          onDismiss={gamification.dismissStreakBroken}
        />
      )}
      
      {/* Achievement / Level / Reward — gated by calmness budget */}
      {canShow(interruptionRef.current, 'reward_popup') && 
       !isOverBudget(interruptionRef.current, interventionConfig.maxInterruptionsPerSession) && (
        <RewardPopup
          reward={gamification.lastReward}
          onDismiss={gamification.dismissReward}
          leveledUp={canShow(interruptionRef.current, 'level_milestone') ? gamification.leveledUp : false}
          newLevel={gamification.newLevel}
          onDismissLevelUp={gamification.dismissLevelUp}
          achievementReward={canShow(interruptionRef.current, 'achievement') ? gamification.achievementReward : null}
          onDismissAchievement={gamification.dismissAchievement}
          streakMilestone={gamification.streakMilestone}
          onDismissStreakMilestone={gamification.dismissStreakMilestone}
        />
      )}
      
      {/* AI Companion — lowest priority, uses pre-computed flag (NOT Math.random on render) */}
      {showAICompanion && aiCompanionAllowed &&
       canShow(interruptionRef.current, 'ai_companion') && 
       !isInDeepFlow(readingProgress, elapsedSeconds, getLastInterruptionTime()) &&
       !isOverBudget(interruptionRef.current, interventionConfig.maxInterruptionsPerSession) && (
        <AICompanion
          readingProgress={readingProgress}
          chapterNumber={currentChapter}
          sectionsCompleted={gamification.state.sectionsCompleted}
          streakDays={gamification.state.streakCurrent}
          bookTitle={book?.title}
        />
      )}
      
      {/* Stuck Reader Rescue */}
      {bookId && (
        <StuckReaderRescue
          chapterNumber={currentChapter}
          readingProgress={readingProgress}
          sectionsCompleted={gamification.state.sectionsCompleted}
          bookId={bookId}
          isVisible={hookDismissed && !gamification.streakBroken}
          onListenInstead={() => setShowTTS(true)}
          onGuidedMode={() => setGuidedModeActive(true)}
          onContinue={() => {
            if (contentRef.current) {
              contentRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          }}
        />
      )}
    </div>
  );
}
