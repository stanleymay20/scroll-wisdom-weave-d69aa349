/**
 * COMPETENCY MANIFEST FOR EMPLOYER-GRADE CERTIFICATES
 * 
 * Each certificate MUST include:
 * - Book title & difficulty level
 * - Learning objectives summary
 * - Skills covered
 * - Assessment type breakdown
 * - Integrity classification
 * - Schema version
 * 
 * ❌ Do NOT expose full book content
 * ✅ Do expose learning scope & rigor
 */

import { CertificateType } from './certificateAuthority';
import { AssessmentTier, TIER_CONFIGS } from './multiTierAssessment';

// ===========================================
// COMPETENCY MANIFEST TYPES
// ===========================================

export interface LearningObjective {
  id: string;
  description: string;
  category: ObjectiveCategory;
  bloomLevel: BloomLevel;
  achieved: boolean;
}

export type ObjectiveCategory = 
  | 'knowledge'
  | 'skill'
  | 'application'
  | 'analysis'
  | 'synthesis'
  | 'evaluation';

export type BloomLevel = 
  | 'remember'
  | 'understand'
  | 'apply'
  | 'analyze'
  | 'evaluate'
  | 'create';

export interface SkillCovered {
  name: string;
  category: string;
  proficiencyLevel: 'foundational' | 'intermediate' | 'advanced' | 'expert';
  evidencedBy: string[]; // Question IDs that demonstrated this skill
}

export interface AssessmentBreakdown {
  tier: AssessmentTier;
  tierName: string;
  questionCount: number;
  scorePercentage: number;
  passed: boolean;
}

export interface IntegrityClassification {
  score: number;
  classification: 'trusted' | 'review' | 'flagged';
  signals: string[];
  timestamp: Date;
}

export interface CompetencyManifest {
  version: string;
  generatedAt: Date;
  
  // Book Information
  bookTitle: string;
  bookId: string;
  difficultyLevel: 'beginner' | 'intermediate' | 'advanced';
  domain: string;
  totalChapters: number;
  completedChapters: number;
  
  // Learning Outcomes
  learningObjectives: LearningObjective[];
  objectivesAchieved: number;
  objectivesTotal: number;
  
  // Skills Summary
  skillsCovered: SkillCovered[];
  primarySkills: string[];
  secondarySkills: string[];
  
  // Assessment Rigor
  assessmentBreakdown: AssessmentBreakdown[];
  totalQuestionsAnswered: number;
  overallScore: number;
  hasTier2Questions: boolean;
  hasTier3Questions: boolean;
  hasTier4Questions: boolean;
  
  // Integrity
  integrity: IntegrityClassification;
  
  // Certificate Meta
  certificateType: CertificateType;
  certificateId: string;
  issuedBy: string;
  
  // Verification
  verificationHash: string;
  schemaVersion: string;
}

// ===========================================
// MANIFEST GENERATOR
// ===========================================

export interface ManifestInput {
  bookId: string;
  bookTitle: string;
  bookType: string;
  domain: string;
  totalChapters: number;
  completedChapters: number;
  learningObjectives: string[];
  skills: { name: string; category: string }[];
  assessmentResults: {
    tier: AssessmentTier;
    questionCount: number;
    correctCount: number;
  }[];
  integrityScore: number;
  integritySignals: string[];
  certificateType: CertificateType;
  certificateId: string;
}

/**
 * Generate a competency manifest for a certificate
 */
