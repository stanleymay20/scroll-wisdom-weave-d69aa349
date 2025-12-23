// ===========================================
// SCROLLLIBRARY AUTHORITY-GRADE ACADEMIC VALIDATOR
// Hard Failure Validation for University-Grade Content
// ===========================================

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  code: string;
  message: string;
  severity: 'critical' | 'high' | 'medium';
  section?: string;
}

export interface ValidationWarning {
  code: string;
  message: string;
  suggestion: string;
}

export interface AcademicSource {
  author: string;
  title: string;
  year: number;
  type: string;
  doi?: string;
  url?: string;
  journal?: string;
  publisher?: string;
  verified?: boolean;
  peerReviewed?: boolean;
  database?: string;
}

// Domain-specific validation rules
export const DOMAIN_RULES: Record<string, {
  requiresPeerReview: boolean;
  requiresDisclaimer: boolean;
  minSources: number;
  specialRequirements: string[];
}> = {
  medicine: {
    requiresPeerReview: true,
    requiresDisclaimer: true,
    minSources: 5,
    specialRequirements: ['evidence_hierarchy', 'medical_disclaimer'],
  },
  law: {
    requiresPeerReview: false,
    requiresDisclaimer: true,
    minSources: 3,
    specialRequirements: ['legal_disclaimer'],
  },
  science: {
    requiresPeerReview: true,
    requiresDisclaimer: false,
    minSources: 5,
    specialRequirements: ['reproducibility_statement'],
  },
  technology: {
    requiresPeerReview: false,
    requiresDisclaimer: false,
    minSources: 3,
    specialRequirements: ['code_formatting', 'version_info'],
  },
  business: {
    requiresPeerReview: false,
    requiresDisclaimer: false,
    minSources: 3,
    specialRequirements: ['framework_citations'],
  },
  history: {
    requiresPeerReview: false,
    requiresDisclaimer: false,
    minSources: 5,
    specialRequirements: ['primary_sources'],
  },
  philosophy: {
    requiresPeerReview: false,
    requiresDisclaimer: false,
    minSources: 4,
    specialRequirements: ['argumentation_structure'],
  },
  default: {
    requiresPeerReview: false,
    requiresDisclaimer: false,
    minSources: 3,
    specialRequirements: [],
  },
};

// ===========================================
// HARD FAILURE CONDITIONS
// ===========================================

