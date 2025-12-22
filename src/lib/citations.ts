// Production-grade citation formatting for APA 7th and Harvard styles

export interface AcademicSource {
  id: string;
  title: string;
  authors: string[];
  year: number;
  type: 'journal' | 'book' | 'article' | 'conference' | 'preprint' | 'thesis' | 'report';
  doi?: string;
  url?: string;
  journal?: string;
  publisher?: string;
  abstract?: string;
  citationCount?: number;
  verified: boolean;
  database: string;
  peerReviewed: boolean;
  volume?: string;
  issue?: string;
  pages?: string;
  accessDate?: string;
}

export type CitationStyle = 'APA' | 'Harvard';

// Format author name for citation
function formatAuthorName(name: string, style: CitationStyle, position: 'first' | 'subsequent'): string {
  const parts = name.split(',').map(p => p.trim());
  
  if (parts.length === 2) {
    // "Last, First" format
    const [lastName, firstName] = parts;
    if (style === 'APA') {
      return position === 'first' 
        ? `${lastName}, ${firstName.charAt(0)}.` 
        : `${lastName}, ${firstName.charAt(0)}.`;
    } else {
      return position === 'first' 
        ? `${lastName}, ${firstName.charAt(0)}.` 
        : `${firstName.charAt(0)}. ${lastName}`;
    }
  }
  
  // "First Last" format
  const nameParts = name.split(' ').filter(p => p.length > 0);
  if (nameParts.length >= 2) {
    const lastName = nameParts[nameParts.length - 1];
    const initials = nameParts.slice(0, -1).map(n => n.charAt(0) + '.').join(' ');
    
    if (style === 'APA') {
      return `${lastName}, ${initials}`;
    } else {
      return position === 'first' 
        ? `${lastName}, ${initials}` 
        : `${initials} ${lastName}`;
    }
  }
  
  return name; // Fallback to original
}

// Format authors list for bibliography
function formatAuthors(authors: string[], style: CitationStyle): string {
  if (!authors || authors.length === 0) return 'Unknown Author';
  
  const formattedAuthors = authors.map((author, index) => 
    formatAuthorName(author, style, index === 0 ? 'first' : 'subsequent')
  );
  
  if (style === 'APA') {
    if (formattedAuthors.length === 1) {
      return formattedAuthors[0];
    } else if (formattedAuthors.length === 2) {
      return `${formattedAuthors[0]}, & ${formattedAuthors[1]}`;
    } else if (formattedAuthors.length <= 20) {
      const allButLast = formattedAuthors.slice(0, -1).join(', ');
      return `${allButLast}, & ${formattedAuthors[formattedAuthors.length - 1]}`;
    } else {
      // More than 20 authors: first 19, ..., last
      const first19 = formattedAuthors.slice(0, 19).join(', ');
      return `${first19}, ... ${formattedAuthors[formattedAuthors.length - 1]}`;
    }
  } else { // Harvard
    if (formattedAuthors.length === 1) {
      return formattedAuthors[0];
    } else if (formattedAuthors.length === 2) {
      return `${formattedAuthors[0]} and ${formattedAuthors[1]}`;
    } else if (formattedAuthors.length <= 3) {
      const allButLast = formattedAuthors.slice(0, -1).join(', ');
      return `${allButLast} and ${formattedAuthors[formattedAuthors.length - 1]}`;
    } else {
      return `${formattedAuthors[0]} et al.`;
    }
  }
}

// Format in-text citation
export function formatInTextCitation(source: AcademicSource, style: CitationStyle): string {
  const lastName = getLastName(source.authors[0] || 'Unknown');
  const year = source.year || 'n.d.';
  
  if (style === 'APA') {
    if (source.authors.length === 1) {
      return `(${lastName}, ${year})`;
    } else if (source.authors.length === 2) {
      const lastName2 = getLastName(source.authors[1]);
      return `(${lastName} & ${lastName2}, ${year})`;
    } else {
      return `(${lastName} et al., ${year})`;
    }
  } else { // Harvard
    if (source.authors.length === 1) {
      return `(${lastName} ${year})`;
    } else if (source.authors.length === 2) {
      const lastName2 = getLastName(source.authors[1]);
      return `(${lastName} and ${lastName2} ${year})`;
    } else {
      return `(${lastName} et al. ${year})`;
    }
  }
}

function getLastName(name: string): string {
  if (name.includes(',')) {
    return name.split(',')[0].trim();
  }
  const parts = name.split(' ').filter(p => p.length > 0);
  return parts[parts.length - 1] || name;
}

// Format full bibliography entry
export function formatBibliographyEntry(source: AcademicSource, style: CitationStyle): string {
  const authors = formatAuthors(source.authors, style);
  const year = source.year || 'n.d.';
  const title = source.title;
  
  if (style === 'APA') {
    return formatAPAEntry(source, authors, year, title);
  } else {
    return formatHarvardEntry(source, authors, year, title);
  }
}

