// ===========================================
// SCROLLVERIFIED™ — Semantic Support Engine
// Institutional-grade citation legitimacy validation
// ===========================================

/**
 * Empirical claim indicators — if a paragraph contains any of these,
 * at least one citation must be peer-reviewed with methodological relevance.
 */
export const EMPIRICAL_INDICATORS = [
  'study', 'studies', 'data', 'sample', 'experiment', 'experimental',
  'rct', 'randomized controlled trial', 'regression', 'panel data',
  'meta-analysis', 'meta analysis', 'survey', 'longitudinal',
  'cross-sectional', 'statistically significant', 'p-value', 'p <',
  'confidence interval', 'effect size', 'cohort', 'trial',
  'findings show', 'results indicate', 'evidence suggests',
];

export interface CitationMetadata {
  title: string;
  abstract?: string;
  keywords?: string[];
  year: number;
  peerReviewed?: boolean;
}

export interface SemanticSupportResult {
  supportScore: number; // 0–100
  supportLevel: 'strong' | 'moderate' | 'weak' | 'ornamental';
  reason: string;
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

// ===========================================
// KEYWORD EXTRACTION
// ===========================================

function extractKeywords(text: string): string[] {
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'shall', 'can', 'need', 'dare', 'ought',
    'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as',
    'into', 'through', 'during', 'before', 'after', 'above', 'below',
    'between', 'out', 'off', 'over', 'under', 'again', 'further', 'then',
    'once', 'and', 'but', 'or', 'nor', 'not', 'so', 'yet', 'both',
    'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no',
    'than', 'too', 'very', 'just', 'also', 'this', 'that', 'these',
    'those', 'it', 'its', 'they', 'them', 'their', 'we', 'our', 'he',
    'she', 'his', 'her', 'who', 'which', 'what', 'where', 'when', 'how',
  ]);

  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w));
}

// ===========================================
// CLAIM TYPE DETECTION
// ===========================================

export type ClaimType = 'empirical' | 'theoretical' | 'general';

export function detectClaimType(paragraph: string): ClaimType {
  const lower = paragraph.toLowerCase();
  
  for (const indicator of EMPIRICAL_INDICATORS) {
    if (lower.includes(indicator)) return 'empirical';
  }
  
  const theoreticalIndicators = [
    'theory', 'framework', 'model', 'hypothesis', 'posits', 'proposes',
    'argues', 'conceptual', 'paradigm', 'construct', 'postulates',
  ];
  
  for (const indicator of theoreticalIndicators) {
    if (lower.includes(indicator)) return 'theoretical';
  }
  
  return 'general';
}

// ===========================================
// SEMANTIC SUPPORT EVALUATION
// ===========================================

export function evaluateCitationSupport(
  paragraphText: string,
  citationMetadata: CitationMetadata
): SemanticSupportResult {
  const paragraphKeywords = extractKeywords(paragraphText);
  const titleKeywords = extractKeywords(citationMetadata.title);
  const abstractKeywords = citationMetadata.abstract
    ? extractKeywords(citationMetadata.abstract)
    : [];
  const metaKeywords = (citationMetadata.keywords || [])
    .map(k => k.toLowerCase());

  // Combine all citation keywords
  const allCitationKeywords = new Set([
    ...titleKeywords,
    ...abstractKeywords,
    ...metaKeywords,
  ]);

  if (paragraphKeywords.length === 0 || allCitationKeywords.size === 0) {
    return { supportScore: 30, supportLevel: 'weak', reason: 'Insufficient text for semantic analysis' };
  }

  // Calculate keyword overlap
  const paragraphSet = new Set(paragraphKeywords);
  const intersection = [...paragraphSet].filter(w => allCitationKeywords.has(w));
  const overlapRatio = intersection.length / Math.min(paragraphSet.size, allCitationKeywords.size);

  // Title-specific match (weighted higher)
  const titleSet = new Set(titleKeywords);
  const titleIntersection = [...paragraphSet].filter(w => titleSet.has(w));
  const titleOverlap = titleKeywords.length > 0
    ? titleIntersection.length / Math.min(paragraphSet.size, titleSet.size)
    : 0;

  // Composite score
  let score = 0;

  // Title relevance (40% weight)
  score += titleOverlap * 40;

  // Abstract/keyword relevance (35% weight)
  if (abstractKeywords.length > 0) {
    const abstractSet = new Set(abstractKeywords);
    const abstractIntersection = [...paragraphSet].filter(w => abstractSet.has(w));
    const abstractOverlap = abstractIntersection.length / Math.min(paragraphSet.size, abstractSet.size);
    score += abstractOverlap * 35;
  } else {
    // If no abstract, rely more on keywords and title
    score += overlapRatio * 25;
  }

  // Keyword tag match (15% weight)
  if (metaKeywords.length > 0) {
    const metaMatches = metaKeywords.filter(k =>
      paragraphKeywords.some(pk => pk.includes(k) || k.includes(pk))
    );
    score += (metaMatches.length / metaKeywords.length) * 15;
  }

  // Recency bonus (10% weight)
  const currentYear = new Date().getFullYear();
  const age = currentYear - citationMetadata.year;
  if (age <= 5) score += 10;
  else if (age <= 10) score += 7;
  else if (age <= 20) score += 4;
  else score += 1;

  // Normalize to 0-100
  score = Math.min(100, Math.max(0, Math.round(score)));

  // Determine support level
  let supportLevel: SemanticSupportResult['supportLevel'];
  let reason: string;

  if (score >= 80) {
    supportLevel = 'strong';
    reason = `High keyword alignment (${intersection.length} shared terms) with title and content`;
  } else if (score >= 65) {
    supportLevel = 'moderate';
    reason = `Moderate conceptual overlap (${intersection.length} shared terms)`;
  } else if (score >= 40) {
    supportLevel = 'weak';
    reason = `Low keyword alignment — citation may be tangentially related`;
  } else {
    supportLevel = 'ornamental';
    reason = `Minimal semantic connection — possible decorative citation`;
  }

  return { supportScore: score, supportLevel, reason };
}

// ===========================================
// PARAGRAPH-LEVEL INTEGRITY ANALYSIS
// ===========================================

export function buildSemanticIntegrityReport(
  evaluations: SemanticSupportResult[]
): SemanticIntegrityReport {
  const total = evaluations.length;
  if (total === 0) {
    return {
      totalCitations: 0,
      strong: 0, moderate: 0, weak: 0, ornamental: 0,
      averageScore: 0,
      empiricalClaimsUnsupported: 0,
      ornamentalPct: 0,
    };
  }

  const strong = evaluations.filter(e => e.supportLevel === 'strong').length;
  const moderate = evaluations.filter(e => e.supportLevel === 'moderate').length;
  const weak = evaluations.filter(e => e.supportLevel === 'weak').length;
  const ornamental = evaluations.filter(e => e.supportLevel === 'ornamental').length;
  const avgScore = Math.round(evaluations.reduce((s, e) => s + e.supportScore, 0) / total);

  return {
    totalCitations: total,
    strong,
    moderate,
    weak,
    ornamental,
    averageScore: avgScore,
    empiricalClaimsUnsupported: 0, // calculated at edge function level
    ornamentalPct: Math.round((ornamental / total) * 100),
  };
}

// ===========================================
// SEMANTIC INTEGRITY LABEL
// ===========================================

export function getSemanticLabel(avgScore: number): 'Strong' | 'Moderate' | 'Weak' {
  if (avgScore >= 75) return 'Strong';
  if (avgScore >= 60) return 'Moderate';
  return 'Weak';
}