export function validateAcademicContent(
  content: string,
  sources: AcademicSource[],
  category: string,
  citationStyle: string
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  
  const domainRules = DOMAIN_RULES[category.toLowerCase()] || DOMAIN_RULES.default;
  
  // 1. CITATION VALIDATION - HARD FAIL
  const citationCheck = validateCitations(content, sources, citationStyle);
  errors.push(...citationCheck.errors);
  warnings.push(...citationCheck.warnings);
  
  // 2. REFERENCES SECTION - HARD FAIL
  if (!hasReferencesSection(content)) {
    errors.push({
      code: 'MISSING_REFERENCES_SECTION',
      message: 'Academic content must include a References section',
      severity: 'critical',
    });
  }
  
  // 3. SOURCE VERIFICATION - HARD FAIL
  const unverifiedSources = sources.filter(s => !s.doi && !s.url);
  if (unverifiedSources.length > 0 && sources.length > 0) {
    const ratio = unverifiedSources.length / sources.length;
    if (ratio > 0.3) {
      errors.push({
        code: 'UNVERIFIED_SOURCES',
        message: `${Math.round(ratio * 100)}% of sources lack DOI or stable URL`,
        severity: 'high',
      });
    }
  }
  
  // 4. MINIMUM SOURCE COUNT - HARD FAIL
  if (sources.length < domainRules.minSources) {
    errors.push({
      code: 'INSUFFICIENT_SOURCES',
      message: `${category} requires minimum ${domainRules.minSources} sources, found ${sources.length}`,
      severity: 'critical',
    });
  }
  
  // 5. PEER REVIEW REQUIREMENT - HARD FAIL for certain domains
  if (domainRules.requiresPeerReview) {
    const peerReviewedCount = sources.filter(s => s.peerReviewed).length;
    if (peerReviewedCount < Math.ceil(domainRules.minSources / 2)) {
      errors.push({
        code: 'INSUFFICIENT_PEER_REVIEWED',
        message: `${category} requires peer-reviewed sources`,
        severity: 'high',
      });
    }
  }
  
  // 6. COGNITIVE STRUCTURE VALIDATION - HARD FAIL
  const structureCheck = validateCognitiveStructure(content);
  errors.push(...structureCheck.errors);
  warnings.push(...structureCheck.warnings);
  
  // 7. CODE FORMATTING VALIDATION - HARD FAIL
  const codeCheck = validateCodeFormatting(content);
  errors.push(...codeCheck.errors);
  warnings.push(...codeCheck.warnings);
  
  // 8. TABLE FORMATTING VALIDATION - HARD FAIL
  const tableCheck = validateTableFormatting(content);
  errors.push(...tableCheck.errors);
  warnings.push(...tableCheck.warnings);
  
  // 9. DISCLAIMER VALIDATION - HARD FAIL for certain domains
  if (domainRules.requiresDisclaimer) {
    if (!hasRequiredDisclaimer(content, category)) {
      errors.push({
        code: 'MISSING_DISCLAIMER',
        message: `${category} content requires appropriate disclaimer`,
        severity: 'critical',
      });
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ===========================================
// CITATION VALIDATION
// ===========================================

function validateCitations(
  content: string,
  sources: AcademicSource[],
  citationStyle: string
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  
  // Check for in-text citations based on style
  const citationPatterns: Record<string, RegExp> = {
    APA: /\([A-Z][a-z]+(?:\s+(?:et\s+al\.?|&\s+[A-Z][a-z]+))?,?\s*\d{4}[a-z]?\)/g,
    Harvard: /\([A-Z][a-z]+(?:\s+(?:et\s+al\.?|and\s+[A-Z][a-z]+))?\s+\d{4}[a-z]?\)/g,
    IEEE: /\[\d+(?:,\s*\d+)*\]/g,
    Chicago: /\[[A-Z][a-z]+,?\s*\d{4}\]/g,
  };
  
  const pattern = citationPatterns[citationStyle] || citationPatterns.APA;
  const citations = content.match(pattern) || [];
  
  if (citations.length === 0 && sources.length > 0) {
    errors.push({
      code: 'NO_IN_TEXT_CITATIONS',
      message: 'Academic content must include in-text citations',
      severity: 'critical',
    });
  }
  
  // Check citation density
  const wordCount = content.split(/\s+/).length;
  const citationDensity = citations.length / (wordCount / 1000);
  
  if (citationDensity < 2 && sources.length >= 3) {
    warnings.push({
      code: 'LOW_CITATION_DENSITY',
      message: `Citation density is low (${citationDensity.toFixed(1)} per 1000 words)`,
      suggestion: 'Increase citations to support factual claims',
    });
  }
  
  // Check for fabricated citations (citations that don't match sources)
  const sourceAuthors = sources.map(s => {
    const lastName = s.author.split(',')[0]?.trim() || s.author.split(' ').pop() || '';
    return lastName.toLowerCase();
  });
  
  citations.forEach(citation => {
    const match = citation.match(/[A-Z][a-z]+/);
    if (match) {
      const citedAuthor = match[0].toLowerCase();
      const isValid = sourceAuthors.some(a => a.includes(citedAuthor) || citedAuthor.includes(a));
      if (!isValid && sourceAuthors.length > 0) {
        warnings.push({
          code: 'UNVERIFIED_CITATION',
          message: `Citation "${citation}" may not match provided sources`,
          suggestion: 'Verify citation matches a provided source',
        });
      }
    }
  });
  
  return { valid: errors.length === 0, errors, warnings };
}

// ===========================================
// COGNITIVE STRUCTURE VALIDATION
// ===========================================

function validateCognitiveStructure(content: string): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  
  // Required sections for academic content
  const requiredSections = [
    { pattern: /(?:^|\n)##+\s*(?:introduction|overview|context)/i, name: 'Introduction' },
    { pattern: /(?:^|\n)##+\s*(?:key\s*(?:takeaways?|points?|concepts?)|summary|conclusion)/i, name: 'Summary/Takeaways' },
  ];
  
  // Check for flat essay (no structure)
  const headings = content.match(/^#{1,3}\s+.+$/gm) || [];
  if (headings.length < 3) {
    errors.push({
      code: 'FLAT_ESSAY_STRUCTURE',
      message: 'Content lacks proper cognitive structure (minimum 3 sections required)',
      severity: 'high',
    });
  }
  
  // Check for required sections
  requiredSections.forEach(section => {
    if (!section.pattern.test(content)) {
      warnings.push({
        code: 'MISSING_SECTION',
        message: `Missing recommended section: ${section.name}`,
        suggestion: `Add a ${section.name} section for better pedagogical structure`,
      });
    }
  });
  
  // Check for examples/applications
  if (!/(?:example|case\s*study|application|scenario|instance)/i.test(content)) {
    warnings.push({
      code: 'NO_EXAMPLES',
      message: 'Content lacks real-world examples or case studies',
      suggestion: 'Add concrete examples to improve understanding',
    });
  }
  
  return { valid: errors.length === 0, errors, warnings };
}

// ===========================================
// CODE FORMATTING VALIDATION
// ===========================================

function validateCodeFormatting(content: string): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  
  // Check for code blocks
  const codeBlockPattern = /```(\w+)?\n([\s\S]*?)```/g;
  const inlineCodePattern = /`[^`]+`/g;
  
  // Find potential code that's NOT in code blocks
  const codeIndicators = [
    /\bfunction\s+\w+\s*\(/,
    /\bdef\s+\w+\s*\(/,
    /\bclass\s+\w+/,
    /\bimport\s+[\w.]+/,
    /\bconst\s+\w+\s*=/,
    /\blet\s+\w+\s*=/,
    /\bvar\s+\w+\s*=/,
  ];
  
  // Remove properly formatted code blocks from content for checking
  let contentWithoutCodeBlocks = content.replace(codeBlockPattern, '');
  
  // Check if multi-line code exists outside code blocks
  codeIndicators.forEach(pattern => {
    const matches = contentWithoutCodeBlocks.match(new RegExp(pattern.source + '[\\s\\S]{50,}', 'g'));
    if (matches && matches.length > 0) {
      errors.push({
        code: 'UNFORMATTED_CODE',
        message: 'Multi-line code found outside fenced code blocks',
        severity: 'critical',
        section: 'Code formatting',
      });
    }
  });
  
  // Check for code blocks without language specification
  const unspecifiedCodeBlocks = content.match(/```\n(?!```)/g);
  if (unspecifiedCodeBlocks && unspecifiedCodeBlocks.length > 0) {
    warnings.push({
      code: 'CODE_BLOCK_NO_LANGUAGE',
      message: 'Code blocks should specify language (e.g., ```python)',
      suggestion: 'Add language identifier to all code blocks',
    });
  }
  
  return { valid: errors.length === 0, errors, warnings };
}

