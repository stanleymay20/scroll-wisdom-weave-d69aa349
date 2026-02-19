// ===========================================
// REFERENCE INTEGRITY ENGINE — 2026 Academic Compliance
// Bidirectional integrity, canonical anchoring, noise removal
// ===========================================

import type { AcademicSource, CitationStyle } from './citations';

// ===========================================
// 1. CANONICAL SOURCES BY DOMAIN
// ===========================================

export interface CanonicalSource {
  authors: string[];
  year: number;
  title: string;
  keywords: string[]; // concepts that trigger this anchor
}

/**
 * Domain-specific canonical anchors that MUST appear
 * when their keywords are discussed in content.
 */
export const CANONICAL_ANCHORS: Record<string, CanonicalSource[]> = {
  behavioral_finance: [
    { authors: ['Kahneman, D.', 'Tversky, A.'], year: 1979, title: 'Prospect Theory: An Analysis of Decision under Risk', keywords: ['prospect theory', 'loss aversion', 'risk aversion', 'decision under risk'] },
    { authors: ['Tversky, A.', 'Kahneman, D.'], year: 1992, title: 'Advances in Prospect Theory: Cumulative Representation of Uncertainty', keywords: ['cumulative prospect theory', 'probability weighting'] },
    { authors: ['Thaler, R.'], year: 1985, title: 'Mental Accounting and Consumer Choice', keywords: ['mental accounting', 'consumer behavior', 'sunk cost'] },
    { authors: ['Shefrin, H.', 'Statman, M.'], year: 1985, title: 'The Disposition to Sell Winners Too Early and Ride Losers Too Long', keywords: ['disposition effect', 'selling winners', 'riding losers'] },
    { authors: ['Benartzi, S.', 'Thaler, R.'], year: 1995, title: 'Myopic Loss Aversion and the Equity Premium Puzzle', keywords: ['myopic loss aversion', 'equity premium puzzle'] },
    { authors: ['Barberis, N.', 'Huang, M.', 'Santos, T.'], year: 2001, title: 'Prospect Theory and Asset Prices', keywords: ['prospect theory', 'asset prices', 'behavioral asset pricing'] },
    { authors: ['Odean, T.'], year: 1998, title: 'Are Investors Reluctant to Realize Their Losses?', keywords: ['investor behavior', 'reluctant to realize losses', 'disposition effect'] },
    { authors: ['Barber, B.', 'Odean, T.'], year: 2000, title: 'Trading Is Hazardous to Your Wealth', keywords: ['overtrading', 'trading frequency', 'investor returns'] },
    { authors: ['Barber, B.', 'Odean, T.'], year: 2001, title: 'Boys Will Be Boys: Gender, Overconfidence, and Common Stock Investment', keywords: ['overconfidence', 'gender differences', 'trading behavior'] },
  ],
  cognitive_psychology: [
    { authors: ['Kahneman, D.'], year: 2011, title: 'Thinking, Fast and Slow', keywords: ['system 1', 'system 2', 'heuristics', 'cognitive bias'] },
    { authors: ['Stanovich, K.', 'West, R.'], year: 2000, title: 'Individual Differences in Reasoning', keywords: ['reasoning', 'individual differences', 'rationality'] },
    { authors: ['Gigerenzer, G.'], year: 2008, title: 'Rationality for Mortals', keywords: ['ecological rationality', 'bounded rationality', 'heuristics'] },
  ],
  economics: [
    { authors: ['Smith, A.'], year: 1776, title: 'An Inquiry into the Nature and Causes of the Wealth of Nations', keywords: ['invisible hand', 'division of labor', 'free market'] },
    { authors: ['Keynes, J.M.'], year: 1936, title: 'The General Theory of Employment, Interest and Money', keywords: ['keynesian', 'aggregate demand', 'liquidity preference'] },
    { authors: ['Friedman, M.'], year: 1962, title: 'Capitalism and Freedom', keywords: ['monetarism', 'free market', 'monetary policy'] },
  ],
};

// ===========================================
// 2. NOISE DETECTION
// ===========================================

/** Domains that are irrelevant to finance/business books */
const NOISE_DOMAINS = [
  'materials science', 'electrochemistry', 'metallurgy',
  'organic chemistry', 'particle physics', 'crystallography',
  'marine biology', 'botany', 'geology',
];

/**
 * Check if a reference is cross-disciplinary noise.
 * Returns a removal reason or null if valid.
 */
export function detectCitationNoise(
  ref: AcademicSource,
  bookCategory: string
): string | null {
  const titleLower = (ref.title || '').toLowerCase();
  const journalLower = (ref.journal || '').toLowerCase();

  // Check for irrelevant domain references in finance/business books
  if (['finance', 'economics', 'business', 'entrepreneurship'].includes(bookCategory)) {
    for (const noise of NOISE_DOMAINS) {
      if (titleLower.includes(noise) || journalLower.includes(noise)) {
        return `Cross-disciplinary noise: ${noise} reference in ${bookCategory} book`;
      }
    }
  }

  // Detect duplicate-by-content (same title, different format)
  // This is handled at the list level in auditReferences()

  return null;
}

