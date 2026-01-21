/**
 * COMIC CERTIFICATION SPECIFICATION (CCS-1.0)
 * 
 * Defines certification pathways for comic book content:
 * - Educational comics → concept_mastery certificate
 * - Children's learning → creative_learning certificate
 * - Moral/values → creative_learning certificate
 * - Entertainment → NO certification (explicit)
 */

import { ComicSubType, ComicSubTypeConfig } from '@/components/generate/ComicSubTypeSelector';

// ===========================================
// CERTIFICATION TYPES FOR COMICS
// ===========================================

export type ComicCertificationType = 
  | 'literacy_engagement'    // Children's story - basic reading engagement
  | 'creative_learning'      // Children's learning, moral values
  | 'concept_mastery'        // Educational comics - concept understanding
  | null;                    // Entertainment - no certification

export interface ComicCertificationConfig {
  subType: ComicSubType;
  certificationType: ComicCertificationType;
  requiresQuiz: boolean;
  quizTierRequirements: {
    minTier1: number;
    minTier2: number;
    minTier3: number;
  };
  passingScore: number;
  requiresCompletionTracking: boolean;
  learningObjectivesRequired: boolean;
  manifestIncludesObjectives: boolean;
}

// ===========================================
// CERTIFICATION CONFIGURATIONS BY SUB-TYPE
// ===========================================

export const COMIC_CERTIFICATION_CONFIGS: Record<ComicSubType, ComicCertificationConfig> = {
  children_story: {
    subType: 'children_story',
    certificationType: 'literacy_engagement',
    requiresQuiz: false, // Reading completion is enough for young children
    quizTierRequirements: { minTier1: 0, minTier2: 0, minTier3: 0 },
    passingScore: 0,
    requiresCompletionTracking: true,
    learningObjectivesRequired: false,
    manifestIncludesObjectives: false,
  },
  children_learning: {
    subType: 'children_learning',
    certificationType: 'creative_learning',
    requiresQuiz: true,
    quizTierRequirements: { minTier1: 2, minTier2: 1, minTier3: 0 },
    passingScore: 60, // Lower bar for children
    requiresCompletionTracking: true,
    learningObjectivesRequired: true,
    manifestIncludesObjectives: true,
  },
  teen_graphic: {
    subType: 'teen_graphic',
    certificationType: null, // Entertainment, no certification
    requiresQuiz: false,
    quizTierRequirements: { minTier1: 0, minTier2: 0, minTier3: 0 },
    passingScore: 0,
    requiresCompletionTracking: false,
    learningObjectivesRequired: false,
    manifestIncludesObjectives: false,
  },
  educational: {
    subType: 'educational',
    certificationType: 'concept_mastery',
    requiresQuiz: true,
    quizTierRequirements: { minTier1: 2, minTier2: 2, minTier3: 1 },
    passingScore: 70,
    requiresCompletionTracking: true,
    learningObjectivesRequired: true,
    manifestIncludesObjectives: true,
  },
  moral_values: {
    subType: 'moral_values',
    certificationType: 'creative_learning',
    requiresQuiz: true,
    quizTierRequirements: { minTier1: 2, minTier2: 1, minTier3: 0 },
    passingScore: 60,
    requiresCompletionTracking: true,
    learningObjectivesRequired: true,
    manifestIncludesObjectives: true,
  },
  entertainment: {
    subType: 'entertainment',
    certificationType: null,
    requiresQuiz: false,
    quizTierRequirements: { minTier1: 0, minTier2: 0, minTier3: 0 },
    passingScore: 0,
    requiresCompletionTracking: false,
    learningObjectivesRequired: false,
    manifestIncludesObjectives: false,
  },
};

// ===========================================
// CHARACTER CONSISTENCY CONTRACT
// ===========================================

export interface CharacterLock {
  characterId: string;
  name: string;
  physicalDescriptionHash: string; // Hash of locked description
  lockedAt: Date;
  cannotChange: string[]; // List of locked attributes
}

