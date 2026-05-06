import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, rgb, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";
import * as zip from "https://deno.land/x/zipjs@v2.7.32/index.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ===========================================
// PRODUCTION MODE - Trial period has ended
// Matches src/lib/config.ts
// ===========================================
const TRIAL_MODE = false;
const TRIAL_END_DATE = new Date('2026-01-20'); // Trial ended

function isTrialActive(): boolean {
  return false; // Trial period ended - use normal subscription logic
}

// Format restrictions by tier (bypassed during trial)
const TIER_FORMATS = {
  free: ["pdf"],
  student: ["pdf", "epub", "docx"],
  premium: ["pdf", "epub", "docx", "kdp-pdf"],
  prophet_tier: ["pdf", "epub", "docx", "kdp-pdf"],
};

// Authorship & disclosure context resolved per-export
interface ExportContext {
  pub: {
    transparency_mode: 'invisible' | 'assisted' | 'transparent';
    show_scrolllibrary_branding: boolean;
    show_ai_assistance_notice: boolean;
    show_powered_by: boolean;
    publisher_name: string | null;
    publisher_imprint: string | null;
    sanitize_metadata: boolean;
    confidential_mode: boolean;
  };
  showAINotice: boolean;
  showAILongDisclosure: boolean;
  showBranding: boolean;
  showPoweredBy: boolean;
  effectivePublisher: string;
  sanitizeMeta: boolean;
}

// All formats available during trial
const ALL_FORMATS = ["pdf", "epub", "docx", "kdp-pdf"];

// KDP Trim Size specifications (in points, 72pt = 1 inch)
const KDP_TRIM_SIZES: Record<string, { width: number; height: number; name: string }> = {
  '5x8':    { width: 360, height: 576, name: '5" × 8"' },
  '5.25x8': { width: 378, height: 576, name: '5.25" × 8"' },
  '5.5x8.5': { width: 396, height: 612, name: '5.5" × 8.5"' },
  '6x9':    { width: 432, height: 648, name: '6" × 9"' },
  '7x10':   { width: 504, height: 720, name: '7" × 10"' },
  '8.5x11': { width: 612, height: 792, name: '8.5" × 11"' },
};

// KDP margin requirements (minimum in points) based on page count
function getKDPMargins(pageCount: number, isBleed: boolean): { inside: number; outside: number; top: number; bottom: number } {
  // KDP minimum inside (gutter) margin based on page count
  let inside = 54; // 0.75" for <= 150 pages
  if (pageCount > 150 && pageCount <= 300) inside = 61; // 0.847"
  else if (pageCount > 300 && pageCount <= 500) inside = 68; // 0.944"
  else if (pageCount > 500) inside = 76; // 1.059"
  
  const outside = isBleed ? 27 : 18; // 0.375" bleed / 0.25" no-bleed
  const top = isBleed ? 27 : 18;
  const bottom = isBleed ? 27 : 18;
  
  return { inside, outside, top, bottom };
}

// Generate Scroll Publishing Code (SPC)
function generateSPC(bookId: string): string {
  const year = new Date().getFullYear();
  const hash = bookId.substring(0, 8).toUpperCase();
  return `SPC-SL-${year}-${hash}`;
}

function isValidISBN(isbn: string): boolean {
  if (!isbn) return false;
  const cleaned = isbn.replace(/[-\s]/g, "");
  if (cleaned.length === 10) {
    let sum = 0;
    for (let i = 0; i < 9; i++) {
      sum += parseInt(cleaned[i]) * (10 - i);
    }
    const check = cleaned[9] === 'X' ? 10 : parseInt(cleaned[9]);
    return (sum + check) % 11 === 0;
  }
  if (cleaned.length === 13) {
    let sum = 0;
    for (let i = 0; i < 12; i++) {
      sum += parseInt(cleaned[i]) * (i % 2 === 0 ? 1 : 3);
    }
    return (10 - (sum % 10)) % 10 === parseInt(cleaned[12]);
  }
  return false;
}

function sanitizeFilename(title: string): string {
  return title.replace(/[^a-zA-Z0-9\s]/g, "").replace(/\s+/g, "_").substring(0, 50);
}

// Parse custom TABLE format from generate-chapter (non-markdown)
// Format: TABLE: [Name]\n\nColumn 1: [H] Column 2: [H]\n\nRow 1:\n[H1]: [V]\n[H2]: [V]
interface ParsedTable {
  name: string;
  headers: string[];
  rows: string[][];
}

function parseCustomTableFormat(text: string): { tables: ParsedTable[]; cleanedText: string } {
  const tables: ParsedTable[] = [];
  
  // Match custom table format: TABLE: [name] followed by Column/Row definitions
  const tablePattern = /TABLE:\s*([^\n]+)\n\n(Column \d+:[^\n]+(?:\n|$))+\n*((?:Row \d+:[\s\S]*?(?=\n\nRow \d+:|\n\n[A-Z]|\n\n$|$))+)/gi;
  
  let cleanedText = text;
  let match;
  
  while ((match = tablePattern.exec(text)) !== null) {
    const tableName = match[1].trim();
    const fullMatch = match[0];
    
    // Parse column headers
    const columnMatch = fullMatch.match(/Column \d+:\s*([^\n]+)/g) || [];
    const headers = columnMatch.map(col => {
      const headerMatch = col.match(/Column \d+:\s*(.+)/);
      return headerMatch ? headerMatch[1].trim() : '';
    });
    
    // Parse rows - each row has format "Row N:\nHeader1: Value1\nHeader2: Value2"
    const rows: string[][] = [];
    const rowMatches = fullMatch.match(/Row \d+:[\s\S]*?(?=Row \d+:|$)/g) || [];
    
    for (const rowText of rowMatches) {
      const rowValues: string[] = [];
      for (const header of headers) {
        // Try to find "Header: Value" pattern
        const valuePattern = new RegExp(`${header.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:\\s*([^\\n]+)`, 'i');
        const valueMatch = rowText.match(valuePattern);
        if (valueMatch) {
          rowValues.push(valueMatch[1].trim());
        } else {
          rowValues.push('');
        }
      }
      if (rowValues.some(v => v)) {
        rows.push(rowValues);
      }
    }
    
    if (headers.length > 0 && rows.length > 0) {
      tables.push({ name: tableName, headers, rows });
      cleanedText = cleanedText.replace(fullMatch, `[CUSTOM_TABLE_${tables.length - 1}]`);
    }
  }
  
  return { tables, cleanedText };
}

// Structured code block interface (ChatGPT-level format)
interface StructuredCodeBlockData {
  language: string;
  title?: string;
  purpose?: string;
  code: string;
  output?: string;
  explanation?: string;
  commonMistake?: string;
}

