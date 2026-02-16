import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, rgb, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";
import * as zip from "https://deno.land/x/zipjs@v2.7.32/index.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
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
  student: ["pdf", "epub"],
  premium: ["pdf", "epub", "docx"],
  prophet_tier: ["pdf", "epub", "docx"],
};

// All formats available during trial
const ALL_FORMATS = ["pdf", "epub", "docx"];

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

  // Extract code specifically - look for fenced code block
  const codeMatch = content.match(/code:\s*\n```\w*\n([\s\S]*?)```/);
  const code = codeMatch?.[1]?.trim() || extractMultilineField('code') || '';

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
  
  const codeBlocks: { lang: string; code: string }[] = [];
  const structuredBlocks: StructuredCodeBlockData[] = [];
  const tables: { name: string; headers: string[]; rows: string[][] }[] = [];
  const images: { alt: string; url: string }[] = [];
  const headings: HeadingData[] = [];
  
  // First, parse old custom TABLE: format (legacy support)
  const { tables: customTables, cleanedText: textAfterCustomTables } = parseCustomTableFormat(text);
  console.log(`[EXPORT] Found ${customTables.length} legacy custom tables`);
  
  // Extract STRUCTURED code blocks [CODE_BLOCK]...[/CODE_BLOCK] (ChatGPT-level format)
  let processedText = textAfterCustomTables.replace(/\[CODE_BLOCK\]([\s\S]*?)\[\/CODE_BLOCK\]/g, (_, blockContent) => {
    const parsed = parseStructuredCodeBlockFromText(blockContent);
    if (parsed && parsed.code) {
      structuredBlocks.push(parsed);
      return `[STRUCTURED_CODE_${structuredBlocks.length - 1}]`;
    }
    return '';
  });
  console.log(`[EXPORT] Found ${structuredBlocks.length} structured code blocks`);
  
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
      .map((cell: string) => cell.trim());
    
    // Skip separator row (line with ---)
    // Parse data rows
    const rows: string[][] = [];
    for (let i = 2; i < lines.length; i++) {
      const rowLine = lines[i];
      if (!rowLine.includes('|')) continue;
      const cells = rowLine.split('|')
        .filter((cell: string, idx: number, arr: string[]) => idx > 0 && idx < arr.length - 1 || cell.trim())
        .map((cell: string) => cell.trim())
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
  
  console.log(`[EXPORT] Found ${tables.length} markdown tables, ${codeBlocks.length} code blocks`);
  
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
  
  console.log(`[EXPORT] Found ${headings.length} headings`);
  
  // Strip remaining markdown (but NOT placeholders and NOT headings - already extracted)
  const stripped = processedText
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`[^`]+`/g, (match) => match.slice(1, -1))
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // Regular links (not images)
    .replace(/^\s*[-*]\s+/gm, "• ")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  
  const paragraphs = stripped.split(/\n\n+/).filter(p => p.trim());
  
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
  
  console.log(`[EXPORT] processMarkdownContent found ${images.length} images, ${codeBlocks.length} code blocks, ${structuredBlocks.length} structured blocks, ${tables.length} md tables, ${headings.length} headings`);
  
  return { paragraphs, codeBlocks, structuredBlocks, tables, customTables, images, headings };
}


function stripMarkdown(text: string): string {
  if (!text) return "";
  return text
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")  // Keep inline code content (was deleting it!)
    .replace(/```[\s\S]*?```/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^\s*[-*]\s+/gm, "• ")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Sanitize text for PDF WinAnsi encoding
 * Replaces Unicode characters that cannot be encoded in WinAnsi
 * CRITICAL: Must be called on ALL text before drawText() in PDF generation
 */
function sanitizeForPDF(text: string): string {
  if (!text) return "";
  return text
    // Arrows (these were causing the error!)
    .replace(/→/g, "->")
    .replace(/←/g, "<-")
    .replace(/↔/g, "<->")
    .replace(/⇒/g, "=>")
    .replace(/⇐/g, "<=")
    .replace(/⇔/g, "<=>")
    .replace(/↑/g, "^")
    .replace(/↓/g, "v")
    // ALL apostrophe & quote variants (CRITICAL - these were being silently dropped!)
    .replace(/[\u2018\u2019\u201A\u02BC\u02B9\u02BB\u0060\u00B4]/g, "'")  // All single-quote-like chars
    .replace(/[\u201C\u201D\u201E\u201F\u2033]/g, '"')  // All double-quote-like chars
    .replace(/\u2032/g, "'")   // Prime → apostrophe
    .replace(/\u2035/g, "'")   // Reversed prime
    .replace(/\u02CA/g, "'")   // Modifier letter acute accent
    .replace(/\u02CB/g, "'")   // Modifier letter grave accent
    // Superscript numbers and symbols
    .replace(/⁰/g, "0")
    .replace(/¹/g, "1")
    .replace(/²/g, "2")
    .replace(/³/g, "3")
    .replace(/⁴/g, "4")
    .replace(/⁵/g, "5")
    .replace(/⁶/g, "6")
    .replace(/⁷/g, "7")
    .replace(/⁸/g, "8")
    .replace(/⁹/g, "9")
    .replace(/⁺/g, "+")
    .replace(/⁻/g, "-")
    .replace(/⁼/g, "=")
    .replace(/⁽/g, "(")
    .replace(/⁾/g, ")")
    .replace(/ⁿ/g, "n")
    // Subscript numbers
    .replace(/₀/g, "0")
    .replace(/₁/g, "1")
    .replace(/₂/g, "2")
    .replace(/₃/g, "3")
    .replace(/₄/g, "4")
    .replace(/₅/g, "5")
    .replace(/₆/g, "6")
    .replace(/₇/g, "7")
    .replace(/₈/g, "8")
    .replace(/₉/g, "9")
    .replace(/₊/g, "+")
    .replace(/₋/g, "-")
    .replace(/₌/g, "=")
    .replace(/₍/g, "(")
    .replace(/₎/g, ")")
    // Common math symbols
    .replace(/×/g, "x")
    .replace(/÷/g, "/")
    .replace(/−/g, "-")  // Minus sign (U+2212)
    .replace(/–/g, "-")  // En dash
    .replace(/—/g, "-")  // Em dash
    .replace(/…/g, "...")
    .replace(/•/g, "-")  // Bullet
    .replace(/◦/g, "o")  // White bullet
    .replace(/▪/g, "-")  // Black small square
    .replace(/▸/g, ">")  // Right-pointing triangle
    .replace(/▹/g, ">")  // White right-pointing triangle
    .replace(/◂/g, "<")  // Left-pointing triangle
    .replace(/◃/g, "<")  // White left-pointing triangle
    .replace(/≈/g, "~")
    .replace(/≠/g, "!=")
    .replace(/≤/g, "<=")
    .replace(/≥/g, ">=")
    .replace(/∞/g, "infinity")
    .replace(/π/g, "pi")
    .replace(/α/g, "alpha")
    .replace(/β/g, "beta")
    .replace(/γ/g, "gamma")
    .replace(/δ/g, "delta")
    .replace(/ε/g, "epsilon")
    .replace(/θ/g, "theta")
    .replace(/λ/g, "lambda")
    .replace(/μ/g, "mu")
    .replace(/σ/g, "sigma")
    .replace(/φ/g, "phi")
    .replace(/ω/g, "omega")
    .replace(/Ω/g, "Omega")
    .replace(/∑/g, "sum")
    .replace(/∏/g, "product")
    .replace(/√/g, "sqrt")
    .replace(/∫/g, "integral")
    .replace(/∂/g, "d")
    .replace(/∆/g, "delta")
    .replace(/∇/g, "nabla")
    // Trademark/legal symbols that ARE in Latin-1
    .replace(/™/g, "(TM)")
    .replace(/℠/g, "(SM)")
    .replace(/℗/g, "(P)")
    // German/international chars that ARE supported in WinAnsi
    // Keep: ä ö ü ß Ä Ö Ü é è ê ë © ® ° ½ ¼ ¾ etc. (these are in Latin-1)
    // Fallback: remove any remaining non-WinAnsi characters (keep basic ASCII + Latin-1)
    .replace(/[^\x00-\xFF]/g, "");
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

async function fetchImageBytes(url: string): Promise<Uint8Array | null> {
  try {
    // Handle base64 data URIs
    if (url.startsWith("data:image")) {
      console.log("[EXPORT] Decoding base64 image data...");
      const base64Data = url.split(",")[1];
      if (!base64Data) {
        console.error("[EXPORT] Invalid base64 data URI");
        return null;
      }
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      console.log(`[EXPORT] Decoded base64 image: ${bytes.length} bytes`);
      return bytes;
    }
    
    // Handle remote URLs (storage URLs, etc.)
    console.log(`[EXPORT] Fetching remote image: ${url.slice(0, 100)}...`);
    const response = await fetch(url, {
      headers: {
        'Accept': 'image/*',
      },
    });
    
    if (!response.ok) {
      console.error(`[EXPORT] Failed to fetch image: ${response.status} ${response.statusText}`);
      return null;
    }
    
    const arrayBuffer = await response.arrayBuffer();
    console.log(`[EXPORT] Fetched remote image: ${arrayBuffer.byteLength} bytes`);
    return new Uint8Array(arrayBuffer);
  } catch (error) {
    console.error("[EXPORT] Error fetching image:", error);
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

    console.log(`[EXPORT] Authenticated user: ${user.id.slice(0, 8)}...`);

    // Check if user is admin
    const { data: userRoles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);
    
    const isAdmin = userRoles?.some(r => r.role === 'admin') || false;

    // Check if trial mode is active - bypass all restrictions
    const trialActive = isTrialActive();
    
    // Get user's subscription plan
    const { data: profile } = await supabase
      .from("profiles")
      .select("plan")
      .eq("id", user.id)
      .single();

    const userPlan = profile?.plan || "free";
    
    // During trial or admin, allow all formats
    const allowedFormats = (trialActive || isAdmin)
      ? ALL_FORMATS 
      : (TIER_FORMATS[userPlan as keyof typeof TIER_FORMATS] || TIER_FORMATS.free);

    const { bookId, format, authorName, isbn, academicMode, citationStyle } = await req.json();

    console.log(`[EXPORT] Trial active: ${trialActive}, User plan: ${userPlan}, Admin: ${isAdmin}, Requested format: ${format}`);
    console.log(`[EXPORT] Academic mode: ${academicMode}, Citation style: ${citationStyle}`);

    // Check format permissions (skip during trial or admin)
    if (!trialActive && !isAdmin && !allowedFormats.includes(format)) {
      console.log(`[EXPORT] Format ${format} not allowed for ${userPlan} plan`);
      return new Response(JSON.stringify({ 
        error: `${format.toUpperCase()} export requires ${format === 'docx' ? 'Premium' : 'Student'} plan or higher.` 
      }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[EXPORT] Exporting book ${bookId.slice(0, 8)}... as ${format}`);

    // Fetch book and verify ownership
    const { data: book, error: bookError } = await supabase
      .from("books")
      .select("*")
      .eq("id", bookId)
      .single();

    if (bookError || !book) throw new Error("Book not found");
    
    // Verify user owns the book or it's published (admins can export any book)
    if (book.creator_id !== user.id && !book.is_published && !isAdmin) {
      return new Response(JSON.stringify({ error: "Not authorized to export this book" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!book.cover_image_url) throw new Error("Export requires a cover image");

    // Fetch chapters with references
    const { data: chapters, error: chaptersError } = await supabase
      .from("chapters")
      .select("*, chapter_references, research_metadata, citation_style, academic_mode")
      .eq("book_id", bookId)
      .eq("is_generated", true)
      .order("chapter_number");

    if (chaptersError) throw new Error("Failed to fetch chapters");
    if (!chapters || chapters.length === 0) throw new Error("No generated chapters found");

    // Fetch book-level citations from book_citations table
    const { data: bookCitations } = await supabase
      .from("book_citations")
      .select("*")
      .eq("book_id", bookId)
      .order("created_at");

    // Determine if this is academic content
    const isAcademicExport = academicMode || chapters.some(ch => ch.academic_mode);
    const effectiveCitationStyle = citationStyle || chapters.find(ch => ch.citation_style)?.citation_style || 'APA';

    // VALIDATION for academic exports
    if (isAcademicExport) {
      const hasRefs = hasAcademicReferences(chapters);
      if (!hasRefs) {
        console.log("[EXPORT] Warning: Academic export requested but no references found");
      }
    }

    // Fetch cover image
    console.log(`[EXPORT] Fetching cover image...`);
    const coverImageBytes = await fetchImageBytes(book.cover_image_url);
    
    const finalAuthorName = authorName || book.author_ai_agent || "Unknown Author";
    const publishingIdentifier = isbn && isValidISBN(isbn) ? isbn : generateSPC(bookId);
    const isISBN = isbn && isValidISBN(isbn);
    const year = new Date().getFullYear();

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

    console.log(`[EXPORT] Found ${chapters.length} chapters, ${bibliography.length} unique references, generating ${format}`);

    let content: string;
    let contentType: string;
    let filename: string;
    let isBase64 = false;

    switch (format) {
      case "pdf": {
        const pdfBytes = await generatePDF(book, chapters, finalAuthorName, publishingIdentifier, isISBN, year, coverImageBytes, isAcademicExport, effectiveCitationStyle, bibliography);
        content = uint8ArrayToBase64(pdfBytes);
        contentType = "application/pdf";
        filename = `${sanitizeFilename(book.title)}.pdf`;
        isBase64 = true;
        break;
      }
      
      case "epub": {
        const epubBytes = await generateEPUB(book, chapters, finalAuthorName, publishingIdentifier, isISBN, year, coverImageBytes, isAcademicExport, effectiveCitationStyle, bibliography);
        content = uint8ArrayToBase64(new Uint8Array(epubBytes));
        contentType = "application/epub+zip";
        filename = `${sanitizeFilename(book.title)}.epub`;
        isBase64 = true;
        break;
      }
      
      case "docx": {
        const docxBytes = await generateDOCX(book, chapters, finalAuthorName, publishingIdentifier, isISBN, year, coverImageBytes, isAcademicExport, effectiveCitationStyle, bibliography);
        content = uint8ArrayToBase64(new Uint8Array(docxBytes));
        contentType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        filename = `${sanitizeFilename(book.title)}.docx`;
        isBase64 = true;
        break;
      }
      
      default:
        throw new Error(`Unsupported format: ${format}`);
    }

    console.log(`[EXPORT] Export complete: ${format}, Academic: ${isAcademicExport}, References: ${bibliography.length}`);

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
  bibliography: string[]
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const timesRoman = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  const timesRomanBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const courier = await pdfDoc.embedFont(StandardFonts.Courier); // Monospace for code
  
  const pageWidth = 612;
  const pageHeight = 792;
  const margin = 72;
  const textWidth = pageWidth - (margin * 2);
  
  let pageNumber = 0;
  
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
          console.log("[EXPORT] Could not embed cover image, using text-only cover");
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
  
  page.drawText(`Published by Scroll Nations Publishing`, {
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
    `© ${year} ${author}. All rights reserved.`,
    "",
    isISBN ? `ISBN: ${identifier}` : `Scroll Publishing Code: ${identifier}`,
    isISBN ? "" : "(Internal identifier - not an ISBN)",
    "",
    "This work was created with AI assistance under the full authorship",
    "and ownership of the author. The author retains all commercial rights.",
    "",
    `Published by Scroll Nations Publishing`,
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
    page.drawText(line, {
      x: margin,
      y,
      size: 10,
      font: timesRoman,
      color: rgb(0.3, 0.3, 0.3),
    });
    y -= 16;
  }

  // Dedication Page
  page = pdfDoc.addPage([pageWidth, pageHeight]);
  pageNumber++;
  y = pageHeight / 2 + 40;
  
  const dedicationText = book.description 
    ? "To all who dare to lead with integrity and purpose."
    : "To all who dare to lead with integrity and purpose.";
  
  page.drawText("DEDICATION", {
    x: pageWidth / 2 - timesRomanBold.widthOfTextAtSize("DEDICATION", 14) / 2,
    y: y + 40,
    size: 14,
    font: timesRomanBold,
    color: rgb(0.3, 0.3, 0.3),
  });
  
  const dedLines = wrapText(dedicationText, timesRoman, 14, textWidth - 80);
  for (const line of dedLines) {
    const lineW = timesRoman.widthOfTextAtSize(line, 14);
    page.drawText(line, {
      x: pageWidth / 2 - lineW / 2,
      y,
      size: 14,
      font: timesRoman,
      color: rgb(0.3, 0.3, 0.3),
    });
    y -= 22;
  }

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
    page.drawText(sanitizeForPDF(`Chapter ${chapter.chapter_number}: ${chapter.title}`), {
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
  let currentChapterTitle = "";
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
    const { paragraphs, codeBlocks, structuredBlocks, images, customTables, tables: mdTables, headings } = processMarkdownContent(chapter.content || "");
    
    // Pre-fetch all images for this chapter (for comics)
    const fetchedImages: Map<number, { bytes: Uint8Array; type: 'png' | 'jpg' }> = new Map();
    for (let i = 0; i < images.length; i++) {
      const imgData = images[i];
      if (imgData.url) {
        console.log(`[EXPORT] Fetching image ${i + 1}/${images.length}: ${imgData.alt}`);
        const imageBytes = await fetchImageBytes(imgData.url);
        if (imageBytes) {
          // Detect image type
          const isPng = imageBytes[0] === 0x89 && imageBytes[1] === 0x50;
          fetchedImages.set(i, { bytes: imageBytes, type: isPng ? 'png' : 'jpg' });
        }
      }
    }
    
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
          
          // Draw background
          const codeLines = block.code.split('\n');
          const codeHeight = codeLines.length * 12 + 20;
          
          if (y - codeHeight < margin + 30) {
            page = pdfDoc.addPage([pageWidth, pageHeight]);
            pageNumber++;
            addPageNumber(page, pageNumber);
            y = pageHeight - margin - 30;
          }
          
          page.drawRectangle({
            x: margin - 5,
            y: y - codeHeight + 10,
            width: textWidth + 10,
            height: codeHeight,
            color: rgb(0.95, 0.95, 0.95),
          });
          
          // Language label
          page.drawText(block.lang.toUpperCase(), {
            x: margin,
            y: y,
            size: 8,
            font: helvetica,
            color: rgb(0.5, 0.5, 0.5),
          });
          y -= 15;
          
          // Code content
          for (const codeLine of codeLines) {
            page.drawText(sanitizeForPDF(codeLine.slice(0, 80)), { // Truncate long lines
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
          
          // Code background
          const codeHeight = codeLines.length * 12 + 15;
          page.drawRectangle({
            x: margin - 5,
            y: y - codeHeight,
            width: textWidth + 10,
            height: codeHeight,
            color: rgb(0.12, 0.12, 0.15),
          });
          
          y -= 10;
          for (const codeLine of codeLines) {
            page.drawText(sanitizeForPDF(codeLine.slice(0, 80)), {
              x: margin,
              y,
              size: 9,
              font: courier,
              color: rgb(0.9, 0.9, 0.9), // Light text on dark background
            });
            y -= 12;
          }
          y -= 5;
          
          // Output section
          if (block.output) {
            page.drawRectangle({
              x: margin - 5,
              y: y - (block.output.split('\n').length * 12 + 20),
              width: textWidth + 10,
              height: block.output.split('\n').length * 12 + 20,
              color: rgb(0.08, 0.10, 0.08),
            });
            
            page.drawText("OUTPUT:", {
              x: margin,
              y: y - 12,
              size: 8,
              font: helvetica,
              color: rgb(0.4, 0.8, 0.4),
            });
            y -= 18;
            
            for (const outLine of block.output.split('\n')) {
              page.drawText(sanitizeForPDF(outLine.slice(0, 80)), {
                x: margin,
                y,
                size: 9,
                font: courier,
                color: rgb(0.4, 0.9, 0.4), // Green output text
              });
              y -= 12;
            }
            y -= 5;
          }
          
          // Explanation
          if (block.explanation) {
            const explLines = wrapText(`Explanation: ${block.explanation}`, timesRoman, 9, textWidth);
            for (const line of explLines) {
              page.drawText(line, {
                x: margin,
                y,
                size: 9,
                font: timesRoman,
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
          // Render custom table
          y -= 10;
          
          // Calculate table dimensions
          const numCols = table.headers.length;
          const colWidth = textWidth / numCols;
          const rowHeight = 18;
          const headerHeight = 24;
          const tableHeight = headerHeight + (table.rows.length * rowHeight) + 30;
          
          if (y - tableHeight < margin + 30) {
            page = pdfDoc.addPage([pageWidth, pageHeight]);
            pageNumber++;
            addPageNumber(page, pageNumber);
            y = pageHeight - margin - 30;
          }
          
          // Table title - MUST sanitize for PDF encoding
          page.drawText(sanitizeForPDF(table.name), {
            x: margin,
            y,
            size: 11,
            font: timesRomanBold,
            color: rgb(0.1, 0.1, 0.1),
          });
          y -= 20;
          
          // Draw header background
          page.drawRectangle({
            x: margin,
            y: y - headerHeight + 5,
            width: textWidth,
            height: headerHeight,
            color: rgb(0.92, 0.92, 0.92),
          });
          
          // Draw headers
          for (let i = 0; i < table.headers.length; i++) {
            const headerText = sanitizeForPDF(table.headers[i].slice(0, 25)); // Truncate long headers
            page.drawText(headerText, {
              x: margin + (i * colWidth) + 5,
              y: y - 12,
              size: 9,
              font: timesRomanBold,
              color: rgb(0.1, 0.1, 0.1),
            });
          }
          y -= headerHeight;
          
          // Draw rows
          for (let rowIdx = 0; rowIdx < table.rows.length; rowIdx++) {
            const row = table.rows[rowIdx];
            
            // Alternate row background
            if (rowIdx % 2 === 1) {
              page.drawRectangle({
                x: margin,
                y: y - rowHeight + 5,
                width: textWidth,
                height: rowHeight,
                color: rgb(0.97, 0.97, 0.97),
              });
            }
            
            for (let colIdx = 0; colIdx < row.length && colIdx < numCols; colIdx++) {
              const cellText = sanitizeForPDF((row[colIdx] || '').slice(0, 30)); // Truncate long values
              page.drawText(cellText, {
                x: margin + (colIdx * colWidth) + 5,
                y: y - 12,
                size: 9,
                font: timesRoman,
                color: rgb(0.2, 0.2, 0.2),
              });
            }
            y -= rowHeight;
            
            // Check if we need a new page
            if (y < margin + 30 && rowIdx < table.rows.length - 1) {
              page = pdfDoc.addPage([pageWidth, pageHeight]);
              pageNumber++;
              addPageNumber(page, pageNumber);
              y = pageHeight - margin - 30;
            }
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
          // Render markdown table
          y -= 10;
          
          // Calculate table dimensions
          const numCols = Math.min(table.headers.length, 6); // Max 6 columns for readability
          const colWidth = textWidth / numCols;
          const rowHeight = 18;
          const headerHeight = 24;
          const tableHeight = headerHeight + (table.rows.length * rowHeight) + 30;
          
          if (y - tableHeight < margin + 30) {
            page = pdfDoc.addPage([pageWidth, pageHeight]);
            pageNumber++;
            addPageNumber(page, pageNumber);
            y = pageHeight - margin - 30;
          }
          
          // Table title (if present)
          if (table.name && table.name !== 'Table') {
            page.drawText(sanitizeForPDF(table.name), {
              x: margin,
              y,
              size: 11,
              font: timesRomanBold,
              color: rgb(0.1, 0.1, 0.1),
            });
            y -= 20;
          }
          
          // Draw header background
          page.drawRectangle({
            x: margin,
            y: y - headerHeight + 5,
            width: textWidth,
            height: headerHeight,
            color: rgb(0.92, 0.92, 0.92),
          });
          
          // Draw headers - MUST sanitize for PDF encoding
          for (let i = 0; i < numCols; i++) {
            const headerText = sanitizeForPDF((table.headers[i] || '').slice(0, 25));
            page.drawText(headerText, {
              x: margin + (i * colWidth) + 5,
              y: y - 12,
              size: 9,
              font: timesRomanBold,
              color: rgb(0.1, 0.1, 0.1),
            });
          }
          y -= headerHeight;
          
          // Draw rows
          for (let rowIdx = 0; rowIdx < table.rows.length; rowIdx++) {
            const row = table.rows[rowIdx];
            
            // Alternate row background
            if (rowIdx % 2 === 1) {
              page.drawRectangle({
                x: margin,
                y: y - rowHeight + 5,
                width: textWidth,
                height: rowHeight,
                color: rgb(0.97, 0.97, 0.97),
              });
            }
            
            for (let colIdx = 0; colIdx < numCols && colIdx < row.length; colIdx++) {
              const cellText = sanitizeForPDF((row[colIdx] || '').slice(0, 30));
              page.drawText(cellText, {
                x: margin + (colIdx * colWidth) + 5,
                y: y - 12,
                size: 9,
                font: timesRoman,
                color: rgb(0.2, 0.2, 0.2),
              });
            }
            y -= rowHeight;
            
            // Check if we need a new page
            if (y < margin + 30 && rowIdx < table.rows.length - 1) {
              page = pdfDoc.addPage([pageWidth, pageHeight]);
              pageNumber++;
              addPageNumber(page, pageNumber);
              y = pageHeight - margin - 30;
            }
          }
          
          y -= 15;
          continue;
        }
      }
      
      const lines = wrapText(paragraph.trim(), timesRoman, 11, textWidth);
      for (const line of lines) {
        if (y < margin + 30) {
          page = pdfDoc.addPage([pageWidth, pageHeight]);
          pageNumber++;
          addPageNumber(page, pageNumber);
          y = pageHeight - margin - 30;
        }
        
        page.drawText(line, {
          x: margin,
          y,
          size: 11,
          font: timesRoman,
          color: rgb(0.1, 0.1, 0.1),
        });
        y -= 16;
      }
      y -= 8;
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
    y -= 20;
    page.drawText("All references are retrieved from verifiable academic databases.", {
      x: margin,
      y,
      size: 9,
      font: helvetica,
      color: rgb(0.4, 0.4, 0.4),
    });
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
    
    // Extract and process images
    const imageMatches = [...content.matchAll(/!\[([^\]]*)\]\(([^)]+)\)/g)];
    const imageMap: Map<string, string> = new Map();
    
    for (const match of imageMatches) {
      const [fullMatch, alt, url] = match;
      
      console.log(`[EXPORT] Fetching EPUB image: ${alt || 'panel'}`);
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
    
    // Replace image markdown with HTML
    for (const [original, replacement] of imageMap) {
      content = content.replace(original, replacement);
    }
    
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
    
    // Convert HEADING placeholders to proper HTML heading tags
    content = content.replace(/\[HEADING_(\d+)_LEVEL_(\d+)\]/g, (_match: string, _idx: string, level: string) => {
      return `[HEADING_PLACEHOLDER_${_idx}_${level}]`;
    });
    
    // Protect <pre> blocks from being split by \n\n paragraph splitting
    // Replace double newlines inside <pre>...</pre> with a placeholder
    content = content.replace(/<pre[\s\S]*?<\/pre>/g, (block: string) => {
      return block.replace(/\n\n+/g, '\n');
    });
    
    // Convert paragraphs (skip already processed HTML) - with heading support
    const htmlContent = content
      .split(/\n\n+/)
      .map((p: string) => {
        p = p.trim();
        if (!p) return '';
        if (p.startsWith('<pre>') || p.startsWith('<code>') || p.startsWith('<figure>') || p.startsWith('<p>') || p.startsWith('<table>') || p.startsWith('<div')) return p;
        // Skip prose that's clearly table data (Row N: format)
        if (/^Row \d+:/.test(p)) return '';
        
        // Check for heading placeholder and convert to proper HTML heading
        const headingMatch = p.match(/\[HEADING_PLACEHOLDER_(\d+)_(\d+)\](.*)$/);
        if (headingMatch) {
          const level = headingMatch[2];
          const headingText = p.replace(/\[HEADING_PLACEHOLDER_\d+_\d+\]/, '').trim();
          return `<h${level}>${escapeXml(headingText)}</h${level}>`;
        }
        
        // Handle remaining heading placeholders that contain the text
        const simpleHeadingMatch = p.match(/^\[HEADING_(\d+)_LEVEL_(\d+)\]$/);
        if (simpleHeadingMatch) {
          return '';
        }
        
        // If paragraph contains already-converted HTML tags, pass through as-is
        if (/<(?:code|strong|em|a|span|br)\b/.test(p)) {
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
    <dc:publisher>Scroll Nations Publishing</dc:publisher>
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
  const css = `body { font-family: Georgia, serif; margin: 2em; line-height: 1.6; }
h1 { font-size: 1.8em; margin-bottom: 0.5em; margin-top: 1em; font-weight: bold; }
h2 { font-size: 1.5em; margin-top: 1.5em; margin-bottom: 0.5em; font-weight: bold; border-bottom: 1px solid #ddd; padding-bottom: 0.3em; }
h3 { font-size: 1.3em; margin-top: 1.3em; margin-bottom: 0.4em; font-weight: bold; }
h4 { font-size: 1.15em; margin-top: 1.2em; margin-bottom: 0.3em; font-weight: bold; }
h5 { font-size: 1.05em; margin-top: 1em; margin-bottom: 0.3em; font-weight: bold; }
h6 { font-size: 1em; margin-top: 1em; margin-bottom: 0.3em; font-weight: bold; font-style: italic; }
p { margin: 0.8em 0; text-align: justify; }
.cover { text-align: center; }
.cover img { max-width: 100%; height: auto; }
pre { background: #1e1e24; color: #e0e0e0; padding: 1em; border-radius: 4px; overflow-x: auto; font-family: monospace; font-size: 0.9em; }
pre.code-content { background: #1e1e24; color: #e0e0e0; margin: 0; border-radius: 0 0 4px 4px; }
code { font-family: monospace; background: #f0f0f0; padding: 0.2em 0.4em; border-radius: 3px; }
pre code { background: transparent; padding: 0; }
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
figure { margin: 1em 0; text-align: center; }
figcaption { font-style: italic; font-size: 0.9em; color: #666; margin-top: 0.5em; }
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
<p>Published by Scroll Nations Publishing</p>`;

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
<head><title>Dedication</title><link rel="stylesheet" href="style.css"/></head>
<body>
<div style="text-align: center; margin-top: 40%; font-style: italic;">
<h2>Dedication</h2>
<p>To all who dare to lead with integrity and purpose.</p>
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
    const imageMatches = [...content.matchAll(/!\[([^\]]*)\]\(([^)]+)\)/g)];
    const imageRefs: { index: number; alt: string }[] = [];
    
    for (const match of imageMatches) {
      const [, alt, url] = match;
      console.log(`[EXPORT] Fetching DOCX image: ${alt || 'panel'}`);
      const imageBytes = await fetchImageBytes(url);
      if (imageBytes) {
        imageCounter++;
        docxImages.push({ id: `image${imageCounter}`, bytes: imageBytes });
        imageRefs.push({ index: imageCounter, alt: alt || 'Panel' });
      }
    }
    
    // Strip images from content for text processing
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
    
    // Use stripMarkdown but preserve heading placeholders
    const paragraphs = stripMarkdown(textContent).split(/\n\n+/);
    
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
</Types>`;
  await zipWriter.add("[Content_Types].xml", new zip.TextReader(contentTypes));

  const rels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;
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
    console.log(`[EXPORT] DOCX cover image type not supported (${coverKind}); using text-only cover page`);
  }
  
  // Add all chapter images
  const imageRelMap: Map<number, number> = new Map();
  for (const img of docxImages) {
    const kind = detectImageKind(img.bytes);
    const canEmbed = kind === 'png' || kind === 'jpeg';
    if (!canEmbed) {
      console.log(`[EXPORT] DOCX image ${img.id} type not supported (${kind}); skipping embed`);
      continue;
    }
    const ext = imageKindToExt(kind);
    await zipWriter.add(`word/media/${img.id}.${ext}`, new zip.Uint8ArrayReader(img.bytes));
    imageRels += `<Relationship Id="rId${imageRelId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${img.id}.${ext}"/>`;
    imageRelMap.set(parseInt(img.id.replace('image', '')), imageRelId);
    imageRelId++;
  }

  const documentRels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
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
<w:p><w:r><w:t>Published by Scroll Nations Publishing</w:t></w:r></w:p>`;

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
<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="28"/></w:rPr><w:t>Dedication</w:t></w:r></w:p>
<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t></w:t></w:r></w:p>
<w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:i/></w:rPr><w:t>To all who dare to lead with integrity and purpose.</w:t></w:r></w:p>
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
        documentContent += `<w:p><w:r><w:t>${escapeXml(trimmed)}</w:t></w:r></w:p>`;
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

    documentContent += `
<w:p><w:r><w:t></w:t></w:r></w:p>
<w:p><w:r><w:rPr><w:sz w:val="20"/><w:color w:val="666666"/></w:rPr><w:t>All references are retrieved from verifiable academic databases.</w:t></w:r></w:p>`;
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
