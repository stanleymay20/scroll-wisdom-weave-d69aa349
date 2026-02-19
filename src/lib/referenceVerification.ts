// ===========================================
// SCROLLVERIFIED™ — Reference Verification Engine
// DOI validation, compliance tiers, transparency reports
// ===========================================

import type { AcademicSource } from './citations';

// ===========================================
// COMPLIANCE TIERS
// ===========================================

export type ComplianceTier = 'platinum' | 'gold' | 'silver' | 'bronze' | 'non-compliant';

export interface ComplianceTierResult {
  tier: ComplianceTier;
  label: string;
  met: string[];
  unmet: string[];
}

export interface ReferenceVerificationMetrics {
  total: number;
  verified: number;
  verifiedPct: number;
  suspicious: number;
  suspiciousPct: number;
  doiFailures: number;
  post2010Pct: number;
  post2018Pct: number;
}

export interface SemanticIntegrityReport {
  totalCitations: number;
  strong: number;
  moderate: number;
  weak: number;
  ornamental: number;
  averageScore: number;
  empiricalClaimsUnsupported: number;
  ornamentalPct: number;
}

export interface ClaimIntegrityReport {
  totalClaims: number;
  analyzedClaims: number;
  strong: number;
  partial: number;
  weak: number;
  contradiction: number;
  avgSupportScore: number;
  unsupportedEmpiricalClaims: number;
  contradictions: number;
  strongPct: number;
  uncitedClaimsPct: number;
  analysisComplete: boolean;
  verdictLabel: 'Conceptually Sound' | 'Requires Revision' | 'Academically Unsafe' | 'Analysis Incomplete';
  manualReviewRequired?: number;
}

export interface EpistemicConflict {
  claimA: { id: string; text: string };
  claimB: { id: string; text: string };
  conflictType: 'direct_contradiction' | 'methodological_inconsistency' | 'theoretical_tension';
  severity: 'critical' | 'moderate' | 'minor';
  explanation: string;
}

export interface EpistemicCoherenceReport {
  totalClaimsAnalyzed: number;
  conflicts: EpistemicConflict[];
  conflictCount: number;
  criticalConflicts: number;
  coherenceScore: number;
  coherenceVerdict: 'Epistemically Coherent' | 'Minor Tensions' | 'Significant Inconsistencies' | 'Epistemically Incoherent' | 'Analysis Incomplete';
  analysisComplete: boolean;
}

export interface AuditArtifact {
  schemaVersion: string;
  standard: string;
  artifactId: string;
  generatedAt: string;
  model: string;
  promptVersion: string;
  replicabilityKey: string;
  summary: {
    complianceTier: string;
    doiValidatedPct: number;
    semanticAvgScore: number;
    claimSupportScore: number;
    claimVerdict: string;
    contradictions: number;
    unsupportedEmpirical: number;
    coherenceScore: number;
    coherenceVerdict: string;
    criticalConflicts: number;
    hardFailures: string[];
    certificationBlocked: boolean;
    totalReferences: number;
    citationStyle: string;
    manualReviewRequired: number;
  };
  integrityHash: string;
  disclaimer: string;
}

export interface ReferenceTransparencyReport {
  canonicalAnchorsPresent: boolean;
  doiValidatedPct: number;
  orphanReferences: number;
  missingCitations: number;
  duplicatesRemoved: number;
  post2010Compliance: number;
  post2018Compliance: number;
  semanticIntegrity: 'Strong' | 'Moderate' | 'Weak';
  fabricationRisk: 'None Detected' | 'Flagged';
  tier: ComplianceTierResult;
  hardFailures: string[];
  certificationBlocked: boolean;
  semanticReport?: SemanticIntegrityReport;
  claimReport?: ClaimIntegrityReport;
  epistemicReport?: EpistemicCoherenceReport;
  auditArtifact?: AuditArtifact;
  citationStyle?: string;
  auditModel?: string;
  promptVersion?: string;
}

// ===========================================
// TIER BADGE STYLING
// ===========================================

export function getTierColor(tier: ComplianceTier): string {
  switch (tier) {
    case 'platinum': return 'bg-gradient-to-r from-slate-300 to-slate-500 text-white';
    case 'gold': return 'bg-gradient-to-r from-amber-400 to-yellow-600 text-white';
    case 'silver': return 'bg-gradient-to-r from-gray-300 to-gray-500 text-white';
    case 'bronze': return 'bg-gradient-to-r from-orange-400 to-orange-600 text-white';
    default: return 'bg-destructive/20 text-destructive';
  }
}