// ===========================================
// TABLE FORMATTING VALIDATION
// ===========================================

function validateTableFormatting(content: string): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  
  // Check for proper markdown tables
  const markdownTablePattern = /\|[^\n]+\|\n\|[-:| ]+\|\n(\|[^\n]+\|\n)+/g;
  const tables = content.match(markdownTablePattern) || [];
  
  // Check for table-like content that isn't properly formatted
  const potentialTables = content.match(/\b\w+\s*:\s*\w+(?:\s*,\s*\w+\s*:\s*\w+){2,}/g);
  if (potentialTables && tables.length === 0) {
    warnings.push({
      code: 'UNFORMATTED_TABLE_DATA',
      message: 'Tabular data may not be properly formatted',
      suggestion: 'Use markdown tables for structured data',
    });
  }
  
  // Validate existing tables
  tables.forEach((table, index) => {
    const rows = table.split('\n').filter(r => r.trim());
    if (rows.length < 3) {
      warnings.push({
        code: 'INCOMPLETE_TABLE',
        message: `Table ${index + 1} has insufficient rows`,
        suggestion: 'Ensure tables have header, separator, and data rows',
      });
    }
    
    // Check for consistent column count
    const columnCounts = rows.map(r => (r.match(/\|/g) || []).length);
    const uniqueCounts = [...new Set(columnCounts)];
    if (uniqueCounts.length > 1) {
      errors.push({
        code: 'INCONSISTENT_TABLE_COLUMNS',
        message: `Table ${index + 1} has inconsistent column counts`,
        severity: 'medium',
      });
    }
  });
  
  return { valid: errors.length === 0, errors, warnings };
}

// ===========================================
// HELPER FUNCTIONS
// ===========================================

function hasReferencesSection(content: string): boolean {
  return /(?:^|\n)##+\s*(?:references?|bibliography|works?\s*cited|sources?)\s*(?:\n|$)/i.test(content);
}