export function generateCompetencyManifest(input: ManifestInput): CompetencyManifest {
  const now = new Date();
  
  // Map learning objectives with Bloom's taxonomy
  const learningObjectives: LearningObjective[] = input.learningObjectives.map((obj, i) => ({
    id: `obj_${i + 1}`,
    description: obj,
    category: detectObjectiveCategory(obj),
    bloomLevel: detectBloomLevel(obj),
    achieved: true // If they got the certificate, objectives are achieved
  }));
  
  // Map skills with proficiency levels
  const skillsCovered: SkillCovered[] = input.skills.map(skill => ({
    name: skill.name,
    category: skill.category,
    proficiencyLevel: determineProficiencyLevel(input.certificateType),
    evidencedBy: []
  }));
  
  // Build assessment breakdown
  const assessmentBreakdown: AssessmentBreakdown[] = input.assessmentResults.map(result => ({
    tier: result.tier,
    tierName: TIER_CONFIGS[result.tier].name,
    questionCount: result.questionCount,
    scorePercentage: result.questionCount > 0 ? (result.correctCount / result.questionCount) * 100 : 0,
    passed: result.questionCount > 0 ? (result.correctCount / result.questionCount) >= 0.7 : false
  }));
  
  // Calculate overall score
  const totalQuestions = input.assessmentResults.reduce((sum, r) => sum + r.questionCount, 0);
  const totalCorrect = input.assessmentResults.reduce((sum, r) => sum + r.correctCount, 0);
  const overallScore = totalQuestions > 0 ? (totalCorrect / totalQuestions) * 100 : 0;
  
  // Determine integrity classification
  const integrityClassification: 'trusted' | 'review' | 'flagged' = 
    input.integrityScore >= 0.9 ? 'trusted' :
    input.integrityScore >= 0.6 ? 'review' : 'flagged';
  
  // Difficulty level based on book type and assessment results
  const difficultyLevel = determineDifficultyLevel(input.bookType, overallScore);
  
  // Generate verification hash
  const verificationData = [
    input.certificateId,
    input.bookId,
    now.toISOString(),
    overallScore.toFixed(2),
    input.integrityScore.toFixed(2)
  ].join('|');
  const verificationHash = simpleHash(verificationData);

  return {
    version: '1.0.0',
    generatedAt: now,
    
    bookTitle: input.bookTitle,
    bookId: input.bookId,
    difficultyLevel,
    domain: input.domain,
    totalChapters: input.totalChapters,
    completedChapters: input.completedChapters,
    
    learningObjectives,
    objectivesAchieved: learningObjectives.filter(o => o.achieved).length,
    objectivesTotal: learningObjectives.length,
    
    skillsCovered,
    primarySkills: skillsCovered.slice(0, 3).map(s => s.name),
    secondarySkills: skillsCovered.slice(3).map(s => s.name),
    
    assessmentBreakdown,
    totalQuestionsAnswered: totalQuestions,
    overallScore,
    hasTier2Questions: input.assessmentResults.some(r => r.tier === 2 && r.questionCount > 0),
    hasTier3Questions: input.assessmentResults.some(r => r.tier === 3 && r.questionCount > 0),
    hasTier4Questions: input.assessmentResults.some(r => r.tier === 4 && r.questionCount > 0),
    
    integrity: {
      score: input.integrityScore,
      classification: integrityClassification,
      signals: input.integritySignals,
      timestamp: now
    },
    
    certificateType: input.certificateType,
    certificateId: input.certificateId,
    issuedBy: 'ScrollLibrary Certification Authority',
    
    verificationHash,
    schemaVersion: 'PBG-1.0'
  };
}

// ===========================================
// HELPER FUNCTIONS
// ===========================================

function detectObjectiveCategory(objective: string): ObjectiveCategory {
  const lower = objective.toLowerCase();
  if (/understand|explain|describe|identify/.test(lower)) return 'knowledge';
  if (/apply|use|implement|build/.test(lower)) return 'application';
  if (/analyze|compare|contrast|examine/.test(lower)) return 'analysis';
  if (/create|design|develop|produce/.test(lower)) return 'synthesis';
  if (/evaluate|assess|judge|critique/.test(lower)) return 'evaluation';
  return 'skill';
}

function detectBloomLevel(objective: string): BloomLevel {
  const lower = objective.toLowerCase();
  if (/remember|recall|list|define/.test(lower)) return 'remember';
  if (/understand|explain|describe|summarize/.test(lower)) return 'understand';
  if (/apply|use|implement|execute/.test(lower)) return 'apply';
  if (/analyze|compare|contrast|differentiate/.test(lower)) return 'analyze';
  if (/evaluate|assess|judge|critique|recommend/.test(lower)) return 'evaluate';
  if (/create|design|develop|produce|construct/.test(lower)) return 'create';
  return 'understand';
}

function determineProficiencyLevel(certificateType: CertificateType): 'foundational' | 'intermediate' | 'advanced' | 'expert' {
  switch (certificateType) {
    case 'mastery': return 'expert';
    case 'completion': return 'intermediate';
    case 'authorship': return 'advanced';
    default: return 'foundational';
  }
}

