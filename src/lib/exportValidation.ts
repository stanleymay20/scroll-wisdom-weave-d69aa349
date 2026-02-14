/**
 * PRE-EXPORT CONTENT VALIDATION
 * 
 * Scans book chapters for unsupported constructs before calling the export function.
 * Returns actionable errors so the user can fix issues before exporting.
 */

export type ExportIssueLevel = 'error' | 'warning' | 'info';

export interface ExportIssue {
  level: ExportIssueLevel;
  code: string;
  message: string;
  chapterNumber?: number;
  details?: string;
}

export interface ExportValidationResult {
  valid: boolean;
  issues: ExportIssue[];
  canProceed: boolean; // true if only warnings/info (no blocking errors)
}

/**
 * Validates all chapter content for export readiness.
 * Checks for:
 * - Unclosed code fences
 * - Malformed tables
 * - Unsupported image formats (webp, svg, gif for DOCX)
 * - Missing images in comics
 * - Broken markdown image syntax
 * - Unsanitized Unicode that may cause PDF crashes
 */
export function validateContentForExport(
  chapters: { chapter_number: number; content: string | null }[],
  bookType: string,
  format: 'pdf' | 'epub' | 'docx'
): ExportValidationResult {
  const issues: ExportIssue[] = [];

  for (const chapter of chapters) {
    const content = chapter.content || '';
    const chapterNum = chapter.chapter_number;

    // 1. Unclosed code fences
    const codeFenceCount = (content.match(/```/g) || []).length;
    if (codeFenceCount % 2 !== 0) {
      issues.push({
        level: 'error',
        code: 'UNCLOSED_CODE_FENCE',
        message: `Chapter ${chapterNum} has an unclosed code block`,
        chapterNumber: chapterNum,
        details: 'Ensure all ``` code fences are properly closed.',
      });
    }

    // 2. Unclosed structured code blocks
    const openBlocks = (content.match(/\[CODE_BLOCK\]/g) || []).length;
    const closeBlocks = (content.match(/\[\/CODE_BLOCK\]/g) || []).length;
    if (openBlocks !== closeBlocks) {
      issues.push({
        level: 'error',
        code: 'UNCLOSED_STRUCTURED_BLOCK',
        message: `Chapter ${chapterNum} has mismatched [CODE_BLOCK] tags`,
        chapterNumber: chapterNum,
        details: `Found ${openBlocks} opening and ${closeBlocks} closing tags.`,
      });
    }

    // 3. Broken image markdown (![...]( without closing paren)
    const brokenImages = content.match(/!\[[^\]]*\]\([^)]*$/gm) || [];
    if (brokenImages.length > 0) {
      issues.push({
        level: 'error',
        code: 'BROKEN_IMAGE_SYNTAX',
        message: `Chapter ${chapterNum} has broken image markdown`,
        chapterNumber: chapterNum,
        details: 'Check for missing closing parenthesis in image URLs.',
      });
    }

    // 4. Unsupported image formats for DOCX
    if (format === 'docx') {
      const webpImages = content.match(/!\[[^\]]*\]\([^)]*\.webp[^)]*\)/gi) || [];
      const svgImages = content.match(/!\[[^\]]*\]\([^)]*\.svg[^)]*\)/gi) || [];
      const gifImages = content.match(/!\[[^\]]*\]\([^)]*\.gif[^)]*\)/gi) || [];
      
      const unsupportedCount = webpImages.length + svgImages.length + gifImages.length;
      if (unsupportedCount > 0) {
        issues.push({
          level: 'warning',
          code: 'UNSUPPORTED_IMAGE_FORMAT_DOCX',
          message: `Chapter ${chapterNum} contains ${unsupportedCount} image(s) that may not render in Word`,
          chapterNumber: chapterNum,
          details: 'WebP, SVG, and GIF images may appear as placeholders in DOCX exports.',
        });
      }
    }

    // 5. Problematic Unicode characters for PDF
    if (format === 'pdf') {
      const problematicChars = content.match(/[→←↔⇒⇐⇔↑↓∞∑∏√∫∂∆∇αβγδεθλμσφωΩπ]/g) || [];
      if (problematicChars.length > 10) {
        issues.push({
          level: 'info',
          code: 'UNICODE_CHARS_PDF',
          message: `Chapter ${chapterNum} contains special Unicode characters`,
          chapterNumber: chapterNum,
          details: 'These will be converted to ASCII equivalents in the PDF.',
        });
      }
    }

    // 6. Malformed markdown tables (header row without separator)
    const tableHeaderPattern = /\|[^|]+\|[^|]+\|\s*\n(?!\|[-:| ]+\|)/g;
    const malformedTables = content.match(tableHeaderPattern) || [];
    if (malformedTables.length > 0) {
      issues.push({
        level: 'warning',
        code: 'MALFORMED_TABLE',
        message: `Chapter ${chapterNum} may have malformed table(s)`,
        chapterNumber: chapterNum,
        details: 'Tables should have a separator row (|---|) after the header.',
      });
    }

    // 7. Comic-specific: panels without images
    if (bookType === 'comic') {
      const panelCount = (content.match(/\[PANEL|\bPanel\s+\d+/gi) || []).length;
      const imageCount = (content.match(/!\[[^\]]*\]\((?:https?:\/\/[^)]+|data:image[^)]+)\)/g) || []).length;
      
      if (panelCount > 0 && imageCount < panelCount) {
        issues.push({
          level: 'error',
          code: 'COMIC_MISSING_IMAGES',
          message: `Chapter ${chapterNum} has ${panelCount} panels but only ${imageCount} images`,
          chapterNumber: chapterNum,
          details: 'Comics cannot be exported without images for all panels.',
        });
      }
    }

    // 8. Empty or very short content
    if (content.trim().length < 100) {
      issues.push({
        level: 'warning',
        code: 'SHORT_CONTENT',
        message: `Chapter ${chapterNum} has very little content`,
        chapterNumber: chapterNum,
        details: 'Consider adding more content before exporting.',
      });
    }
  }

  // Determine if export can proceed
  const hasErrors = issues.some(i => i.level === 'error');
  
  return {
    valid: issues.length === 0,
    issues,
    canProceed: !hasErrors,
  };
}