// ===========================================
// 3. BIDIRECTIONAL INTEGRITY CHECK
// ===========================================

export interface IntegrityReport {
  orphanReferences: AcademicSource[];    // In ref list but never cited in text
  missingReferences: string[];           // Cited in text but not in ref list
  duplicates: AcademicSource[];          // Same source listed multiple times
  noiseReferences: Array<{ ref: AcademicSource; reason: string }>;
  missingCanonicals: CanonicalSource[];  // Required but absent
  recencyStats: {
    total: number;
    post2010: number;
    post2018: number;
    post2010Pct: number;
    post2018Pct: number;
    meetsThreshold: boolean;
  };
  compliant: boolean;
}

/**
 * Extract in-text citation keys from chapter content.
 * Matches patterns like (Author, Year), (Author & Author, Year), (Author et al., Year)
 */
function extractInTextCitations(content: string): string[] {
  const patterns = [
    /\(([A-Z][a-z]+(?:\s*(?:&|and)\s*[A-Z][a-z]+)*(?:\s*et\s*al\.?)?,?\s*\d{4}[a-z]?)\)/gi,
    /\[([A-Z][a-z]+(?:\s*(?:&|and)\s*[A-Z][a-z]+)*(?:\s*et\s*al\.?)?,?\s*\d{4}[a-z]?)\]/gi,
  ];
  const citations: string[] = [];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      citations.push(match[1].trim());
    }
  }
  return [...new Set(citations)];
}

/**
 * Build a citation key from a source for matching purposes.
 */
function buildCitationKey(source: AcademicSource): string {
  const lastName = source.authors[0]?.split(',')[0]?.split(' ').pop() || 'Unknown';
  return `${lastName}, ${source.year}`;
}

/**
 * Perform a full bidirectional integrity audit on a chapter's references.
 */
export function auditReferences(
  chapterContent: string,
  references: AcademicSource[],
  bookCategory: string,
  contentKeywords: string[] = []
): IntegrityReport {
  const inTextCitations = extractInTextCitations(chapterContent);
  const refKeys = references.map(buildCitationKey);

  // 1. Orphan references (in list, never cited)
  const orphanReferences = references.filter(ref => {
    const key = buildCitationKey(ref);
    const lastName = ref.authors[0]?.split(',')[0]?.split(' ').pop() || '';
    // Check if any in-text citation mentions this author+year
    return !inTextCitations.some(cite =>
      cite.toLowerCase().includes(lastName.toLowerCase()) &&
      cite.includes(String(ref.year))
    );
  });

  // 2. Missing references (cited but not in list)
  const missingReferences = inTextCitations.filter(cite => {
    return !references.some(ref => {
      const lastName = ref.authors[0]?.split(',')[0]?.split(' ').pop() || '';
      return cite.toLowerCase().includes(lastName.toLowerCase()) &&
             cite.includes(String(ref.year));
    });
  });

  // 3. Duplicates (same DOI or same title+year)
  const seen = new Map<string, AcademicSource>();
  const duplicates: AcademicSource[] = [];
  for (const ref of references) {
    const dedupeKey = ref.doi || `${ref.title.toLowerCase().slice(0, 60)}|${ref.year}`;
    if (seen.has(dedupeKey)) {
      duplicates.push(ref);
    } else {
      seen.set(dedupeKey, ref);
    }
  }

  // 4. Noise detection
  const noiseReferences: Array<{ ref: AcademicSource; reason: string }> = [];
  for (const ref of references) {
    const reason = detectCitationNoise(ref, bookCategory);
    if (reason) noiseReferences.push({ ref, reason });
  }

  // 5. Missing canonical anchors
  const contentLower = chapterContent.toLowerCase();
  const keywordsLower = contentKeywords.map(k => k.toLowerCase());
  const allKeywords = [...keywordsLower, ...contentLower.split(/\s+/)];
  
  const missingCanonicals: CanonicalSource[] = [];
  for (const [domain, canonicals] of Object.entries(CANONICAL_ANCHORS)) {
    for (const canonical of canonicals) {
      // Check if any canonical keyword appears in content
      const keywordMatch = canonical.keywords.some(kw =>
        contentLower.includes(kw)
      );
      if (!keywordMatch) continue;

      // Check if this canonical is already in references
      const alreadyCited = references.some(ref => {
        const authorMatch = canonical.authors.some(ca =>
          ref.authors.some(ra => ra.toLowerCase().includes(ca.split(',')[0].toLowerCase()))
        );
        return authorMatch && ref.year === canonical.year;
      });

      if (!alreadyCited) {
        missingCanonicals.push(canonical);
      }
    }
  }

  // 6. Recency statistics
  const total = references.length;
  const post2010 = references.filter(r => r.year >= 2010).length;
  const post2018 = references.filter(r => r.year >= 2018).length;
  const post2010Pct = total > 0 ? Math.round((post2010 / total) * 100) : 0;
  const post2018Pct = total > 0 ? Math.round((post2018 / total) * 100) : 0;

  const compliant =
    orphanReferences.length === 0 &&
    missingReferences.length === 0 &&
    duplicates.length === 0 &&
    noiseReferences.length === 0 &&
    missingCanonicals.length === 0 &&
    post2010Pct >= 30 &&
    post2018Pct >= 15;

  return {
    orphanReferences,
    missingReferences,
    duplicates,
    noiseReferences,
    missingCanonicals,
    recencyStats: {
      total,
      post2010,
      post2018,
      post2010Pct,
      post2018Pct,
      meetsThreshold: post2010Pct >= 30 && post2018Pct >= 15,
    },
    compliant,
  };
}