function determineDifficultyLevel(bookType: string, score: number): 'beginner' | 'intermediate' | 'advanced' {
  if (bookType === 'children') return 'beginner';
  if (bookType === 'academic' || bookType === 'technical') return 'advanced';
  if (score >= 90) return 'advanced';
  if (score >= 70) return 'intermediate';
  return 'beginner';
}

function simpleHash(data: string): string {
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    const char = data.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).toUpperCase().padStart(12, '0');
}

// ===========================================
// MANIFEST DISPLAY HELPERS
// ===========================================

export interface ManifestSummary {
  headline: string;
  rigorLevel: 'basic' | 'standard' | 'rigorous' | 'comprehensive';
  keyStats: { label: string; value: string }[];
  employerRecommendation: string;
}

/**
 * Generate employer-friendly summary from manifest
 */
export function generateManifestSummary(manifest: CompetencyManifest): ManifestSummary {
  // Determine rigor level based on assessment tiers used
  let rigorLevel: 'basic' | 'standard' | 'rigorous' | 'comprehensive' = 'basic';
  if (manifest.hasTier4Questions) rigorLevel = 'comprehensive';
  else if (manifest.hasTier3Questions) rigorLevel = 'rigorous';
  else if (manifest.hasTier2Questions) rigorLevel = 'standard';
  
  const keyStats = [
    { label: 'Overall Score', value: `${manifest.overallScore.toFixed(0)}%` },
    { label: 'Chapters Completed', value: `${manifest.completedChapters}/${manifest.totalChapters}` },
    { label: 'Skills Demonstrated', value: `${manifest.skillsCovered.length}` },
    { label: 'Integrity Rating', value: manifest.integrity.classification.toUpperCase() },
    { label: 'Assessment Rigor', value: rigorLevel.toUpperCase() },
  ];
  
  // Generate employer recommendation
  let recommendation: string;
  if (manifest.integrity.classification === 'trusted' && manifest.overallScore >= 90) {
    recommendation = 'This certificate demonstrates comprehensive mastery with verified integrity. Recommended for roles requiring strong expertise.';
  } else if (manifest.integrity.classification === 'trusted' && manifest.overallScore >= 70) {
    recommendation = 'This certificate demonstrates solid understanding with verified integrity. Suitable for roles requiring functional competence.';
  } else if (manifest.integrity.classification === 'review') {
    recommendation = 'This certificate shows learning achievement but has integrity flags requiring review. Consider follow-up assessment.';
  } else {
    recommendation = 'This certificate has integrity concerns. Additional verification recommended before hiring decisions.';
  }

  return {
    headline: `${manifest.certificateType === 'mastery' ? 'Mastery' : 'Completion'} Certificate in ${manifest.domain}`,
    rigorLevel,
    keyStats,
    employerRecommendation: recommendation
  };
}

/**
 * Format manifest for JSON export (employer API)
 */
export function formatManifestForExport(manifest: CompetencyManifest): object {
  return {
    certificate: {
      id: manifest.certificateId,
      type: manifest.certificateType,
      issuedBy: manifest.issuedBy,
      issuedAt: manifest.generatedAt.toISOString(),
      verificationHash: manifest.verificationHash,
      schemaVersion: manifest.schemaVersion
    },
    learningAchievement: {
      bookTitle: manifest.bookTitle,
      domain: manifest.domain,
      difficultyLevel: manifest.difficultyLevel,
      completionRate: `${manifest.completedChapters}/${manifest.totalChapters}`,
      objectivesAchieved: `${manifest.objectivesAchieved}/${manifest.objectivesTotal}`,
      overallScore: manifest.overallScore
    },
    skills: {
      primary: manifest.primarySkills,
      secondary: manifest.secondarySkills,
      totalDemonstrated: manifest.skillsCovered.length
    },
    assessmentRigor: {
      totalQuestions: manifest.totalQuestionsAnswered,
      includedTiers: manifest.assessmentBreakdown.filter(a => a.questionCount > 0).map(a => a.tierName),
      hasTier2Applied: manifest.hasTier2Questions,
      hasTier3Scenario: manifest.hasTier3Questions,
      hasTier4Integrity: manifest.hasTier4Questions
    },
    integrity: {
      score: manifest.integrity.score,
      classification: manifest.integrity.classification,
      verifiedAt: manifest.integrity.timestamp.toISOString()
    }
  };
}