export interface CharacterSheetLock {
  bookId: string;
  isLocked: boolean;
  lockedAt?: Date;
  characters: CharacterLock[];
  settingDescriptionHash: string;
  visualConsistencyHash: string;
}

export function validateCharacterConsistency(
  currentSheet: any,
  previousSheet?: CharacterSheetLock
): { valid: boolean; violations: string[] } {
  const violations: string[] = [];
  
  if (!previousSheet || !previousSheet.isLocked) {
    return { valid: true, violations: [] };
  }
  
  // Check character count
  if (currentSheet.characters?.length !== previousSheet.characters.length) {
    violations.push('Character count changed after lock');
  }
  
  // Check individual characters
  previousSheet.characters.forEach((lockedChar, index) => {
    const currentChar = currentSheet.characters?.find(
      (c: any) => c.id === lockedChar.characterId || c.name === lockedChar.name
    );
    
    if (!currentChar) {
      violations.push(`Character "${lockedChar.name}" was removed after lock`);
      return;
    }
    
    // Physical description should not change
    const currentDescHash = simpleHash(currentChar.physicalDescription || '');
    if (currentDescHash !== lockedChar.physicalDescriptionHash) {
      violations.push(`Physical description of "${lockedChar.name}" changed after lock`);
    }
  });
  
  return {
    valid: violations.length === 0,
    violations,
  };
}

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(16);
}

// ===========================================
// LEARNING OBJECTIVES TRACKING
// ===========================================

export interface ComicLearningObjective {
  id: string;
  objective: string;
  chapterNumber?: number;
  demonstratedInPanels: number[];
  masteryIndicator?: string;
}

export interface ComicLearningProgress {
  bookId: string;
  userId: string;
  objectives: ComicLearningObjective[];
  completedObjectives: string[];
  quizScoresByChapter: Record<number, number>;
  overallMastery: number;
  certificateEligible: boolean;
}

export function calculateComicLearningMastery(
  progress: ComicLearningProgress,
  config: ComicCertificationConfig
): { masteryScore: number; eligible: boolean; missingRequirements: string[] } {
  const missingRequirements: string[] = [];
  
  // Check completion
  const completionRatio = progress.completedObjectives.length / 
    Math.max(progress.objectives.length, 1);
  
  if (completionRatio < 0.8) {
    missingRequirements.push(`Complete at least 80% of learning objectives (current: ${Math.round(completionRatio * 100)}%)`);
  }
  
  // Check quiz scores
  const quizScores = Object.values(progress.quizScoresByChapter);
  const averageQuizScore = quizScores.length > 0
    ? quizScores.reduce((a, b) => a + b, 0) / quizScores.length
    : 0;
  
  if (config.requiresQuiz && averageQuizScore < config.passingScore) {
    missingRequirements.push(`Achieve ${config.passingScore}% average quiz score (current: ${Math.round(averageQuizScore)}%)`);
  }
  
  // Calculate mastery score
  const masteryScore = (completionRatio * 0.4) + 
    (averageQuizScore / 100 * 0.6);
  
  return {
    masteryScore: Math.round(masteryScore * 100),
    eligible: missingRequirements.length === 0,
    missingRequirements,
  };
}

// ===========================================
// MULTI-AGENT ORCHESTRATION
// ===========================================

export type ComicAgentRole = 
  | 'story_architect'
  | 'scriptwriter'
  | 'visual_director'
  | 'learning_agent'
  | 'continuity_guardian';

export interface AgentOutput {
  agent: ComicAgentRole;
  output: string;
  confidence: number;
  warnings: string[];
}

export interface MultiAgentComicResult {
  storyBeats: string[];
  panelScripts: Array<{
    panelNumber: number;
    visual: string;
    dialogue: Array<{ character: string; speech: string }>;
    caption?: string;
    learningMoment?: string;
  }>;
  continuityChecks: {
    charactersConsistent: boolean;
    settingConsistent: boolean;
    dialogueToneConsistent: boolean;
  };
  learningIntegration?: {
    objectivesCovered: string[];
    vocabularyIntroduced: string[];
    conceptsDemonstrated: string[];
  };
}

