// ===========================================
// SCROLLVERIFIED™ — Epistemic Coherence Engine
// Internal contradiction detection across claims
// ===========================================

import type { Claim } from './claimExtraction';

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
  coherenceScore: number; // 0-100, 100 = perfectly coherent
  coherenceVerdict: 'Epistemically Coherent' | 'Minor Tensions' | 'Significant Inconsistencies' | 'Epistemically Incoherent' | 'Analysis Incomplete';
  analysisComplete: boolean;
}

// ===========================================
// CONTRADICTION INDICATOR PAIRS
// Lightweight pre-screening before LLM pass
// ===========================================

const CONTRADICTION_PAIRS: [RegExp, RegExp][] = [
  [/\bincreases?\b/i, /\bdecreases?\b/i],
  [/\bpositively?\s+(?:correlat|associat|relat)/i, /\bnegatively?\s+(?:correlat|associat|relat)/i],
  [/\bsupports?\b/i, /\bcontradicts?\b/i],
  [/\bsignificant\b/i, /\bnot?\s+significant\b/i],
  [/\bconfirms?\b/i, /\brefutes?\b/i],
  [/\bcauses?\b/i, /\bdoes\s+not\s+cause\b/i],
  [/\beffective\b/i, /\bineffective\b/i],
  [/\bbeneficial\b/i, /\bharmful\b/i],
  [/\bimproves?\b/i, /\bworsens?\b/i],
];

// ===========================================
// PRE-SCREEN: Find potentially contradictory claim pairs
// ===========================================

export function preScreenConflicts(claims: Claim[]): Array<[Claim, Claim]> {
  const candidates: Array<[Claim, Claim]> = [];

  for (let i = 0; i < claims.length; i++) {
    for (let j = i + 1; j < claims.length; j++) {
      const a = claims[i];
      const b = claims[j];

      // Check if any contradiction pair matches across the two claims
      for (const [patA, patB] of CONTRADICTION_PAIRS) {
        if (
          (patA.test(a.text) && patB.test(b.text)) ||
          (patB.test(a.text) && patA.test(b.text))
        ) {
          // Also require some topical overlap (shared nouns)
          const nounsA = extractSubstantiveTerms(a.text);
          const nounsB = extractSubstantiveTerms(b.text);
          const overlap = nounsA.filter(n => nounsB.includes(n));
          if (overlap.length >= 2) {
            candidates.push([a, b]);
            break; // one match per pair is enough
          }
        }
      }
    }
  }

  // Cap at 15 pairs to limit LLM calls
  return candidates.slice(0, 15);
}

function extractSubstantiveTerms(text: string): string[] {
  const stops = new Set('the a an is are was were be been have has had do does did will would could should may might can to of in for on with at by from as into and but or not so yet this that it its they them their we our he she his her'.split(' '));
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3 && !stops.has(w));
}

// ===========================================
// BUILD COHERENCE REPORT FROM LLM RESULTS
// ===========================================

export function buildCoherenceReport(
  totalClaims: number,
  conflicts: EpistemicConflict[],
  analysisComplete: boolean
): EpistemicCoherenceReport {
  const criticalCount = conflicts.filter(c => c.severity === 'critical').length;
  const moderateCount = conflicts.filter(c => c.severity === 'moderate').length;

  // Score: start at 100, deduct per conflict
  let score = 100;
  score -= criticalCount * 20;
  score -= moderateCount * 10;
  score -= conflicts.filter(c => c.severity === 'minor').length * 3;
  score = Math.max(0, Math.min(100, score));

  let verdict: EpistemicCoherenceReport['coherenceVerdict'];
  if (!analysisComplete) verdict = 'Analysis Incomplete';
  else if (criticalCount > 0 || score < 40) verdict = 'Epistemically Incoherent';
  else if (score < 70) verdict = 'Significant Inconsistencies';
  else if (score < 90) verdict = 'Minor Tensions';
  else verdict = 'Epistemically Coherent';

  return {
    totalClaimsAnalyzed: totalClaims,
    conflicts,
    conflictCount: conflicts.length,
    criticalConflicts: criticalCount,
    coherenceScore: score,
    coherenceVerdict: verdict,
    analysisComplete,
  };
}

// ===========================================
// VERDICT STYLING
// ===========================================

export function getCoherenceVerdictColor(verdict: EpistemicCoherenceReport['coherenceVerdict']): string {
  switch (verdict) {
    case 'Epistemically Coherent': return 'text-green-600 dark:text-green-400 bg-green-500/10 border-green-500/30';
    case 'Minor Tensions': return 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/30';
    case 'Significant Inconsistencies': return 'text-orange-600 dark:text-orange-400 bg-orange-500/10 border-orange-500/30';
    case 'Epistemically Incoherent': return 'text-destructive bg-destructive/10 border-destructive/30';
    case 'Analysis Incomplete': return 'text-muted-foreground bg-muted/30 border-border/50';
  }
}