/**
 * Format validation issues for display
 */
export function formatIssuesForDisplay(result: ExportValidationResult): string {
  if (result.valid) return '';
  
  const errorCount = result.issues.filter(i => i.level === 'error').length;
  const warningCount = result.issues.filter(i => i.level === 'warning').length;
  
  let summary = '';
  if (errorCount > 0) {
    summary += `${errorCount} error(s) must be fixed before export. `;
  }
  if (warningCount > 0) {
    summary += `${warningCount} warning(s) may affect export quality.`;
  }
  
  return summary.trim();
}

/**
 * Check if content contains charts/graphs that need to be images
 */
export function detectUnrenderedCharts(content: string): boolean {
  // Look for chart/graph markers that aren't already images
  const chartMarkers = [
    /\[CHART:/gi,
    /\[GRAPH:/gi,
    /```mermaid/gi,
    /```chart/gi,
    /<svg[^>]*>/gi, // SVG inline content (not images)
  ];
  
  for (const pattern of chartMarkers) {
    if (pattern.test(content)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Auto-repair mismatched [CODE_BLOCK] tags in chapter content.
 * Appends missing [/CODE_BLOCK] closing tags where needed.
 */
export function repairCodeBlockTags(content: string): string {
  if (!content) return content;
  
  const openCount = (content.match(/\[CODE_BLOCK\]/g) || []).length;
  const closeCount = (content.match(/\[\/CODE_BLOCK\]/g) || []).length;
  
  if (openCount === closeCount) return content;
  
  if (openCount > closeCount) {
    // Add missing closing tags at the end
    const missing = openCount - closeCount;
    let repaired = content;
    for (let i = 0; i < missing; i++) {
      repaired += '\n[/CODE_BLOCK]';
    }
    return repaired;
  }
  
  // More closing than opening — remove excess closing tags from end
  let repaired = content;
  let excess = closeCount - openCount;
  while (excess > 0) {
    const lastIdx = repaired.lastIndexOf('[/CODE_BLOCK]');
    if (lastIdx === -1) break;
    repaired = repaired.substring(0, lastIdx) + repaired.substring(lastIdx + '[/CODE_BLOCK]'.length);
    excess--;
  }
  return repaired;
}
