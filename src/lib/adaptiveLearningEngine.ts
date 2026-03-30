/**
 * Adaptive Learning Engine
 * 
 * REAL behavior model that uses reading progress, quiz performance, and user profile
 * to affect playback speed, recap frequency, quiz difficulty, and explanation depth.
 * 
 * STATUS:
 * - ✅ IMPLEMENTED: Speed recommendations, recap triggers, difficulty mapping
 * - ✅ IMPLEMENTED: Profile-based defaults
 * - 🔮 FUTURE-READY: Server-side persistence, checkpoint gating, chapter flow reordering
 */

export interface LearnerState {
  /** Average quiz score across recent attempts (0-100) */
  avgQuizScore: number;
  /** Number of quiz attempts for this book */
  totalAttempts: number;
  /** Reading progress for current chapter (0-100) */
  chapterProgress: number;
  /** Chapters completed in this book */
  chaptersCompleted: number;
  /** Total chapters in book */
  totalChapters: number;
  /** User's profile complexity level */
  complexityLevel: 'beginner' | 'intermediate' | 'advanced';
  /** User's study speed preference */
  studySpeed: 'slow' | 'normal' | 'fast';
  /** Current cognitive/learning mode */
  cognitiveLevel: string;
  /** Time spent reading this chapter (seconds) */
  timeSpentSeconds: number;
}

export interface AdaptiveRecommendation {
  /** Recommended playback speed multiplier */
  playbackSpeed: number;
  /** Whether to show a recap prompt at this progress point */
  showRecap: boolean;
  /** Recap prompt text */
  recapPrompt: string | null;
  /** Recommended quiz difficulty (1-5) */
  quizDifficulty: number;
  /** Recommended Bloom level for next quiz */
  bloomLevel: 'remember' | 'understand' | 'apply' | 'analyze' | 'evaluate' | 'create';
  /** Whether to show a reflection prompt */
  showReflection: boolean;
  /** Reflection prompt text */
  reflectionPrompt: string | null;
  /** Whether to suggest re-reading previous chapter */
  suggestReview: boolean;
  /** Explanation depth: 'brief' | 'standard' | 'detailed' */
  explanationDepth: 'brief' | 'standard' | 'detailed';
}

const BLOOM_LEVELS = ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create'] as const;

/**
 * Compute adaptive recommendation from learner state.
 * This is the real engine — not cosmetic.
 */
export function computeAdaptiveRecommendation(state: LearnerState): AdaptiveRecommendation {
  const {
    avgQuizScore, totalAttempts, chapterProgress, chaptersCompleted,
    totalChapters, complexityLevel, studySpeed, cognitiveLevel, timeSpentSeconds,
  } = state;

  // === PLAYBACK SPEED ===
  let playbackSpeed = 1.0;
  if (studySpeed === 'fast') playbackSpeed = 1.25;
  if (studySpeed === 'slow') playbackSpeed = 0.85;
  // If struggling (low quiz scores), slow down
  if (avgQuizScore < 50 && totalAttempts > 1) playbackSpeed = Math.min(playbackSpeed, 0.9);
  // If mastering (high scores), allow speed up
  if (avgQuizScore > 85 && totalAttempts > 2) playbackSpeed = Math.max(playbackSpeed, 1.25);

  // === RECAP TRIGGERS ===
  let showRecap = false;
  let recapPrompt: string | null = null;
  
  // Show recap at 50% if in analytical/mastery mode
  if (chapterProgress >= 48 && chapterProgress <= 52) {
    if (cognitiveLevel === 'analytical' || cognitiveLevel === 'mastery') {
      showRecap = true;
      recapPrompt = 'You\'re halfway through. What key concepts have you identified so far? How do they relate to what you learned in previous chapters?';
    }
  }
  // Show recap at 75% for all modes if struggling
  if (chapterProgress >= 73 && chapterProgress <= 77 && avgQuizScore < 60 && totalAttempts > 0) {
    showRecap = true;
    recapPrompt = 'Before continuing to the final section, review the main ideas. Consider re-reading any sections that were unclear.';
  }

  // === QUIZ DIFFICULTY ===
  let quizDifficulty = 2; // default: moderate
  if (complexityLevel === 'beginner') quizDifficulty = 1;
  if (complexityLevel === 'advanced') quizDifficulty = 3;
  // Adapt from performance
  if (avgQuizScore > 80 && totalAttempts >= 2) quizDifficulty = Math.min(5, quizDifficulty + 1);
  if (avgQuizScore < 40 && totalAttempts >= 2) quizDifficulty = Math.max(1, quizDifficulty - 1);

  // === BLOOM LEVEL ===
  let bloomIndex = 1; // default: understand
  if (complexityLevel === 'beginner') bloomIndex = 0;
  if (complexityLevel === 'advanced') bloomIndex = 3;
  if (cognitiveLevel === 'mastery') bloomIndex = Math.max(bloomIndex, 4);
  if (cognitiveLevel === 'analytical') bloomIndex = Math.max(bloomIndex, 3);
  if (cognitiveLevel === 'applied') bloomIndex = Math.max(bloomIndex, 2);
  // Performance-based adjustment
  if (avgQuizScore > 85 && totalAttempts >= 3) bloomIndex = Math.min(5, bloomIndex + 1);
  if (avgQuizScore < 40 && totalAttempts >= 2) bloomIndex = Math.max(0, bloomIndex - 1);
  const bloomLevel = BLOOM_LEVELS[bloomIndex];

  // === REFLECTION PROMPTS ===
  let showReflection = false;
  let reflectionPrompt: string | null = null;
  if (chapterProgress >= 95 && (cognitiveLevel === 'analytical' || cognitiveLevel === 'mastery' || cognitiveLevel === 'applied')) {
    showReflection = true;
    reflectionPrompt = 'Before moving to the next chapter, write a brief reflection: What was the most important insight? How might you apply it?';
  }

  // === SUGGEST REVIEW ===
  const suggestReview = avgQuizScore < 50 && totalAttempts >= 2 && chaptersCompleted > 0;

  // === EXPLANATION DEPTH ===
  let explanationDepth: 'brief' | 'standard' | 'detailed' = 'standard';
  if (complexityLevel === 'beginner' || avgQuizScore < 50) explanationDepth = 'detailed';
  if (complexityLevel === 'advanced' && avgQuizScore > 80) explanationDepth = 'brief';

  return {
    playbackSpeed,
    showRecap,
    recapPrompt,
    quizDifficulty,
    bloomLevel,
    showReflection,
    reflectionPrompt,
    suggestReview,
    explanationDepth,
  };
}

/**
 * Get default learner state from profile settings.
 */
export function defaultLearnerState(profileOverrides?: Partial<LearnerState>): LearnerState {
  return {
    avgQuizScore: 0,
    totalAttempts: 0,
    chapterProgress: 0,
    chaptersCompleted: 0,
    totalChapters: 0,
    complexityLevel: 'intermediate',
    studySpeed: 'normal',
    cognitiveLevel: 'functional',
    timeSpentSeconds: 0,
    ...profileOverrides,
  };
}