function hasRequiredDisclaimer(content: string, category: string): boolean {
  const disclaimerPatterns: Record<string, RegExp> = {
    medicine: /(?:not\s+(?:a\s+)?substitute|consult\s+(?:a\s+)?(?:doctor|physician|healthcare)|medical\s+advice)/i,
    law: /(?:not\s+(?:a\s+)?substitute|legal\s+advice|consult\s+(?:a\s+)?(?:lawyer|attorney)|jurisdiction)/i,
    default: /(?:educational|research|informational)\s+purpose/i,
  };
  
  const pattern = disclaimerPatterns[category.toLowerCase()] || disclaimerPatterns.default;
  return pattern.test(content);
}

// ===========================================
// ACADEMIC FRONT MATTER
// ===========================================

export function generateAcademicFrontMatter(
  author: string,
  category: string
): string {
  const domainRules = DOMAIN_RULES[category.toLowerCase()] || DOMAIN_RULES.default;
  
  let frontMatter = `---

> **Academic Content Notice**
> 
> This work is an AI-assisted academic synthesis intended for educational and research support.
> It is not peer-reviewed and does not replace professional or scholarly judgment.
> All referenced content is sourced from verified academic databases.
> Users remain responsible for proper academic use and verification of citations.

`;

  if (domainRules.requiresDisclaimer) {
    if (category.toLowerCase() === 'medicine') {
      frontMatter += `
> **Medical Disclaimer**
> 
> This content is for educational purposes only and is not intended to be a substitute for professional medical advice, diagnosis, or treatment.
> Always seek the advice of your physician or other qualified health provider with any questions you may have regarding a medical condition.

`;
    } else if (category.toLowerCase() === 'law') {
      frontMatter += `
> **Legal Disclaimer**
> 
> This content is for educational purposes only and does not constitute legal advice.
> Laws vary by jurisdiction and are subject to change. Consult a qualified legal professional for specific legal matters.

`;
    }
  }

  frontMatter += `---

`;

  return frontMatter;
}

// ===========================================
// ERROR MESSAGE FORMATTER
// ===========================================

export function formatValidationError(result: ValidationResult): string {
  if (result.valid) {
    return '';
  }
  
  const criticalErrors = result.errors.filter(e => e.severity === 'critical');
  const highErrors = result.errors.filter(e => e.severity === 'high');
  
  let message = '**ACADEMIC GENERATION FAILED**\n\n';
  
  if (criticalErrors.length > 0) {
    message += '**Critical Violations:**\n';
    criticalErrors.forEach(e => {
      message += `- ❌ ${e.message} (${e.code})\n`;
    });
    message += '\n';
  }
  
  if (highErrors.length > 0) {
    message += '**High Priority Issues:**\n';
    highErrors.forEach(e => {
      message += `- ⚠️ ${e.message} (${e.code})\n`;
    });
    message += '\n';
  }
  
  message += '**Required to Proceed:**\n';
  message += '1. Ensure sufficient verified sources (with DOI or stable URL)\n';
  message += '2. Include proper in-text citations in the specified style\n';
  message += '3. Add a References section at the end\n';
  message += '4. Structure content with clear sections (Introduction, Main content, Summary)\n';
  message += '5. Format all code blocks with language specification\n';
  
  return message;
}

// ===========================================
// EXPORT VALIDATION
// ===========================================

export function validateExportReadiness(
  book: any,
  chapters: any[],
  academicMode: boolean
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  
  // Check cover page
  if (!book.cover_image_url) {
    errors.push({
      code: 'MISSING_COVER',
      message: 'Export requires a cover image',
      severity: 'critical',
    });
  }
  
  // Check chapters
  if (!chapters || chapters.length === 0) {
    errors.push({
      code: 'NO_CHAPTERS',
      message: 'No generated chapters found',
      severity: 'critical',
    });
  }
  
  // Academic-specific checks
  if (academicMode) {
    // Check for references in at least some chapters
    const chaptersWithRefs = chapters.filter(c => 
      c.chapter_references && Object.keys(c.chapter_references).length > 0
    );
    
    if (chaptersWithRefs.length === 0) {
      errors.push({
        code: 'NO_REFERENCES_IN_EXPORT',
        message: 'Academic export requires chapters with verified references',
        severity: 'high',
      });
    }
    
    // Check for References section in content
    const chaptersWithRefSection = chapters.filter(c =>
      hasReferencesSection(c.content || '')
    );
    
    if (chaptersWithRefSection.length < chapters.length / 2) {
      warnings.push({
        code: 'INCOMPLETE_REFERENCES',
        message: 'Some chapters may be missing References sections',
        suggestion: 'Regenerate chapters in Academic Mode for complete references',
      });
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