/**
 * Remove noise and duplicates from a reference list.
 * Returns cleaned references and a removal log.
 */
export function cleanReferences(
  references: AcademicSource[],
  bookCategory: string
): { cleaned: AcademicSource[]; removed: Array<{ ref: AcademicSource; reason: string }> } {
  const removed: Array<{ ref: AcademicSource; reason: string }> = [];
  const seen = new Map<string, boolean>();
  const cleaned: AcademicSource[] = [];

  for (const ref of references) {
    // Check noise
    const noiseReason = detectCitationNoise(ref, bookCategory);
    if (noiseReason) {
      removed.push({ ref, reason: noiseReason });
      continue;
    }

    // Check duplicate
    const dedupeKey = ref.doi || `${ref.title.toLowerCase().slice(0, 60)}|${ref.year}`;
    if (seen.has(dedupeKey)) {
      removed.push({ ref, reason: 'Duplicate entry' });
      continue;
    }

    // Check fabrication signals (no DOI, no URL, unverified)
    if (!ref.verified && !ref.doi && !ref.url && !ref.peerReviewed) {
      removed.push({ ref, reason: 'Unverifiable: no DOI, URL, or verification status' });
      continue;
    }

    seen.set(dedupeKey, true);
    cleaned.push(ref);
  }

  return { cleaned, removed };
}

// ===========================================
// 4. COMPLIANCE SUMMARY
// ===========================================

export function formatComplianceReport(report: IntegrityReport): string {
  const lines: string[] = ['## 📋 Reference Integrity Report (2026 Compliance)\n'];

  if (report.compliant) {
    lines.push('✅ **2026 Academic Compliance Achieved**\n');
  } else {
    lines.push('⚠️ **Compliance Issues Detected**\n');
  }

  // Orphans
  if (report.orphanReferences.length > 0) {
    lines.push(`### Orphan References (${report.orphanReferences.length})`);
    lines.push('*Listed in bibliography but never cited in text:*');
    report.orphanReferences.forEach(r => lines.push(`- ${r.authors[0]} (${r.year}). ${r.title}`));
    lines.push('');
  }

  // Missing
  if (report.missingReferences.length > 0) {
    lines.push(`### Missing from Bibliography (${report.missingReferences.length})`);
    lines.push('*Cited in text but absent from reference list:*');
    report.missingReferences.forEach(c => lines.push(`- ${c}`));
    lines.push('');
  }

  // Duplicates
  if (report.duplicates.length > 0) {
    lines.push(`### Duplicates (${report.duplicates.length})`);
    report.duplicates.forEach(r => lines.push(`- ${r.authors[0]} (${r.year}). ${r.title}`));
    lines.push('');
  }

  // Noise
  if (report.noiseReferences.length > 0) {
    lines.push(`### Citation Noise (${report.noiseReferences.length})`);
    report.noiseReferences.forEach(({ ref, reason }) =>
      lines.push(`- ❌ ${ref.authors[0]} (${ref.year}): ${reason}`)
    );
    lines.push('');
  }

  // Missing canonicals
  if (report.missingCanonicals.length > 0) {
    lines.push(`### Missing Canonical Sources (${report.missingCanonicals.length})`);
    report.missingCanonicals.forEach(c =>
      lines.push(`- 📌 ${c.authors.join(', ')} (${c.year}). *${c.title}*`)
    );
    lines.push('');
  }

  // Recency
  lines.push('### Recency Analysis');
  lines.push(`- Total references: ${report.recencyStats.total}`);
  lines.push(`- Post-2010: ${report.recencyStats.post2010} (${report.recencyStats.post2010Pct}%) ${report.recencyStats.post2010Pct >= 30 ? '✅' : '❌ <30%'}`);
  lines.push(`- Post-2018: ${report.recencyStats.post2018} (${report.recencyStats.post2018Pct}%) ${report.recencyStats.post2018Pct >= 15 ? '✅' : '❌ <15%'}`);

  return lines.join('\n');
}
