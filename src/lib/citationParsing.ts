// ===========================================
// SCROLLVERIFIED™ — Multi-Style Citation Parser
// Abstraction layer for APA, Harvard, Chicago, IEEE citation detection
// ===========================================

export type CitationStyleType = 'APA' | 'Harvard' | 'Chicago' | 'IEEE' | 'auto';

export interface ParsedCitation {
  raw: string;
  authorKey: string;
  year?: number;
  style: CitationStyleType;
}

// ===========================================
// STYLE-SPECIFIC PATTERNS
// ===========================================

// APA: (Smith, 2020) | (Smith & Jones, 2020) | (Smith et al., 2020)
const APA_PATTERN = /\(([A-ZÀ-Ÿ][a-zà-ÿ]+(?:\s(?:&|and)\s[A-ZÀ-Ÿ][a-zà-ÿ]+)*(?:\s+et\s+al\.?)?),?\s*(\d{4})(?:[a-z])?(?:,\s*p{1,2}\.?\s*[\d–-]+)?\)/g;

// Harvard: (Smith 2020) | (Smith and Jones 2020) — no comma before year
const HARVARD_PATTERN = /\(([A-ZÀ-Ÿ][a-zà-ÿ]+(?:\s(?:and|&)\s[A-ZÀ-Ÿ][a-zà-ÿ]+)*(?:\s+et\s+al\.?)?)\s+(\d{4})(?:,\s*p{1,2}\.?\s*[\d–-]+)?\)/g;

// Chicago author-date: (Smith 2020, 45) | (Smith and Jones 2020)
const CHICAGO_PATTERN = /\(([A-ZÀ-Ÿ][a-zà-ÿ]+(?:\s(?:and|&)\s[A-ZÀ-Ÿ][a-zà-ÿ]+)*(?:\s+et\s+al\.?)?)\s+(\d{4})(?:,\s*[\d–-]+)?\)/g;

// IEEE: [1] | [2, 3] | [4-7]
const IEEE_PATTERN = /\[(\d+(?:\s*[,–-]\s*\d+)*)\]/g;

// Narrative citations: Smith (2020) | Smith and Jones (2020) | Smith et al. (2020)
const NARRATIVE_PATTERN = /([A-ZÀ-Ÿ][a-zà-ÿ]+(?:\s(?:and|&)\s[A-ZÀ-Ÿ][a-zà-ÿ]+)*(?:\s+et\s+al\.?)?)\s+\((\d{4})(?:[a-z])?\)/g;

// Footnote markers: superscript numbers or ¹²³
const FOOTNOTE_PATTERN = /(?:^|\s)(\d{1,3})(?=[,.\s]|$)/g;

// ===========================================
// AUTO-DETECT DOMINANT STYLE
// ===========================================

export function detectCitationStyle(content: string): CitationStyleType {
  const counts: Record<CitationStyleType, number> = {
    APA: 0,
    Harvard: 0,
    Chicago: 0,
    IEEE: 0,
    auto: 0,
  };

  // Count matches for each style
  counts.APA = (content.match(APA_PATTERN) || []).length;
  counts.Harvard = (content.match(HARVARD_PATTERN) || []).length;
  counts.IEEE = (content.match(IEEE_PATTERN) || []).length;
  // Chicago overlaps with Harvard; distinguish by comma+page pattern
  const chicagoSpecific = content.match(/\([A-ZÀ-Ÿ][a-zà-ÿ]+\s+\d{4},\s*\d+\)/g);
  counts.Chicago = (chicagoSpecific || []).length;

  // Harvard count minus Chicago-specific (they overlap)
  counts.Harvard = Math.max(0, counts.Harvard - counts.Chicago);

  // Find dominant
  let max = 0;
  let dominant: CitationStyleType = 'APA'; // default fallback
  for (const [style, count] of Object.entries(counts)) {
    if (style !== 'auto' && count > max) {
      max = count;
      dominant = style as CitationStyleType;
    }
  }

  return max > 0 ? dominant : 'APA';
}

// ===========================================
// UNIFIED CITATION EXTRACTION
// ===========================================

export function parseCitations(
  content: string,
  style: CitationStyleType = 'auto'
): ParsedCitation[] {
  const effectiveStyle = style === 'auto' ? detectCitationStyle(content) : style;
  const results: ParsedCitation[] = [];
  const seen = new Set<string>();

  function addResult(raw: string, authorKey: string, year: number | undefined, s: CitationStyleType) {
    const key = `${authorKey.toLowerCase()}_${year || ''}`;
    if (!seen.has(key)) {
      seen.add(key);
      results.push({ raw, authorKey: authorKey.trim(), year, style: s });
    }
  }

  // Always try the primary style + narrative citations
  switch (effectiveStyle) {
    case 'APA': {
      let m: RegExpExecArray | null;
      const re = new RegExp(APA_PATTERN.source, 'g');
      while ((m = re.exec(content)) !== null) {
        addResult(m[0], m[1], parseInt(m[2]), 'APA');
      }
      break;
    }
    case 'Harvard': {
      let m: RegExpExecArray | null;
      const re = new RegExp(HARVARD_PATTERN.source, 'g');
      while ((m = re.exec(content)) !== null) {
        addResult(m[0], m[1], parseInt(m[2]), 'Harvard');
      }
      break;
    }
    case 'Chicago': {
      let m: RegExpExecArray | null;
      const re = new RegExp(CHICAGO_PATTERN.source, 'g');
      while ((m = re.exec(content)) !== null) {
        addResult(m[0], m[1], parseInt(m[2]), 'Chicago');
      }
      break;
    }
    case 'IEEE': {
      let m: RegExpExecArray | null;
      const re = new RegExp(IEEE_PATTERN.source, 'g');
      while ((m = re.exec(content)) !== null) {
        // IEEE uses numbers, not author keys
        addResult(m[0], `ref_${m[1]}`, undefined, 'IEEE');
      }
      break;
    }
  }

  // Always also check narrative citations (common across styles)
  {
    let m: RegExpExecArray | null;
    const re = new RegExp(NARRATIVE_PATTERN.source, 'g');
    while ((m = re.exec(content)) !== null) {
      addResult(m[0], m[1], parseInt(m[2]), effectiveStyle);
    }
  }

  return results;
}

// ===========================================
// EXTRACT CITATION KEYS FROM PARAGRAPH
// (Backwards-compatible helper for claim mapping)
// ===========================================

export function extractCitationKeysMultiStyle(
  text: string,
  style: CitationStyleType = 'auto'
): string[] {
  const parsed = parseCitations(text, style);
  return parsed.map(p => p.authorKey);
}
