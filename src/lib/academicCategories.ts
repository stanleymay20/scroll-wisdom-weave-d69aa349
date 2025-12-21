// Academic categories that require references by default
export const ACADEMIC_CATEGORIES = [
  'theology',
  'science',
  'technology',
  'medicine',
  'law',
  'history',
  'philosophy',
  'economics',
  'finance',
  'governance',
  'african_studies',
] as const;

export const CITATION_STYLES = [
  { value: 'APA', label: 'APA (7th Edition)', example: '(Author, Year)' },
  { value: 'MLA', label: 'MLA (9th Edition)', example: '(Author Page)' },
  { value: 'Harvard', label: 'Harvard', example: '(Author Year)' },
  { value: 'Chicago', label: 'Chicago', example: 'Footnotes' },
] as const;

export type CitationStyle = typeof CITATION_STYLES[number]['value'];

export function isAcademicCategory(category: string): boolean {
  return ACADEMIC_CATEGORIES.includes(category as any);
}

// Format a reference based on citation style
export function formatReference(
  ref: {
    author: string;
    title: string;
    year: number;
    type: string;
    doi?: string;
    url?: string;
    journal?: string;
    publisher?: string;
  },
  style: CitationStyle
): string {
  const { author, title, year, type, doi, url, journal, publisher } = ref;
  
  switch (style) {
    case 'APA':
      if (type === 'journal' && journal) {
        return `${author} (${year}). ${title}. *${journal}*.${doi ? ` https://doi.org/${doi}` : url ? ` ${url}` : ''}`;
      }
      return `${author} (${year}). *${title}*.${publisher ? ` ${publisher}.` : ''}${doi ? ` https://doi.org/${doi}` : url ? ` ${url}` : ''}`;
    
    case 'MLA':
      if (type === 'journal' && journal) {
        return `${author}. "${title}." *${journal}*, ${year}.${url ? ` ${url}` : ''}`;
      }
      return `${author}. *${title}*.${publisher ? ` ${publisher},` : ''} ${year}.`;
    
    case 'Harvard':
      return `${author} (${year}) ${title}.${publisher ? ` ${publisher}.` : journal ? ` ${journal}.` : ''}${url ? ` Available at: ${url}` : ''}`;
    
    case 'Chicago':
      return `${author}. ${title}.${publisher ? ` ${publisher},` : ''} ${year}.${url ? ` ${url}.` : ''}`;
    
    default:
      return `${author} (${year}). ${title}.`;
  }
}

// Get confidence label based on reference count
export function getConfidenceLabel(refCount: number): { label: string; color: string } {
  if (refCount >= 10) return { label: 'High citation density', color: 'text-green-500' };
  if (refCount >= 5) return { label: 'Moderate', color: 'text-yellow-500' };
  if (refCount >= 1) return { label: 'Introductory overview', color: 'text-orange-500' };
  return { label: 'No citations', color: 'text-red-500' };
}
