// ===========================================
// SCROLLLIBRARY AUTHORITY-GRADE MASTER VALIDATOR
// Non-Negotiable Quality & Compliance Contract
// ===========================================

// ============================================
// TYPES & INTERFACES
// ============================================

export interface ValidationResult {
  valid: boolean;
  blocked: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  failureMessage?: string;
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

export interface ComicPanel {
  panelNumber: number;
  visual: string;
  dialogue: DialogueLine[];
  caption?: string;
  action?: string;
  emotion?: string;
}

export interface DialogueLine {
  character: string;
  speech: string;
  bubbleType: 'speech' | 'thought' | 'shout' | 'whisper';
}

export interface WorkbookSection {
  type: 'purpose' | 'concepts' | 'prompts' | 'tables' | 'reflection' | 'action';
  wordCount: number;
  content: string;
}

// ============================================
// GLOBAL FORBIDDEN PATTERNS
// ============================================

const FORBIDDEN_PATTERNS = {
  longParagraphs: /(?:^|\n)[^\n]{600,}(?:\n|$)/g, // 120+ words = ~600 chars
  unstructuredProse: /^[^#\n]{2000,}/m, // 2000+ chars without heading
  aiFillerPhrases: [
    /it's\s+important\s+to\s+note\s+that/gi,
    /in\s+conclusion,?\s+we\s+can\s+see/gi,
    /let's\s+dive\s+(?:deep\s+)?into/gi,
    /in\s+today's\s+(?:fast-paced|modern|digital)/gi,
    /now\s+more\s+than\s+ever/gi,
    /it\s+goes\s+without\s+saying/gi,
  ],
  exaggeratedClaims: [
    /revolutionary\s+breakthrough/gi,
    /game-?changing/gi,
    /completely\s+transforms/gi,
    /never\s+(?:been\s+)?seen\s+before/gi,
  ],
};

// ============================================
// DOMAIN-SPECIFIC RULES
// ============================================

export const DOMAIN_RULES: Record<string, {
  requiresPeerReview: boolean;
  requiresDisclaimer: boolean;
  minSources: number;
  specialRequirements: string[];
  enforcementLevel: 'strict' | 'standard' | 'flexible';
}> = {
  medicine: {
    requiresPeerReview: true,
    requiresDisclaimer: true,
    minSources: 5,
    specialRequirements: ['evidence_hierarchy', 'medical_disclaimer', 'clinical_accuracy'],
    enforcementLevel: 'strict',
  },
  law: {
    requiresPeerReview: false,
    requiresDisclaimer: true,
    minSources: 3,
    specialRequirements: ['legal_disclaimer', 'jurisdictional_note'],
    enforcementLevel: 'strict',
  },
  science: {
    requiresPeerReview: true,
    requiresDisclaimer: false,
    minSources: 5,
    specialRequirements: ['reproducibility_statement', 'methodology_citation'],
    enforcementLevel: 'strict',
  },
  technology: {
    requiresPeerReview: false,
    requiresDisclaimer: false,
    minSources: 3,
    specialRequirements: ['code_formatting', 'version_info', 'runnable_examples'],
    enforcementLevel: 'standard',
  },
  business: {
    requiresPeerReview: false,
    requiresDisclaimer: false,
    minSources: 3,
    specialRequirements: ['framework_citations', 'case_studies', 'tables'],
    enforcementLevel: 'standard',
  },
  history: {
    requiresPeerReview: false,
    requiresDisclaimer: false,
    minSources: 5,
    specialRequirements: ['primary_sources', 'chronological_accuracy'],
    enforcementLevel: 'standard',
  },
  philosophy: {
    requiresPeerReview: false,
    requiresDisclaimer: false,
    minSources: 4,
    specialRequirements: ['argumentation_structure', 'multiple_perspectives'],
    enforcementLevel: 'standard',
  },
  humanities: {
    requiresPeerReview: false,
    requiresDisclaimer: false,
    minSources: 4,
    specialRequirements: ['argumentation_structure', 'citation_density'],
    enforcementLevel: 'standard',
  },
  default: {
    requiresPeerReview: false,
    requiresDisclaimer: false,
    minSources: 3,
    specialRequirements: [],
    enforcementLevel: 'flexible',
  },
};

// ============================================
// CITATION PATTERNS BY STYLE
// ============================================

export const CITATION_PATTERNS: Record<string, RegExp> = {
  APA: /\([A-Z][a-z]+(?:\s+(?:et\s+al\.?|&\s+[A-Z][a-z]+))?,?\s*\d{4}[a-z]?\)/g,
  Harvard: /\([A-Z][a-z]+(?:\s+(?:et\s+al\.?|and\s+[A-Z][a-z]+))?\s+\d{4}[a-z]?\)/g,
  IEEE: /\[\d+(?:,\s*\d+)*\]/g,
  Chicago: /\[[A-Z][a-z]+,?\s*\d{4}\]/g,
};

// ============================================
// GLOBAL QUALITY VALIDATION
// ============================================

export function validateGlobalQuality(content: string): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Check for long paragraphs (>120 words)
  const paragraphs = content.split(/\n\n+/);
  paragraphs.forEach((p, i) => {
    const wordCount = p.split(/\s+/).length;
    if (wordCount > 120 && !p.startsWith('```')) {
      warnings.push({
        code: 'LONG_PARAGRAPH',
        message: `Paragraph ${i + 1} exceeds 120 words (${wordCount} words)`,
        suggestion: 'Break into smaller, focused paragraphs',
      });
    }
  });

  // Check for AI filler phrases
  FORBIDDEN_PATTERNS.aiFillerPhrases.forEach(pattern => {
    if (pattern.test(content)) {
      warnings.push({
        code: 'AI_FILLER_DETECTED',
        message: 'Content contains AI filler phrases',
        suggestion: 'Remove generic phrases; be direct and specific',
      });
    }
  });

  // Check for exaggerated claims
  FORBIDDEN_PATTERNS.exaggeratedClaims.forEach(pattern => {
    if (pattern.test(content)) {
      warnings.push({
        code: 'EXAGGERATED_CLAIM',
        message: 'Content contains potentially exaggerated claims',
        suggestion: 'Use measured, evidence-based language',
      });
    }
  });

  // Check for proper section structure
  const headings = content.match(/^#{1,3}\s+.+$/gm) || [];
  if (headings.length < 3) {
    errors.push({
      code: 'INSUFFICIENT_STRUCTURE',
      message: 'Content lacks proper sectioning (minimum 3 headings required)',
      severity: 'high',
    });
  }

  return {
    valid: errors.filter(e => e.severity === 'critical').length === 0,
    blocked: false,
    errors,
    warnings,
  };
}

// ============================================
// ACADEMIC MODE VALIDATION - HARD FAIL
// ============================================

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

export function validateAcademicContent(
  content: string,
  sources: AcademicSource[],
  category: string,
  citationStyle: string
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];
  const domainRules = DOMAIN_RULES[category.toLowerCase()] || DOMAIN_RULES.default;

  // ========================================
  // HARD FAIL CONDITIONS
  // ========================================

  // 1. INSUFFICIENT SOURCES - HARD FAIL
  if (sources.length < domainRules.minSources) {
    errors.push({
      code: 'INSUFFICIENT_SOURCES',
      message: `${category} requires minimum ${domainRules.minSources} verified sources, found ${sources.length}`,
      severity: 'critical',
    });
  }

  // 2. NO IN-TEXT CITATIONS - HARD FAIL
  const pattern = CITATION_PATTERNS[citationStyle] || CITATION_PATTERNS.APA;
  const citations = content.match(pattern) || [];
  
  if (citations.length === 0 && sources.length > 0) {
    errors.push({
      code: 'NO_IN_TEXT_CITATIONS',
      message: 'Academic content MUST include in-text citations for all factual claims',
      severity: 'critical',
    });
  }

  // 3. NO REFERENCES SECTION - HARD FAIL
  if (!/(?:^|\n)##+\s*(?:references?|bibliography|works?\s*cited|sources?)\s*(?:\n|$)/i.test(content)) {
    errors.push({
      code: 'MISSING_REFERENCES_SECTION',
      message: 'Academic content MUST include a References section',
      severity: 'critical',
    });
  }

  // 4. UNVERIFIABLE SOURCES - HARD FAIL (if >50% lack DOI/URL)
  const verifiedSources = sources.filter(s => s.doi || s.url);
  if (sources.length > 0 && verifiedSources.length / sources.length < 0.5) {
    errors.push({
      code: 'UNVERIFIABLE_SOURCES',
      message: `${Math.round((1 - verifiedSources.length / sources.length) * 100)}% of sources lack DOI or stable URL`,
      severity: 'critical',
    });
  }

  // 5. PEER REVIEW REQUIREMENT - HARD FAIL for strict domains
  if (domainRules.requiresPeerReview) {
    const peerReviewedCount = sources.filter(s => s.peerReviewed).length;
    if (peerReviewedCount < Math.ceil(domainRules.minSources / 2)) {
      errors.push({
        code: 'INSUFFICIENT_PEER_REVIEWED',
        message: `${category} requires at least ${Math.ceil(domainRules.minSources / 2)} peer-reviewed sources`,
        severity: 'critical',
      });
    }
  }

  // 6. MISSING DISCLAIMER - HARD FAIL for medicine/law
  if (domainRules.requiresDisclaimer && !hasRequiredDisclaimer(content, category)) {
    errors.push({
      code: 'MISSING_DISCLAIMER',
      message: `${category} content REQUIRES appropriate professional disclaimer`,
      severity: 'critical',
    });
  }

  // ========================================
  // QUALITY WARNINGS
  // ========================================

  // Citation density check
  const wordCount = content.split(/\s+/).length;
  const citationDensity = citations.length / (wordCount / 1000);
  if (citationDensity < 3 && sources.length >= 3) {
    warnings.push({
      code: 'LOW_CITATION_DENSITY',
      message: `Citation density is low (${citationDensity.toFixed(1)} per 1000 words)`,
      suggestion: 'Increase citations to support factual claims (aim for 5+ per 1000 words)',
    });
  }

  // Cognitive structure check
  const requiredSections = [
    { pattern: /(?:^|\n)##+\s*(?:introduction|overview|context)/i, name: 'Introduction' },
    { pattern: /(?:^|\n)##+\s*(?:key\s*(?:takeaways?|points?|concepts?)|summary|conclusion)/i, name: 'Summary/Conclusion' },
  ];

  requiredSections.forEach(section => {
    if (!section.pattern.test(content)) {
      warnings.push({
        code: 'MISSING_SECTION',
        message: `Missing recommended section: ${section.name}`,
        suggestion: `Add a ${section.name} section for proper cognitive structure`,
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

  const hasCriticalError = errors.some(e => e.severity === 'critical');
  
  return {
    valid: !hasCriticalError,
    blocked: hasCriticalError,
    errors,
    warnings,
    failureMessage: hasCriticalError ? formatAcademicFailure(errors, category) : undefined,
  };
}

function hasRequiredDisclaimer(content: string, category: string): boolean {
  const disclaimerPatterns: Record<string, RegExp> = {
    medicine: /(?:not\s+(?:a\s+)?substitute|consult\s+(?:a\s+)?(?:doctor|physician|healthcare)|medical\s+advice|educational\s+purpose)/i,
    law: /(?:not\s+(?:a\s+)?substitute|legal\s+advice|consult\s+(?:a\s+)?(?:lawyer|attorney)|jurisdiction|does\s+not\s+constitute)/i,
    default: /(?:educational|research|informational)\s+purpose/i,
  };
  
  const pattern = disclaimerPatterns[category.toLowerCase()] || disclaimerPatterns.default;
  return pattern.test(content);
}

function formatAcademicFailure(errors: ValidationError[], category: string): string {
  let message = `❌ **ACADEMIC GENERATION BLOCKED — QUALITY VIOLATION**\n\n`;
  message += `**Category:** ${category}\n\n`;
  message += `**Violations:**\n`;
  
  errors.filter(e => e.severity === 'critical').forEach(e => {
    message += `- ${e.message} (${e.code})\n`;
  });
  
  message += `\n**To proceed:**\n`;
  message += `1. Try a more specific topic with available academic literature\n`;
  message += `2. Ensure the topic has peer-reviewed sources in academic databases\n`;
  message += `3. Consider refining your search terms for better source coverage\n`;
  
  return message;
}

// ============================================
// CODE FORMATTING VALIDATION - HARD FAIL
// ============================================

export function validateCodeFormatting(content: string): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Check for code blocks
  const codeBlockPattern = /```(\w+)?\n([\s\S]*?)```/g;
  const codeBlocks = [...content.matchAll(codeBlockPattern)];

  // Check for potential code outside code blocks
  const codeIndicators = [
    /\bfunction\s+\w+\s*\([^)]*\)\s*\{/,
    /\bdef\s+\w+\s*\([^)]*\):/,
    /\bclass\s+\w+[:\s{]/,
    /\bimport\s+[\w.{}\s,]+\s+from/,
    /\bconst\s+\w+\s*=\s*(?:\(|function|async|\{|\[)/,
    /\blet\s+\w+\s*=\s*(?:\(|function|async|\{|\[)/,
  ];

  // Remove code blocks from content for checking
  let contentWithoutCodeBlocks = content;
  codeBlocks.forEach(block => {
    contentWithoutCodeBlocks = contentWithoutCodeBlocks.replace(block[0], '');
  });

  // Check for multi-line code outside code blocks
  codeIndicators.forEach(pattern => {
    const lineMatches = contentWithoutCodeBlocks.split('\n');
    lineMatches.forEach((line, i) => {
      if (pattern.test(line) && line.length > 50) {
        errors.push({
          code: 'UNFORMATTED_CODE',
          message: `Multi-line code found outside fenced code blocks (line ~${i + 1})`,
          severity: 'critical',
          section: 'Code formatting',
        });
      }
    });
  });

  // Check for code blocks without language specification
  const unspecifiedBlocks = content.match(/```\n(?!```)/g);
  if (unspecifiedBlocks && unspecifiedBlocks.length > 0) {
    errors.push({
      code: 'CODE_BLOCK_NO_LANGUAGE',
      message: `${unspecifiedBlocks.length} code block(s) missing language specification`,
      severity: 'high',
    });
  }

  // Check for proper indentation in code blocks
  codeBlocks.forEach((block, i) => {
    const code = block[2];
    const lines = code.split('\n');
    const hasIndentation = lines.some(l => l.startsWith('  ') || l.startsWith('\t'));
    const isMultiLine = lines.length > 3;
    
    if (isMultiLine && !hasIndentation) {
      warnings.push({
        code: 'FLAT_CODE_BLOCK',
        message: `Code block ${i + 1} may have flattened indentation`,
        suggestion: 'Ensure proper indentation is preserved',
      });
    }
  });

  const hasCriticalError = errors.some(e => e.severity === 'critical');

  return {
    valid: !hasCriticalError,
    blocked: hasCriticalError,
    errors,
    warnings,
    failureMessage: hasCriticalError ? 
      '❌ **CODE FORMATTING VIOLATION**: All code must be in fenced code blocks with language specification.' : undefined,
  };
}

// ============================================
// TABLE FORMATTING VALIDATION - HARD FAIL
// ============================================

export function validateTableFormatting(content: string): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Check for proper markdown tables
  const markdownTablePattern = /\|[^\n]+\|\n\|[-:| ]+\|\n(\|[^\n]+\|\n)+/g;
  const tables = content.match(markdownTablePattern) || [];

  // Check for table-like content that isn't properly formatted
  const inlineTablePatterns = [
    /\b\w+\s*:\s*\w+(?:\s*,\s*\w+\s*:\s*\w+){3,}/g, // key: value, key: value...
    /(?:\w+\s+){3,}\n(?:\w+\s+){3,}\n(?:\w+\s+){3,}/g, // Columnar text
  ];

  inlineTablePatterns.forEach(pattern => {
    if (pattern.test(content) && tables.length === 0) {
      warnings.push({
        code: 'UNFORMATTED_TABLE_DATA',
        message: 'Potential tabular data not formatted as markdown table',
        suggestion: 'Use proper markdown tables with headers and separators',
      });
    }
  });

  // Validate existing tables
  tables.forEach((table, index) => {
    const rows = table.split('\n').filter(r => r.trim());
    
    // Check for consistent column count
    const columnCounts = rows.map(r => (r.match(/\|/g) || []).length);
    const uniqueCounts = [...new Set(columnCounts)];
    
    if (uniqueCounts.length > 1) {
      errors.push({
        code: 'INCONSISTENT_TABLE_COLUMNS',
        message: `Table ${index + 1} has inconsistent column counts`,
        severity: 'high',
      });
    }

    // Check for empty cells
    if (table.includes('| |') || table.includes('||')) {
      warnings.push({
        code: 'EMPTY_TABLE_CELLS',
        message: `Table ${index + 1} has empty cells`,
        suggestion: 'Fill all table cells or use "-" for empty values',
      });
    }
  });

  return {
    valid: errors.filter(e => e.severity === 'critical').length === 0,
    blocked: false,
    errors,
    warnings,
  };
}

// ============================================
// COMIC/ILLUSTRATED BOOK VALIDATION - HARD FAIL
// ============================================

export interface ComicValidationOptions {
  minPanelsPerPage: number;
  maxPanelsPerPage: number;
  requireDialogue: boolean;
  requireVisualConsistency: boolean;
}

const DEFAULT_COMIC_OPTIONS: ComicValidationOptions = {
  minPanelsPerPage: 3,
  maxPanelsPerPage: 6,
  requireDialogue: true,
  requireVisualConsistency: true,
};

export function validateComicStructure(
  content: string,
  options: Partial<ComicValidationOptions> = {}
): ValidationResult {
  const opts = { ...DEFAULT_COMIC_OPTIONS, ...options };
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  // Parse panels from content
  const panelRegex = /\[PANEL\s*(\d+)\]/gi;
  const panels = content.match(panelRegex) || [];

  // HARD FAIL: No panels detected
  if (panels.length === 0) {
    errors.push({
      code: 'NO_PANELS_DETECTED',
      message: 'Comic content must have structured panels [PANEL X]',
      severity: 'critical',
    });
    return {
      valid: false,
      blocked: true,
      errors,
      warnings,
      failureMessage: '❌ **COMIC STRUCTURE VIOLATION**: Content must be organized into numbered panels.',
    };
  }

  // Check panel count
  if (panels.length < opts.minPanelsPerPage) {
    errors.push({
      code: 'INSUFFICIENT_PANELS',
      message: `Comic requires minimum ${opts.minPanelsPerPage} panels, found ${panels.length}`,
      severity: 'high',
    });
  }

  // Check for dialogue in panels
  if (opts.requireDialogue) {
    const dialoguePatterns = [
      /\*\*Dialogue:\*\*/gi,
      /\*\*Speech:\*\*/gi,
      /-\s*[A-Z][A-Za-z]+:\s*"/g,
    ];
    
    const hasDialogue = dialoguePatterns.some(p => p.test(content));
    
    if (!hasDialogue) {
      errors.push({
        code: 'NO_DIALOGUE',
        message: 'Comic panels MUST include character dialogue (speech bubbles)',
        severity: 'critical',
      });
    }
  }

  // Check for visual descriptions
  const visualPattern = /\*\*Visual:\*\*/gi;
  const visualDescriptions = content.match(visualPattern) || [];
  
  if (visualDescriptions.length < panels.length * 0.8) {
    warnings.push({
      code: 'INCOMPLETE_VISUAL_DESCRIPTIONS',
      message: 'Some panels may lack detailed visual descriptions',
      suggestion: 'Each panel should have a **Visual:** section for AI image generation',
    });
  }

  // Check for story progression
  const storyElements = [
    /conflict|challenge|problem/i,
    /resolution|solution|overcome/i,
    /character|hero|protagonist/i,
  ];
  
  const hasStoryArc = storyElements.filter(p => p.test(content)).length >= 2;
  if (!hasStoryArc) {
    warnings.push({
      code: 'WEAK_STORY_ARC',
      message: 'Comic may lack clear story progression',
      suggestion: 'Include beginning, conflict, and resolution in the narrative',
    });
  }

  const hasCriticalError = errors.some(e => e.severity === 'critical');

  return {
    valid: !hasCriticalError,
    blocked: hasCriticalError,
    errors,
    warnings,
    failureMessage: hasCriticalError ? 
      '❌ **COMIC GENERATION BLOCKED**: Panels must include visual descriptions AND character dialogue.' : undefined,
  };
}

// ============================================
// WORKBOOK MODE VALIDATION - HARD FAIL
// ============================================

export interface WorkbookValidationOptions {
  maxWordsPerChapter: number;
  maxExplanationRatio: number; // Max % of content that can be explanation
  requiredSections: string[];
}

const DEFAULT_WORKBOOK_OPTIONS: WorkbookValidationOptions = {
  maxWordsPerChapter: 1800,
  maxExplanationRatio: 0.30, // 30% max explanation
  requiredSections: ['purpose', 'concepts', 'prompts', 'reflection', 'action'],
};

export function validateWorkbookStructure(
  content: string,
  options: Partial<WorkbookValidationOptions> = {}
): ValidationResult {
  const opts = { ...DEFAULT_WORKBOOK_OPTIONS, ...options };
  const errors: ValidationError[] = [];
  const warnings: ValidationWarning[] = [];

  const wordCount = content.split(/\s+/).filter(w => w.length > 0).length;

  // Check word count limit
  if (wordCount > opts.maxWordsPerChapter) {
    errors.push({
      code: 'WORKBOOK_TOO_LONG',
      message: `Workbook chapter exceeds ${opts.maxWordsPerChapter} words (${wordCount} words)`,
      severity: 'high',
    });
  }

  // Check for required sections
  const sectionPatterns: Record<string, RegExp> = {
    purpose: /(?:^|\n)##+\s*(?:purpose|objective|goal|aim)/i,
    concepts: /(?:^|\n)##+\s*(?:key\s*concepts?|core\s*ideas?|fundamentals?)/i,
    prompts: /(?:^|\n)##+\s*(?:prompts?|exercises?|fill[- ]in|activities?|your\s*turn)/i,
    reflection: /(?:^|\n)##+\s*(?:reflect(?:ion)?|think\s*about|consider)/i,
    action: /(?:^|\n)##+\s*(?:action\s*(?:steps?|items?)|next\s*steps?|to[- ]do|tasks?)/i,
  };

  opts.requiredSections.forEach(section => {
    const pattern = sectionPatterns[section];
    if (pattern && !pattern.test(content)) {
      errors.push({
        code: `MISSING_${section.toUpperCase()}_SECTION`,
        message: `Workbook requires a ${section} section`,
        severity: 'high',
      });
    }
  });

  // Check for fill-in prompts (interactive elements)
  const interactivePatterns = [
    /_{3,}/g, // Underscores for fill-in
    /\[your\s+(?:answer|response|notes?)\]/gi,
    /\[ {3,}\]/g, // Empty brackets
    /☐|☑|□|▢/g, // Checkbox characters
    /\[\s*\]/g, // Empty checkboxes
  ];

  const hasInteractiveElements = interactivePatterns.some(p => p.test(content));
  if (!hasInteractiveElements) {
    errors.push({
      code: 'NO_INTERACTIVE_ELEMENTS',
      message: 'Workbook must include fill-in prompts or interactive elements',
      severity: 'high',
    });
  }

  // Check explanation ratio
  const explanatoryPatterns = [
    /^(?!#|[-*]|\d+\.|_|\[|\|).{50,}$/gm, // Long lines without formatting
  ];
  
  const explanatoryMatches = content.match(explanatoryPatterns[0]) || [];
  const explanatoryWordCount = explanatoryMatches.join(' ').split(/\s+/).length;
  const explanationRatio = explanatoryWordCount / wordCount;

  if (explanationRatio > opts.maxExplanationRatio) {
    warnings.push({
      code: 'EXCESSIVE_EXPLANATION',
      message: `Explanation content is ${Math.round(explanationRatio * 100)}% (max ${opts.maxExplanationRatio * 100}%)`,
      suggestion: 'Reduce prose; increase interactive prompts and exercises',
    });
  }

  const hasCriticalError = errors.some(e => e.severity === 'critical');

  return {
    valid: !hasCriticalError && errors.length === 0,
    blocked: hasCriticalError,
    errors,
    warnings,
    failureMessage: errors.length > 0 ? 
      '❌ **WORKBOOK STRUCTURE VIOLATION**: Workbooks must be interactive with fill-in prompts, not prose-heavy.' : undefined,
  };
}

// ============================================
// OUTPUT QUALITY GATE - FINAL CHECK
// ============================================

export interface QualityGateOptions {
  bookType: 'text' | 'illustrated' | 'comic' | 'workbook';
  academicMode: boolean;
  category: string;
  citationStyle?: string;
  sources?: AcademicSource[];
  isAdmin?: boolean;
}

export function runQualityGate(
  content: string,
  options: QualityGateOptions
): ValidationResult {
  // Admin bypass
  if (options.isAdmin) {
    return {
      valid: true,
      blocked: false,
      errors: [],
      warnings: [],
    };
  }

  const allErrors: ValidationError[] = [];
  const allWarnings: ValidationWarning[] = [];

  // 1. Global quality check
  const globalResult = validateGlobalQuality(content);
  allErrors.push(...globalResult.errors);
  allWarnings.push(...globalResult.warnings);

  // 2. Code formatting check (for all types)
  const codeResult = validateCodeFormatting(content);
  allErrors.push(...codeResult.errors);
  allWarnings.push(...codeResult.warnings);

  // 3. Table formatting check (for all types)
  const tableResult = validateTableFormatting(content);
  allErrors.push(...tableResult.errors);
  allWarnings.push(...tableResult.warnings);

  // 4. Type-specific validation
  if (options.academicMode && options.sources) {
    const academicResult = validateAcademicContent(
      content,
      options.sources,
      options.category,
      options.citationStyle || 'APA'
    );
    allErrors.push(...academicResult.errors);
    allWarnings.push(...academicResult.warnings);
    
    if (academicResult.blocked) {
      return academicResult;
    }
  }

  if (options.bookType === 'comic') {
    const comicResult = validateComicStructure(content);
    allErrors.push(...comicResult.errors);
    allWarnings.push(...comicResult.warnings);
    
    if (comicResult.blocked) {
      return comicResult;
    }
  }

  if (options.bookType === 'workbook') {
    const workbookResult = validateWorkbookStructure(content);
    allErrors.push(...workbookResult.errors);
    allWarnings.push(...workbookResult.warnings);
  }

  // Check if any critical errors block generation
  const hasCriticalError = allErrors.some(e => e.severity === 'critical');
  const hasHighErrors = allErrors.filter(e => e.severity === 'high').length >= 3;

  if (hasCriticalError || hasHighErrors) {
    return {
      valid: false,
      blocked: true,
      errors: allErrors,
      warnings: allWarnings,
      failureMessage: formatQualityGateFailure(allErrors),
    };
  }

  return {
    valid: true,
    blocked: false,
    errors: allErrors,
    warnings: allWarnings,
  };
}

function formatQualityGateFailure(errors: ValidationError[]): string {
  let message = `❌ **GENERATION BLOCKED — QUALITY VIOLATION**\n\n`;
  message += `The output does not meet publication standards.\n\n`;
  
  const critical = errors.filter(e => e.severity === 'critical');
  const high = errors.filter(e => e.severity === 'high');
  
  if (critical.length > 0) {
    message += `**Critical Issues:**\n`;
    critical.forEach(e => {
      message += `- ${e.message}\n`;
    });
    message += '\n';
  }
  
  if (high.length > 0) {
    message += `**High Priority Issues:**\n`;
    high.forEach(e => {
      message += `- ${e.message}\n`;
    });
  }
  
  message += `\n**Standard:** Output must be acceptable to university lecturers, graduate students, and professional readers.`;
  
  return message;
}

// ============================================
// FRONT MATTER GENERATORS
// ============================================

export function generateAcademicFrontMatter(category: string): string {
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
> Always seek the advice of your physician or other qualified health provider with any questions regarding a medical condition.

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

export function generateWorkbookFrontMatter(): string {
  return `---

> **Interactive Workbook**
> 
> This workbook is designed for active learning. Complete all prompts, exercises, and reflection questions.
> Use the blank spaces provided for your responses.
> Return to this workbook regularly to track your progress.

---

`;
}
