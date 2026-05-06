/**
 * Elite Publishing Intelligence Engine (EPIE)
 * ===========================================
 * Foundation scaffold for the 10-layer publishing OS.
 *
 * Layers:
 *  1. Content Intelligence    — structural & coherence analysis
 *  2. Humanization            — AI-pattern removal & rewrite
 *  3. Publishing Validation   — KDP / EPUB / print readiness
 *  4. Source Verification     — citation flagging & generation
 *  5. Formatting & Design     — typography, layout, infographics
 *  6. Readability & Engagement— hook / pacing / curiosity gap
 *  7. Quality Scoring         — multi-dim scorecard + tier
 *  8. Publishing Export       — KDP/EPUB/MOBI/Audio/Slides
 *  9. Authorship Integrity    — provenance, fingerprint, seal
 * 10. Continuous Learning     — reader-feedback driven loop
 *
 * Every layer routes through paid-tier gating (Premium/Prophet) by default
 * for automatic runs. On-demand audit is available to all users.
 */

export type EpieLayer =
  | 'content_intelligence'
  | 'humanization'
  | 'publishing_validation'
  | 'source_verification'
  | 'formatting_design'
  | 'readability_engagement'
  | 'quality_scoring'
  | 'publishing_export'
  | 'authorship_integrity'
  | 'continuous_learning';

export type CertificationTier = 'bronze' | 'silver' | 'gold' | 'platinum' | 'sovereign';

export interface PublishingScorecard {
  publish_readiness: number;
  human_authenticity: number;
  engagement: number;
  strategic_depth: number;
  commercial: number;
  citation_confidence: number;
  formatting: number;
}

export interface AuditFinding {
  layer: EpieLayer;
  chapter_id?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  code: string;
  message: string;
  suggestion?: string;
}

export const EPIE_LAYERS: { id: EpieLayer; label: string; description: string }[] = [
  { id: 'content_intelligence', label: 'Content Intelligence', description: 'Coherence, redundancy, drift detection' },
  { id: 'humanization', label: 'Humanization', description: 'Strip AI patterns, add founder voice' },
  { id: 'publishing_validation', label: 'Publishing Validation', description: 'KDP / EPUB / print readiness' },
  { id: 'source_verification', label: 'Source Verification', description: 'Flag unsupported claims, suggest citations' },
  { id: 'formatting_design', label: 'Formatting & Design', description: 'Typography, tables, callouts, infographics' },
  { id: 'readability_engagement', label: 'Readability & Engagement', description: 'Hooks, pacing, curiosity gaps' },
  { id: 'quality_scoring', label: 'Quality Scoring', description: 'Multi-dimensional certification' },
  { id: 'publishing_export', label: 'Publishing Export', description: 'KDP/EPUB/MOBI/Audio/Slides' },
  { id: 'authorship_integrity', label: 'Authorship Integrity', description: 'Provenance & integrity seal' },
  { id: 'continuous_learning', label: 'Continuous Learning', description: 'Reader-feedback improvement loop' },
];

export function tierFromScorecard(s: PublishingScorecard): CertificationTier {
  const avg =
    (s.publish_readiness +
      s.human_authenticity +
      s.engagement +
      s.strategic_depth +
      s.commercial +
      s.citation_confidence +
      s.formatting) /
    7;
  if (avg >= 95) return 'sovereign';
  if (avg >= 88) return 'platinum';
  if (avg >= 80) return 'gold';
  if (avg >= 70) return 'silver';
  return 'bronze';
}

export const EPIE_AUTO_RUN_TIERS = ['premium', 'prophet'] as const;