export function getTierIcon(tier: ComplianceTier): string {
  switch (tier) {
    case 'platinum': return '💎';
    case 'gold': return '🥇';
    case 'silver': return '🥈';
    case 'bronze': return '🥉';
    default: return '⚠️';
  }
}

// ===========================================
// VERDICT HELPERS
// ===========================================

export function getVerdictColor(label: ClaimIntegrityReport['verdictLabel']): string {
  switch (label) {
    case 'Conceptually Sound': return 'text-green-600 dark:text-green-400 bg-green-500/10 border-green-500/30';
    case 'Requires Revision': return 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/30';
    case 'Academically Unsafe': return 'text-destructive bg-destructive/10 border-destructive/30';
    case 'Analysis Incomplete': return 'text-muted-foreground bg-muted/30 border-border/50';
  }
}

export function getCoherenceVerdictColor(verdict: EpistemicCoherenceReport['coherenceVerdict']): string {
  switch (verdict) {
    case 'Epistemically Coherent': return 'text-green-600 dark:text-green-400 bg-green-500/10 border-green-500/30';
    case 'Minor Tensions': return 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/30';
    case 'Significant Inconsistencies': return 'text-orange-600 dark:text-orange-400 bg-orange-500/10 border-orange-500/30';
    case 'Epistemically Incoherent': return 'text-destructive bg-destructive/10 border-destructive/30';
    case 'Analysis Incomplete': return 'text-muted-foreground bg-muted/30 border-border/50';
  }
}

// ===========================================
// TRANSPARENCY REPORT MARKDOWN GENERATOR
// ===========================================

