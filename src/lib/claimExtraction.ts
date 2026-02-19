// ===========================================
// SCROLLVERIFIED™ — Claim Extraction Engine
// Atomic claim extraction + claim-to-citation mapping
// ===========================================

export interface Claim {
  id: string;
  text: string;
  type: 'empirical' | 'theoretical' | 'descriptive';
  paragraphIndex: number;
}

export interface ClaimCitationLink {
  claim: Claim;
  citationKeys: string[];
  unsupported: boolean;
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
}

// ===========================================
// EMPIRICAL / THEORETICAL INDICATORS
// ===========================================

const EMPIRICAL_INDICATORS = [
  'study', 'studies', 'data', 'sample', 'experiment', 'experimental',
  'rct', 'randomized controlled trial', 'regression', 'panel data',
  'meta-analysis', 'meta analysis', 'survey', 'longitudinal',
  'cross-sectional', 'statistically significant', 'p-value', 'p <',
  'confidence interval', 'effect size', 'cohort', 'trial',
  'findings show', 'results indicate', 'evidence suggests',
  'correlation', 'variance', 'significant difference',
];

const THEORETICAL_INDICATORS = [
  'theory', 'framework', 'model', 'hypothesis', 'posits', 'proposes',
  'argues', 'conceptual', 'paradigm', 'construct', 'postulates',
  'according to', 'suggests that', 'posited by', 'framework of',
  'theoretical basis', 'foundational', 'seminal work',
];

const TRIVIAL_PATTERNS = [
  /^(this|the|in|a|an)\s+(chapter|section|book|paper|article)\s/i,
  /^(however|moreover|furthermore|additionally|consequently)\b/i,
  /^\d+\.\s*$/,
  /^(figure|table|chart|graph)\s+\d/i,
];

// ===========================================
// CITATION PATTERN DETECTOR
// ===========================================

const CITATION_PATTERN = /\(([A-Z][a-zÀ-ÿ]+(?:\s(?:&|and)\s[A-Z][a-zÀ-ÿ]+)*(?:\s+et\s+al\.?)?),?\s*\d{4}(?:,\s*p\.?\s*\d+)?\)/g;

function extractCitationKeys(text: string): string[] {
  const keys: string[] = [];
  let match: RegExpExecArray | null;
  const regex = new RegExp(CITATION_PATTERN.source, 'g');
  while ((match = regex.exec(text)) !== null) {
    keys.push(match[1].trim());
  }
  return keys;
}

// ===========================================
// CLAIM TYPE CLASSIFICATION
// ===========================================

function classifyClaimType(sentence: string): Claim['type'] {
  const lower = sentence.toLowerCase();
  
  for (const indicator of EMPIRICAL_INDICATORS) {
    if (lower.includes(indicator)) return 'empirical';
  }
  
  for (const indicator of THEORETICAL_INDICATORS) {
    if (lower.includes(indicator)) return 'theoretical';
  }
  
  return 'descriptive';
}

// ===========================================
// ATOMIC CLAIM EXTRACTION
// ===========================================

export function extractAtomicClaims(chapterContent: string): Claim[] {
  const paragraphs = chapterContent
    .split(/\n\n+/)
    .map(p => p.trim())
    .filter(p => p.length > 30);

  const claims: Claim[] = [];
  let claimId = 0;

  for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
    const paragraph = paragraphs[pIdx];
    
    // Split into sentences
    const sentences = paragraph
      .split(/(?<=[.!?])\s+/)
      .map(s => s.trim())
      .filter(s => s.length > 15);

    for (const sentence of sentences) {
      // Skip trivial sentences
      if (TRIVIAL_PATTERNS.some(p => p.test(sentence))) continue;
      
      // Skip headings and list markers
      if (sentence.startsWith('#') || sentence.startsWith('-') || sentence.startsWith('*')) continue;
      
      // Skip very short or very long sentences
      if (sentence.length < 20 || sentence.length > 500) continue;

      // Must contain a substantive claim (verb + subject)
      const hasVerb = /\b(is|are|was|were|has|have|had|show|demonstrate|indicate|suggest|find|found|reveal|confirm|establish|cause|lead|result|affect|influence|predict|determine|explain)\b/i.test(sentence);
      if (!hasVerb) continue;

      claims.push({
        id: `claim_${claimId++}`,
        text: sentence,
        type: classifyClaimType(sentence),
        paragraphIndex: pIdx,
      });
    }
  }

  return claims;
}

// ===========================================
// CLAIM ↔ CITATION MAPPING
// ===========================================

export function mapClaimsToCitations(
  claims: Claim[],
  chapterContent: string,
  referenceKeys: string[]
): ClaimCitationLink[] {
  const paragraphs = chapterContent
    .split(/\n\n+/)
    .map(p => p.trim())
    .filter(p => p.length > 30);

  return claims.map(claim => {
    const paragraph = paragraphs[claim.paragraphIndex] || '';
    const citationsInParagraph = extractCitationKeys(paragraph);
    
    // Also check the specific sentence
    const citationsInSentence = extractCitationKeys(claim.text);
    
    // Combine and deduplicate
    const allCitations = [...new Set([...citationsInSentence, ...citationsInParagraph])];
    
    // Filter to only known references
    const matchedCitations = allCitations.filter(cit =>
      referenceKeys.some(rk => 
        rk.toLowerCase().includes(cit.toLowerCase()) || 
        cit.toLowerCase().includes(rk.toLowerCase())
      )
    );

    return {
      claim,
      citationKeys: matchedCitations,
      unsupported: matchedCitations.length === 0 && claim.type !== 'descriptive',
    };
  });
}

// ===========================================
// VERDICT LABEL CALCULATION
// ===========================================

export function getVerdictLabel(report: ClaimIntegrityReport): ClaimIntegrityReport['verdictLabel'] {
  if (!report.analysisComplete) return 'Analysis Incomplete';
  if (report.contradictions > 0 || report.avgSupportScore < 50) return 'Academically Unsafe';
  if (report.avgSupportScore < 65 || report.unsupportedEmpiricalClaims > 0) return 'Requires Revision';
  return 'Conceptually Sound';
}

export function getVerdictColor(label: ClaimIntegrityReport['verdictLabel']): string {
  switch (label) {
    case 'Conceptually Sound': return 'text-green-600 dark:text-green-400 bg-green-500/10 border-green-500/30';
    case 'Requires Revision': return 'text-amber-600 dark:text-amber-400 bg-amber-500/10 border-amber-500/30';
    case 'Academically Unsafe': return 'text-destructive bg-destructive/10 border-destructive/30';
    case 'Analysis Incomplete': return 'text-muted-foreground bg-muted/30 border-border/50';
  }
}