// Parse structured code block format from text [CODE_BLOCK]...[/CODE_BLOCK]
function parseStructuredCodeBlockFromText(blockContent: string): StructuredCodeBlockData | null {
  const content = blockContent.trim();
  if (!content) return null;

  // Check if the block has structured field headers (language:, code:, etc.)
  const hasStructuredFields = /^(?:language|title|purpose|code):\s/mi.test(content);

  if (!hasStructuredFields) {
    // Raw code content without structured fields - auto-detect language
    const rawCode = content.trim();
    if (!rawCode) return null;

    let detectedLang = 'text';
    if (/^import\s|^from\s.*import|def\s+\w+|print\s*\(|class\s+\w+.*:/m.test(rawCode)) detectedLang = 'python';
    else if (/^(?:const|let|var|function|import|export)\s|=>\s*{|console\.\w+/m.test(rawCode)) detectedLang = 'javascript';
    else if (/^(?:public|private|protected)\s|System\.out|class\s+\w+\s*{/m.test(rawCode)) detectedLang = 'java';
    else if (/^#include|std::|int\s+main|cout\s*<</m.test(rawCode)) detectedLang = 'cpp';
    else if (/^SELECT\s|^INSERT\s|^CREATE\s|^UPDATE\s|^DELETE\s/mi.test(rawCode)) detectedLang = 'sql';
    else if (/^<\?php|^\$\w+\s*=/m.test(rawCode)) detectedLang = 'php';
    else if (/^(?:func |package |import\s+")/m.test(rawCode)) detectedLang = 'go';
    else if (/^(?:fn |let\s+mut |use\s+std::)/m.test(rawCode)) detectedLang = 'rust';

    // Strip fenced code block markers if present
    let cleanCode = rawCode.replace(/^```\w*\n/, '').replace(/\n```$/, '');

    return {
      language: detectedLang,
      code: cleanCode,
    };
  }

  const extractField = (field: string): string | undefined => {
    const regex = new RegExp(`^${field}:\\s*["']?(.+?)["']?\\s*$`, 'mi');
    const match = content.match(regex);
    return match?.[1]?.trim();
  };

  const extractMultilineField = (field: string): string | undefined => {
    const regex = new RegExp(`^${field}:\\s*\\n([\\s\\S]*?)(?=^(?:language|title|purpose|code|output|explanation|common_mistake):|$)`, 'mi');
    const match = content.match(regex);
    return match?.[1]?.trim();
  };

  // Extract code: prefer the full multiline field (captures everything between code: and next field)
  // then strip any fenced code block markers (```lang / ```) that may appear inside
  let code = '';
  const rawCodeField = extractMultilineField('code');
  if (rawCodeField) {
    code = rawCodeField
      .replace(/^```\w*\n?/gm, '')  // opening fences
      .replace(/^```\s*$/gm, '')     // closing fences
      .trim();
  }
  if (!code) {
    const codeMatch = content.match(/code:\s*\n```\w*\n([\s\S]*?)```/);
    code = codeMatch?.[1]?.trim() || '';
  }

  // Extract output - may be multi-line
  const outputMatch = content.match(/output:\s*\n([\s\S]*?)(?=^(?:explanation|common_mistake):|$)/mi);
  const output = outputMatch?.[1]?.trim();

  return {
    language: extractField('language') || 'text',
    title: extractField('title'),
    purpose: extractField('purpose') || extractMultilineField('purpose'),
    code,
    output,
    explanation: extractMultilineField('explanation'),
    commonMistake: extractMultilineField('common_mistake'),
  };
}

// Heading structure for export
interface HeadingData {
  level: number; // 1-6
  text: string;
  index: number; // position in paragraphs array
}

// Enhanced markdown processing that handles markdown tables, code blocks, images, and HEADINGS
// Now prioritizes proper markdown pipe format for tables
// Supports structured [CODE_BLOCK]...[/CODE_BLOCK] format
// PRESERVES headings as structured data for proper export styling
function processMarkdownContent(text: string): { 
  paragraphs: string[]; 
  codeBlocks: { lang: string; code: string }[]; 
  structuredBlocks: StructuredCodeBlockData[];
  tables: { name: string; headers: string[]; rows: string[][] }[];
  customTables: ParsedTable[];
  images: { alt: string; url: string }[];
  headings: HeadingData[];
} {
  if (!text) return { paragraphs: [], codeBlocks: [], structuredBlocks: [], tables: [], customTables: [], images: [], headings: [] };
  
  // PRE-CLEAN: Strip raw [FIGURE ...] markers that the chapter generator leaves behind
  let cleanedInput = text.replace(/\[FIGURE[^\]]*\]/gi, '');
  // Also strip stray [Image not available: ...] or [Image: ...] placeholders
  cleanedInput = cleanedInput.replace(/\[Image[^\]]*\]/gi, '');
  
  const codeBlocks: { lang: string; code: string }[] = [];
  const structuredBlocks: StructuredCodeBlockData[] = [];
  const tables: { name: string; headers: string[]; rows: string[][] }[] = [];
  const images: { alt: string; url: string }[] = [];
  const headings: HeadingData[] = [];
  
  // First, parse old custom TABLE: format (legacy support)
  const { tables: customTables, cleanedText: textAfterCustomTables } = parseCustomTableFormat(cleanedInput);
  
  // Extract STRUCTURED code blocks [CODE_BLOCK]...[/CODE_BLOCK] (ChatGPT-level format)
  let processedText = textAfterCustomTables.replace(/\[CODE_BLOCK\]([\s\S]*?)\[\/CODE_BLOCK\]/g, (_, blockContent) => {
    const parsed = parseStructuredCodeBlockFromText(blockContent);
    if (parsed && parsed.code) {
      structuredBlocks.push(parsed);
      return `[STRUCTURED_CODE_${structuredBlocks.length - 1}]`;
    }
    return '';
  });
  
  // Extract regular fenced code blocks with triple backticks
  processedText = processedText.replace(/```(\w+)?\n([\s\S]*?)```/g, (_, lang, code) => {
    codeBlocks.push({ lang: lang || 'text', code: code.trim() });
    return `[CODE_BLOCK_${codeBlocks.length - 1}]`;
  });
  
  // Also handle legacy "CODE EXAMPLE (Language):" format
  processedText = processedText.replace(/CODE EXAMPLE \(([^)]+)\):\n\n((?:    [^\n]*\n?)+)/gi, (_, lang, code) => {
    codeBlocks.push({ lang: lang || 'text', code: code.replace(/^    /gm, '').trim() });
    return `[CODE_BLOCK_${codeBlocks.length - 1}]`;
  });
  
  // Extract markdown images (![alt](url)) - MUST happen before stripping markdown
  processedText = processedText.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt, url) => {
    // Skip placeholder text that isn't a real URL
    if (url.startsWith('[') || url.includes('Illustration:')) {
      return `[Illustration: ${alt}]`;
    }
    images.push({ alt: alt || 'Image', url: url.trim() });
    return `[IMAGE_${images.length - 1}]`;
  });
  
  // Extract PROPER markdown tables (pipe format) - this is the new primary format
  // Pattern matches: | header | header |\n|---|---|\n| cell | cell |
  const markdownTableRegex = /(?:(?:\*\*[^*]+\*\*|\w[^\n]*)\n\n?)?\|[^\n]+\|\n\|[-:| ]+\|\n(?:\|[^\n]+\|\n?)+/g;
  processedText = processedText.replace(markdownTableRegex, (match) => {
    // Extract optional table title (bold text or plain text before the table)
    let tableName = '';
    let tableContent = match;
    const titleMatch = match.match(/^(?:\*\*([^*]+)\*\*|([^\n|]+))\n\n?(\|.+)/s);
    if (titleMatch) {
      tableName = (titleMatch[1] || titleMatch[2] || '').trim();
      tableContent = titleMatch[3];
    }
    
    const lines = tableContent.trim().split('\n');
    if (lines.length < 2) return match;
    
    // Parse header row
    const headerLine = lines[0];
    const headers = headerLine.split('|')
      .filter((cell: string) => cell.trim())
      .map((cell: string) => stripInlineMarkdown(cell.trim()));
    
    // Skip separator row (line with ---)
    // Parse data rows
    const rows: string[][] = [];
    for (let i = 2; i < lines.length; i++) {
      const rowLine = lines[i];
      if (!rowLine.includes('|')) continue;
      const cells = rowLine.split('|')
        .filter((cell: string, idx: number, arr: string[]) => idx > 0 && idx < arr.length - 1 || cell.trim())
        .map((cell: string) => stripInlineMarkdown(cell.trim()))
        .filter((cell: string) => cell);
      if (cells.length > 0) {
        rows.push(cells);
      }
    }
    
    if (headers.length > 0 && rows.length > 0) {
      tables.push({ name: tableName || 'Table', headers, rows });
      return `[MD_TABLE_${tables.length - 1}]`;
    }
    return match;
  });
  
  
  // EXTRACT HEADINGS - preserve them as structured data with placeholders
  // This must happen BEFORE stripping other markdown
  
  // First: detect plain-text headings (legacy content without ## markers)
  // Short standalone lines between blank lines that look like section titles
  processedText = processedText.replace(/\n\n([A-Z][A-Za-z0-9 :&,\-–—'()]{2,75})\n\n/g, (match, line) => {
    const trimmed = line.trim();
    if (/^#{1,6}\s/.test(trimmed) || /^[-*]\s/.test(trimmed) || /[.!?;,]$/.test(trimmed)) return match;
    const words = trimmed.split(/\s+/);
    if (words.length > 10) return match;
    return `\n\n## ${trimmed}\n\n`;
  });
  // Detect numbered sub-headings like "4.3. Manufacturing and Logistics" or "1.1.2. Floating-Point Numbers (float)"
  // Match with either double newline or single newline after
  processedText = processedText.replace(/\n\n(\d+(?:\.\d+)*\.?\s+[A-Za-z][A-Za-z0-9 :&,\-–—'()*/]{2,70})\n/g, (match, line) => {
    const trimmed = line.trim();
    if (/[.!?;,]$/.test(trimmed) && !/[)]$/.test(trimmed) && !/\.\s*$/.test(trimmed)) return match;
    const words = trimmed.split(/\s+/);
    if (words.length > 12) return match;
    if (words.length > 8 && /\b(the|is|are|was|were|and|or|but|for|with|that|this|from|into|have|has)\b/i.test(trimmed)) return match;
    return `\n\n### ${trimmed}\n\n`;
  });
  // Convert bullet dots (•) to standard markdown bullets
  processedText = processedText.replace(/^[\s]*•\s+/gm, '- ');
  
  processedText = processedText.replace(/^(#{1,6})\s+(.+)$/gm, (_, hashes, text) => {
    const level = hashes.length;
    headings.push({ level, text: text.trim(), index: -1 }); // index will be set after paragraph split
    return `[HEADING_${headings.length - 1}_LEVEL_${level}]`;
  });
  
  
  // Strip markdown EXCEPT bold/italic (preserve ** and * for styled rendering)
  const stripped = processedText
    .replace(/`[^`]+`/g, (match) => match.slice(1, -1))
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // Regular links (not images)
    .replace(/^\s*[-*]\s+/gm, "\u2022 ")     // Unify bullet markers to bullet char
    .replace(/^\s*(\d+)\.\s+/gm, "$1. ")     // Preserve ordered list numbers
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  
  // Split paragraphs: double newline = new paragraph, BUT also split on single
  // newlines when lines start with bullet/number markers so list items stay separate
  const rawBlocks = stripped.split(/\n\n+/).filter(p => p.trim());
  const paragraphs: string[] = [];
  for (const block of rawBlocks) {
    // If block contains bullet or numbered list items separated by single newlines, split them
    const lines = block.split('\n');
    if (lines.length > 1 && lines.some(l => /^(\u2022|\d+\.\s)/.test(l.trim()))) {
      // Split list items into separate paragraphs
      let currentGroup = '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (/^(\u2022|\d+\.\s)/.test(trimmed)) {
          if (currentGroup.trim()) paragraphs.push(currentGroup.trim());
          currentGroup = trimmed;
        } else {
          // Continuation of previous item
          currentGroup += ' ' + trimmed;
        }
      }
      if (currentGroup.trim()) paragraphs.push(currentGroup.trim());
    } else {
      paragraphs.push(block);
    }
  }
  
  // Update heading indices to match paragraph positions
  paragraphs.forEach((p, idx) => {
    const headingMatch = p.match(/\[HEADING_(\d+)_LEVEL_\d+\]/);
    if (headingMatch) {
      const headingIdx = parseInt(headingMatch[1], 10);
      if (headings[headingIdx]) {
        headings[headingIdx].index = idx;
      }
    }
  });
  
  
  return { paragraphs, codeBlocks, structuredBlocks, tables, customTables, images, headings };
}


// Strip inline markdown formatting (bold/italic markers) from text — used for table cells & plain rendering
function stripInlineMarkdown(text: string): string {
  if (!text) return "";
  return text
    .replace(/\*\*\*([^*]+)\*\*\*/g, "$1") // bold+italic
    .replace(/\*\*([^*]+)\*\*/g, "$1")     // bold
    .replace(/\*([^*]+)\*/g, "$1")         // italic
    .replace(/`([^`]+)`/g, "$1");          // inline code
}

function stripMarkdown(text: string): string {
  if (!text) return "";
  return text
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/`([^`]+)`/g, "$1")  // Keep inline code content
    .replace(/```[\s\S]*?```/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^\s*[-*]\s+/gm, "• ")
    .replace(/^\s*(\d+)\.\s+/gm, "$1. ")  // Preserve ordered list numbers
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// Parse a paragraph into styled runs for PDF rendering (bold, italic, bold+italic, normal)
interface StyledRun {
  text: string;
  bold: boolean;
  italic: boolean;
}

function parseStyledRuns(text: string): StyledRun[] {
  const runs: StyledRun[] = [];
  // Robust parser: handle ***bold+italic***, **bold**, *italic*, lone * as literal text
  let remaining = text;
  while (remaining.length > 0) {
    // Try bold+italic first
    const biMatch = remaining.match(/^\*\*\*([^*]+)\*\*\*/);
    if (biMatch) {
      runs.push({ text: biMatch[1], bold: true, italic: true });
      remaining = remaining.slice(biMatch[0].length);
      continue;
    }
    // Try bold
    const bMatch = remaining.match(/^\*\*([^*]+)\*\*/);
    if (bMatch) {
      runs.push({ text: bMatch[1], bold: true, italic: false });
      remaining = remaining.slice(bMatch[0].length);
      continue;
    }
    // Try italic (requires closing *)
    const iMatch = remaining.match(/^\*([^*]+)\*/);
    if (iMatch) {
      runs.push({ text: iMatch[1], bold: false, italic: true });
      remaining = remaining.slice(iMatch[0].length);
      continue;
    }
    // Consume plain text up to the next * that could start formatting, or to end
    const nextStar = remaining.indexOf('*', remaining[0] === '*' ? 1 : 0);
    if (remaining[0] === '*') {
      // Lone * — treat as literal text, consume it
      const plainEnd = nextStar > 0 ? nextStar : remaining.length;
      runs.push({ text: remaining.slice(0, Math.max(1, plainEnd)), bold: false, italic: false });
      remaining = remaining.slice(Math.max(1, plainEnd));
    } else if (nextStar > 0) {
      runs.push({ text: remaining.slice(0, nextStar), bold: false, italic: false });
      remaining = remaining.slice(nextStar);
    } else {
      runs.push({ text: remaining, bold: false, italic: false });
      remaining = '';
    }
  }
  return runs.length > 0 ? runs : [{ text, bold: false, italic: false }];
}

// Draw a styled paragraph in PDF with inline bold/italic support
// Returns { y, page } so the caller can track page breaks
function drawStyledParagraph(
  page: any,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  fontSize: number,
  fonts: { regular: any; bold: any; italic: any; boldItalic: any },
  color: any,
  pdfDoc?: any,
  pageWidth?: number,
  pageHeight?: number,
  margin?: number,
  addPageNumberFn?: (page: any, num: number) => void,
  pageNumberRef?: { current: number }
): { y: number; page: any } {
  const runs = parseStyledRuns(sanitizeForPDF(text));
  const lineHeight = fontSize + 4;
  const bottomMargin = (margin || 72) + 30;
  
  let currentX = x;
  let currentY = y;
  let currentPage = page;
  
  for (const run of runs) {
    const font = run.bold && run.italic ? fonts.boldItalic 
               : run.bold ? fonts.bold 
               : run.italic ? fonts.italic 
               : fonts.regular;
    
    const words = run.text.split(/\s+/);
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      if (!word) continue;
      const wordWithSpace = (currentX > x ? ' ' : '') + word;
      const wordWidth = font.widthOfTextAtSize(wordWithSpace, fontSize);
      
      if (currentX + wordWidth > x + maxWidth && currentX > x) {
        // New line
        currentX = x;
        currentY -= lineHeight;
        
        // Page break check
        if (currentY < bottomMargin && pdfDoc && pageWidth && pageHeight) {
          currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
          if (pageNumberRef) {
            pageNumberRef.current++;
            addPageNumberFn?.(currentPage, pageNumberRef.current);
          }
          currentY = (pageHeight || 792) - (margin || 72) - 30;
          currentX = x; // Reset X after page break to prevent text starting mid-line
        }
      }
      
      const drawWord = currentX > x ? ' ' + word : word;
      currentPage.drawText(drawWord, {
        x: currentX,
        y: currentY,
        size: fontSize,
        font,
        color,
      });
      currentX += font.widthOfTextAtSize(drawWord, fontSize);
    }
  }
  
  return { y: currentY - lineHeight, page: currentPage }; // Return next Y position AND current page
}

// Convert markdown text to WordprocessingML runs with bold/italic
function markdownToDocxRuns(text: string): string {
  const runs = parseStyledRuns(text);
  return runs.map(run => {
    let rPr = '';
    if (run.bold || run.italic) {
      rPr = '<w:rPr>';
      if (run.bold) rPr += '<w:b/>';
      if (run.italic) rPr += '<w:i/>';
      rPr += '</w:rPr>';
    }
    return `<w:r>${rPr}<w:t xml:space="preserve">${escapeXml(run.text)}</w:t></w:r>`;
  }).join('');
}

/**
 * Sanitize text for PDF WinAnsi encoding — SINGLE-PASS character map
 * Replaces Unicode characters that cannot be encoded in WinAnsi
 * CRITICAL: Must be called on ALL text before drawText() in PDF generation
 */
const _pdfCharMap: Record<string, string> = {
  '\u2192': '->', '\u2190': '<-', '\u2194': '<->', '\u21D2': '=>', '\u21D0': '<=', '\u21D4': '<=>', '\u2191': '^', '\u2193': 'v',
  '\u2018': "'", '\u2019': "'", '\u201A': "'", '\u02BC': "'", '\u02B9': "'", '\u02BB': "'", '\u0060': "'", '\u00B4': "'",
  '\u201C': '"', '\u201D': '"', '\u201E': '"', '\u201F': '"', '\u2033': '"',
  '\u2032': "'", '\u2035': "'", '\u02CA': "'", '\u02CB': "'",
  '\u2070': '0', '\u00B9': '1', '\u00B2': '2', '\u00B3': '3', '\u2074': '4', '\u2075': '5', '\u2076': '6', '\u2077': '7', '\u2078': '8', '\u2079': '9',
  '\u207A': '+', '\u207B': '-', '\u207C': '=', '\u207D': '(', '\u207E': ')', '\u207F': 'n',
  '\u2080': '0', '\u2081': '1', '\u2082': '2', '\u2083': '3', '\u2084': '4', '\u2085': '5', '\u2086': '6', '\u2087': '7', '\u2088': '8', '\u2089': '9',
  '\u208A': '+', '\u208B': '-', '\u208C': '=', '\u208D': '(', '\u208E': ')',
  '\u00D7': 'x', '\u00F7': '/', '\u2212': '-', '\u2013': '-', '\u2014': '-', '\u2026': '...', '\u2022': '-',
  '\u25E6': 'o', '\u25AA': '-', '\u25B8': '>', '\u25B9': '>', '\u25C2': '<', '\u25C3': '<',
  '\u2248': '~', '\u2260': '!=', '\u2264': '<=', '\u2265': '>=',
  '\u221E': 'infinity', '\u03C0': 'pi', '\u03B1': 'alpha', '\u03B2': 'beta', '\u03B3': 'gamma', '\u03B4': 'delta',
  '\u03B5': 'epsilon', '\u03B8': 'theta', '\u03BB': 'lambda', '\u03BC': 'mu', '\u03C3': 'sigma', '\u03C6': 'phi',
  '\u03C9': 'omega', '\u03A9': 'Omega', '\u2211': 'sum', '\u220F': 'product', '\u221A': 'sqrt',
  '\u222B': 'integral', '\u2202': 'd', '\u2206': 'delta', '\u2207': 'nabla',
  '\u2122': '(TM)', '\u2120': '(SM)', '\u2117': '(P)',
};

function sanitizeForPDF(text: string): string {
  if (!text) return "";
  let result = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const code = ch.charCodeAt(0);
    const mapped = _pdfCharMap[ch];
    if (mapped !== undefined) {
      result += mapped;
    } else if (code <= 0xFF) {
      result += ch; // Latin-1 range — safe for WinAnsi
    }
    // else: non-Latin-1 char not in map — drop silently
  }
  return result;
}

/**
 * Sanitize text for HTML/XML output (EPUB/DOCX)
 * Preserves Unicode but escapes XML entities
 */
function sanitizeForExport(text: string): string {
  if (!text) return "";
  // Just normalize whitespace, keep Unicode for EPUB/DOCX (they support it)
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

async function fetchImageBytes(url: string, timeoutMs = 8000): Promise<Uint8Array | null> {
  try {
    // Handle base64 data URIs
    if (url.startsWith("data:image")) {
      const base64Data = url.split(",")[1];
      if (!base64Data) {
        return null;
      }
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return bytes;
    }
    
    // Handle remote URLs with timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    
    const response = await fetch(url, {
      headers: { 'Accept': 'image/*' },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    
    if (!response.ok) {
      console.error(`[EXPORT] Failed to fetch image: ${response.status} ${response.statusText}`);
      return null;
    }
    
    const arrayBuffer = await response.arrayBuffer();
    // Cap image size at 2MB to prevent CPU timeout during PDF embedding
    if (arrayBuffer.byteLength > 2 * 1024 * 1024) {
      return null;
    }
    return new Uint8Array(arrayBuffer);
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      console.error("[EXPORT] Image fetch timed out");
    } else {
      console.error("[EXPORT] Error fetching image:", error);
    }
    return null;
  }
}

type ImageKind = 'jpeg' | 'png' | 'gif' | 'webp' | 'svg' | 'unknown';

function detectImageKind(bytes: Uint8Array): ImageKind {
  if (!bytes || bytes.length < 12) return 'unknown';

  // PNG
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'png';
  // JPEG
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'jpeg';
  // GIF
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) return 'gif';
  // WEBP (RIFF....WEBP)
  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) return 'webp';

  // SVG (best-effort: detect "<svg" early in the content)
  try {
    const prefix = new TextDecoder().decode(bytes.slice(0, Math.min(bytes.length, 256))).trimStart();
    if (prefix.startsWith('<svg') || (prefix.startsWith('<?xml') && prefix.includes('<svg'))) return 'svg';
  } catch {
    // ignore
  }

  return 'unknown';
}

function imageKindToExt(kind: ImageKind): string {
  switch (kind) {
    case 'jpeg':
      return 'jpg';
    case 'png':
      return 'png';
    case 'gif':
      return 'gif';
    case 'webp':
      return 'webp';
    case 'svg':
      return 'svg';
    default:
      return 'jpg';
  }
}

function imageKindToMediaType(kind: ImageKind): string {
  switch (kind) {
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'gif':
      return 'image/gif';
    case 'webp':
      return 'image/webp';
    case 'svg':
      return 'image/svg+xml';
    default:
      return 'image/jpeg';
  }
}

// Safe base64 encoding for large arrays (avoids stack overflow)
function uint8ArrayToBase64(bytes: Uint8Array): string {
  const chunkSize = 8192;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.slice(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return btoa(binary);
}

// Check if content has academic references
function hasAcademicReferences(chapters: any[]): boolean {
  return chapters.some(ch => 
    (ch.chapter_references && Object.keys(ch.chapter_references).length > 0) ||
    (ch.content && /(?:^|\n)##+\s*references/i.test(ch.content))
  );
}

// Generate combined bibliography from all chapters
function generateBibliography(chapters: any[], citationStyle: string): string[] {
  const allRefs: any[] = [];
  
  chapters.forEach(ch => {
    if (ch.chapter_references && Array.isArray(ch.chapter_references)) {
      allRefs.push(...ch.chapter_references);
    }
  });
  
  // Deduplicate by DOI or title
  const seen = new Set<string>();
  const uniqueRefs = allRefs.filter(ref => {
    const key = ref.doi || ref.title?.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  
  // Sort alphabetically by author
  uniqueRefs.sort((a, b) => (a.author || '').localeCompare(b.author || ''));
  
  // Format references
  return uniqueRefs.map((ref, index) => {
    switch (citationStyle) {
      case 'APA':
        return `${ref.author} (${ref.year}). ${ref.title}.${ref.journal ? ` ${ref.journal}.` : ref.publisher ? ` ${ref.publisher}.` : ''}${ref.doi ? ` https://doi.org/${ref.doi}` : ref.url ? ` ${ref.url}` : ''}`;
      case 'Harvard':
        return `${ref.author} (${ref.year}) ${ref.title}.${ref.journal ? ` ${ref.journal}.` : ref.publisher ? ` ${ref.publisher}.` : ''}${ref.url ? ` Available at: ${ref.url}` : ''}`;
      case 'IEEE':
        return `[${index + 1}] ${ref.author}, "${ref.title},"${ref.journal ? ` ${ref.journal},` : ''} ${ref.year}.${ref.doi ? ` DOI: ${ref.doi}` : ''}`;
      case 'Chicago':
        return `${ref.author}. ${ref.title}.${ref.publisher ? ` ${ref.publisher},` : ''} ${ref.year}.${ref.url ? ` ${ref.url}.` : ''}`;
      default:
        return `${ref.author} (${ref.year}). ${ref.title}.`;
    }
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase configuration is missing");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Authenticate user from JWT token
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Authentication required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      console.error("[EXPORT] Auth error:", authError);
      return new Response(JSON.stringify({ error: "Invalid authentication" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if user is admin
    const { data: userRoles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);
    
    const isAdmin = userRoles?.some(r => r.role === 'admin') || false;

    // Check if trial mode is active - bypass all restrictions
    const trialActive = isTrialActive();
    
    // Get user's subscription plan from subscriptions table (single source of truth)
    const { data: subscription } = await supabase
      .from("subscriptions")
      .select("tier, status")
      .eq("user_id", user.id)
      .maybeSingle();

    // Only use tier if subscription is active, otherwise fall back to free
    const userPlan = (subscription?.status === 'active' && subscription?.tier) ? subscription.tier : "free";
    
    // During trial or admin, allow all formats
    const allowedFormats = (trialActive || isAdmin)
      ? ALL_FORMATS 
      : (TIER_FORMATS[userPlan as keyof typeof TIER_FORMATS] || TIER_FORMATS.free);

    const { bookId, format, authorName, isbn, isAcademicMode, academicMode, citationStyle, kdpTrimSize, kdpBleed, publishingSettings: publishingSettingsOverride } = await req.json();
    
    // Support both param names (client sends isAcademicMode, legacy sends academicMode)
    const resolvedAcademicMode = isAcademicMode || academicMode || false;

    console.log(`[EXPORT] Plan: ${userPlan}, format: ${format}`);
    // Check format permissions (skip during trial or admin)
    if (!trialActive && !isAdmin && !allowedFormats.includes(format)) {
      const requiredPlan = format === 'docx' ? 'Student' : 'Premium';
      return new Response(JSON.stringify({ 
        error: `${format.toUpperCase()} export requires ${requiredPlan} plan or higher.` 
      }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    

    // Fetch book and verify ownership
    const { data: book, error: bookError } = await supabase
      .from("books")
      .select("*")
      .eq("id", bookId)
      .single();

    if (bookError || !book) throw new Error("Book not found");
    
    // Verify user owns the book or it's published (admins can export any book)
    if (book.creator_id !== user.id && book.user_id !== user.id && !book.is_published && !isAdmin) {
      return new Response(JSON.stringify({ error: "Not authorized to export this book" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Cover image is optional — export will skip cover page if not available
    if (!book.cover_image_url) {
      console.log("[EXPORT] No cover image — skipping cover page");
    }

    // Fetch chapters with references
    const { data: chapters, error: chaptersError } = await supabase
      .from("chapters")
      .select("*, chapter_references, research_metadata, citation_style, academic_mode")
      .eq("book_id", bookId)
      .eq("is_generated", true)
      .order("chapter_number");

    if (chaptersError) throw new Error("Failed to fetch chapters");
    if (!chapters || chapters.length === 0) throw new Error("No generated chapters found");

    // GUARD: Reject extremely large books that risk edge function timeout (60s limit)
    const totalContentSize = chapters.reduce((sum, ch) => sum + (ch.content?.length || 0), 0);
    if (totalContentSize > 2_000_000) {
      return new Response(JSON.stringify({ 
        error: `Book content is too large for export (${Math.round(totalContentSize / 1000)}KB). Try exporting fewer chapters or contact support.` 
      }), {
        status: 413,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (chapters.length > 80) {
      return new Response(JSON.stringify({ 
        error: `Book has ${chapters.length} chapters — export is limited to 80 chapters. Contact support for larger exports.` 
      }), {
        status: 413,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Auto-repair mismatched [CODE_BLOCK] tags and unclosed backtick fences before export
    for (const chapter of chapters) {
      if (chapter.content) {
        // Repair [CODE_BLOCK] tags
        const openCount = (chapter.content.match(/\[CODE_BLOCK\]/g) || []).length;
        const closeCount = (chapter.content.match(/\[\/CODE_BLOCK\]/g) || []).length;
        if (openCount !== closeCount) {
          
          if (openCount > closeCount) {
            for (let i = 0; i < openCount - closeCount; i++) {
              chapter.content += '\n[/CODE_BLOCK]';
            }
          } else {
            let excess = closeCount - openCount;
            while (excess > 0) {
              const lastIdx = chapter.content.lastIndexOf('[/CODE_BLOCK]');
              if (lastIdx === -1) break;
              chapter.content = chapter.content.substring(0, lastIdx) + chapter.content.substring(lastIdx + '[/CODE_BLOCK]'.length);
              excess--;
            }
          }
        }

        // Repair unclosed backtick fences (``` without matching close)
        const fenceCount = (chapter.content.match(/```/g) || []).length;
        if (fenceCount % 2 !== 0) {
          
          chapter.content += '\n```';
        }
      }
    }

    // Fetch book-level citations from book_citations table
    const { data: bookCitations } = await supabase
      .from("book_citations")
      .select("*")
      .eq("book_id", bookId)
      .order("created_at");

    // Determine if this is academic content
    const isAcademicExport = resolvedAcademicMode || chapters.some(ch => ch.academic_mode);
    const effectiveCitationStyle = citationStyle || chapters.find(ch => ch.citation_style)?.citation_style || 'APA';

    // VALIDATION for academic exports
    if (isAcademicExport) {
      const hasRefs = hasAcademicReferences(chapters);
      if (!hasRefs) {
        
      }
    }

    // Fetch cover image (only if URL exists)
    const coverImageBytes = book.cover_image_url 
      ? await fetchImageBytes(book.cover_image_url) 
      : null;
    
    const finalAuthorName = authorName || book.author_ai_agent || "Unknown Author";
    const publishingIdentifier = isbn && isValidISBN(isbn) ? isbn : generateSPC(bookId);
    const isISBN = isbn && isValidISBN(isbn);
    const year = new Date().getFullYear();

    // ===== AUTHORSHIP & DISCLOSURE SETTINGS =====
    // Default: invisible mode (no AI/ScrollLibrary references anywhere in export).
    // Per-export overrides take precedence over book-level saved settings.
    const DEFAULT_PUB_SETTINGS = {
      transparency_mode: 'invisible' as 'invisible' | 'assisted' | 'transparent',
      show_scrolllibrary_branding: false,
      show_ai_assistance_notice: false,
      show_powered_by: false,
      publisher_name: null as string | null,
      publisher_imprint: null as string | null,
      sanitize_metadata: true,
      confidential_mode: false,
    };
    const pub = {
      ...DEFAULT_PUB_SETTINGS,
      ...(book.publishing_settings || {}),
      ...(publishingSettingsOverride || {}),
    };
    // Confidential mode forces invisible + sanitize + no branding.
    if (pub.confidential_mode) {
      pub.transparency_mode = 'invisible';
      pub.sanitize_metadata = true;
      pub.show_scrolllibrary_branding = false;
      pub.show_ai_assistance_notice = false;
      pub.show_powered_by = false;
    }
    const showAINotice = pub.transparency_mode !== 'invisible' && pub.show_ai_assistance_notice;
    const showAILongDisclosure = pub.transparency_mode === 'transparent';
    const showBranding = !pub.confidential_mode && pub.show_scrolllibrary_branding;
    const showPoweredBy = !pub.confidential_mode && pub.show_powered_by;
    const effectivePublisher = pub.publisher_name || (showBranding ? 'ScrollLibrary' : finalAuthorName);
    const sanitizeMeta = pub.sanitize_metadata;
    const exportContext = { pub, showAINotice, showAILongDisclosure, showBranding, showPoweredBy, effectivePublisher, sanitizeMeta };

    // Generate bibliography for ALL books (from chapter refs + book_citations table)
    let bibliography = generateBibliography(chapters, effectiveCitationStyle);
    
    // Also include book-level citations from the database
    if (bookCitations && bookCitations.length > 0) {
      const dbCitations = bookCitations.map(c => c.citation_text);
      // Deduplicate against existing bibliography
      const existingSet = new Set(bibliography.map(b => b.toLowerCase().trim()));
      for (const citation of dbCitations) {
        if (!existingSet.has(citation.toLowerCase().trim())) {
          bibliography.push(citation);
        }
      }
    }

    

    let content: string;
    let contentType: string;
    let filename: string;
    let isBase64 = false;

    switch (format) {
      case "pdf": {
        const pdfBytes = await generatePDF(book, chapters, finalAuthorName, publishingIdentifier, isISBN, year, coverImageBytes, isAcademicExport, effectiveCitationStyle, bibliography, exportContext);
        content = uint8ArrayToBase64(pdfBytes);
        contentType = "application/pdf";
        filename = `${sanitizeFilename(book.title)}.pdf`;
        isBase64 = true;
        break;
      }

      case "kdp-pdf": {
        const trimSize = KDP_TRIM_SIZES[kdpTrimSize || '6x9'] || KDP_TRIM_SIZES['6x9'];
        const useBleed = kdpBleed === true;
        const pdfBytes = await generateKDPPDF(book, chapters, finalAuthorName, publishingIdentifier, isISBN, year, coverImageBytes, isAcademicExport, effectiveCitationStyle, bibliography, trimSize, useBleed, exportContext);
        content = uint8ArrayToBase64(pdfBytes);
        contentType = "application/pdf";
        filename = `${sanitizeFilename(book.title)}_KDP.pdf`;
        isBase64 = true;
        break;
      }
      
      case "epub": {
        const epubBytes = await generateEPUB(book, chapters, finalAuthorName, publishingIdentifier, isISBN, year, coverImageBytes, isAcademicExport, effectiveCitationStyle, bibliography, exportContext);
        content = uint8ArrayToBase64(new Uint8Array(epubBytes));
        contentType = "application/epub+zip";
        filename = `${sanitizeFilename(book.title)}.epub`;
        isBase64 = true;
        break;
      }
      
      case "docx": {
        const docxBytes = await generateDOCX(book, chapters, finalAuthorName, publishingIdentifier, isISBN, year, coverImageBytes, isAcademicExport, effectiveCitationStyle, bibliography, exportContext);
        content = uint8ArrayToBase64(new Uint8Array(docxBytes));
        contentType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        filename = `${sanitizeFilename(book.title)}.docx`;
        isBase64 = true;
        break;
      }
      
      default:
        throw new Error(`Unsupported format: ${format}`);
    }

    

    return new Response(
      JSON.stringify({ success: true, content, contentType, filename, isBase64 }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[EXPORT] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

// ===== PDF Generation with Cover Page, TOC, and References =====
async function generatePDF(
  book: any, 
  chapters: any[], 
  author: string, 
  identifier: string, 
  isISBN: boolean, 
  year: number, 
  coverImageBytes: Uint8Array | null,
  isAcademic: boolean,
  citationStyle: string,
  bibliography: string[],
  ctx: ExportContext,
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const timesRoman = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  const timesRomanBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
  const timesRomanItalic = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);
  const timesRomanBoldItalic = await pdfDoc.embedFont(StandardFonts.TimesRomanBoldItalic);
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const courier = await pdfDoc.embedFont(StandardFonts.Courier); // Monospace for code
  
  const bodyFonts = { regular: timesRoman, bold: timesRomanBold, italic: timesRomanItalic, boldItalic: timesRomanBoldItalic };
  
  const pageWidth = 612;
  const pageHeight = 792;
  const margin = 72;
  const textWidth = pageWidth - (margin * 2);
  
  let pageNumber = 0;
  const pageNumberRef = { current: 0 };
  let currentChapterTitle = "";
  
  const addPageNumber = (page: any, num: number) => {
    if (num > 5) {
      // Page number at bottom center
      page.drawText(String(num - 5), {
        x: pageWidth / 2 - 5,
        y: 30,
        size: 10,
        font: helvetica,
        color: rgb(0.5, 0.5, 0.5),
      });
      // Running header: author left, chapter right
      if (currentChapterTitle) {
        page.drawText(sanitizeForPDF(author), {
          x: margin,
          y: pageHeight - 45,
          size: 8,
          font: helvetica,
          color: rgb(0.6, 0.6, 0.6),
        });
        const truncTitle = currentChapterTitle.length > 50 ? currentChapterTitle.slice(0, 47) + "..." : currentChapterTitle;
        const titleW = helvetica.widthOfTextAtSize(sanitizeForPDF(truncTitle), 8);
        page.drawText(sanitizeForPDF(truncTitle), {
          x: pageWidth - margin - titleW,
          y: pageHeight - 45,
          size: 8,
          font: helvetica,
          color: rgb(0.6, 0.6, 0.6),
        });
      }
    }
  };

  // Cover Page with Image
  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  pageNumber++;
  
  if (coverImageBytes) {
    try {
      let image;
      try {
        image = await pdfDoc.embedPng(coverImageBytes);
      } catch {
        try {
          image = await pdfDoc.embedJpg(coverImageBytes);
        } catch {
          
        }
      }
      
      if (image) {
        const imgAspect = image.width / image.height;
        const pageAspect = pageWidth / pageHeight;
        
        let drawWidth, drawHeight, drawX, drawY;
        
        if (imgAspect > pageAspect) {
          drawHeight = pageHeight;
          drawWidth = drawHeight * imgAspect;
          drawX = (pageWidth - drawWidth) / 2;
          drawY = 0;
        } else {
          drawWidth = pageWidth;
          drawHeight = drawWidth / imgAspect;
          drawX = 0;
          drawY = (pageHeight - drawHeight) / 2;
        }
        
        page.drawImage(image, {
          x: drawX,
          y: drawY,
          width: drawWidth,
          height: drawHeight,
        });
      }
    } catch (error) {
      console.error("[EXPORT] Error embedding cover image:", error);
    }
  }

  // Title Page
  page = pdfDoc.addPage([pageWidth, pageHeight]);
  pageNumber++;
  let y = pageHeight - 200;
  
  page.drawText(book.category?.toUpperCase() || "BOOK", {
    x: margin,
    y,
    size: 12,
    font: helvetica,
    color: rgb(0.6, 0.5, 0.1),
  });
  y -= 50;
  
  const titleLines = wrapText(book.title, timesRomanBold, 28, textWidth);
  for (const line of titleLines) {
    page.drawText(line, {
      x: margin,
      y,
      size: 28,
      font: timesRomanBold,
      color: rgb(0.1, 0.1, 0.1),
    });
    y -= 36;
  }
  y -= 30;
  
  page.drawText(`by ${author}`, {
    x: margin,
    y,
    size: 16,
    font: timesRoman,
    color: rgb(0.3, 0.3, 0.3),
  });
  
  // Academic badge if applicable
  if (isAcademic) {
    page.drawText(`[Academic Content - ${citationStyle} Citations]`, {
      x: margin,
      y: y - 30,
      size: 10,
      font: helvetica,
      color: rgb(0.4, 0.3, 0.1),
    });
  }
  
  page.drawText(`Created with ScrollLibrary - AI-Assisted Content`, {
    x: margin,
    y: margin + 50,
    size: 10,
    font: helvetica,
    color: rgb(0.5, 0.5, 0.5),
  });

  // Copyright Page
  page = pdfDoc.addPage([pageWidth, pageHeight]);
  pageNumber++;
  y = margin + 200;
  
  const copyrightText = [
    `Copyright ${year} ${author}. All rights reserved.`,
    "",
    isISBN ? `ISBN: ${identifier}` : `Scroll Publishing Code: ${identifier}`,
    isISBN ? "" : "(Internal identifier - not an ISBN)",
    "",
    "This work was created with AI assistance under the full authorship",
    "and ownership of the author. The author retains all commercial rights.",
    "",
    `Created with ScrollLibrary`,
  ];
  
  // Add academic disclaimer if needed
  if (isAcademic) {
    copyrightText.push("");
    copyrightText.push("---");
    copyrightText.push("");
    copyrightText.push("ACADEMIC CONTENT NOTICE");
    copyrightText.push("");
    copyrightText.push("All references in this document are retrieved from verifiable");
    copyrightText.push("academic databases including OpenAlex, CrossRef, Semantic Scholar,");
    copyrightText.push("arXiv, and PubMed. ScrollLibrary does not replace academic judgment.");
    copyrightText.push("Users remain responsible for proper academic use and verification");
    copyrightText.push("of all citations before submission.");
  }
  
  for (const line of copyrightText) {
    page.drawText(sanitizeForPDF(line), {
      x: margin,
      y,
      size: 10,
      font: timesRoman,
      color: rgb(0.3, 0.3, 0.3),
    });
    y -= 16;
  }

  // Blank page separator (no hardcoded dedication - user may add their own)
  page = pdfDoc.addPage([pageWidth, pageHeight]);
  pageNumber++;

  // Table of Contents
  page = pdfDoc.addPage([pageWidth, pageHeight]);
  pageNumber++;
  addPageNumber(page, pageNumber);
  y = pageHeight - margin - 50;
  
  page.drawText("TABLE OF CONTENTS", {
    x: margin,
    y,
    size: 18,
    font: timesRomanBold,
    color: rgb(0.1, 0.1, 0.1),
  });
  y -= 50;
  
  for (const chapter of chapters) {
    // Avoid "Chapter X: Chapter X: Title" duplication — check if title already has prefix
    const titleText = /^chapter\s+\d+/i.test(chapter.title)
      ? chapter.title
      : `Chapter ${chapter.chapter_number}: ${chapter.title}`;
    page.drawText(sanitizeForPDF(titleText), {
      x: margin,
      y,
      size: 12,
      font: timesRoman,
      color: rgb(0.2, 0.2, 0.2),
    });
    y -= 24;
    if (y < margin + 50) {
      page = pdfDoc.addPage([pageWidth, pageHeight]);
      pageNumber++;
      addPageNumber(page, pageNumber);
      y = pageHeight - margin - 50;
    }
  }
  
  // Add Bibliography/References entry to TOC if we have any
  if (bibliography.length > 0) {
    y -= 20;
    page.drawText(isAcademic ? "References" : "Bibliography", {
      x: margin,
      y,
      size: 12,
      font: timesRomanBold,
      color: rgb(0.2, 0.2, 0.2),
    });
  }

  // Chapters
  for (const chapter of chapters) {
    currentChapterTitle = chapter.title;
    page = pdfDoc.addPage([pageWidth, pageHeight]);
    pageNumber++;
    addPageNumber(page, pageNumber);
    y = pageHeight - margin - 50;
    
    page.drawText(`CHAPTER ${chapter.chapter_number}`, {
      x: margin,
      y,
      size: 10,
      font: helvetica,
      color: rgb(0.6, 0.5, 0.1),
    });
    y -= 30;
    
    const chapterTitleLines = wrapText(chapter.title, timesRomanBold, 22, textWidth);
    for (const line of chapterTitleLines) {
      page.drawText(line, {
        x: margin,
        y,
        size: 22,
        font: timesRomanBold,
        color: rgb(0.1, 0.1, 0.1),
      });
      y -= 28;
    }
    y -= 30;
    
    // Process content with code block, image, table, and HEADING handling
    // Strip duplicate chapter title from content start (generated content often repeats it)
    let chapterContent = chapter.content || "";
    const titleVariants = [
      chapter.title,
      `Chapter ${chapter.chapter_number}: ${chapter.title}`,
      `Chapter ${chapter.chapter_number}`,
    ];
    for (const variant of titleVariants) {
      // Strip title at start of content (with optional # prefix)
      const escapedVariant = variant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      chapterContent = chapterContent.replace(new RegExp(`^\\s*#{0,6}\\s*${escapedVariant}\\s*\\n+`, 'i'), '');
    }
    
    const { paragraphs, codeBlocks, structuredBlocks, images, customTables, tables: mdTables, headings } = processMarkdownContent(chapterContent);
    
    // SKIP image fetching/embedding in PDF to avoid CPU timeout — use text placeholders instead
    const fetchedImages: Map<number, { bytes: Uint8Array; type: 'png' | 'jpg' }> = new Map();
    
    for (let paraIdx = 0; paraIdx < paragraphs.length; paraIdx++) {
      const paragraph = paragraphs[paraIdx];
      if (!paragraph.trim()) continue;
      
      // Check if this is a HEADING placeholder - render with proper styling
      const headingMatch = paragraph.match(/\[HEADING_(\d+)_LEVEL_(\d+)\]/);
      if (headingMatch) {
        const headingIdx = parseInt(headingMatch[1], 10);
        const headingLevel = parseInt(headingMatch[2], 10);
        const heading = headings[headingIdx];
        if (heading) {
          // Determine font size and styling based on heading level
          const headingSizes = { 1: 18, 2: 16, 3: 14, 4: 13, 5: 12, 6: 11 };
          const headingSize = headingSizes[headingLevel as keyof typeof headingSizes] || 12;
          
          if (y < margin + 50) {
            page = pdfDoc.addPage([pageWidth, pageHeight]);
            pageNumber++;
            addPageNumber(page, pageNumber);
            y = pageHeight - margin - 30;
          }
          
          // Add some spacing before headings
          y -= (headingLevel <= 2 ? 15 : 8);
          
          const headingLines = wrapText(heading.text, timesRomanBold, headingSize, textWidth);
          for (const line of headingLines) {
            page.drawText(line, {
              x: margin,
              y,
              size: headingSize,
              font: timesRomanBold,
              color: rgb(0.1, 0.1, 0.1),
            });
            y -= headingSize + 4;
          }
          y -= 6;
        }
        continue;
      }
      
      // Check if this is an image placeholder (for comics)
      const imageMatch = paragraph.match(/\[IMAGE_(\d+)\]/);
      if (imageMatch) {
        const imgIndex = parseInt(imageMatch[1]);
        const imgInfo = fetchedImages.get(imgIndex);
        const imgMeta = images[imgIndex];
        
        if (imgInfo) {
          // Add new page if needed for image
          const imgHeight = 300; // Fixed height for comic panels
          if (y - imgHeight < margin + 30) {
            page = pdfDoc.addPage([pageWidth, pageHeight]);
            pageNumber++;
            addPageNumber(page, pageNumber);
            y = pageHeight - margin - 30;
          }
          
          try {
            let image;
            if (imgInfo.type === 'png') {
              image = await pdfDoc.embedPng(imgInfo.bytes);
            } else {
              image = await pdfDoc.embedJpg(imgInfo.bytes);
            }
            
            // Calculate dimensions to fit in page width while maintaining aspect ratio
            const imgAspect = image.width / image.height;
            let drawWidth = textWidth;
            let drawHeight = drawWidth / imgAspect;
            
            // Limit max height
            if (drawHeight > 350) {
              drawHeight = 350;
              drawWidth = drawHeight * imgAspect;
            }
            
            // Center the image
            const drawX = margin + (textWidth - drawWidth) / 2;
            
            page.drawImage(image, {
              x: drawX,
              y: y - drawHeight,
              width: drawWidth,
              height: drawHeight,
            });
            
            y -= drawHeight + 10;
            
            // Add caption if available - MUST sanitize
            if (imgMeta?.alt && imgMeta.alt !== 'Image') {
              page.drawText(sanitizeForPDF(imgMeta.alt), {
                x: margin,
                y,
                size: 9,
                font: helvetica,
                color: rgb(0.4, 0.4, 0.4),
              });
              y -= 20;
            }
          } catch (error) {
            console.error(`[EXPORT] Failed to embed image ${imgIndex}:`, error);
            // Draw placeholder text - MUST sanitize
            page.drawText(sanitizeForPDF(`[Image: ${imgMeta?.alt || 'Panel'}]`), {
              x: margin,
              y,
              size: 10,
              font: helvetica,
              color: rgb(0.6, 0.6, 0.6),
            });
            y -= 20;
          }
        } else {
          // Image not found - draw placeholder - MUST sanitize
          page.drawText(sanitizeForPDF(`[Image not available: ${imgMeta?.alt || 'Panel'}]`), {
            x: margin,
            y,
            size: 10,
            font: helvetica,
            color: rgb(0.6, 0.6, 0.6),
          });
          y -= 20;
        }
        continue;
      }
      
      // Check if this is a code block placeholder
      const codeMatch = paragraph.match(/\[CODE_BLOCK_(\d+)\]/);
      if (codeMatch) {
        const blockIndex = parseInt(codeMatch[1]);
        const block = codeBlocks[blockIndex];
        if (block) {
          // Render code block with monospace font
          y -= 10;
          
          const codeLines = block.code.split('\n');
          
          // If code fits on current page, draw background rectangle + code
          // Otherwise render line-by-line with page breaks
          const codeHeight = codeLines.length * 12 + 30;
          const fitsOnPage = (y - codeHeight) >= (margin + 30);
          
          if (fitsOnPage) {
            // Draw background rectangle
            page.drawRectangle({
              x: margin - 5,
              y: y - codeHeight + 10,
              width: textWidth + 10,
              height: codeHeight,
              color: rgb(0.95, 0.95, 0.95),
            });
          }
          
          if (!fitsOnPage && y < margin + 60) {
            page = pdfDoc.addPage([pageWidth, pageHeight]);
            pageNumber++;
            pageNumberRef.current = pageNumber;
            addPageNumber(page, pageNumber);
            y = pageHeight - margin - 30;
          }
          
          // Language label
          page.drawText(block.lang.toUpperCase(), {
            x: margin,
            y: y,
            size: 8,
            font: helvetica,
            color: rgb(0.5, 0.5, 0.5),
          });
          y -= 15;
          
          // Code content — render line by line with page break support
          for (const codeLine of codeLines) {
            if (y < margin + 30) {
              page = pdfDoc.addPage([pageWidth, pageHeight]);
              pageNumber++;
              pageNumberRef.current = pageNumber;
              addPageNumber(page, pageNumber);
              y = pageHeight - margin - 30;
            }
            
            // Draw line background for non-rectangle mode
            if (!fitsOnPage) {
              page.drawRectangle({
                x: margin - 5,
                y: y - 3,
                width: textWidth + 10,
                height: 14,
                color: rgb(0.95, 0.95, 0.95),
              });
            }
            
            page.drawText(sanitizeForPDF(codeLine.slice(0, 100)), {
              x: margin,
              y,
              size: 9,
              font: courier,
              color: rgb(0.2, 0.2, 0.2),
            });
            y -= 12;
          }
          y -= 10;
          continue;
        }
      }
      
      // Check if this is a STRUCTURED code block placeholder (ChatGPT-level format)
      const structuredMatch = paragraph.match(/\[STRUCTURED_CODE_(\d+)\]/);
      if (structuredMatch) {
        const blockIndex = parseInt(structuredMatch[1]);
        const block = structuredBlocks[blockIndex];
        if (block) {
          y -= 10;
          
          // Calculate total height needed for the structured block
          const codeLines = block.code.split('\n');
          let blockHeight = 40; // Header + padding
          blockHeight += codeLines.length * 12 + 20; // Code
          if (block.purpose) blockHeight += 20;
          if (block.output) blockHeight += (block.output.split('\n').length * 12) + 30;
          if (block.explanation) blockHeight += 30;
          if (block.commonMistake) blockHeight += 30;
          
          if (y - blockHeight < margin + 30) {
            page = pdfDoc.addPage([pageWidth, pageHeight]);
            pageNumber++;
            addPageNumber(page, pageNumber);
            y = pageHeight - margin - 30;
          }
          
          // Header bar with language tag
          page.drawRectangle({
            x: margin - 5,
            y: y - 20,
            width: textWidth + 10,
            height: 25,
            color: rgb(0.92, 0.92, 0.92),
          });
          
          page.drawText(`[${block.language.toUpperCase()}]${block.title ? ' - ' + sanitizeForPDF(block.title) : ''}`, {
            x: margin,
            y: y - 14,
            size: 10,
            font: timesRomanBold,
            color: rgb(0.2, 0.2, 0.2),
          });
          y -= 25;
          
          // Purpose statement
          if (block.purpose) {
            page.drawText(sanitizeForPDF(`Purpose: ${block.purpose}`), {
              x: margin,
              y: y - 12,
              size: 9,
              font: helvetica,
              color: rgb(0.4, 0.4, 0.4),
            });
            y -= 18;
          }
          
          // Code content — render line by line with page break support
          y -= 5;
          for (const codeLine of codeLines) {
            if (y < margin + 30) {
              page = pdfDoc.addPage([pageWidth, pageHeight]);
              pageNumber++;
              pageNumberRef.current = pageNumber;
              addPageNumber(page, pageNumber);
              y = pageHeight - margin - 30;
            }
            
            // Per-line dark background
            page.drawRectangle({
              x: margin - 5,
              y: y - 3,
              width: textWidth + 10,
              height: 14,
              color: rgb(0.12, 0.12, 0.15),
            });
            
            page.drawText(sanitizeForPDF(codeLine.slice(0, 100)), {
              x: margin,
              y,
              size: 9,
              font: courier,
              color: rgb(0.9, 0.9, 0.9),
            });
            y -= 12;
          }
          y -= 5;
          
          // Output section
          if (block.output) {
            if (y < margin + 40) {
              page = pdfDoc.addPage([pageWidth, pageHeight]);
              pageNumber++;
              pageNumberRef.current = pageNumber;
              addPageNumber(page, pageNumber);
              y = pageHeight - margin - 30;
            }
            
            page.drawText("OUTPUT:", {
              x: margin,
              y,
              size: 8,
              font: helvetica,
              color: rgb(0.4, 0.8, 0.4),
            });
            y -= 15;
            
            for (const outLine of block.output.split('\n')) {
              if (y < margin + 30) {
                page = pdfDoc.addPage([pageWidth, pageHeight]);
                pageNumber++;
                pageNumberRef.current = pageNumber;
                addPageNumber(page, pageNumber);
                y = pageHeight - margin - 30;
              }
              page.drawRectangle({
                x: margin - 5, y: y - 3, width: textWidth + 10, height: 14,
                color: rgb(0.08, 0.10, 0.08),
              });
              page.drawText(sanitizeForPDF(outLine.slice(0, 100)), {
                x: margin, y, size: 9, font: courier,
                color: rgb(0.4, 0.9, 0.4),
              });
              y -= 12;
            }
            y -= 5;
          }
          
          // Explanation
          if (block.explanation) {
            const explLines = wrapText(`Explanation: ${block.explanation}`, timesRoman, 9, textWidth);
            for (const line of explLines) {
              if (y < margin + 30) {
                page = pdfDoc.addPage([pageWidth, pageHeight]);
                pageNumber++;
                pageNumberRef.current = pageNumber;
                addPageNumber(page, pageNumber);
                y = pageHeight - margin - 30;
              }
              page.drawText(line, {
                x: margin, y, size: 9, font: timesRoman,
                color: rgb(0.3, 0.3, 0.3),
              });
              y -= 12;
            }
            y -= 5;
          }
          
          // Common mistake warning
          if (block.commonMistake) {
            page.drawRectangle({
              x: margin - 5,
              y: y - 25,
              width: textWidth + 10,
              height: 25,
              color: rgb(0.95, 0.90, 0.90),
            });
            const warnLines = wrapText(`⚠ Common Mistake: ${block.commonMistake}`, timesRoman, 9, textWidth - 10);
            for (const line of warnLines) {
              page.drawText(sanitizeForPDF(line), {
                x: margin,
                y: y - 12,
                size: 9,
                font: timesRoman,
                color: rgb(0.6, 0.2, 0.2),
              });
              y -= 12;
            }
            y -= 5;
          }
          
          y -= 15;
          continue;
        }
      }
      
      // Check if this is a custom table placeholder
      const customTableMatch = paragraph.match(/\[CUSTOM_TABLE_(\d+)\]/);
      if (customTableMatch) {
        const tableIndex = parseInt(customTableMatch[1]);
        const table = customTables[tableIndex];
        if (table) {
          y -= 10;
          
          const numCols = Math.min(table.headers.length, 6);
          const colWidth = textWidth / numCols;
          const cellFontSize = 8;
          const cellLineHeight = cellFontSize + 3;
          const cellPadding = 6;
          const headerHeight = 22;
          
          // Calculate dynamic row heights
          const rowHeights: number[] = [];
          for (const row of table.rows) {
            let maxLines = 1;
            for (let colIdx = 0; colIdx < numCols && colIdx < row.length; colIdx++) {
              const cellText = stripInlineMarkdown((row[colIdx] || '').slice(0, 80));
              const wrapped = wrapText(cellText, timesRoman, cellFontSize, colWidth - 10);
              maxLines = Math.max(maxLines, wrapped.length);
            }
            rowHeights.push(maxLines * cellLineHeight + cellPadding);
          }
          
          const totalTableHeight = headerHeight + rowHeights.reduce((s, h) => s + h, 0) + 30;
          
          if (y - Math.min(totalTableHeight, 200) < margin + 30) {
            page = pdfDoc.addPage([pageWidth, pageHeight]);
            pageNumber++;
            addPageNumber(page, pageNumber);
            y = pageHeight - margin - 30;
          }
          
          page.drawText(sanitizeForPDF(stripInlineMarkdown(table.name)), {
            x: margin, y, size: 11,
            font: timesRomanBold, color: rgb(0.1, 0.1, 0.1),
          });
          y -= 20;
          
          page.drawRectangle({
            x: margin, y: y - headerHeight + 5,
            width: textWidth, height: headerHeight,
            color: rgb(0.92, 0.92, 0.92),
          });
          
          for (let i = 0; i < numCols; i++) {
            const headerText = sanitizeForPDF(stripInlineMarkdown((table.headers[i] || '').slice(0, 40)));
            page.drawText(headerText, {
              x: margin + (i * colWidth) + 5, y: y - 12,
              size: 9, font: timesRomanBold, color: rgb(0.1, 0.1, 0.1),
            });
          }
          y -= headerHeight;
          
          for (let rowIdx = 0; rowIdx < table.rows.length; rowIdx++) {
            const row = table.rows[rowIdx];
            const rowH = rowHeights[rowIdx];
            
            if (y - rowH < margin + 30) {
              page = pdfDoc.addPage([pageWidth, pageHeight]);
              pageNumber++;
              addPageNumber(page, pageNumber);
              y = pageHeight - margin - 30;
            }
            
            if (rowIdx % 2 === 1) {
              page.drawRectangle({
                x: margin, y: y - rowH + 5,
                width: textWidth, height: rowH,
                color: rgb(0.97, 0.97, 0.97),
              });
            }
            
            for (let colIdx = 0; colIdx < row.length && colIdx < numCols; colIdx++) {
              const cellText = sanitizeForPDF(stripInlineMarkdown((row[colIdx] || '').slice(0, 80)));
              const wrapped = wrapText(cellText, timesRoman, cellFontSize, colWidth - 10);
              let cellY = y - cellLineHeight;
              for (const line of wrapped) {
                page.drawText(line, {
                  x: margin + (colIdx * colWidth) + 5, y: cellY,
                  size: cellFontSize, font: timesRoman, color: rgb(0.2, 0.2, 0.2),
                });
                cellY -= cellLineHeight;
              }
            }
            y -= rowH;
          }
          
          y -= 15;
          continue;
        }
      }
      
      // Check if this is a markdown table placeholder (new format)
      const mdTableMatch = paragraph.match(/\[MD_TABLE_(\d+)\]/);
      if (mdTableMatch) {
        const tableIndex = parseInt(mdTableMatch[1]);
        const table = mdTables[tableIndex];
        if (table) {
          // Render markdown table with dynamic row heights
          y -= 10;
          
          const numCols = Math.min(table.headers.length, 6);
          const colWidth = textWidth / numCols;
          const cellFontSize = 8;
          const cellLineHeight = cellFontSize + 3;
          const cellPadding = 6;
          const headerHeight = 22;
          
          // Calculate dynamic row heights based on wrapped text
          const rowHeights: number[] = [];
          for (const row of table.rows) {
            let maxLines = 1;
            for (let colIdx = 0; colIdx < numCols && colIdx < row.length; colIdx++) {
              const cellText = stripInlineMarkdown((row[colIdx] || '').slice(0, 80));
              const wrapped = wrapText(cellText, timesRoman, cellFontSize, colWidth - 10);
              maxLines = Math.max(maxLines, wrapped.length);
            }
            rowHeights.push(maxLines * cellLineHeight + cellPadding);
          }
          
          const totalTableHeight = headerHeight + rowHeights.reduce((s, h) => s + h, 0) + 30;
          
          // Start table on new page if it won't fit
          if (y - Math.min(totalTableHeight, 200) < margin + 30) {
            page = pdfDoc.addPage([pageWidth, pageHeight]);
            pageNumber++;
            addPageNumber(page, pageNumber);
            y = pageHeight - margin - 30;
          }
          
          // Table title
          if (table.name && table.name !== 'Table') {
            page.drawText(sanitizeForPDF(stripInlineMarkdown(table.name)), {
              x: margin, y, size: 11,
              font: timesRomanBold, color: rgb(0.1, 0.1, 0.1),
            });
            y -= 20;
          }
          
          // Header background
          page.drawRectangle({
            x: margin, y: y - headerHeight + 5,
            width: textWidth, height: headerHeight,
            color: rgb(0.92, 0.92, 0.92),
          });
          
          // Header text
          for (let i = 0; i < numCols; i++) {
            const headerText = sanitizeForPDF(stripInlineMarkdown((table.headers[i] || '').slice(0, 40)));
            page.drawText(headerText, {
              x: margin + (i * colWidth) + 5, y: y - 12,
              size: 9, font: timesRomanBold, color: rgb(0.1, 0.1, 0.1),
            });
          }
          y -= headerHeight;
          
          // Rows with dynamic height and text wrapping
          for (let rowIdx = 0; rowIdx < table.rows.length; rowIdx++) {
            const row = table.rows[rowIdx];
            const rowH = rowHeights[rowIdx];
            
            // Page break check
            if (y - rowH < margin + 30) {
              page = pdfDoc.addPage([pageWidth, pageHeight]);
              pageNumber++;
              addPageNumber(page, pageNumber);
              y = pageHeight - margin - 30;
            }
            
            // Alternate row background
            if (rowIdx % 2 === 1) {
              page.drawRectangle({
                x: margin, y: y - rowH + 5,
                width: textWidth, height: rowH,
                color: rgb(0.97, 0.97, 0.97),
              });
            }
            
            // Draw cell text with wrapping
            for (let colIdx = 0; colIdx < numCols && colIdx < row.length; colIdx++) {
              const cellText = sanitizeForPDF(stripInlineMarkdown((row[colIdx] || '').slice(0, 80)));
              const wrapped = wrapText(cellText, timesRoman, cellFontSize, colWidth - 10);
              let cellY = y - cellLineHeight;
              for (const line of wrapped) {
                page.drawText(line, {
                  x: margin + (colIdx * colWidth) + 5, y: cellY,
                  size: cellFontSize, font: timesRoman, color: rgb(0.2, 0.2, 0.2),
                });
                cellY -= cellLineHeight;
              }
            }
            y -= rowH;
          }
          
          y -= 15;
          continue;
        }
      }
      
      
      // Detect bullet or numbered list items
      const isBullet = /^\u2022\s/.test(paragraph.trim());
      const isNumbered = /^\d+\.\s/.test(paragraph.trim());
      const indent = (isBullet || isNumbered) ? 15 : 0;
      const effectiveWidth = textWidth - indent;
      
      // Check if paragraph has bold/italic markers
      const hasFormatting = /\*/.test(paragraph);
      
      if (hasFormatting) {
        // Use styled paragraph renderer for inline bold/italic with page break support
        if (y < margin + 50) {
          page = pdfDoc.addPage([pageWidth, pageHeight]);
          pageNumber++;
          pageNumberRef.current = pageNumber;
          addPageNumber(page, pageNumber);
          y = pageHeight - margin - 30;
        }
        pageNumberRef.current = pageNumber;
        const styledResult = drawStyledParagraph(page, paragraph.trim(), margin + indent, y, effectiveWidth, 11, bodyFonts, rgb(0.1, 0.1, 0.1), pdfDoc, pageWidth, pageHeight, margin, addPageNumber, pageNumberRef);
        y = styledResult.y;
        page = styledResult.page;
        pageNumber = pageNumberRef.current;
      } else {
        const lines = wrapText(paragraph.trim(), timesRoman, 11, effectiveWidth);
        for (const line of lines) {
          if (y < margin + 30) {
            page = pdfDoc.addPage([pageWidth, pageHeight]);
            pageNumber++;
            pageNumberRef.current = pageNumber;
            addPageNumber(page, pageNumber);
            y = pageHeight - margin - 30;
          }
          
          page.drawText(line, {
            x: margin + indent,
            y,
            size: 11,
            font: timesRoman,
            color: rgb(0.1, 0.1, 0.1),
          });
          y -= 16;
        }
      }
      // Less spacing after list items, more after paragraphs
      y -= (isBullet || isNumbered) ? 3 : 8;
    }
  }

  // Bibliography/References section for ALL books with citations
  if (bibliography.length > 0) {
    page = pdfDoc.addPage([pageWidth, pageHeight]);
    pageNumber++;
    addPageNumber(page, pageNumber);
    y = pageHeight - margin - 50;
    
    page.drawText(isAcademic ? "REFERENCES" : "BIBLIOGRAPHY", {
      x: margin,
      y,
      size: 18,
      font: timesRomanBold,
      color: rgb(0.1, 0.1, 0.1),
    });
    y -= 40;
    
    if (isAcademic) {
      page.drawText(`Citation Style: ${citationStyle}`, {
        x: margin,
        y,
        size: 10,
        font: helvetica,
        color: rgb(0.5, 0.5, 0.5),
      });
      y -= 30;
    }
    
    
    for (const ref of bibliography) {
      const refLines = wrapText(ref, timesRoman, 10, textWidth - 20);
      
      for (let i = 0; i < refLines.length; i++) {
        if (y < margin + 30) {
          page = pdfDoc.addPage([pageWidth, pageHeight]);
          pageNumber++;
          addPageNumber(page, pageNumber);
          y = pageHeight - margin - 30;
        }
        
        page.drawText(refLines[i], {
          x: margin + (i > 0 ? 20 : 0), // Hanging indent
          y,
          size: 10,
          font: timesRoman,
          color: rgb(0.2, 0.2, 0.2),
        });
        y -= 14;
      }
      y -= 8;
    }
    
    // Footer note
    if (isAcademic) {
      y -= 20;
      page.drawText("All references are retrieved from verifiable academic databases.", {
        x: margin,
        y,
        size: 9,
        font: helvetica,
        color: rgb(0.4, 0.4, 0.4),
      });
    }
  }

  // About the Author Page
  currentChapterTitle = "";
  page = pdfDoc.addPage([pageWidth, pageHeight]);
  pageNumber++;
  y = pageHeight - margin - 80;
  
  page.drawText("ABOUT THE AUTHOR", {
    x: margin,
    y,
    size: 18,
    font: timesRomanBold,
    color: rgb(0.1, 0.1, 0.1),
  });
  y -= 50;
  
  const aboutLines = wrapText(
    `${author} is the author of "${book.title}". ` +
    `This work reflects a commitment to advancing knowledge and thought leadership ` +
    `in the field of ${book.category?.replace(/_/g, ' ') || 'general studies'}. ` +
    `The author retains full ownership and commercial rights to this publication.`,
    timesRoman, 12, textWidth
  );
  for (const line of aboutLines) {
    page.drawText(line, {
      x: margin,
      y,
      size: 12,
      font: timesRoman,
      color: rgb(0.2, 0.2, 0.2),
    });
    y -= 18;
  }

  // Set PDF metadata for professional publishing
  pdfDoc.setTitle(book.title);
  pdfDoc.setAuthor(author);
  pdfDoc.setSubject(book.category?.replace(/_/g, ' ') || 'Book');
  pdfDoc.setCreator('ScrollLibrary');
  pdfDoc.setProducer('ScrollLibrary Export Engine');
  
  return pdfDoc.save();
}

function wrapText(text: string, font: any, fontSize: number, maxWidth: number): string[] {
  // Sanitize text for PDF WinAnsi encoding before measuring/wrapping
  const sanitizedText = sanitizeForPDF(text);
  const words = sanitizedText.split(/\s+/);
  const lines: string[] = [];
  let currentLine = "";
  
  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    const width = font.widthOfTextAtSize(testLine, fontSize);
    
    if (width <= maxWidth) {
      currentLine = testLine;
    } else {
      if (currentLine) lines.push(currentLine);
      currentLine = word;
    }
  }
  
  if (currentLine) lines.push(currentLine);
  return lines;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ===== KDP-COMPLIANT PDF Generation =====
// Amazon KDP requires specific trim sizes, margins, and formatting
async function generateKDPPDF(
  book: any,
  chapters: any[],
  author: string,
  identifier: string,
  isISBN: boolean,
  year: number,
  coverImageBytes: Uint8Array | null,
  isAcademic: boolean,
  citationStyle: string,
  bibliography: string[],
  trimSize: { width: number; height: number; name: string },
  useBleed: boolean,
  ctx: ExportContext,
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const timesRoman = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  const timesRomanBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
  const timesRomanItalic = await pdfDoc.embedFont(StandardFonts.TimesRomanItalic);
  const timesRomanBoldItalic = await pdfDoc.embedFont(StandardFonts.TimesRomanBoldItalic);
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const courier = await pdfDoc.embedFont(StandardFonts.Courier);

  const pageWidth = trimSize.width;
  const pageHeight = trimSize.height;

  // Estimate page count for gutter margin calculation
  const totalWords = chapters.reduce((sum: number, ch: any) => sum + (ch.content?.split(/\s+/).length || 0), 0);
  const estimatedPages = Math.max(24, Math.ceil(totalWords / 250) + 10);
  const margins = getKDPMargins(estimatedPages, useBleed);

  const textWidth = pageWidth - margins.inside - margins.outside;
  const textTop = pageHeight - margins.top - 20;
  const textBottom = margins.bottom + 15;

  let pageNumber = 0;
  let currentChapterTitle = "";

  const addRunningHeader = (page: any, num: number, isRecto: boolean) => {
    if (num <= 4) return;
    const displayNum = num - 4;
    const numStr = String(displayNum);
    const numW = helvetica.widthOfTextAtSize(numStr, 9);
    const numX = isRecto ? pageWidth - margins.outside - numW : margins.outside;
    page.drawText(numStr, {
      x: numX, y: margins.bottom, size: 9, font: helvetica, color: rgb(0.4, 0.4, 0.4),
    });
    if (currentChapterTitle) {
      const headerText = isRecto
        ? (currentChapterTitle.length > 40 ? currentChapterTitle.slice(0, 37) + '...' : currentChapterTitle)
        : author;
      const headerW = helvetica.widthOfTextAtSize(sanitizeForPDF(headerText), 8);
      const headerX = isRecto ? pageWidth - margins.outside - headerW : margins.outside;
      page.drawText(sanitizeForPDF(headerText), {
        x: headerX, y: pageHeight - margins.top - 5, size: 8, font: helvetica, color: rgb(0.5, 0.5, 0.5),
      });
    }
  };

  // Helper to get left margin based on page side
  const getLeftMargin = (pNum: number) => pNum % 2 === 1 ? margins.inside : margins.outside;

  // ---- Half Title Page ----
  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  pageNumber++;
  const titleW = timesRomanBold.widthOfTextAtSize(sanitizeForPDF(book.title), 18);
  page.drawText(sanitizeForPDF(book.title), {
    x: (pageWidth - Math.min(titleW, textWidth)) / 2,
    y: pageHeight * 0.6,
    size: 18, font: timesRomanBold, color: rgb(0, 0, 0),
  });

  // ---- Title Page ----
  page = pdfDoc.addPage([pageWidth, pageHeight]);
  pageNumber++;
  let y = pageHeight * 0.65;
  const fullTitleW = timesRomanBold.widthOfTextAtSize(sanitizeForPDF(book.title), 22);
  page.drawText(sanitizeForPDF(book.title), {
    x: (pageWidth - Math.min(fullTitleW, textWidth)) / 2,
    y, size: 22, font: timesRomanBold, color: rgb(0, 0, 0),
  });
  y -= 36;
  const byW = timesRomanItalic.widthOfTextAtSize(sanitizeForPDF(author), 13);
  page.drawText(sanitizeForPDF(author), {
    x: (pageWidth - byW) / 2, y, size: 13, font: timesRomanItalic, color: rgb(0.2, 0.2, 0.2),
  });

  // ---- Copyright Page ----
  page = pdfDoc.addPage([pageWidth, pageHeight]);
  pageNumber++;
  y = pageHeight * 0.45;
  const copyrightLines = [
    `Copyright \u00A9 ${year} ${author}`,
    'All rights reserved.',
    '',
    isISBN ? `ISBN: ${identifier}` : `Reference: ${identifier}`,
    '',
    `Trim Size: ${trimSize.name}`,
    '',
    'This book was created with AI assistance via ScrollLibrary.',
    'The author retains full ownership and commercial rights.',
    '',
    'No part of this publication may be reproduced, distributed,',
    'or transmitted in any form without prior written permission.',
  ];
  for (const line of copyrightLines) {
    page.drawText(sanitizeForPDF(line), {
      x: getLeftMargin(pageNumber), y, size: 9, font: timesRoman, color: rgb(0.3, 0.3, 0.3),
    });
    y -= 13;
  }

  // ---- Table of Contents ----
  page = pdfDoc.addPage([pageWidth, pageHeight]);
  pageNumber++;
  y = textTop - 30;
  const tocTitleW2 = timesRomanBold.widthOfTextAtSize('Contents', 16);
  page.drawText('Contents', {
    x: (pageWidth - tocTitleW2) / 2, y: textTop, size: 16, font: timesRomanBold, color: rgb(0, 0, 0),
  });
  y -= 25;
  for (const chapter of chapters) {
    const chTitle = `${chapter.chapter_number}. ${chapter.title}`;
    const displayTitle = chTitle.length > 50 ? chTitle.slice(0, 47) + '...' : chTitle;
    page.drawText(sanitizeForPDF(displayTitle), {
      x: getLeftMargin(pageNumber), y, size: 10.5, font: timesRoman, color: rgb(0, 0, 0),
    });
    y -= 16;
    if (y < textBottom + 20) {
      page = pdfDoc.addPage([pageWidth, pageHeight]);
      pageNumber++;
      y = textTop - 20;
    }
  }

  // ---- Chapter Content ----
  const bodySize = 11;
  const lineHeight = bodySize * 1.4;

  for (const chapter of chapters) {
    // Each chapter starts on a recto (odd) page — KDP convention
    if (pageNumber % 2 === 0) {
      pdfDoc.addPage([pageWidth, pageHeight]); // blank verso
      pageNumber++;
    }
    page = pdfDoc.addPage([pageWidth, pageHeight]);
    pageNumber++;
    currentChapterTitle = chapter.title;
    let leftMargin = getLeftMargin(pageNumber);

    // Chapter opening: drop the title down from top
    y = textTop - 50;
    const chNumText = `Chapter ${chapter.chapter_number}`;
    const chNumW = helvetica.widthOfTextAtSize(chNumText, 10);
    page.drawText(chNumText, {
      x: (pageWidth - chNumW) / 2, y: textTop - 20, size: 10, font: helvetica, color: rgb(0.5, 0.5, 0.5),
    });
    const chNameText = sanitizeForPDF(chapter.title.length > 45 ? chapter.title.slice(0, 42) + '...' : chapter.title);
    const chNameW = timesRomanBold.widthOfTextAtSize(chNameText, 15);
    page.drawText(chNameText, {
      x: (pageWidth - Math.min(chNameW, textWidth)) / 2, y, size: 15, font: timesRomanBold, color: rgb(0, 0, 0),
    });
    y -= 30;

    // Decorative rule
    page.drawLine({
      start: { x: pageWidth * 0.35, y }, end: { x: pageWidth * 0.65, y },
      thickness: 0.5, color: rgb(0.75, 0.75, 0.75),
    });
    y -= 18;

    if (!chapter.content) continue;

    // Strip duplicate chapter title from content start (KDP)
    let kdpChapterContent = chapter.content;
    const kdpTitleVariants = [
      chapter.title,
      `Chapter ${chapter.chapter_number}: ${chapter.title}`,
      `Chapter ${chapter.chapter_number}`,
    ];
    for (const variant of kdpTitleVariants) {
      const escapedVariant = variant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      kdpChapterContent = kdpChapterContent.replace(new RegExp(`^\\s*#{0,6}\\s*${escapedVariant}\\s*\\n+`, 'i'), '');
    }

    const processed = processMarkdownContent(kdpChapterContent);
    for (const para of processed.paragraphs) {
      const trimmed = para.trim();
      if (!trimmed) { y -= lineHeight * 0.4; continue; }

      // Heading
      const headingMatch = trimmed.match(/\[HEADING_(\d+)_LEVEL_(\d+)\]/);
      if (headingMatch) {
        const hIdx = parseInt(headingMatch[1]);
        const heading = processed.headings[hIdx];
        if (heading) {
          y -= lineHeight * 0.6;
          const hSize = heading.level <= 2 ? 13 : 11.5;
          if (y < textBottom + 25) {
            addRunningHeader(page, pageNumber, pageNumber % 2 === 1);
            page = pdfDoc.addPage([pageWidth, pageHeight]);
            pageNumber++;
            leftMargin = getLeftMargin(pageNumber);
            y = textTop - 15;
          }
          page.drawText(sanitizeForPDF(heading.text), {
            x: leftMargin, y, size: hSize, font: timesRomanBold, color: rgb(0, 0, 0),
          });
          y -= hSize * 1.6;
        }
        continue;
      }

      // Code block
      const codeMatch = trimmed.match(/\[CODE_BLOCK_(\d+)\]/);
      if (codeMatch) {
        const block = processed.codeBlocks[parseInt(codeMatch[1])];
        if (block) {
          y -= 4;
          // Language label
          if (y < textBottom + 20) {
            addRunningHeader(page, pageNumber, pageNumber % 2 === 1);
            page = pdfDoc.addPage([pageWidth, pageHeight]);
            pageNumber++;
            leftMargin = getLeftMargin(pageNumber);
            y = textTop - 15;
          }
          page.drawText(block.lang.toUpperCase(), {
            x: leftMargin, y, size: 7, font: helvetica, color: rgb(0.5, 0.5, 0.5),
          });
          y -= 12;
          const codeLines = block.code.split('\n');
          for (let cli = 0; cli < codeLines.length; cli++) {
            if (y < textBottom + 12) {
              addRunningHeader(page, pageNumber, pageNumber % 2 === 1);
              page = pdfDoc.addPage([pageWidth, pageHeight]);
              pageNumber++;
              leftMargin = getLeftMargin(pageNumber);
              y = textTop - 15;
            }
            page.drawRectangle({ x: leftMargin - 3, y: y - 3, width: textWidth + 6, height: lineHeight * 0.85, color: rgb(0.96, 0.96, 0.96) });
            page.drawText(sanitizeForPDF(codeLines[cli].slice(0, 90)), {
              x: leftMargin, y, size: 8, font: courier, color: rgb(0.15, 0.15, 0.15),
            });
            y -= lineHeight * 0.85;
          }
          y -= 6;
        }
        continue;
      }

      // Structured code block
      const structuredMatch = trimmed.match(/\[STRUCTURED_CODE_(\d+)\]/);
      if (structuredMatch) {
        const block = processed.structuredBlocks[parseInt(structuredMatch[1])];
        if (block) {
          y -= 6;
          if (y < textBottom + 60) {
            addRunningHeader(page, pageNumber, pageNumber % 2 === 1);
            page = pdfDoc.addPage([pageWidth, pageHeight]);
            pageNumber++;
            leftMargin = getLeftMargin(pageNumber);
            y = textTop - 15;
          }
          // Header bar
          page.drawRectangle({ x: leftMargin - 3, y: y - 18, width: textWidth + 6, height: 22, color: rgb(0.92, 0.92, 0.92) });
          page.drawText(sanitizeForPDF(`[${block.language.toUpperCase()}]${block.title ? ' - ' + block.title : ''}`), {
            x: leftMargin, y: y - 12, size: 9, font: timesRomanBold, color: rgb(0.2, 0.2, 0.2),
          });
          y -= 24;
          if (block.purpose) {
            page.drawText(sanitizeForPDF(`Purpose: ${block.purpose}`), {
              x: leftMargin, y: y - 10, size: 8, font: helvetica, color: rgb(0.4, 0.4, 0.4),
            });
            y -= 16;
          }
          const structCodeLines = block.code.split('\n');
          for (let cli = 0; cli < structCodeLines.length; cli++) {
            if (y < textBottom + 12) {
              addRunningHeader(page, pageNumber, pageNumber % 2 === 1);
              page = pdfDoc.addPage([pageWidth, pageHeight]);
              pageNumber++;
              leftMargin = getLeftMargin(pageNumber);
              y = textTop - 15;
            }
            page.drawRectangle({ x: leftMargin - 3, y: y - 3, width: textWidth + 6, height: lineHeight * 0.85, color: rgb(0.12, 0.12, 0.15) });
            page.drawText(sanitizeForPDF(structCodeLines[cli].slice(0, 90)), {
              x: leftMargin, y, size: 8, font: courier, color: rgb(0.9, 0.9, 0.9),
            });
            y -= lineHeight * 0.85;
          }
          if (block.output) {
            y -= 4;
            page.drawText("OUTPUT:", { x: leftMargin, y, size: 7, font: helvetica, color: rgb(0.3, 0.7, 0.3) });
            y -= 12;
            const outLines = block.output.split('\n');
            for (let oli = 0; oli < outLines.length; oli++) {
              if (y < textBottom + 12) {
                addRunningHeader(page, pageNumber, pageNumber % 2 === 1);
                page = pdfDoc.addPage([pageWidth, pageHeight]);
                pageNumber++;
                leftMargin = getLeftMargin(pageNumber);
                y = textTop - 15;
              }
              page.drawRectangle({ x: leftMargin - 3, y: y - 3, width: textWidth + 6, height: lineHeight * 0.85, color: rgb(0.08, 0.10, 0.08) });
              page.drawText(sanitizeForPDF(outLines[oli].slice(0, 90)), {
                x: leftMargin, y, size: 8, font: courier, color: rgb(0.4, 0.9, 0.4),
              });
              y -= lineHeight * 0.85;
            }
          }
          y -= 10;
        }
        continue;
      }

      // Markdown table (KDP)
      const mdTableMatch = trimmed.match(/\[MD_TABLE_(\d+)\]/);
      if (mdTableMatch) {
        const table = processed.tables[parseInt(mdTableMatch[1])];
        if (table) {
          y -= 8;
          const numCols = Math.min(table.headers.length, 5);
          const colWidth = textWidth / numCols;
          const cellFontSize = 7.5;
          const cellLineH = cellFontSize + 2.5;
          const cellPad = 5;
          const headerHeight = 18;
          
          // Dynamic row heights
          const kdpRowHeights: number[] = [];
          for (const row of table.rows) {
            let maxLines = 1;
            for (let c = 0; c < numCols && c < row.length; c++) {
              const ct = stripInlineMarkdown((row[c] || '').slice(0, 60));
              const wr = wrapText(ct, timesRoman, cellFontSize, colWidth - 8);
              maxLines = Math.max(maxLines, wr.length);
            }
            kdpRowHeights.push(maxLines * cellLineH + cellPad);
          }
          
          const totalH = headerHeight + kdpRowHeights.reduce((s, h) => s + h, 0) + 20;
          if (y - Math.min(totalH, 150) < textBottom + 20) {
            addRunningHeader(page, pageNumber, pageNumber % 2 === 1);
            page = pdfDoc.addPage([pageWidth, pageHeight]);
            pageNumber++;
            leftMargin = getLeftMargin(pageNumber);
            y = textTop - 15;
          }
          
          if (table.name && table.name !== 'Table') {
            page.drawText(sanitizeForPDF(stripInlineMarkdown(table.name)), { x: leftMargin, y, size: 9, font: timesRomanBold, color: rgb(0, 0, 0) });
            y -= 14;
          }
          page.drawRectangle({ x: leftMargin, y: y - headerHeight + 4, width: textWidth, height: headerHeight, color: rgb(0.92, 0.92, 0.92) });
          for (let i = 0; i < numCols; i++) {
            page.drawText(sanitizeForPDF(stripInlineMarkdown((table.headers[i] || '').slice(0, 25))), {
              x: leftMargin + (i * colWidth) + 4, y: y - 10, size: cellFontSize, font: timesRomanBold, color: rgb(0.1, 0.1, 0.1),
            });
          }
          y -= headerHeight;
          for (let rowIdx = 0; rowIdx < table.rows.length; rowIdx++) {
            const rowH = kdpRowHeights[rowIdx];
            if (y - rowH < textBottom + 12) {
              addRunningHeader(page, pageNumber, pageNumber % 2 === 1);
              page = pdfDoc.addPage([pageWidth, pageHeight]);
              pageNumber++;
              leftMargin = getLeftMargin(pageNumber);
              y = textTop - 15;
            }
            if (rowIdx % 2 === 1) {
              page.drawRectangle({ x: leftMargin, y: y - rowH + 4, width: textWidth, height: rowH, color: rgb(0.97, 0.97, 0.97) });
            }
            for (let colIdx = 0; colIdx < numCols && colIdx < table.rows[rowIdx].length; colIdx++) {
              const ct = sanitizeForPDF(stripInlineMarkdown((table.rows[rowIdx][colIdx] || '').slice(0, 60)));
              const wr = wrapText(ct, timesRoman, cellFontSize, colWidth - 8);
              let cy = y - cellLineH;
              for (const ln of wr) {
                page.drawText(ln, { x: leftMargin + (colIdx * colWidth) + 4, y: cy, size: cellFontSize, font: timesRoman, color: rgb(0.2, 0.2, 0.2) });
                cy -= cellLineH;
              }
            }
            y -= rowH;
          }
          y -= 10;
        }
        continue;
      }

      // Custom table (KDP)
      const customTableMatch = trimmed.match(/\[CUSTOM_TABLE_(\d+)\]/);
      if (customTableMatch) {
        const table = processed.customTables[parseInt(customTableMatch[1])];
        if (table) {
          y -= 8;
          const numCols = Math.min(table.headers.length, 5);
          const colWidth = textWidth / numCols;
          const cellFontSize = 7.5;
          const cellLineH = cellFontSize + 2.5;
          const cellPad = 5;
          const headerHeight = 18;
          
          const kdpCRowHeights: number[] = [];
          for (const row of table.rows) {
            let maxLines = 1;
            for (let c = 0; c < numCols && c < row.length; c++) {
              const ct = stripInlineMarkdown((row[c] || '').slice(0, 60));
              const wr = wrapText(ct, timesRoman, cellFontSize, colWidth - 8);
              maxLines = Math.max(maxLines, wr.length);
            }
            kdpCRowHeights.push(maxLines * cellLineH + cellPad);
          }
          
          const totalH = headerHeight + kdpCRowHeights.reduce((s, h) => s + h, 0) + 20;
          if (y - Math.min(totalH, 150) < textBottom + 20) {
            addRunningHeader(page, pageNumber, pageNumber % 2 === 1);
            page = pdfDoc.addPage([pageWidth, pageHeight]);
            pageNumber++;
            leftMargin = getLeftMargin(pageNumber);
            y = textTop - 15;
          }
          
          page.drawText(sanitizeForPDF(stripInlineMarkdown(table.name)), { x: leftMargin, y, size: 9, font: timesRomanBold, color: rgb(0, 0, 0) });
          y -= 14;
          page.drawRectangle({ x: leftMargin, y: y - headerHeight + 4, width: textWidth, height: headerHeight, color: rgb(0.92, 0.92, 0.92) });
          for (let i = 0; i < numCols; i++) {
            page.drawText(sanitizeForPDF(stripInlineMarkdown((table.headers[i] || '').slice(0, 25))), {
              x: leftMargin + (i * colWidth) + 4, y: y - 10, size: cellFontSize, font: timesRomanBold, color: rgb(0.1, 0.1, 0.1),
            });
          }
          y -= headerHeight;
          for (let rowIdx = 0; rowIdx < table.rows.length; rowIdx++) {
            const rowH = kdpCRowHeights[rowIdx];
            if (y - rowH < textBottom + 12) {
              addRunningHeader(page, pageNumber, pageNumber % 2 === 1);
              page = pdfDoc.addPage([pageWidth, pageHeight]);
              pageNumber++;
              leftMargin = getLeftMargin(pageNumber);
              y = textTop - 15;
            }
            for (let colIdx = 0; colIdx < numCols && colIdx < table.rows[rowIdx].length; colIdx++) {
              const ct = sanitizeForPDF(stripInlineMarkdown((table.rows[rowIdx][colIdx] || '').slice(0, 60)));
              const wr = wrapText(ct, timesRoman, cellFontSize, colWidth - 8);
              let cy = y - cellLineH;
              for (const ln of wr) {
                page.drawText(ln, { x: leftMargin + (colIdx * colWidth) + 4, y: cy, size: cellFontSize, font: timesRoman, color: rgb(0.2, 0.2, 0.2) });
                cy -= cellLineH;
              }
            }
            y -= rowH;
          }
          y -= 10;
        }
        continue;
      }

      // Image placeholder
      const imageMatch = trimmed.match(/\[IMAGE_(\d+)\]/);
      if (imageMatch) {
        // KDP: show text placeholder for images (no embedding for stability)
        const imgIdx = parseInt(imageMatch[1]);
        const imgMeta = processed.images[imgIdx];
        if (y < textBottom + 20) {
          addRunningHeader(page, pageNumber, pageNumber % 2 === 1);
          page = pdfDoc.addPage([pageWidth, pageHeight]);
          pageNumber++;
          leftMargin = getLeftMargin(pageNumber);
          y = textTop - 15;
        }
        page.drawText(sanitizeForPDF(`[Image: ${imgMeta?.alt || 'Illustration'}]`), {
          x: leftMargin, y, size: 9, font: helvetica, color: rgb(0.5, 0.5, 0.5),
        });
        y -= 16;
        continue;
      }

      // Regular paragraph with word-wrap and bold/italic support
      const isBullet = /^[-\u2022]\s/.test(trimmed);
      const isNumbered = /^\d+[.)]\s/.test(trimmed);
      const indent = (isBullet || isNumbered) ? 14 : 0;
      const hasFormatting = /\*/.test(trimmed);
      
      if (hasFormatting) {
        // Use styled paragraph renderer for inline bold/italic
        if (y < textBottom + 25) {
          addRunningHeader(page, pageNumber, pageNumber % 2 === 1);
          page = pdfDoc.addPage([pageWidth, pageHeight]);
          pageNumber++;
          leftMargin = getLeftMargin(pageNumber);
          y = textTop - 15;
        }
        const kdpBodyFonts = { regular: timesRoman, bold: timesRomanBold, italic: timesRomanItalic, boldItalic: timesRomanBoldItalic };
        const pageNumberRefKDP = { current: pageNumber };
        const addPageKDP = (pg: any, num: number) => addRunningHeader(pg, num, num % 2 === 1);
        const kdpStyledResult = drawStyledParagraph(page, trimmed, leftMargin + indent, y, textWidth - indent, bodySize, kdpBodyFonts, rgb(0, 0, 0), pdfDoc, pageWidth, pageHeight, margins.bottom, addPageKDP, pageNumberRefKDP);
        y = kdpStyledResult.y;
        page = kdpStyledResult.page;
        pageNumber = pageNumberRefKDP.current;
        leftMargin = getLeftMargin(pageNumber); // Sync margin after potential page break
      } else {
        const prefix = isBullet ? '\u2022 ' : isNumbered ? (trimmed.match(/^\d+[.)]\s/)?.[0] || '') : '';
        const bodyText = trimmed.replace(/^[-\u2022]\s|^\d+[.)]\s/, '');
        const words = bodyText.split(/\s+/);
        let line = prefix;

        for (const word of words) {
          const testLine = line + (line && !prefix ? ' ' : line === prefix ? '' : ' ') + word;
          const testW = timesRoman.widthOfTextAtSize(sanitizeForPDF(testLine), bodySize);
          if (testW > textWidth - indent && line !== prefix) {
            if (y < textBottom + 12) {
              addRunningHeader(page, pageNumber, pageNumber % 2 === 1);
              page = pdfDoc.addPage([pageWidth, pageHeight]);
              pageNumber++;
              leftMargin = getLeftMargin(pageNumber);
              y = textTop - 15;
            }
            page.drawText(sanitizeForPDF(line), {
              x: leftMargin + indent, y, size: bodySize, font: timesRoman, color: rgb(0, 0, 0),
            });
            y -= lineHeight;
            line = word;
          } else {
            line = testLine;
          }
        }
        if (line) {
          if (y < textBottom + 12) {
            addRunningHeader(page, pageNumber, pageNumber % 2 === 1);
            page = pdfDoc.addPage([pageWidth, pageHeight]);
            pageNumber++;
            leftMargin = getLeftMargin(pageNumber);
            y = textTop - 15;
          }
          page.drawText(sanitizeForPDF(line), {
            x: leftMargin + indent, y, size: bodySize, font: timesRoman, color: rgb(0, 0, 0),
          });
          y -= lineHeight;
        }
      }
      y -= lineHeight * 0.25;
    }
    addRunningHeader(page, pageNumber, pageNumber % 2 === 1);
  }

  // ---- Bibliography ----
  if (bibliography.length > 0) {
    page = pdfDoc.addPage([pageWidth, pageHeight]);
    pageNumber++;
    y = textTop - 30;
    page.drawText(isAcademic ? 'References' : 'Bibliography', {
      x: getLeftMargin(pageNumber), y: textTop, size: 15, font: timesRomanBold, color: rgb(0, 0, 0),
    });
    y -= 25;
    for (const ref of bibliography) {
      const refLines = kdpWrapText(sanitizeForPDF(ref), timesRoman, 9, textWidth - 18);
      for (let i = 0; i < refLines.length; i++) {
        if (y < textBottom + 12) {
          page = pdfDoc.addPage([pageWidth, pageHeight]);
          pageNumber++;
          y = textTop - 15;
        }
        page.drawText(refLines[i], {
          x: getLeftMargin(pageNumber) + (i === 0 ? 0 : 18), y, size: 9, font: timesRoman, color: rgb(0, 0, 0),
        });
        y -= 12;
      }
      y -= 3;
    }
  }

  // Set PDF metadata
  pdfDoc.setTitle(book.title);
  pdfDoc.setAuthor(author);
  pdfDoc.setSubject(`KDP-ready | Trim: ${trimSize.name}`);
  pdfDoc.setCreator('ScrollLibrary');
  pdfDoc.setProducer('ScrollLibrary KDP Export');

  return pdfDoc.save();
}