export function generateTransparencyMarkdown(report: ReferenceTransparencyReport): string {
  const lines: string[] = [];

  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('## 📋 Reference Integrity Summary (ScrollVerified™ 2026 — Institutional Epistemic Integrity Certified)');
  lines.push('');
  lines.push(`| Metric | Status |`);
  lines.push(`|--------|--------|`);
  lines.push(`| Canonical Anchors Present | ${report.canonicalAnchorsPresent ? '✅' : '❌'} |`);
  lines.push(`| DOI Validated | ${report.doiValidatedPct}% |`);
  lines.push(`| Orphan References | ${report.orphanReferences} |`);
  lines.push(`| Missing Citations | ${report.missingCitations} |`);
  lines.push(`| Duplicate Entries Removed | ${report.duplicatesRemoved} |`);
  lines.push(`| Post-2010 Compliance | ${report.post2010Compliance}% |`);
  lines.push(`| Post-2018 Compliance | ${report.post2018Compliance}% |`);
  lines.push(`| Semantic Support Integrity | ${report.semanticIntegrity} |`);
  lines.push(`| Fabrication Risk | ${report.fabricationRisk} |`);
  lines.push(`| Compliance Tier | ${getTierIcon(report.tier.tier)} **${report.tier.label}** |`);

  if (report.semanticReport) {
    lines.push('');
    lines.push('### Semantic Citation Analysis');
    lines.push(`| Metric | Value |`);
    lines.push(`|--------|-------|`);
    lines.push(`| Average Support Score | ${report.semanticReport.averageScore}/100 |`);
    lines.push(`| Strong Citations | ${report.semanticReport.strong} |`);
    lines.push(`| Moderate Citations | ${report.semanticReport.moderate} |`);
    lines.push(`| Weak Citations | ${report.semanticReport.weak} |`);
    lines.push(`| Ornamental Citations | ${report.semanticReport.ornamental} (${report.semanticReport.ornamentalPct}%) |`);
    lines.push(`| Unsupported Empirical Claims | ${report.semanticReport.empiricalClaimsUnsupported} |`);
  }

  if (report.claimReport) {
    const cr = report.claimReport;
    lines.push('');
    lines.push('### Claim-Level Justification Analysis');
    lines.push(`| Metric | Value |`);
    lines.push(`|--------|-------|`);
    lines.push(`| Total Claims Extracted | ${cr.totalClaims} |`);
    lines.push(`| Claims Analyzed | ${cr.analyzedClaims} |`);
    lines.push(`| Average Support Score | ${cr.avgSupportScore}/100 |`);
    lines.push(`| Strong Verdicts | ${cr.strong} (${cr.strongPct}%) |`);
    lines.push(`| Partial Verdicts | ${cr.partial} |`);
    lines.push(`| Weak Verdicts | ${cr.weak} |`);
    lines.push(`| Contradictions | ${cr.contradiction} |`);
    lines.push(`| Unsupported Empirical | ${cr.unsupportedEmpiricalClaims} |`);
    lines.push(`| Institutional Verdict | **${cr.verdictLabel}** |`);
    if (cr.manualReviewRequired && cr.manualReviewRequired > 0) {
      lines.push(`| Manual Review Required | ${cr.manualReviewRequired} verdict(s) |`);
    }
  }

  if (report.epistemicReport) {
    const er = report.epistemicReport;
    lines.push('');
    lines.push('### Epistemic Coherence Analysis');
    lines.push(`| Metric | Value |`);
    lines.push(`|--------|-------|`);
    lines.push(`| Claims Analyzed | ${er.totalClaimsAnalyzed} |`);
    lines.push(`| Coherence Score | ${er.coherenceScore}/100 |`);
    lines.push(`| Internal Conflicts | ${er.conflictCount} |`);
    lines.push(`| Critical Conflicts | ${er.criticalConflicts} |`);
    lines.push(`| Coherence Verdict | **${er.coherenceVerdict}** |`);
  }

  // Audit Artifact section
  if (report.auditArtifact) {
    const aa = report.auditArtifact;
    lines.push('');
    lines.push('### 🔏 Immutable Audit Artifact');
    lines.push(`| Field | Value |`);
    lines.push(`|-------|-------|`);
    lines.push(`| Artifact ID | \`${aa.artifactId}\` |`);
    lines.push(`| Schema Version | ${aa.schemaVersion} |`);
    lines.push(`| Generated At | ${aa.generatedAt} |`);
    lines.push(`| Model | ${aa.model} |`);
    lines.push(`| Prompt Version | ${aa.promptVersion} |`);
    lines.push(`| Replicability Key | \`${aa.replicabilityKey}\` |`);
    lines.push(`| Integrity Hash | \`${aa.integrityHash}\` |`);
    lines.push('');
    lines.push(`> *${aa.disclaimer}*`);
  }

  lines.push('');

  if (report.hardFailures.length > 0) {
    lines.push('**⚠️ Hard Failure Conditions:**');
    report.hardFailures.forEach(f => lines.push(`- ❌ ${f}`));
    lines.push('');
  }

  if (report.certificationBlocked) {
    lines.push('> 🔒 **Certification Blocked** — Resolve hard failures before certification.');
    lines.push('');
  }

  lines.push(`*Verified by: ScrollLibrary Research Integrity Engine*`);
  if (report.auditModel) lines.push(`*Model: ${report.auditModel}*`);
  if (report.promptVersion) lines.push(`*Prompt Version: ${report.promptVersion}*`);
  lines.push('');

  return lines.join('\n');
}

// ===========================================
// BUILD REPORT FROM AUDIT + VERIFICATION DATA
// ===========================================

export function buildTransparencyReport(
  verificationData: {
    metrics: ReferenceVerificationMetrics;
    tier: ComplianceTierResult;
    hardFailures: string[];
    certificationBlocked: boolean;
  },
  integrityData: {
    orphanReferences: number;
    missingReferences: number;
    duplicates: number;
    missingCanonicals: number;
  },
  auditModel?: string,
  promptVersion?: string
): ReferenceTransparencyReport {
  return {
    canonicalAnchorsPresent: integrityData.missingCanonicals === 0,
    doiValidatedPct: verificationData.metrics.verifiedPct,
    orphanReferences: integrityData.orphanReferences,
    missingCitations: integrityData.missingReferences,
    duplicatesRemoved: integrityData.duplicates,
    post2010Compliance: verificationData.metrics.post2010Pct,
    post2018Compliance: verificationData.metrics.post2018Pct,
    semanticIntegrity: verificationData.metrics.verifiedPct >= 80 ? 'Strong'
      : verificationData.metrics.verifiedPct >= 50 ? 'Moderate' : 'Weak',
    fabricationRisk: verificationData.metrics.suspiciousPct >= 5 ? 'Flagged' : 'None Detected',
    tier: verificationData.tier,
    hardFailures: verificationData.hardFailures,
    certificationBlocked: verificationData.certificationBlocked,
    auditModel,
    promptVersion,
  };
}