function formatAPAEntry(source: AcademicSource, authors: string, year: number | string, title: string): string {
  let entry = `${authors} (${year}). `;
  
  switch (source.type) {
    case 'journal':
      entry += `${title}. `;
      if (source.journal) {
        entry += `*${source.journal}*`;
        if (source.volume) {
          entry += `, *${source.volume}*`;
          if (source.issue) entry += `(${source.issue})`;
        }
        if (source.pages) entry += `, ${source.pages}`;
        entry += '. ';
      }
      break;
      
    case 'book':
      entry += `*${title}*. `;
      if (source.publisher) entry += `${source.publisher}. `;
      break;
      
    case 'conference':
      entry += `${title}. `;
      if (source.journal) entry += `In *${source.journal}*. `;
      if (source.publisher) entry += `${source.publisher}. `;
      break;
      
    case 'preprint':
      entry += `${title}. `;
      entry += `*Preprint*. `;
      break;
      
    case 'thesis':
      entry += `*${title}* [Doctoral dissertation]. `;
      if (source.publisher) entry += `${source.publisher}. `;
      break;
      
    default:
      entry += `${title}. `;
      if (source.publisher) entry += `${source.publisher}. `;
  }
  
  if (source.doi) {
    entry += `https://doi.org/${source.doi}`;
  } else if (source.url) {
    entry += source.url;
  }
  
  return entry.trim();
}

function formatHarvardEntry(source: AcademicSource, authors: string, year: number | string, title: string): string {
  let entry = `${authors} (${year}) `;
  
  switch (source.type) {
    case 'journal':
      entry += `'${title}', `;
      if (source.journal) {
        entry += `*${source.journal}*`;
        if (source.volume) {
          entry += `, vol. ${source.volume}`;
          if (source.issue) entry += `, no. ${source.issue}`;
        }
        if (source.pages) entry += `, pp. ${source.pages}`;
        entry += '. ';
      }
      break;
      
    case 'book':
      entry += `*${title}*, `;
      if (source.publisher) entry += `${source.publisher}. `;
      break;
      
    case 'conference':
      entry += `'${title}', `;
      if (source.journal) entry += `in *${source.journal}*, `;
      if (source.publisher) entry += `${source.publisher}. `;
      break;
      
    case 'preprint':
      entry += `'${title}', `;
      entry += `preprint. `;
      break;
      
    default:
      entry += `'${title}', `;
      if (source.publisher) entry += `${source.publisher}. `;
  }
  
  if (source.doi) {
    entry += `Available at: https://doi.org/${source.doi}`;
  } else if (source.url) {
    const accessDate = source.accessDate || new Date().toLocaleDateString('en-GB', {
      day: 'numeric', month: 'long', year: 'numeric'
    });
    entry += `Available at: ${source.url} (Accessed: ${accessDate})`;
  }
  
  return entry.trim();
}

// Generate full bibliography from sources
export function generateBibliography(sources: AcademicSource[], style: CitationStyle): string {
  // Sort alphabetically by first author's last name
  const sorted = [...sources].sort((a, b) => {
    const lastNameA = getLastName(a.authors[0] || 'Unknown').toLowerCase();
    const lastNameB = getLastName(b.authors[0] || 'Unknown').toLowerCase();
    return lastNameA.localeCompare(lastNameB);
  });
  
  const header = style === 'APA' ? '## References\n\n' : '## Reference List\n\n';
  const entries = sorted.map(source => formatBibliographyEntry(source, style));
  
  return header + entries.join('\n\n');
}

// Validate that a source has minimum required fields for citation
export function validateSource(source: AcademicSource): { valid: boolean; missing: string[] } {
  const missing: string[] = [];
  
  if (!source.title) missing.push('title');
  if (!source.authors || source.authors.length === 0) missing.push('authors');
  if (!source.year) missing.push('year');
  
  // For academic mode, DOI or URL is strongly recommended
  if (!source.doi && !source.url) {
    missing.push('DOI or URL (recommended)');
  }
  
  return {
    valid: missing.filter(m => !m.includes('recommended')).length === 0,
    missing,
  };
}

// Get citation confidence badge
export function getCitationConfidence(source: AcademicSource): 'verified' | 'partial' | 'unverified' {
  if (source.doi && source.peerReviewed) return 'verified';
  if (source.verified || source.doi || source.peerReviewed) return 'partial';
  return 'unverified';
}

// Format confidence score to human-readable label
export function formatConfidenceLabel(confidence: 'high' | 'moderate' | 'low' | 'insufficient'): string {
  const labels = {
    high: 'Strongly supported by peer-reviewed literature',
    moderate: 'Adequately supported by academic sources',
    low: 'Limited academic sources available',
    insufficient: 'Insufficient verified sources - topic refinement recommended',
  };
  return labels[confidence];
}