function kdpWrapText(text: string, font: any, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const test = line + (line ? ' ' : '') + word;
    if (font.widthOfTextAtSize(test, size) > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines.length > 0 ? lines : [''];
}

// ===== EPUB Generation with Cover, Images, and References =====
async function generateEPUB(
  book: any, 
  chapters: any[], 
  author: string, 
  identifier: string, 
  isISBN: boolean, 
  year: number, 
  coverImageBytes: Uint8Array | null,
  isAcademic: boolean,
  citationStyle: string,
  bibliography: string[]
): Promise<ArrayBuffer> {
  const blobWriter = new zip.BlobWriter("application/epub+zip");
  const zipWriter = new zip.ZipWriter(blobWriter);

  await zipWriter.add("mimetype", new zip.TextReader("application/epub+zip"), { level: 0 });

  const containerXml = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;
  await zipWriter.add("META-INF/container.xml", new zip.TextReader(containerXml));

  const hasCover = coverImageBytes && coverImageBytes.length > 0;
  const coverKind: ImageKind = hasCover ? detectImageKind(coverImageBytes!) : 'unknown';
  const coverExt = imageKindToExt(coverKind);
  const coverMediaType = imageKindToMediaType(coverKind);

  if (hasCover) {
    await zipWriter.add(`OEBPS/images/cover.${coverExt}`, new zip.Uint8ArrayReader(coverImageBytes!));
  }

  const chapterItems = chapters.map((ch, i) => ({
    id: `chapter${i + 1}`,
    href: `chapter${i + 1}.xhtml`,
    chapter: ch,
  }));

  // Add references/bibliography as separate document for all books with citations
  const hasRefs = bibliography.length > 0;
  
  // First, process all chapters to collect images and generate XHTML
  let imageCounter = 0;
  const chapterImages: { id: string; path: string; bytes: Uint8Array; href: string; mediaType: string }[] = [];
  const processedChapters: { id: string; href: string; xhtml: string }[] = [];
  
  for (const item of chapterItems) {
    try {
    let content = item.chapter.content || "";
    
    // FIRST: Detect plain-text headings (legacy content without ## markers)
    content = content.replace(/\n\n([A-Z][A-Za-z0-9 :&,\-–—']{2,75})\n\n/g, (match: string, line: string) => {
      const trimmed = line.trim();
      if (/^#{1,6}\s/.test(trimmed) || /^[-*]\s/.test(trimmed) || /[.!?;,]$/.test(trimmed)) return match;
      if (trimmed.split(/\s+/).length > 10) return match;
      return `\n\n## ${trimmed}\n\n`;
    });
    content = content.replace(/\n\n(\d+(?:\.\d+)*\.?\s+[A-Z][A-Za-z0-9 :&,\-–—']{2,70})\n\n/g, (match: string, line: string) => {
      const trimmed = line.trim();
      if (/[.!?;,]$/.test(trimmed) && !/\.\s*$/.test(trimmed)) return match;
      if (trimmed.split(/\s+/).length > 12) return match;
      return `\n\n### ${trimmed}\n\n`;
    });
    content = content.replace(/^[\s]*•\s+/gm, '- ');
    
    // Extract and store headings BEFORE any other processing
    const headingMap: Map<string, { level: number; text: string }> = new Map();
    let headingIdx = 0;
    content = content.replace(/^(#{1,6})\s+(.+)$/gm, (_match: string, hashes: string, text: string) => {
      const level = hashes.length;
      const placeholder = `[EPUB_HEADING_${headingIdx}]`;
      headingMap.set(placeholder, { level, text: text.trim() });
      headingIdx++;
      return placeholder;
    });
    
    // Extract and process images — cap at 5 per chapter to avoid CPU timeout
    const allImageMatches = [...content.matchAll(/!\[([^\]]*)\]\(([^)]+)\)/g)];
    const imageMatches = allImageMatches.slice(0, 5);
    const imageMap: Map<string, string> = new Map();
    
    for (const match of imageMatches) {
      const [fullMatch, alt, url] = match;
      
      
      const imageBytes = await fetchImageBytes(url);
      if (imageBytes) {
        const kind = detectImageKind(imageBytes);
        const ext = imageKindToExt(kind);
        const imageName = `img-${imageCounter}.${ext}`;
        const imageId = `img-${imageCounter}`;
        const href = `images/${imageName}`;
        imageCounter++;

        chapterImages.push({
          id: imageId,
          path: `OEBPS/${href}`,
          href,
          bytes: imageBytes,
          mediaType: imageKindToMediaType(kind),
        });
        imageMap.set(fullMatch, `<figure><img src="${href}" alt="${escapeXml(alt || 'Image')}" style="max-width:100%;"/><figcaption>${escapeXml(alt || '')}</figcaption></figure>`);
      } else {
        imageMap.set(fullMatch, `<p><em>[Image not available: ${escapeXml(alt || 'Panel')}]</em></p>`);
      }
    }
    
    // Replace image markdown with HTML (processed images)
    for (const [original, replacement] of imageMap) {
      content = content.replace(original, replacement);
    }
    // Strip any remaining unprocessed image markdown (beyond the 5-per-chapter cap)
    content = content.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m: string, alt: string) => {
      return `<p><em>[Image: ${escapeXml(alt || 'Illustration')}]</em></p>`;
    });
    
    // Convert heading placeholders to proper HTML heading tags
    for (const [placeholder, headingData] of headingMap) {
      content = content.replace(placeholder, `<h${headingData.level}>${escapeXml(headingData.text)}</h${headingData.level}>`);
    }
    
    // Convert STRUCTURED code blocks [CODE_BLOCK]...[/CODE_BLOCK] to rich HTML
    content = content.replace(/\[CODE_BLOCK\]([\s\S]*?)\[\/CODE_BLOCK\]/g, (_match: string, blockContent: string) => {
      const parsed = parseStructuredCodeBlockFromText(blockContent);
      if (!parsed || !parsed.code) return '';
      
      let html = `<div class="structured-code-block">`;
      html += `<div class="code-header"><span class="lang-tag">[${escapeXml(parsed.language.toUpperCase())}]</span>`;
      if (parsed.title) html += ` <span class="code-title">${escapeXml(parsed.title)}</span>`;
      html += `</div>`;
      
      if (parsed.purpose) {
        html += `<p class="code-purpose"><strong>Purpose:</strong> ${escapeXml(parsed.purpose)}</p>`;
      }
      
      html += `<pre class="code-content"><code class="${parsed.language}">${escapeXml(parsed.code)}</code></pre>`;
      
      if (parsed.output) {
        html += `<div class="code-output"><div class="output-label">OUTPUT:</div><pre class="output-content">${escapeXml(parsed.output)}</pre></div>`;
      }
      
      if (parsed.explanation) {
        html += `<p class="code-explanation"><strong>Explanation:</strong> ${escapeXml(parsed.explanation)}</p>`;
      }
      
      if (parsed.commonMistake) {
        html += `<div class="code-warning"><strong>⚠ Common Mistake:</strong> ${escapeXml(parsed.commonMistake)}</div>`;
      }
      
      html += `</div>`;
      return html;
    });
    
    // Convert regular markdown code blocks to HTML
    content = content.replace(/```(\w+)?\n([\s\S]*?)```/g, (_match: string, lang: string, code: string) => {
      return `<pre><code class="${lang || 'text'}">${escapeXml(code.trim())}</code></pre>`;
    });
    
    // Convert PROPER markdown tables (pipe format) to HTML tables
    content = content.replace(/(?:(?:\*\*([^*]+)\*\*|([^\n|]+))\n\n?)?(\|[^\n]+\|\n\|[-:| ]+\|\n(?:\|[^\n]+\|\n?)+)/g, 
      (_match: string, boldTitle: string, plainTitle: string, tableContent: string) => {
        const tableName = (boldTitle || plainTitle || '').trim();
        const lines = tableContent.trim().split('\n');
        if (lines.length < 2) return _match;
        
        // Parse header row
        const headerLine = lines[0];
        const headers = headerLine.split('|')
          .filter((cell: string) => cell.trim())
          .map((cell: string) => `<th>${escapeXml(cell.trim())}</th>`)
          .join('');
        
        // Parse data rows (skip separator row at index 1)
        const rows = lines.slice(2).map((line: string) => {
          const cells = line.split('|')
            .filter((cell: string, idx: number, arr: string[]) => idx > 0 && idx < arr.length - 1 || cell.trim())
            .map((cell: string) => `<td>${escapeXml(cell.trim())}</td>`)
            .join('');
          return cells ? `<tr>${cells}</tr>` : '';
        }).filter((r: string) => r).join('\n');
        
        const titleHtml = tableName ? `<caption><strong>${escapeXml(tableName)}</strong></caption>` : '';
        return `<table>${titleHtml}<thead><tr>${headers}</tr></thead><tbody>${rows}</tbody></table>`;
      }
    );
    
    // Convert PROSE-FORMAT tables (Row 1: ... Row 2: ...) to HTML tables
    // This handles AI-generated tables that aren't in markdown pipe format
    content = content.replace(/((?:Row \d+:[^\n]+\n)+)/g, (match: string) => {
      const lines = match.trim().split('\n');
      if (lines.length < 2) return match;
      
      // Parse the first row to extract column headers from "Field: Value" pairs
      const firstRow = lines[0];
      const fieldValuePairs = firstRow.match(/([A-Za-z][A-Za-z\s()]+):\s*([^:]+?)(?=\s+[A-Za-z][A-Za-z\s()]+:|$)/g);
      
      if (!fieldValuePairs || fieldValuePairs.length < 2) return match;
      
      // Extract headers from field names
      const headers: string[] = [];
      const headerMap: Map<string, number> = new Map();
      fieldValuePairs.forEach((pair, idx) => {
        const colonIdx = pair.indexOf(':');
        if (colonIdx > 0) {
          const header = pair.substring(0, colonIdx).trim();
          headers.push(header);
          headerMap.set(header.toLowerCase(), idx);
        }
      });
      
      // Parse all rows
      const tableRows: string[][] = [];
      for (const line of lines) {
        const rowMatch = line.match(/^Row \d+:\s*/);
        if (!rowMatch) continue;
        
        const rowContent = line.substring(rowMatch[0].length);
        const pairs = rowContent.match(/([A-Za-z][A-Za-z\s()]+):\s*([^:]+?)(?=\s+[A-Za-z][A-Za-z\s()]+:|$)/g);
        
        if (pairs) {
          const cells: string[] = new Array(headers.length).fill('');
          pairs.forEach(pair => {
            const colonIdx = pair.indexOf(':');
            if (colonIdx > 0) {
              const key = pair.substring(0, colonIdx).trim().toLowerCase();
              const value = pair.substring(colonIdx + 1).trim();
              const idx = headerMap.get(key);
              if (idx !== undefined) {
                cells[idx] = value;
              }
            }
          });
          tableRows.push(cells);
        }
      }
      
      if (tableRows.length === 0) return match;
      
      const headerHtml = headers.map(h => `<th>${escapeXml(h)}</th>`).join('');
      const rowsHtml = tableRows.map(row => 
        `<tr>${row.map(cell => `<td>${escapeXml(cell)}</td>`).join('')}</tr>`
      ).join('\n');
      
      return `<table class="data-table"><thead><tr>${headerHtml}</tr></thead><tbody>${rowsHtml}</tbody></table>`;
    });
    
    // Convert bold and italic markdown to HTML (MUST happen before inline code)
    content = content.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    content = content.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    content = content.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    content = content.replace(/_([^_]+)_/g, '<em>$1</em>');
    
    // Convert inline code (with XML escaping for safety)
    content = content.replace(/`([^`]+)`/g, (_m: string, code: string) => `<code>${escapeXml(code)}</code>`);
    
    // Note: headings are already converted to <hN> tags via headingMap above
    // No additional heading placeholder conversion needed
    
    // Protect <pre> blocks from being split by \n\n paragraph splitting
    // Replace double newlines inside <pre>...</pre> with a placeholder
    content = content.replace(/<pre[\s\S]*?<\/pre>/g, (block: string) => {
      return block.replace(/\n\n+/g, '\n');
    });
    
    // Convert paragraphs (skip already processed HTML) - with heading support
    // Convert bullet lists to proper HTML
    content = content.replace(/^[-]\s+(.*)/gm, '<li>$1</li>');
    content = content.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>\n$1</ul>');
    
    const htmlContent = content
      .split(/\n\n+/)
      .map((p: string) => {
        p = p.trim();
        if (!p) return '';
        // Pass through already-processed HTML elements
        if (/^<(?:pre|code|figure|p|table|div|h[1-6]|ul|ol|li)\b/.test(p)) return p;
        // Skip prose that's clearly table data (Row N: format)
        if (/^Row \d+:/.test(p)) return '';
        
        // If paragraph contains already-converted HTML tags, wrap without re-escaping
        if (/<(?:code|strong|em|a|span|br|h[1-6]|sub|sup)\b/.test(p)) {
          return `<p>${p}</p>`;
        }
        
        return `<p>${escapeXml(p)}</p>`;
      })
      .filter((p: string) => p)
      .join('\n');
    
    const chapterXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>${escapeXml(item.chapter.title)}</title><link rel="stylesheet" href="style.css"/></head>
<body>
<h1>Chapter ${item.chapter.chapter_number}: ${escapeXml(item.chapter.title)}</h1>
${htmlContent}
</body>
</html>`;
    
    processedChapters.push({ id: item.id, href: item.href, xhtml: chapterXhtml });
    } catch (chapterError) {
      console.error(`[EXPORT] EPUB chapter ${item.chapter.chapter_number} processing error:`, chapterError);
      // Add a fallback chapter so it's not missing from the EPUB
      const fallbackXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>${escapeXml(item.chapter.title)}</title><link rel="stylesheet" href="style.css"/></head>
<body>
<h1>Chapter ${item.chapter.chapter_number}: ${escapeXml(item.chapter.title)}</h1>
<p>${escapeXml(item.chapter.content || 'Content could not be processed.')}</p>
</body>
</html>`;
      processedChapters.push({ id: item.id, href: item.href, xhtml: fallbackXhtml });
    }
  }
  
  // Now generate manifest with all collected images - use the actual stored path
  const imageManifestItems = chapterImages.map((img) => {
    return `<item id="${img.id}" href="${img.href}" media-type="${img.mediaType}"/>`;
  }).join('\n    ');

  const contentOpf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">${identifier}</dc:identifier>
    <dc:title>${escapeXml(book.title)}</dc:title>
    <dc:creator>${escapeXml(author)}</dc:creator>
    <dc:language>${book.language || 'en'}</dc:language>
    <dc:publisher>ScrollLibrary</dc:publisher>
    <dc:date>${year}</dc:date>
    <meta property="dcterms:modified">${new Date().toISOString().split('.')[0]}Z</meta>
    ${hasCover ? '<meta name="cover" content="cover-image"/>' : ''}
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    ${hasCover ? '<item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>' : ''}
    ${hasCover ? `<item id="cover-image" href="images/cover.${coverExt}" media-type="${coverMediaType}" properties="cover-image"/>` : ''}
    <item id="title" href="title.xhtml" media-type="application/xhtml+xml"/>
    <item id="dedication" href="dedication.xhtml" media-type="application/xhtml+xml"/>
    ${chapterItems.map(c => `<item id="${c.id}" href="${c.href}" media-type="application/xhtml+xml"/>`).join('\n    ')}
    <item id="about-author" href="about-author.xhtml" media-type="application/xhtml+xml"/>
    ${hasRefs ? '<item id="references" href="references.xhtml" media-type="application/xhtml+xml"/>' : ''}
    ${imageManifestItems}
    <item id="css" href="style.css" media-type="text/css"/>
  </manifest>
  <spine>
    ${hasCover ? '<itemref idref="cover"/>' : ''}
    <itemref idref="nav"/>
    <itemref idref="title"/>
    <itemref idref="dedication"/>
    ${chapterItems.map(c => `<itemref idref="${c.id}"/>`).join('\n    ')}
    <itemref idref="about-author"/>
    ${hasRefs ? '<itemref idref="references"/>' : ''}
  </spine>
</package>`;
  await zipWriter.add("OEBPS/content.opf", new zip.TextReader(contentOpf));

  // Enhanced CSS with structured code block, table, figure, and HEADING styling
  const css = `body { font-family: Georgia, serif; margin: 2em; line-height: 1.7; color: #1a1a1a; }
h1 { font-size: 1.8em; margin-bottom: 0.5em; margin-top: 1em; font-weight: bold; }
h2 { font-size: 1.5em; margin-top: 1.5em; margin-bottom: 0.5em; font-weight: bold; border-bottom: 1px solid #ddd; padding-bottom: 0.3em; }
h3 { font-size: 1.3em; margin-top: 1.3em; margin-bottom: 0.4em; font-weight: bold; }
h4 { font-size: 1.15em; margin-top: 1.2em; margin-bottom: 0.3em; font-weight: bold; }
h5 { font-size: 1.05em; margin-top: 1em; margin-bottom: 0.3em; font-weight: bold; }
h6 { font-size: 1em; margin-top: 1em; margin-bottom: 0.3em; font-weight: bold; font-style: italic; }
p { margin: 0.8em 0; text-align: justify; }
ul, ol { margin: 0.8em 0; padding-left: 2em; }
li { margin: 0.3em 0; line-height: 1.6; }
.cover { text-align: center; }
.cover img { max-width: 100%; height: auto; }
pre { background: #1e1e24; color: #e0e0e0; padding: 1em; border-radius: 6px; overflow-x: auto; font-family: 'Courier New', Courier, monospace; font-size: 0.88em; line-height: 1.5; white-space: pre-wrap; word-wrap: break-word; }
pre.code-content { background: #1e1e24; color: #e0e0e0; margin: 0; border-radius: 0 0 6px 6px; }
code { font-family: 'Courier New', Courier, monospace; background: #f0f0f0; padding: 0.15em 0.4em; border-radius: 3px; font-size: 0.92em; }
pre code { background: transparent; padding: 0; font-size: 1em; }
.reference { margin: 0.5em 0; padding-left: 2em; text-indent: -2em; font-size: 0.95em; }
.academic-notice { background: #fff8e1; border-left: 4px solid #ffc107; padding: 1em; margin: 1em 0; font-size: 0.9em; }
table { border-collapse: collapse; width: 100%; margin: 1.5em 0; page-break-inside: avoid; }
table caption { font-weight: bold; margin-bottom: 0.5em; text-align: left; font-size: 1.1em; }
th, td { border: 1px solid #ccc; padding: 0.6em 0.8em; text-align: left; vertical-align: top; }
th { background: #e8e8e8; font-weight: bold; }
tr:nth-child(even) { background: #f9f9f9; }
tr:nth-child(odd) { background: #fff; }
.data-table { font-size: 0.95em; }
.data-table th { background: #4a90d9; color: white; }
.data-table tr:nth-child(even) { background: #e6f2ff; }
figure { margin: 1.5em 0; text-align: center; }
figure img { max-width: 100%; height: auto; border-radius: 4px; }
figcaption { font-style: italic; font-size: 0.9em; color: #666; margin-top: 0.5em; }
blockquote { border-left: 3px solid #ccc; margin: 1em 0; padding: 0.5em 1em; color: #555; font-style: italic; }
/* Structured Code Block Styles (ChatGPT-level) */
.structured-code-block { margin: 1.5em 0; border: 1px solid #ddd; border-radius: 6px; overflow: hidden; }
.code-header { background: #e8e8ec; padding: 0.6em 1em; border-bottom: 1px solid #ddd; }
.lang-tag { background: #5c6bc0; color: white; padding: 0.2em 0.5em; border-radius: 3px; font-size: 0.8em; font-weight: bold; }
.code-title { margin-left: 0.5em; font-weight: bold; }
.code-purpose { background: #f5f5fa; padding: 0.6em 1em; margin: 0; font-size: 0.9em; color: #555; border-bottom: 1px solid #eee; }
.code-output { background: #0a0c0a; }
.output-label { color: #4caf50; font-size: 0.75em; padding: 0.5em 1em 0; font-weight: bold; }
.output-content { color: #4caf50; margin: 0; padding: 0.5em 1em 1em; background: transparent; }
.code-explanation { padding: 0.8em 1em; margin: 0; font-size: 0.9em; background: #fafafa; border-top: 1px solid #eee; }
.code-warning { background: #fff3e0; border-top: 1px solid #ff9800; padding: 0.8em 1em; font-size: 0.9em; color: #e65100; }`;
  await zipWriter.add("OEBPS/style.css", new zip.TextReader(css));

  if (hasCover) {
    const coverXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>Cover</title><link rel="stylesheet" href="style.css"/></head>
 <body class="cover"><img src="images/cover.${coverExt}" alt="Cover"/></body>
</html>`;
    await zipWriter.add("OEBPS/cover.xhtml", new zip.TextReader(coverXhtml));
  }

  const navXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Navigation</title><link rel="stylesheet" href="style.css"/></head>
<body>
<nav epub:type="toc" id="toc">
  <h1>Table of Contents</h1>
  <ol>
    ${chapterItems.map(c => `<li><a href="${c.href}">Chapter ${c.chapter.chapter_number}: ${escapeXml(c.chapter.title)}</a></li>`).join('\n    ')}
    ${hasRefs ? '<li><a href="references.xhtml">References</a></li>' : ''}
  </ol>
</nav>
</body>
</html>`;
  await zipWriter.add("OEBPS/nav.xhtml", new zip.TextReader(navXhtml));

  // Title page with academic notice
  let titleContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>${escapeXml(book.title)}</title><link rel="stylesheet" href="style.css"/></head>
<body>
<h1>${escapeXml(book.title)}</h1>
<p>by ${escapeXml(author)}</p>
<p>${escapeXml(book.category?.replace(/_/g, ' ') || 'Book')}</p>
${isAcademic ? `<p><em>[Academic Content - ${citationStyle} Citations]</em></p>` : ''}
<hr/>
<p>© ${year} ${escapeXml(author)}. All rights reserved.</p>
<p>${isISBN ? `ISBN: ${identifier}` : `SPC: ${identifier}`}</p>
<p>Created with ScrollLibrary - AI-Assisted Content</p>`;

  if (isAcademic) {
    titleContent += `
<div class="academic-notice">
<strong>Academic Content Notice</strong><br/>
All references in this document are retrieved from verifiable academic databases including OpenAlex, CrossRef, Semantic Scholar, arXiv, and PubMed. ScrollLibrary does not replace academic judgment. Users remain responsible for proper academic use and verification of all citations before submission.
</div>`;
  }

  titleContent += `
</body>
</html>`;
  await zipWriter.add("OEBPS/title.xhtml", new zip.TextReader(titleContent));

  // Dedication Page
  const dedicationXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>About This Book</title><link rel="stylesheet" href="style.css"/></head>
<body>
<div style="text-align: center; margin-top: 40%; font-style: italic;">
<p>This book was created with AI assistance via ScrollLibrary.</p>
<p>The author retains full ownership and commercial rights.</p>
</div>
</body>
</html>`;
  await zipWriter.add("OEBPS/dedication.xhtml", new zip.TextReader(dedicationXhtml));

  // Write all processed chapters
  for (const chapter of processedChapters) {
    await zipWriter.add(`OEBPS/${chapter.href}`, new zip.TextReader(chapter.xhtml));
  }
  
  // Add all collected panel images to the EPUB
  for (const img of chapterImages) {
    await zipWriter.add(img.path, new zip.Uint8ArrayReader(img.bytes));
  }

  // References/Bibliography page for all books with citations
  if (hasRefs) {
    const sectionTitle = isAcademic ? 'References' : 'Bibliography';
    const refsContent = bibliography.map(ref => 
      `<p class="reference">${escapeXml(ref)}</p>`
    ).join('\n');
    
    const referencesXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>${sectionTitle}</title><link rel="stylesheet" href="style.css"/></head>
<body>
<h1>${sectionTitle}</h1>
${isAcademic ? `<p><em>Citation Style: ${citationStyle}</em></p>` : ''}
${refsContent}
${isAcademic ? '<hr/>\n<p><small>All references are retrieved from verifiable academic databases.</small></p>' : ''}
</body>
</html>`;
    await zipWriter.add("OEBPS/references.xhtml", new zip.TextReader(referencesXhtml));
  }

  // About the Author Page
  const aboutAuthorXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>About the Author</title><link rel="stylesheet" href="style.css"/></head>
<body>
<h1>About the Author</h1>
<p>${escapeXml(author)} is the author of <em>${escapeXml(book.title)}</em>. This work reflects a commitment to advancing knowledge and thought leadership in the field of ${escapeXml(book.category?.replace(/_/g, ' ') || 'general studies')}. The author retains full ownership and commercial rights to this publication.</p>
</body>
</html>`;
  await zipWriter.add("OEBPS/about-author.xhtml", new zip.TextReader(aboutAuthorXhtml));

  await zipWriter.close();
  const blob = await blobWriter.getData();
  return await blob.arrayBuffer();
}

// ===== DOCX Generation with Cover, Images, and References =====
async function generateDOCX(
  book: any, 
  chapters: any[], 
  author: string, 
  identifier: string, 
  isISBN: boolean, 
  year: number, 
  coverImageBytes: Uint8Array | null,
  isAcademic: boolean,
  citationStyle: string,
  bibliography: string[]
): Promise<ArrayBuffer> {
  const blobWriter = new zip.BlobWriter("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  const zipWriter = new zip.ZipWriter(blobWriter);

  // Process all chapters to extract images first
  let imageCounter = 0;
  const docxImages: { id: string; bytes: Uint8Array }[] = [];
  const processedChapters: { chapter: any; processedContent: string[]; imageRefs: { index: number; alt: string }[]; tables: { original: string; headers: string[]; rows: string[][] }[]; structuredCodeBlocks: StructuredCodeBlockData[]; codeBlocks: { lang: string; code: string }[]; headings: { level: number; text: string }[] }[] = [];
  
  for (const chapter of chapters) {
    const content = chapter.content || "";
    // Cap images at 5 per chapter to avoid CPU timeout in edge function
    const allImgMatches = [...content.matchAll(/!\[([^\]]*)\]\(([^)]+)\)/g)];
    const imageMatches = allImgMatches.slice(0, 5);
    const imageRefs: { index: number; alt: string }[] = [];
    
    for (const match of imageMatches) {
      const [, alt, url] = match;
      
      const imageBytes = await fetchImageBytes(url);
      if (imageBytes) {
        imageCounter++;
        docxImages.push({ id: `image${imageCounter}`, bytes: imageBytes });
        imageRefs.push({ index: imageCounter, alt: alt || 'Panel' });
      }
    }
    
    // Strip images from content for text processing (replaces ALL, not just first 5)
    let textContent = content.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '[IMAGE_PLACEHOLDER]');
    
    // FIRST: Detect plain-text headings (legacy content without ## markers)
    textContent = textContent.replace(/\n\n([A-Z][A-Za-z0-9 :&,\-–—']{2,75})\n\n/g, (match: string, line: string) => {
      const trimmed = line.trim();
      if (/^#{1,6}\s/.test(trimmed) || /^[-*]\s/.test(trimmed) || /[.!?;,]$/.test(trimmed)) return match;
      if (trimmed.split(/\s+/).length > 10) return match;
      return `\n\n## ${trimmed}\n\n`;
    });
    textContent = textContent.replace(/\n\n(\d+(?:\.\d+)*\.?\s+[A-Z][A-Za-z0-9 :&,\-–—']{2,70})\n\n/g, (match: string, line: string) => {
      const trimmed = line.trim();
      if (/[.!?;,]$/.test(trimmed) && !/\.\s*$/.test(trimmed)) return match;
      if (trimmed.split(/\s+/).length > 12) return match;
      return `\n\n### ${trimmed}\n\n`;
    });
    textContent = textContent.replace(/^[\s]*•\s+/gm, '- ');
    
    // Extract headings BEFORE other markdown processing
    const docxHeadings: { level: number; text: string }[] = [];
    textContent = textContent.replace(/^(#{1,6})\s+(.+)$/gm, (_match: string, hashes: string, text: string) => {
      const level = hashes.length;
      docxHeadings.push({ level, text: text.trim() });
      return `[DOCX_HEADING_${docxHeadings.length - 1}]`;
    });
    
    // Extract STRUCTURED code blocks [CODE_BLOCK]...[/CODE_BLOCK] for DOCX
    const structuredCodeBlocks: StructuredCodeBlockData[] = [];
    textContent = textContent.replace(/\[CODE_BLOCK\]([\s\S]*?)\[\/CODE_BLOCK\]/g, (_match: string, blockContent: string) => {
      const parsed = parseStructuredCodeBlockFromText(blockContent);
      if (parsed && parsed.code) {
        structuredCodeBlocks.push(parsed);
        return `[DOCX_STRUCTURED_CODE_${structuredCodeBlocks.length - 1}]`;
      }
      return '';
    });
    
    // Extract regular fenced code blocks for DOCX
    const codeBlocks: { lang: string; code: string }[] = [];
    textContent = textContent.replace(/```(\w+)?\n([\s\S]*?)```/g, (_match: string, lang: string, code: string) => {
      codeBlocks.push({ lang: lang || 'text', code: code.trim() });
      return `[DOCX_CODE_${codeBlocks.length - 1}]`;
    });
    
    // Extract tables in "Row X:" prose format for DOCX
    const tableMatches: { original: string; headers: string[]; rows: string[][] }[] = [];
    textContent = textContent.replace(/((?:Row \d+:[^\n]+\n)+)/g, (match: string) => {
      const lines = match.trim().split('\n');
      if (lines.length < 2) return match;
      
      // Parse the first row to extract column headers
      const firstRow = lines[0];
      const fieldValuePairs = firstRow.match(/([A-Za-z][A-Za-z\s()]+):\s*([^:]+?)(?=\s+[A-Za-z][A-Za-z\s()]+:|$)/g);
      
      if (!fieldValuePairs || fieldValuePairs.length < 2) return match;
      
      const headers: string[] = [];
      const headerMap: Map<string, number> = new Map();
      fieldValuePairs.forEach((pair, idx) => {
        const colonIdx = pair.indexOf(':');
        if (colonIdx > 0) {
          const header = pair.substring(0, colonIdx).trim();
          headers.push(header);
          headerMap.set(header.toLowerCase(), idx);
        }
      });
      
      const tableRows: string[][] = [];
      for (const line of lines) {
        const rowMatch = line.match(/^Row \d+:\s*/);
        if (!rowMatch) continue;
        
        const rowContent = line.substring(rowMatch[0].length);
        const pairs = rowContent.match(/([A-Za-z][A-Za-z\s()]+):\s*([^:]+?)(?=\s+[A-Za-z][A-Za-z\s()]+:|$)/g);
        
        if (pairs) {
          const cells: string[] = new Array(headers.length).fill('');
          pairs.forEach(pair => {
            const colonIdx = pair.indexOf(':');
            if (colonIdx > 0) {
              const key = pair.substring(0, colonIdx).trim().toLowerCase();
              const value = pair.substring(colonIdx + 1).trim();
              const idx = headerMap.get(key);
              if (idx !== undefined) {
                cells[idx] = value;
              }
            }
          });
          tableRows.push(cells);
        }
      }
      
      if (tableRows.length === 0) return match;
      
      tableMatches.push({ original: match, headers, rows: tableRows });
      return `[DOCX_TABLE_${tableMatches.length - 1}]`;
    });
    
    // Extract PROPER markdown tables (pipe format) for DOCX
    textContent = textContent.replace(/(?:(?:\*\*([^*]+)\*\*|([^\n|]+))\n\n?)?(\|[^\n]+\|\n\|[-:| ]+\|\n(?:\|[^\n]+\|\n?)+)/g,
      (_match: string, boldTitle: string, plainTitle: string, tableContent: string) => {
        const tableName = (boldTitle || plainTitle || '').trim();
        const lines = tableContent.trim().split('\n');
        if (lines.length < 2) return _match;
        
        const headerLine = lines[0];
        const headers = headerLine.split('|')
          .filter((cell: string) => cell.trim())
          .map((cell: string) => cell.trim());
        
        const rows: string[][] = [];
        for (let i = 2; i < lines.length; i++) {
          const rowLine = lines[i];
          if (!rowLine.includes('|')) continue;
          const cells = rowLine.split('|')
            .filter((cell: string, idx: number, arr: string[]) => idx > 0 && idx < arr.length - 1 || cell.trim())
            .map((cell: string) => cell.trim())
            .filter((cell: string) => cell);
          if (cells.length > 0) rows.push(cells);
        }
        
        if (headers.length > 0 && rows.length > 0) {
          tableMatches.push({ original: _match, headers, rows });
          return `[DOCX_TABLE_${tableMatches.length - 1}]`;
        }
        return _match;
      }
    );
    
    // Strip markdown but PRESERVE bold/italic markers (**text**, *text*) for markdownToDocxRuns
    // Also preserve heading/code/table placeholders
    const strippedText = textContent
      .replace(/`([^`]+)`/g, "$1")  // Remove inline code backticks
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // Remove links, keep text
      .replace(/^\s*[-]\s+/gm, "- ")  // Normalize list bullets
      .replace(/^\s*(\d+)\.\s+/gm, "$1. ")  // Preserve ordered list numbers
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    const paragraphs = strippedText.split(/\n\n+/);
    
    processedChapters.push({ 
      chapter, 
      processedContent: paragraphs, 
      imageRefs, 
      tables: tableMatches,
      structuredCodeBlocks,
      codeBlocks,
      headings: docxHeadings
    });
  }

  // Build content types with all images
  let contentTypes = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Default Extension="jpeg" ContentType="image/jpeg"/>
  <Default Extension="jpg" ContentType="image/jpeg"/>
  <Default Extension="png" ContentType="image/png"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;
  await zipWriter.add("[Content_Types].xml", new zip.TextReader(contentTypes));

  // Add styles.xml for proper heading rendering in Word
  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:styleId="Title">
    <w:name w:val="Title"/>
    <w:pPr><w:jc w:val="center"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="56"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:pPr><w:keepNext/><w:spacing w:before="240" w:after="120"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="36"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/>
    <w:pPr><w:keepNext/><w:spacing w:before="200" w:after="80"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="32"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading3">
    <w:name w:val="heading 3"/>
    <w:pPr><w:keepNext/><w:spacing w:before="160" w:after="80"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="28"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading4">
    <w:name w:val="heading 4"/>
    <w:pPr><w:keepNext/><w:spacing w:before="120" w:after="60"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="26"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading5">
    <w:name w:val="heading 5"/>
    <w:pPr><w:keepNext/><w:spacing w:before="120" w:after="60"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="24"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading6">
    <w:name w:val="heading 6"/>
    <w:pPr><w:keepNext/><w:spacing w:before="100" w:after="40"/></w:pPr>
    <w:rPr><w:b/><w:i/><w:sz w:val="22"/></w:rPr>
  </w:style>
</w:styles>`;
  await zipWriter.add("word/styles.xml", new zip.TextReader(stylesXml));

  const rels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  // Add styles relationship in document.xml.rels - will be merged below
  await zipWriter.add("_rels/.rels", new zip.TextReader(rels));

  // Add cover and all panel images to media folder
  let imageRelId = 2;
  let imageRels = '';
  const coverKind: ImageKind = coverImageBytes ? detectImageKind(coverImageBytes) : 'unknown';
  const canEmbedDocxCover = coverKind === 'png' || coverKind === 'jpeg';
  const coverExt = imageKindToExt(coverKind);
  
  if (coverImageBytes && canEmbedDocxCover) {
    await zipWriter.add(`word/media/cover.${coverExt}`, new zip.Uint8ArrayReader(coverImageBytes));
    imageRels += `<Relationship Id="rId${imageRelId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/cover.${coverExt}"/>`;
    imageRelId++;
  } else if (coverImageBytes && !canEmbedDocxCover) {
    
  }
  
  // Add all chapter images
  const imageRelMap: Map<number, number> = new Map();
  for (const img of docxImages) {
    const kind = detectImageKind(img.bytes);
    const canEmbed = kind === 'png' || kind === 'jpeg';
    if (!canEmbed) {
      
      continue;
    }
    const ext = imageKindToExt(kind);
    await zipWriter.add(`word/media/${img.id}.${ext}`, new zip.Uint8ArrayReader(img.bytes));
    imageRels += `<Relationship Id="rId${imageRelId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${img.id}.${ext}"/>`;
    imageRelMap.set(parseInt(img.id.replace('image', '')), imageRelId);
    imageRelId++;
  }

  const stylesRelId = imageRelId++;
  const documentRels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId${stylesRelId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  ${imageRels}
</Relationships>`;
  await zipWriter.add("word/_rels/document.xml.rels", new zip.TextReader(documentRels));

  let documentContent = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
            xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
            xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
            xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
<w:body>`;

  // Cover image
  if (coverImageBytes && canEmbedDocxCover) {
    documentContent += `
<w:p>
  <w:r>
    <w:drawing>
      <wp:inline>
        <wp:extent cx="5943600" cy="7920000"/>
        <wp:docPr id="1" name="Cover"/>
        <a:graphic>
          <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
            <pic:pic>
              <pic:nvPicPr>
                 <pic:cNvPr id="1" name="cover.${coverExt}"/>
                <pic:cNvPicPr/>
              </pic:nvPicPr>
              <pic:blipFill>
                <a:blip r:embed="rId2"/>
                <a:stretch><a:fillRect/></a:stretch>
              </pic:blipFill>
              <pic:spPr>
                <a:xfrm>
                  <a:off x="0" y="0"/>
                  <a:ext cx="5943600" cy="7920000"/>
                </a:xfrm>
                <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
              </pic:spPr>
            </pic:pic>
          </a:graphicData>
        </a:graphic>
      </wp:inline>
    </w:drawing>
  </w:r>
</w:p>
<w:p><w:r><w:br w:type="page"/></w:r></w:p>`;
  }

  // Title page
  documentContent += `
<w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr><w:r><w:t>${escapeXml(book.title)}</w:t></w:r></w:p>
<w:p><w:r><w:t>by ${escapeXml(author)}</w:t></w:r></w:p>
<w:p><w:r><w:t>${escapeXml(book.category?.replace(/_/g, ' ') || 'Book')}</w:t></w:r></w:p>`;

  if (isAcademic) {
    documentContent += `<w:p><w:r><w:rPr><w:i/></w:rPr><w:t>[Academic Content - ${citationStyle} Citations]</w:t></w:r></w:p>`;
  }

  documentContent += `
<w:p><w:r><w:t></w:t></w:r></w:p>
<w:p><w:r><w:t>© ${year} ${escapeXml(author)}. All rights reserved.</w:t></w:r></w:p>
<w:p><w:r><w:t>${isISBN ? `ISBN: ${identifier}` : `Scroll Publishing Code: ${identifier}`}</w:t></w:r></w:p>
<w:p><w:r><w:t>Created with ScrollLibrary - AI-Assisted Content</w:t></w:r></w:p>`;

  // Academic notice
  if (isAcademic) {
    documentContent += `
<w:p><w:r><w:t></w:t></w:r></w:p>
<w:p><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="FFF8E1"/></w:pPr>
<w:r><w:rPr><w:b/></w:rPr><w:t>Academic Content Notice</w:t></w:r></w:p>
<w:p><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="FFF8E1"/></w:pPr>
<w:r><w:t>All references in this document are retrieved from verifiable academic databases. ScrollLibrary does not replace academic judgment. Users remain responsible for proper academic use and verification of all citations.</w:t></w:r></w:p>`;
  }

  documentContent += `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`;

  // Dedication Page
  documentContent += `
<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t></w:t></w:r></w:p>
<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t></w:t></w:r></w:p>
<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t></w:t></w:r></w:p>
<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t></w:t></w:r></w:p>
<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:i/></w:rPr><w:t>This book was created with AI assistance via ScrollLibrary.</w:t></w:r></w:p>
<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:i/></w:rPr><w:t>The author retains full ownership and commercial rights.</w:t></w:r></w:p>
<w:p><w:r><w:br w:type="page"/></w:r></w:p>`;

  // Chapters with embedded images and tables
  let docPicId = 2;
  for (const { chapter, processedContent, imageRefs, tables, structuredCodeBlocks, codeBlocks, headings } of processedChapters) {
    documentContent += `
<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Chapter ${chapter.chapter_number}: ${escapeXml(chapter.title)}</w:t></w:r></w:p>`;
    
    let imageIdx = 0;
    for (const para of processedContent) {
      const trimmed = para.trim();
      if (!trimmed) continue;
      
      // Check for HEADING placeholder - render with Word heading styles
      const headingMatch = trimmed.match(/\[DOCX_HEADING_(\d+)\]/);
      if (headingMatch) {
        const headingIdx = parseInt(headingMatch[1]);
        const heading = headings[headingIdx];
        if (heading) {
          // Map heading level to Word heading style
          // Level 1 is used for chapter titles, so content headings start at Heading2
          const wordHeadingLevel = Math.min(heading.level + 1, 6);
          const headingSizes: Record<number, number> = { 1: 36, 2: 32, 3: 28, 4: 26, 5: 24, 6: 22 };
          const fontSize = headingSizes[heading.level] || 24;
          
          documentContent += `
<w:p><w:pPr><w:pStyle w:val="Heading${wordHeadingLevel}"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="${fontSize}"/></w:rPr><w:t>${escapeXml(heading.text)}</w:t></w:r></w:p>`;
        }
        continue;
      }
      
      // Check for table placeholder
      const tableMatch = trimmed.match(/\[DOCX_TABLE_(\d+)\]/);
      if (tableMatch) {
        const tableIdx = parseInt(tableMatch[1]);
        const table = tables[tableIdx];
        if (table) {
          // Render Word table
          const numCols = table.headers.length;
          const colWidth = Math.floor(9000 / numCols); // Total width ~9000 twips
          
          documentContent += `
<w:tbl>
  <w:tblPr>
    <w:tblW w:w="0" w:type="auto"/>
    <w:tblBorders>
      <w:top w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>
      <w:left w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>
      <w:bottom w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>
      <w:right w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>
      <w:insideH w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>
      <w:insideV w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>
    </w:tblBorders>
  </w:tblPr>
  <w:tblGrid>
    ${table.headers.map(() => `<w:gridCol w:w="${colWidth}"/>`).join('')}
  </w:tblGrid>
  <w:tr>
    ${table.headers.map(h => `<w:tc><w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="F0F0F0"/></w:tcPr><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>${escapeXml(h)}</w:t></w:r></w:p></w:tc>`).join('')}
  </w:tr>
  ${table.rows.map((row, rowIdx) => `<w:tr>
    ${row.map(cell => `<w:tc>${rowIdx % 2 === 1 ? '<w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="FAFAFA"/></w:tcPr>' : ''}<w:p><w:r><w:t>${escapeXml(cell)}</w:t></w:r></w:p></w:tc>`).join('')}
  </w:tr>`).join('\n  ')}
</w:tbl>
<w:p><w:r><w:t></w:t></w:r></w:p>`;
        }
        continue;
      }
      
      // Check for STRUCTURED code block placeholder
      const structuredCodeMatch = trimmed.match(/\[DOCX_STRUCTURED_CODE_(\d+)\]/);
      if (structuredCodeMatch) {
        const codeIdx = parseInt(structuredCodeMatch[1]);
        const block = structuredCodeBlocks[codeIdx];
        if (block) {
          // Render structured code block with full metadata in Word
          // Header with language tag
          documentContent += `
<w:p><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="E8E8EC"/></w:pPr>
<w:r><w:rPr><w:b/><w:color w:val="5C6BC0"/></w:rPr><w:t>[${escapeXml(block.language.toUpperCase())}]</w:t></w:r>
${block.title ? `<w:r><w:t xml:space="preserve"> - ${escapeXml(block.title)}</w:t></w:r>` : ''}
</w:p>`;
          
          // Purpose
          if (block.purpose) {
            documentContent += `<w:p><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="F5F5FA"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>Purpose: </w:t></w:r><w:r><w:t>${escapeXml(block.purpose)}</w:t></w:r></w:p>`;
          }
          
          // Code block (monospace, dark background)
          const codeLines = block.code.split('\n');
          for (const codeLine of codeLines) {
            documentContent += `<w:p><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="1E1E24"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:color w:val="E0E0E0"/><w:sz w:val="18"/></w:rPr><w:t>${escapeXml(codeLine)}</w:t></w:r></w:p>`;
          }
          
          // Output section
          if (block.output) {
            documentContent += `<w:p><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="0A0C0A"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="4CAF50"/><w:sz w:val="16"/></w:rPr><w:t>OUTPUT:</w:t></w:r></w:p>`;
            for (const outLine of block.output.split('\n')) {
              documentContent += `<w:p><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="0A0C0A"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:color w:val="4CAF50"/><w:sz w:val="18"/></w:rPr><w:t>${escapeXml(outLine)}</w:t></w:r></w:p>`;
            }
          }
          
          // Explanation
          if (block.explanation) {
            documentContent += `<w:p><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="FAFAFA"/></w:pPr><w:r><w:rPr><w:b/></w:rPr><w:t>Explanation: </w:t></w:r><w:r><w:t>${escapeXml(block.explanation)}</w:t></w:r></w:p>`;
          }
          
          // Common mistake warning
          if (block.commonMistake) {
            documentContent += `<w:p><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="FFF3E0"/></w:pPr><w:r><w:rPr><w:b/><w:color w:val="E65100"/></w:rPr><w:t>Common Mistake: </w:t></w:r><w:r><w:rPr><w:color w:val="E65100"/></w:rPr><w:t>${escapeXml(block.commonMistake)}</w:t></w:r></w:p>`;
          }
          
          documentContent += `<w:p><w:r><w:t></w:t></w:r></w:p>`;
        }
        continue;
      }
      
      // Check for regular code block placeholder
      const codeMatch = trimmed.match(/\[DOCX_CODE_(\d+)\]/);
      if (codeMatch) {
        const codeIdx = parseInt(codeMatch[1]);
        const block = codeBlocks[codeIdx];
        if (block) {
          // Language label
          documentContent += `<w:p><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="E8E8E8"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="16"/></w:rPr><w:t>${escapeXml(block.lang.toUpperCase())}</w:t></w:r></w:p>`;
          
          // Code lines with monospace font
          for (const codeLine of block.code.split('\n')) {
            documentContent += `<w:p><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="F5F5F5"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas"/><w:sz w:val="18"/></w:rPr><w:t>${escapeXml(codeLine)}</w:t></w:r></w:p>`;
          }
          documentContent += `<w:p><w:r><w:t></w:t></w:r></w:p>`;
        }
        continue;
      }
      
      // Check for image placeholder
      if (trimmed.includes('[IMAGE_PLACEHOLDER]') && imageIdx < imageRefs.length) {
        const imgRef = imageRefs[imageIdx];
        const relId = imageRelMap.get(imgRef.index);
        if (relId) {
          docPicId++;
          documentContent += `
<w:p>
  <w:r>
    <w:drawing>
      <wp:inline>
        <wp:extent cx="4572000" cy="3429000"/>
        <wp:docPr id="${docPicId}" name="${escapeXml(imgRef.alt)}"/>
        <a:graphic>
          <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
            <pic:pic>
              <pic:nvPicPr>
                <pic:cNvPr id="${docPicId}" name="image${imgRef.index}"/>
                <pic:cNvPicPr/>
              </pic:nvPicPr>
              <pic:blipFill>
                <a:blip r:embed="rId${relId}"/>
                <a:stretch><a:fillRect/></a:stretch>
              </pic:blipFill>
              <pic:spPr>
                <a:xfrm>
                  <a:off x="0" y="0"/>
                  <a:ext cx="4572000" cy="3429000"/>
                </a:xfrm>
                <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
              </pic:spPr>
            </pic:pic>
          </a:graphicData>
        </a:graphic>
      </wp:inline>
    </w:drawing>
  </w:r>
</w:p>
<w:p><w:r><w:rPr><w:i/><w:sz w:val="18"/></w:rPr><w:t>${escapeXml(imgRef.alt)}</w:t></w:r></w:p>`;
        } else {
          // Image format not supported in DOCX (webp, svg, gif) - show placeholder
          documentContent += `
<w:p><w:pPr><w:shd w:val="clear" w:color="auto" w:fill="FFF3E0"/><w:pBdr><w:top w:val="single" w:sz="4" w:space="1" w:color="FF9800"/><w:bottom w:val="single" w:sz="4" w:space="1" w:color="FF9800"/></w:pBdr></w:pPr>
<w:r><w:rPr><w:color w:val="E65100"/></w:rPr><w:t>[Image: ${escapeXml(imgRef.alt)}]</w:t></w:r></w:p>
<w:p><w:r><w:rPr><w:i/><w:sz w:val="16"/><w:color w:val="999999"/></w:rPr><w:t>This image format (WebP/SVG/GIF) is not supported in Word documents. View the original in the app or EPUB export.</w:t></w:r></w:p>`;
        }
        imageIdx++;
      } else if (trimmed.includes('[IMAGE_PLACEHOLDER]')) {
        // Image placeholder without corresponding image ref - skip silently
        imageIdx++;
      } else if (!trimmed.includes('[DOCX_TABLE_') && !trimmed.includes('[DOCX_STRUCTURED_CODE_') && !trimmed.includes('[DOCX_CODE_')) {
        // Use styled runs for bold/italic support
        const hasFormatting = /\*/.test(trimmed);
        if (hasFormatting) {
          documentContent += `<w:p>${markdownToDocxRuns(trimmed)}</w:p>`;
        } else {
          documentContent += `<w:p><w:r><w:t xml:space="preserve">${escapeXml(trimmed)}</w:t></w:r></w:p>`;
        }
      }
    }
    documentContent += `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`;
  }

  // Bibliography/References section for ALL books with citations
  if (bibliography.length > 0) {
    const sectionTitle = isAcademic ? 'References' : 'Bibliography';
    documentContent += `
<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>${sectionTitle}</w:t></w:r></w:p>
${isAcademic ? `<w:p><w:r><w:rPr><w:i/></w:rPr><w:t>Citation Style: ${citationStyle}</w:t></w:r></w:p>` : ''}
<w:p><w:r><w:t></w:t></w:r></w:p>`;

    for (const ref of bibliography) {
      documentContent += `<w:p><w:pPr><w:ind w:left="720" w:hanging="720"/></w:pPr><w:r><w:t>${escapeXml(ref)}</w:t></w:r></w:p>`;
    }

    if (isAcademic) {
      documentContent += `
<w:p><w:r><w:t></w:t></w:r></w:p>
<w:p><w:r><w:rPr><w:sz w:val="20"/><w:color w:val="666666"/></w:rPr><w:t>All references are retrieved from verifiable academic databases.</w:t></w:r></w:p>`;
    }
  }

  // About the Author
  documentContent += `
<w:p><w:r><w:br w:type="page"/></w:r></w:p>
<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>About the Author</w:t></w:r></w:p>
<w:p><w:r><w:t>${escapeXml(author)} is the author of "${escapeXml(book.title)}". This work reflects a commitment to advancing knowledge and thought leadership in the field of ${escapeXml(book.category?.replace(/_/g, ' ') || 'general studies')}. The author retains full ownership and commercial rights to this publication.</w:t></w:r></w:p>`;

  documentContent += `</w:body></w:document>`;
  await zipWriter.add("word/document.xml", new zip.TextReader(documentContent));

  await zipWriter.close();
  const blob = await blobWriter.getData();
  return await blob.arrayBuffer();
}
