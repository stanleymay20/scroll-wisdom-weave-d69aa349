/**
 * COMIC READER TYPES
 * Shared types for the comic reading experience
 */

import { ComicSubType } from '@/components/generate/ComicSubTypeSelector';

// Panel data structure
export interface ComicPanelData {
  panelNumber: number;
  imageUrl?: string;
  visualDescription: string;
  dialogues: DialogueData[];
  caption?: string;
  learningMoment?: LearningMoment;
}

export interface DialogueData {
  character: string;
  speech: string;
  bubbleType: 'speech' | 'thought' | 'shout' | 'whisper' | 'narration';
}

// Learning moment embedded in panels
export interface LearningMoment {
  objective: string;
  concept?: string;
  vocabulary?: string[];
  highlighted: boolean;
}

// Age-based UI configuration
export type AgeGroup = 'children' | 'teen' | 'adult';

export interface AgeAdaptiveConfig {
  ageGroup: AgeGroup;
  fontSize: 'large' | 'medium' | 'normal';
  useRoundedUI: boolean;
  showEmojis: boolean;
  colorSaturation: 'high' | 'medium' | 'low';
  animationIntensity: 'bouncy' | 'smooth' | 'minimal';
  hapticFeedback: boolean;
  encouragementMessages: boolean;
  showLearningBadges: boolean;
  progressStyle: 'stars' | 'dots' | 'bar';
}

// Get age group from comic sub-type
export function getAgeGroupFromSubType(subType: ComicSubType): AgeGroup {
  switch (subType) {
    case 'children_story':
    case 'children_learning':
    case 'moral_values':
      return 'children';
    case 'teen_graphic':
      return 'teen';
    case 'educational':
    case 'entertainment':
    default:
      return 'adult';
  }
}

// Age-adaptive configurations
export const AGE_CONFIGS: Record<AgeGroup, AgeAdaptiveConfig> = {
  children: {
    ageGroup: 'children',
    fontSize: 'large',
    useRoundedUI: true,
    showEmojis: true,
    colorSaturation: 'high',
    animationIntensity: 'bouncy',
    hapticFeedback: true,
    encouragementMessages: true,
    showLearningBadges: true,
    progressStyle: 'stars',
  },
  teen: {
    ageGroup: 'teen',
    fontSize: 'medium',
    useRoundedUI: true,
    showEmojis: false,
    colorSaturation: 'medium',
    animationIntensity: 'smooth',
    hapticFeedback: true,
    encouragementMessages: false,
    showLearningBadges: true,
    progressStyle: 'dots',
  },
  adult: {
    ageGroup: 'adult',
    fontSize: 'normal',
    useRoundedUI: false,
    showEmojis: false,
    colorSaturation: 'low',
    animationIntensity: 'minimal',
    hapticFeedback: false,
    encouragementMessages: false,
    showLearningBadges: false,
    progressStyle: 'bar',
  },
};

// Reader props
export interface ComicReaderProps {
  panels: ComicPanelData[];
  chapterTitle: string;
  bookTitle: string;
  subType: ComicSubType;
  onClose: () => void;
  onComplete?: () => void;
  onPanelChange?: (panelIndex: number) => void;
  learningObjectives?: string[];
  certificationProgress?: CertificationProgress;
}

// Certification progress for comics
export interface CertificationProgress {
  isEligible: boolean;
  certificationType: string | null;
  completedPanels: number[];
  quizScore?: number;
  objectivesCompleted: number;
  objectivesTotal: number;
}

// Encouragement messages for children
export const ENCOURAGEMENT_MESSAGES = [
  "Great job! 🌟",
  "You're doing amazing! ✨",
  "Keep going! 🎉",
  "Awesome reading! 📚",
  "You're a superstar! ⭐",
  "Fantastic! 🌈",
  "Well done! 👏",
  "You're learning so much! 🧠",
] as const;

export function getRandomEncouragement(): string {
  return ENCOURAGEMENT_MESSAGES[Math.floor(Math.random() * ENCOURAGEMENT_MESSAGES.length)];
}
