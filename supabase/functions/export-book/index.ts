import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, rgb, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";
import * as zip from "https://deno.land/x/zipjs@v2.7.32/index.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ===========================================
// TRIAL MODE CONFIG - Matches src/lib/config.ts
// During trial, all users get full export access
// ===========================================
const TRIAL_MODE = true;
const TRIAL_END_DATE = new Date('2026-01-20');

function isTrialActive(): boolean {
  if (!TRIAL_MODE) return false;
  return new Date() < TRIAL_END_DATE;
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

// Enhanced markdown processing that preserves code blocks
function processMarkdownContent(text: string): { paragraphs: string[]; codeBlocks: { lang: string; code: string }[]; tables: string[][] } {
  if (!text) return { paragraphs: [], codeBlocks: [], tables: [] };
  
  const codeBlocks: { lang: string; code: string }[] = [];
  const tables: string[][] = [];
  
  // Extract code blocks first
  let processedText = text.replace(/```(\w+)?\n([\s\S]*?)```/g, (_, lang, code) => {
    codeBlocks.push({ lang: lang || 'text', code: code.trim() });
    return `[CODE_BLOCK_${codeBlocks.length - 1}]`;
  });
  
  // Extract tables
  const tableRegex = /\|[^\n]+\|\n\|[-:| ]+\|\n(\|[^\n]+\|\n)+/g;
  processedText = processedText.replace(tableRegex, (match) => {
    const rows = match.split('\n').filter(r => r.trim() && !r.match(/^[-:| ]+$/));
    const tableData = rows.map(row => 
      row.split('|').filter(cell => cell.trim()).map(cell => cell.trim())
    );
    tables.push(tableData.flat());
    return `[TABLE_${tables.length - 1}]`;
  });
  
  // Strip remaining markdown
  const stripped = processedText
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`[^`]+`/g, (match) => match.slice(1, -1))
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^\s*[-*]\s+/gm, "• ")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  
  const paragraphs = stripped.split(/\n\n+/).filter(p => p.trim());
  
  return { paragraphs, codeBlocks, tables };
}

function stripMarkdown(text: string): string {
  if (!text) return "";
  return text
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`[^`]+`/g, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^\s*[-*]\s+/gm, "• ")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function fetchImageBytes(url: string): Promise<Uint8Array | null> {
  try {
    if (url.startsWith("data:image")) {
      const base64Data = url.split(",")[1];
      const binaryString = atob(base64Data);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      return bytes;
    }
    
    const response = await fetch(url);
    if (!response.ok) return null;
    const arrayBuffer = await response.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  } catch (error) {
    console.error("[EXPORT] Error fetching image:", error);
    return null;
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
    
    const finalAuthorName = authorName || book.author_ai_agent || "ScrollLibrary Author";
    const publishingIdentifier = isbn && isValidISBN(isbn) ? isbn : generateSPC(bookId);
    const isISBN = isbn && isValidISBN(isbn);
    const year = new Date().getFullYear();

    // Generate bibliography for academic exports
    const bibliography = isAcademicExport ? generateBibliography(chapters, effectiveCitationStyle) : [];

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
    if (num > 3) {
      page.drawText(String(num - 3), {
        x: pageWidth / 2 - 5,
        y: 30,
        size: 10,
        font: helvetica,
        color: rgb(0.5, 0.5, 0.5),
      });
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
  
  page.drawText("ScrollLibrary Publishing", {
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
    "Published by ScrollLibrary Publishing",
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
    page.drawText(`Chapter ${chapter.chapter_number}: ${chapter.title}`, {
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
  
  // Add References entry if academic
  if (isAcademic && bibliography.length > 0) {
    y -= 20;
    page.drawText("References", {
      x: margin,
      y,
      size: 12,
      font: timesRomanBold,
      color: rgb(0.2, 0.2, 0.2),
    });
  }

  // Chapters
  for (const chapter of chapters) {
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
    
    // Process content with code block handling
    const { paragraphs, codeBlocks } = processMarkdownContent(chapter.content || "");
    
    for (const paragraph of paragraphs) {
      if (!paragraph.trim()) continue;
      
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
            page.drawText(codeLine.slice(0, 80), { // Truncate long lines
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

  // Bibliography/References section for academic content
  if (isAcademic && bibliography.length > 0) {
    page = pdfDoc.addPage([pageWidth, pageHeight]);
    pageNumber++;
    addPageNumber(page, pageNumber);
    y = pageHeight - margin - 50;
    
    page.drawText("REFERENCES", {
      x: margin,
      y,
      size: 18,
      font: timesRomanBold,
      color: rgb(0.1, 0.1, 0.1),
    });
    y -= 40;
    
    page.drawText(`Citation Style: ${citationStyle}`, {
      x: margin,
      y,
      size: 10,
      font: helvetica,
      color: rgb(0.5, 0.5, 0.5),
    });
    y -= 30;
    
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

  return pdfDoc.save();
}

function wrapText(text: string, font: any, fontSize: number, maxWidth: number): string[] {
  const words = text.split(/\s+/);
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

// ===== EPUB Generation with Cover and References =====
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
  if (hasCover) {
    await zipWriter.add("OEBPS/images/cover.jpg", new zip.Uint8ArrayReader(coverImageBytes));
  }

  const chapterItems = chapters.map((ch, i) => ({
    id: `chapter${i + 1}`,
    href: `chapter${i + 1}.xhtml`,
    chapter: ch,
  }));

  // Add references as separate document for academic
  const hasRefs = isAcademic && bibliography.length > 0;

  const contentOpf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">${identifier}</dc:identifier>
    <dc:title>${escapeXml(book.title)}</dc:title>
    <dc:creator>${escapeXml(author)}</dc:creator>
    <dc:language>${book.language || 'en'}</dc:language>
    <dc:publisher>ScrollLibrary Publishing</dc:publisher>
    <dc:date>${year}</dc:date>
    <meta property="dcterms:modified">${new Date().toISOString().split('.')[0]}Z</meta>
    ${hasCover ? '<meta name="cover" content="cover-image"/>' : ''}
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    ${hasCover ? '<item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>' : ''}
    ${hasCover ? '<item id="cover-image" href="images/cover.jpg" media-type="image/jpeg" properties="cover-image"/>' : ''}
    <item id="title" href="title.xhtml" media-type="application/xhtml+xml"/>
    ${chapterItems.map(c => `<item id="${c.id}" href="${c.href}" media-type="application/xhtml+xml"/>`).join('\n    ')}
    ${hasRefs ? '<item id="references" href="references.xhtml" media-type="application/xhtml+xml"/>' : ''}
    <item id="css" href="style.css" media-type="text/css"/>
  </manifest>
  <spine>
    ${hasCover ? '<itemref idref="cover"/>' : ''}
    <itemref idref="nav"/>
    <itemref idref="title"/>
    ${chapterItems.map(c => `<itemref idref="${c.id}"/>`).join('\n    ')}
    ${hasRefs ? '<itemref idref="references"/>' : ''}
  </spine>
</package>`;
  await zipWriter.add("OEBPS/content.opf", new zip.TextReader(contentOpf));

  // Enhanced CSS with code block styling
  const css = `body { font-family: Georgia, serif; margin: 2em; line-height: 1.6; }
h1 { font-size: 1.8em; margin-bottom: 0.5em; }
h2 { font-size: 1.4em; margin-top: 1.5em; }
p { margin: 0.8em 0; text-align: justify; }
.cover { text-align: center; }
.cover img { max-width: 100%; height: auto; }
pre { background: #f5f5f5; padding: 1em; border-radius: 4px; overflow-x: auto; font-family: monospace; font-size: 0.9em; }
code { font-family: monospace; background: #f0f0f0; padding: 0.2em 0.4em; border-radius: 3px; }
.reference { margin: 0.5em 0; padding-left: 2em; text-indent: -2em; font-size: 0.95em; }
.academic-notice { background: #fff8e1; border-left: 4px solid #ffc107; padding: 1em; margin: 1em 0; font-size: 0.9em; }
table { border-collapse: collapse; width: 100%; margin: 1em 0; }
th, td { border: 1px solid #ddd; padding: 0.5em; text-align: left; }
th { background: #f5f5f5; }`;
  await zipWriter.add("OEBPS/style.css", new zip.TextReader(css));

  if (hasCover) {
    const coverXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>Cover</title><link rel="stylesheet" href="style.css"/></head>
<body class="cover"><img src="images/cover.jpg" alt="Cover"/></body>
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
<p>Published by ScrollLibrary Publishing</p>`;

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

  // Process chapters with proper code block handling
  for (const item of chapterItems) {
    let content = item.chapter.content || "";
    
    // Convert markdown code blocks to HTML
    content = content.replace(/```(\w+)?\n([\s\S]*?)```/g, (_match: string, lang: string, code: string) => {
      return `<pre><code class="${lang || 'text'}">${escapeXml(code.trim())}</code></pre>`;
    });
    
    // Convert inline code
    content = content.replace(/`([^`]+)`/g, '<code>$1</code>');
    
    // Convert paragraphs
    const htmlContent = content
      .split(/\n\n+/)
      .map((p: string) => {
        if (p.startsWith('<pre>') || p.startsWith('<code>')) return p;
        return `<p>${escapeXml(p.trim())}</p>`;
      })
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
    await zipWriter.add(`OEBPS/${item.href}`, new zip.TextReader(chapterXhtml));
  }

  // References page for academic exports
  if (hasRefs) {
    const refsContent = bibliography.map(ref => 
      `<p class="reference">${escapeXml(ref)}</p>`
    ).join('\n');
    
    const referencesXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>References</title><link rel="stylesheet" href="style.css"/></head>
<body>
<h1>References</h1>
<p><em>Citation Style: ${citationStyle}</em></p>
${refsContent}
<hr/>
<p><small>All references are retrieved from verifiable academic databases.</small></p>
</body>
</html>`;
    await zipWriter.add("OEBPS/references.xhtml", new zip.TextReader(referencesXhtml));
  }

  await zipWriter.close();
  const blob = await blobWriter.getData();
  return await blob.arrayBuffer();
}

// ===== DOCX Generation with Cover and References =====
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

  const contentTypes = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  ${coverImageBytes ? '<Default Extension="jpeg" ContentType="image/jpeg"/>' : ''}
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;
  await zipWriter.add("[Content_Types].xml", new zip.TextReader(contentTypes));

  const rels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;
  await zipWriter.add("_rels/.rels", new zip.TextReader(rels));

  let imageRel = '';
  if (coverImageBytes) {
    await zipWriter.add("word/media/cover.jpeg", new zip.Uint8ArrayReader(coverImageBytes));
    imageRel = '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/cover.jpeg"/>';
  }

  const documentRels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${imageRel}
</Relationships>`;
  await zipWriter.add("word/_rels/document.xml.rels", new zip.TextReader(documentRels));

  let documentContent = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
            xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
            xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
            xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
<w:body>`;

  if (coverImageBytes) {
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
                <pic:cNvPr id="1" name="cover.jpeg"/>
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
<w:p><w:r><w:t>Published by ScrollLibrary Publishing</w:t></w:r></w:p>`;

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

  // Chapters
  for (const chapter of chapters) {
    documentContent += `
<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Chapter ${chapter.chapter_number}: ${escapeXml(chapter.title)}</w:t></w:r></w:p>`;
    
    const paragraphs = stripMarkdown(chapter.content || "").split(/\n\n+/);
    for (const para of paragraphs) {
      if (para.trim()) {
        documentContent += `<w:p><w:r><w:t>${escapeXml(para.trim())}</w:t></w:r></w:p>`;
      }
    }
    documentContent += `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`;
  }

  // References section for academic content
  if (isAcademic && bibliography.length > 0) {
    documentContent += `
<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>References</w:t></w:r></w:p>
<w:p><w:r><w:rPr><w:i/></w:rPr><w:t>Citation Style: ${citationStyle}</w:t></w:r></w:p>
<w:p><w:r><w:t></w:t></w:r></w:p>`;

    for (const ref of bibliography) {
      documentContent += `<w:p><w:pPr><w:ind w:left="720" w:hanging="720"/></w:pPr><w:r><w:t>${escapeXml(ref)}</w:t></w:r></w:p>`;
    }

    documentContent += `
<w:p><w:r><w:t></w:t></w:r></w:p>
<w:p><w:r><w:rPr><w:sz w:val="20"/><w:color w:val="666666"/></w:rPr><w:t>All references are retrieved from verifiable academic databases.</w:t></w:r></w:p>`;
  }

  documentContent += `</w:body></w:document>`;
  await zipWriter.add("word/document.xml", new zip.TextReader(documentContent));

  await zipWriter.close();
  const blob = await blobWriter.getData();
  return await blob.arrayBuffer();
}
