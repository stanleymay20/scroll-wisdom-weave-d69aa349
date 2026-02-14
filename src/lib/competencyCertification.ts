/**
 * Competency Certification Engine
 * 
 * 4-Level Certification:
 * Level 1 — Knowledge Verified (concept phase completed)
 * Level 2 — Applied Competency (reflection + application passed)
 * Level 3 — Professional Integration (all phases, score ≥ 70)
 * Level 4 — Mastery (all phases, score ≥ 90)
 */

import { supabase } from '@/integrations/supabase/client';

export type CompetencyLevel = 'knowledge_verified' | 'applied_competency' | 'professional_integration' | 'mastery';

export interface CompetencyCertificate {
  id: string;
  certificateNumber: string;
  competencyLevel: CompetencyLevel;
  skillsValidated: string[];
  competencySummary: string;
  aiEvaluationSummary: string;
  averageReflectionScore: number;
  averageApplicationScore: number;
  averageCompetencyScore: number;
  overallScore: number;
  issuedAt: string;
}

export const COMPETENCY_LEVELS: Record<CompetencyLevel, {
  label: string;
  description: string;
  minScore: number;
  requirements: string[];
  color: string;
}> = {
  knowledge_verified: {
    label: 'Level 1 — Knowledge Verified',
    description: 'Demonstrated understanding of core concepts',
    minScore: 50,
    requirements: ['Complete all phases', 'Weighted score ≥ 50'],
    color: 'text-blue-500',
  },
  applied_competency: {
    label: 'Level 2 — Applied Competency',
    description: 'Successfully applied knowledge to scenarios',
    minScore: 70,
    requirements: ['Complete all phases', 'Weighted score ≥ 70'],
    color: 'text-amber-500',
  },
  professional_integration: {
    label: 'Level 3 — Professional Integration',
    description: 'Integrated knowledge for professional practice',
    minScore: 85,
    requirements: ['Pass all competency checks', 'Weighted score ≥ 85'],
    color: 'text-purple-500',
  },
  mastery: {
    label: 'Level 4 — Mastery',
    description: 'Expert-level competency demonstrated',
    minScore: 95,
    requirements: ['Pass all competency checks', 'Weighted score ≥ 95', 'Deep reflection quality'],
    color: 'text-emerald-500',
  },
};

/** Determine highest eligible level based on scores */
export function determineCompetencyLevel(
  overallScore: number,
  allPhasesCompleted: boolean,
  allCompetencyChecksPassed: boolean,
): CompetencyLevel {
  if (allCompetencyChecksPassed && overallScore >= 95) return 'mastery';
  if (allCompetencyChecksPassed && overallScore >= 85) return 'professional_integration';
  if (allPhasesCompleted && overallScore >= 70) return 'applied_competency';
  if (allPhasesCompleted && overallScore >= 50) return 'knowledge_verified';
  return 'knowledge_verified';
}

/** Generate a unique certificate number */
export function generateCertificateNumber(level: CompetencyLevel): string {
  const prefix = {
    knowledge_verified: 'SL-KV',
    applied_competency: 'SL-AC',
    professional_integration: 'SL-PI',
    mastery: 'SL-MA',
  }[level];
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `${prefix}-${timestamp}-${random}`;
}

/** Issue a competency certificate */
export async function issueCompetencyCertificate(params: {
  userId: string;
  bookId: string;
  competencyLevel: CompetencyLevel;
  skillsValidated: string[];
  averageReflectionScore: number;
  averageApplicationScore: number;
  averageCompetencyScore: number;
  overallScore: number;
  chaptersCompleted: number;
  totalChapters: number;
  bookVersionHash?: string;
}): Promise<CompetencyCertificate | null> {
  const certNumber = generateCertificateNumber(params.competencyLevel);
  const levelConfig = COMPETENCY_LEVELS[params.competencyLevel];
  
  const competencySummary = `Achieved ${levelConfig.label} certification with an overall score of ${Math.round(params.overallScore)}/100 across ${params.chaptersCompleted} chapters.`;
  const aiEvalSummary = `Reflection: ${Math.round(params.averageReflectionScore)}/100, Application: ${Math.round(params.averageApplicationScore)}/100, Competency: ${Math.round(params.averageCompetencyScore)}/100.`;

  const { data, error } = await supabase
    .from('competency_certificates')
    .insert({
      user_id: params.userId,
      book_id: params.bookId,
      competency_level: params.competencyLevel,
      certificate_number: certNumber,
      skills_validated: params.skillsValidated,
      competency_summary: competencySummary,
      ai_evaluation_summary: aiEvalSummary,
      average_reflection_score: params.averageReflectionScore,
      average_application_score: params.averageApplicationScore,
      average_competency_score: params.averageCompetencyScore,
      overall_competency_score: params.overallScore,
      chapters_completed: params.chaptersCompleted,
      total_chapters: params.totalChapters,
      book_version_hash: params.bookVersionHash,
    })
    .select()
    .single();

  if (error) {
    console.error('[CompetencyCert] Issue failed:', error);
    return null;
  }

  return {
    id: data.id,
    certificateNumber: data.certificate_number,
    competencyLevel: data.competency_level as CompetencyLevel,
    skillsValidated: data.skills_validated || [],
    competencySummary: data.competency_summary || '',
    aiEvaluationSummary: data.ai_evaluation_summary || '',
    averageReflectionScore: data.average_reflection_score || 0,
    averageApplicationScore: data.average_application_score || 0,
    averageCompetencyScore: data.average_competency_score || 0,
    overallScore: data.overall_competency_score || 0,
    issuedAt: data.issued_at,
  };
}