export function validateMultiAgentOutput(result: MultiAgentComicResult): {
  valid: boolean;
  issues: string[];
} {
  const issues: string[] = [];
  
  // Check panel count
  if (result.panelScripts.length < 3) {
    issues.push('Insufficient panels: minimum 3 required');
  }
  
  // Check dialogue presence
  result.panelScripts.forEach((panel, idx) => {
    if (!panel.dialogue || panel.dialogue.length === 0) {
      issues.push(`Panel ${panel.panelNumber}: Missing dialogue`);
    }
    if (!panel.visual || panel.visual.length < 20) {
      issues.push(`Panel ${panel.panelNumber}: Visual description too short`);
    }
  });
  
  // Check continuity
  if (!result.continuityChecks.charactersConsistent) {
    issues.push('Character consistency check failed');
  }
  
  return {
    valid: issues.length === 0,
    issues,
  };
}

// ===========================================
// QUIZ GENERATION FOR COMICS
// ===========================================

export interface ComicQuizQuestion {
  tier: 1 | 2;
  type: 'recall' | 'comprehension' | 'application' | 'values';
  question: string;
  options: string[];
  correctIndex: number;
  relatedPanels: number[];
  learningObjectiveId?: string;
  ageAppropriate: boolean;
}

export function generateComicQuizPrompt(
  subType: ComicSubType,
  chapterContent: string,
  learningObjectives?: string[]
): string {
  const config = COMIC_CERTIFICATION_CONFIGS[subType];
  
  if (!config.requiresQuiz) {
    return '';
  }
  
  let prompt = `Generate a quiz for this comic chapter.
  
TARGET AUDIENCE: ${getAudienceDescription(subType)}
CERTIFICATION TYPE: ${config.certificationType || 'none'}

QUIZ REQUIREMENTS:
- Tier 1 questions: ${config.quizTierRequirements.minTier1}
- Tier 2 questions: ${config.quizTierRequirements.minTier2}
- Passing score: ${config.passingScore}%
`;

  if (learningObjectives && learningObjectives.length > 0) {
    prompt += `\nLEARNING OBJECTIVES TO ASSESS:\n`;
    learningObjectives.forEach((obj, i) => {
      prompt += `${i + 1}. ${obj}\n`;
    });
  }

  prompt += `\nQUESTION FORMAT:
For children (ages 4-12):
- Simple vocabulary
- Visual references ("In the panel where...")
- Positive framing
- Encouragement in explanations

For teens/adults:
- Standard assessment format
- Can include inference questions
- Critical thinking prompts
`;

  return prompt;
}

function getAudienceDescription(subType: ComicSubType): string {
  const audiences: Record<ComicSubType, string> = {
    children_story: 'Young children ages 4-7, early readers',
    children_learning: 'Children ages 7-12, developing readers',
    teen_graphic: 'Teenagers ages 13-17',
    educational: 'All ages, learning-focused',
    moral_values: 'All ages, values-focused',
    entertainment: 'General audience, entertainment-focused',
  };
  return audiences[subType];
}

// ===========================================
// EXPORT HELPERS
// ===========================================

export function getComicCertificationConfig(subType: ComicSubType): ComicCertificationConfig {
  return COMIC_CERTIFICATION_CONFIGS[subType] || COMIC_CERTIFICATION_CONFIGS.entertainment;
}

export function isComicCertificationEligible(subType: ComicSubType): boolean {
  const config = COMIC_CERTIFICATION_CONFIGS[subType];
  return config.certificationType !== null;
}

export function getComicCertificateType(subType: ComicSubType): ComicCertificationType {
  return COMIC_CERTIFICATION_CONFIGS[subType].certificationType;
}
