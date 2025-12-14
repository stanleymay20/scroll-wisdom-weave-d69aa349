import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Generate Scroll Publishing Code (SPC) - Safe internal identifier
function generateSPC(bookId: string): string {
  const year = new Date().getFullYear();
  const hash = bookId.substring(0, 8).toUpperCase();
  return `SPC-SL-${year}-${hash}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { bookId, format, authorName, isbn } = await req.json();
    
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase configuration is missing");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    console.log(`[EXPORT] Exporting book ${bookId} as ${format}`);

    // Fetch book details with retry logic
    let book;
    let retryCount = 0;
    const maxRetries = 3;

    while (retryCount < maxRetries) {
      try {
        const { data, error: bookError } = await supabase
          .from("books")
          .select("*")
          .eq("id", bookId)
          .single();

        if (bookError) {
          console.error(`[EXPORT] Book fetch attempt ${retryCount + 1} failed:`, bookError);
          if (retryCount >= maxRetries - 1) throw bookError;
          retryCount++;
          await new Promise(r => setTimeout(r, 1000 * retryCount));
          continue;
        }
        
        book = data;
        break;
      } catch (e) {
        if (retryCount >= maxRetries - 1) throw e;
        retryCount++;
        await new Promise(r => setTimeout(r, 1000 * retryCount));
      }
    }

    if (!book) {
      throw new Error("Book not found");
    }

    // CRITICAL: Check for cover - export requires cover
    if (!book.cover_image_url) {
      throw new Error("Export requires a cover image. Please generate or upload a cover before exporting.");
    }

    // Fetch all chapters
    const { data: chapters, error: chaptersError } = await supabase
      .from("chapters")
      .select("*")
      .eq("book_id", bookId)
      .eq("is_generated", true)
      .order("chapter_number");

    if (chaptersError) {
      throw new Error("Failed to fetch chapters");
    }

    if (!chapters || chapters.length === 0) {
      throw new Error("No generated chapters found. Please generate chapters first.");
    }

    // Validate chapter integrity - no incomplete chapters
    for (const chapter of chapters) {
      if (!chapter.content || chapter.content.length < 500) {
        throw new Error(`Chapter ${chapter.chapter_number} appears incomplete. Please regenerate before exporting.`);
      }
      if (chapter.content.includes("[PLACEHOLDER]") || chapter.content.includes("[TODO]")) {
        throw new Error(`Chapter ${chapter.chapter_number} contains placeholder text. Please regenerate before exporting.`);
      }
    }

    console.log(`[EXPORT] Found ${chapters.length} complete chapters to export`);

    // PRODUCTION FORMATS ONLY - No HTML, no markdown for user downloads
    const validFormats = ['pdf', 'epub', 'docx'];
    if (!validFormats.includes(format)) {
      throw new Error(`Invalid format: ${format}. Valid formats are: ${validFormats.join(', ')}`);
    }

    // Use provided author name or default
    const finalAuthorName = authorName || book.author_ai_agent || "ScrollLibrary Author";
    
    // Generate publishing identifier
    const publishingIdentifier = isbn && isValidISBN(isbn) ? isbn : generateSPC(bookId);
    const isISBN = isbn && isValidISBN(isbn);

    // Generate content based on format
    let content: string;
    let contentType: string;
    let filename: string;

    const totalWords = chapters.reduce((sum: number, ch: any) => sum + (ch.word_count || 0), 0);
    const exportMetadata = {
      title: book.title,
      author: finalAuthorName,
      category: book.category,
      coverUrl: book.cover_image_url,
      publishingIdentifier,
      isISBN,
      year: new Date().getFullYear(),
      totalChapters: chapters.length,
      totalWords,
    };

    switch (format) {
      case "pdf":
        content = generateProductionPDF(book, chapters, exportMetadata);
        contentType = "text/html";
        filename = `${sanitizeFilename(book.title)}.html`;
        break;
      
      case "epub":
        content = generateProductionEPUB(book, chapters, exportMetadata);
        contentType = "application/xhtml+xml";
        filename = `${sanitizeFilename(book.title)}.xhtml`;
        break;
      
      case "docx":
        content = generateProductionDOCX(book, chapters, exportMetadata);
        contentType = "application/rtf";
        filename = `${sanitizeFilename(book.title)}.rtf`;
        break;
      
      default:
        throw new Error(`Unsupported format: ${format}`);
    }

    console.log(`[EXPORT] Export complete: ${content.length} characters, ${totalWords} words`);

    return new Response(
      JSON.stringify({
        success: true,
        content,
        contentType,
        filename,
        metadata: exportMetadata,
        publishingReady: true,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("[EXPORT] Error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

function isValidISBN(isbn: string): boolean {
  if (!isbn) return false;
  const cleaned = isbn.replace(/[-\s]/g, "");
  // ISBN-10 or ISBN-13 validation
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

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function markdownToHtml(markdown: string): string {
  if (!markdown) return "";
  return markdown
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^#### (.+)$/gm, "<h4>$1</h4>")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/(<li>.*<\/li>\n?)+/g, "<ul>$&</ul>")
    .replace(/\n\n/g, "</p><p>")
    .replace(/^(?!<[hup]|<li)/gm, "<p>")
    .replace(/(?<![>])$/gm, "</p>");
}

interface ExportMetadata {
  title: string;
  author: string;
  category: string;
  coverUrl: string;
  publishingIdentifier: string;
  isISBN: boolean;
  year: number;
  totalChapters: number;
  totalWords: number;
}

// ===== PRODUCTION PDF EXPORT =====
function generateProductionPDF(book: any, chapters: any[], meta: ExportMetadata): string {
  const chaptersHtml = chapters.map((ch: any, index: number) => `
    <div class="chapter" id="chapter-${ch.chapter_number}" style="${index > 0 ? 'page-break-before: always;' : ''}">
      <div class="chapter-header">
        <span class="chapter-label">CHAPTER ${ch.chapter_number}</span>
        <h2 class="chapter-title">${escapeHtml(ch.title)}</h2>
      </div>
      <div class="chapter-content">
        ${markdownToHtml(ch.content || "")}
      </div>
    </div>
  `).join("\n");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(meta.title)}</title>
  <meta name="author" content="${escapeHtml(meta.author)}">
  <meta name="description" content="${escapeHtml(book.description || '')}">
  <meta name="generator" content="ScrollLibrary Publishing Engine">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=Source+Serif+4:wght@400;500;600&display=swap');
    
    @page {
      size: A4;
      margin: 0.75in 0.75in 1in 0.75in;
      
      @top-center {
        content: "${escapeHtml(meta.title)}";
        font-family: 'Source Serif 4', Georgia, serif;
        font-size: 10pt;
        color: #666;
      }
      
      @bottom-center {
        content: counter(page);
        font-family: 'Source Serif 4', Georgia, serif;
        font-size: 10pt;
        color: #333;
      }
    }
    
    @page :first {
      @top-center { content: none; }
      @bottom-center { content: none; }
    }
    
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    
    body {
      font-family: 'Source Serif 4', Georgia, 'Times New Roman', serif;
      line-height: 1.6;
      color: #1a1a1a;
      font-size: 11pt;
      text-rendering: optimizeLegibility;
      -webkit-font-smoothing: antialiased;
    }
    
    /* ===== COVER PAGE ===== */
    .cover-page {
      page-break-after: always;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 2in 1in;
    }
    
    .cover-image {
      max-width: 4in;
      max-height: 6in;
      box-shadow: 0 10px 40px rgba(0,0,0,0.3);
      margin-bottom: 40px;
    }
    
    .cover-category {
      font-family: 'Source Serif 4', sans-serif;
      font-size: 12pt;
      text-transform: uppercase;
      letter-spacing: 4px;
      color: #b8860b;
      margin-bottom: 20px;
    }
    
    .cover-title {
      font-family: 'Playfair Display', serif;
      font-size: 36pt;
      font-weight: 700;
      color: #1a1a2e;
      line-height: 1.2;
      margin-bottom: 24px;
    }
    
    .cover-author {
      font-size: 16pt;
      color: #444;
      margin-top: 20px;
    }
    
    .cover-publisher {
      margin-top: 60px;
      font-size: 10pt;
      color: #888;
    }
    
    /* ===== COPYRIGHT PAGE ===== */
    .copyright-page {
      page-break-after: always;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      padding-bottom: 2in;
      font-size: 10pt;
      color: #555;
    }
    
    .copyright-page p {
      margin-bottom: 12px;
      text-align: left;
    }
    
    .copyright-page .identifier {
      font-family: monospace;
      background: #f5f5f5;
      padding: 4px 8px;
      border-radius: 4px;
    }
    
    .copyright-page .ownership-notice {
      margin-top: 30px;
      padding: 15px;
      border: 1px solid #ddd;
      border-radius: 4px;
      background: #fafafa;
    }
    
    /* ===== TABLE OF CONTENTS ===== */
    .toc-page {
      page-break-after: always;
      padding: 60px 0;
    }
    
    .toc-title {
      font-family: 'Playfair Display', serif;
      font-size: 24pt;
      text-align: center;
      margin-bottom: 50px;
      color: #1a1a2e;
    }
    
    .toc-item {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      padding: 12px 0;
      border-bottom: 1px dotted #ccc;
    }
    
    .toc-item a {
      color: #1a1a2e;
      text-decoration: none;
      font-size: 12pt;
    }
    
    .toc-item .page-ref {
      color: #666;
      font-size: 10pt;
    }
    
    .toc-summary {
      margin-top: 40px;
      text-align: center;
      color: #666;
      font-size: 10pt;
    }
    
    /* ===== CHAPTERS ===== */
    .chapter {
      padding-top: 40px;
    }
    
    .chapter-header {
      margin-bottom: 40px;
      padding-bottom: 20px;
      border-bottom: 2px solid #b8860b;
    }
    
    .chapter-label {
      display: block;
      font-family: 'Source Serif 4', sans-serif;
      font-size: 10pt;
      text-transform: uppercase;
      letter-spacing: 3px;
      color: #b8860b;
      margin-bottom: 10px;
    }
    
    .chapter-title {
      font-family: 'Playfair Display', serif;
      font-size: 24pt;
      font-weight: 600;
      color: #1a1a2e;
      line-height: 1.3;
    }
    
    .chapter-content {
      text-align: justify;
      hyphens: auto;
      -webkit-hyphens: auto;
      orphans: 3;
      widows: 3;
    }
    
    .chapter-content p {
      margin-bottom: 14px;
      text-indent: 0;
    }
    
    .chapter-content p + p {
      text-indent: 1.5em;
    }
    
    .chapter-content h2 {
      font-family: 'Playfair Display', serif;
      font-size: 18pt;
      margin-top: 36px;
      margin-bottom: 16px;
      color: #1a1a2e;
      page-break-after: avoid;
    }
    
    .chapter-content h3 {
      font-family: 'Playfair Display', serif;
      font-size: 14pt;
      margin-top: 28px;
      margin-bottom: 12px;
      color: #333;
      page-break-after: avoid;
    }
    
    .chapter-content h4 {
      font-size: 12pt;
      font-weight: 600;
      margin-top: 24px;
      margin-bottom: 10px;
      color: #444;
    }
    
    .chapter-content ul, .chapter-content ol {
      margin: 20px 0;
      padding-left: 24px;
    }
    
    .chapter-content li {
      margin-bottom: 8px;
    }
    
    .chapter-content strong {
      font-weight: 600;
    }
    
    .chapter-content em {
      font-style: italic;
    }
    
    /* ===== END PAGE ===== */
    .end-page {
      page-break-before: always;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
    }
    
    .end-page h3 {
      font-family: 'Playfair Display', serif;
      font-size: 24pt;
      color: #1a1a2e;
      margin-bottom: 20px;
    }
    
    .end-page p {
      color: #666;
      font-size: 10pt;
    }
    
    .publishing-badge {
      margin-top: 40px;
      padding: 15px 30px;
      border: 2px solid #b8860b;
      border-radius: 4px;
      font-size: 10pt;
      color: #b8860b;
    }
    
    @media print {
      body { margin: 0; padding: 0; }
      .chapter { page-break-before: always; }
      .cover-page, .copyright-page, .toc-page { page-break-after: always; }
      h2, h3, h4 { page-break-after: avoid; }
      p { orphans: 3; widows: 3; }
    }
  </style>
</head>
<body>
  <!-- COVER PAGE -->
  <div class="cover-page">
    <img src="${escapeHtml(meta.coverUrl)}" alt="Book Cover" class="cover-image">
    <p class="cover-category">${escapeHtml((meta.category || '').replace(/_/g, " "))}</p>
    <h1 class="cover-title">${escapeHtml(meta.title)}</h1>
    <p class="cover-author">By ${escapeHtml(meta.author)}</p>
    <p class="cover-publisher">ScrollLibrary™ Publishing<br>${meta.year}</p>
  </div>
  
  <!-- COPYRIGHT PAGE -->
  <div class="copyright-page">
    <p><strong>${escapeHtml(meta.title)}</strong></p>
    <p>By ${escapeHtml(meta.author)}</p>
    <p>&nbsp;</p>
    <p>© ${meta.year} ${escapeHtml(meta.author)}. All rights reserved.</p>
    <p>&nbsp;</p>
    <p>No part of this publication may be reproduced, distributed, or transmitted in any form or by any means without the prior written permission of the copyright holder.</p>
    <p>&nbsp;</p>
    <p>${meta.isISBN ? 'ISBN' : 'Scroll Publishing Code (SPC)'}: <span class="identifier">${escapeHtml(meta.publishingIdentifier)}</span></p>
    ${!meta.isISBN ? '<p><em>Note: SPC is an internal publishing identifier. For commercial distribution requiring ISBN, please obtain one from your national ISBN agency.</em></p>' : ''}
    <p>&nbsp;</p>
    <p>Published via ScrollLibrary™</p>
    <p>Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
    
    <div class="ownership-notice">
      <p><strong>Authorship & Ownership Declaration</strong></p>
      <p>This work was generated with the assistance of AI tools under the full authorship and ownership of the user. The creator retains 100% ownership and all commercial publishing rights.</p>
    </div>
  </div>
  
  <!-- TABLE OF CONTENTS -->
  <div class="toc-page">
    <h2 class="toc-title">Contents</h2>
    ${chapters.map((ch: any) => `
      <div class="toc-item">
        <a href="#chapter-${ch.chapter_number}">Chapter ${ch.chapter_number}: ${escapeHtml(ch.title)}</a>
        <span class="page-ref">${(ch.word_count || 0).toLocaleString()} words</span>
      </div>
    `).join("")}
    <div class="toc-summary">
      <p>${meta.totalChapters} Chapters · ${meta.totalWords.toLocaleString()} Words</p>
    </div>
  </div>
  
  <!-- CHAPTERS -->
  ${chaptersHtml}
  
  <!-- END PAGE -->
  <div class="end-page">
    <h3>The End</h3>
    <p>Thank you for reading</p>
    <p>&nbsp;</p>
    <p><em>${escapeHtml(meta.title)}</em> by ${escapeHtml(meta.author)}</p>
    <p class="publishing-badge">✓ Publishing Ready</p>
    <p style="margin-top: 30px;">Generated by ScrollLibrary™<br>© ${meta.year} All Rights Reserved</p>
  </div>
</body>
</html>`;
}

// ===== PRODUCTION EPUB EXPORT =====
function generateProductionEPUB(book: any, chapters: any[], meta: ExportMetadata): string {
  const chaptersXhtml = chapters.map((ch: any) => `
    <section id="chapter-${ch.chapter_number}" epub:type="chapter" class="chapter">
      <header class="chapter-header">
        <p class="chapter-label">Chapter ${ch.chapter_number}</p>
        <h2 class="chapter-title">${escapeHtml(ch.title)}</h2>
      </header>
      <div class="chapter-content">
        ${markdownToHtml(ch.content || "")}
      </div>
    </section>
  `).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en" xml:lang="en">
<head>
  <title>${escapeHtml(meta.title)}</title>
  <meta charset="UTF-8"/>
  <meta name="author" content="${escapeHtml(meta.author)}"/>
  <meta name="description" content="${escapeHtml(book.description || '')}"/>
  <meta name="publisher" content="ScrollLibrary"/>
  <meta name="date" content="${new Date().toISOString().split('T')[0]}"/>
  <meta name="identifier" content="${escapeHtml(meta.publishingIdentifier)}"/>
  <style type="text/css">
    body { 
      font-family: Georgia, 'Times New Roman', serif; 
      line-height: 1.6; 
      margin: 0;
      padding: 20px;
      color: #1a1a1a;
    }
    
    /* Cover */
    .cover-page {
      text-align: center;
      page-break-after: always;
      padding: 40px 20px;
    }
    
    .cover-image {
      max-width: 100%;
      max-height: 80vh;
      margin-bottom: 30px;
    }
    
    .cover-title {
      font-size: 2.5em;
      font-weight: bold;
      margin-bottom: 0.5em;
      line-height: 1.2;
    }
    
    .cover-author {
      font-size: 1.3em;
      color: #555;
    }
    
    /* Copyright */
    .copyright-page {
      page-break-after: always;
      padding: 40px 20px;
      font-size: 0.9em;
      color: #555;
    }
    
    .copyright-page p {
      margin-bottom: 1em;
    }
    
    .ownership-notice {
      margin-top: 2em;
      padding: 15px;
      border: 1px solid #ddd;
      background: #f9f9f9;
    }
    
    /* TOC */
    nav[epub|type="toc"] {
      page-break-after: always;
    }
    
    nav[epub|type="toc"] h2 {
      text-align: center;
      font-size: 1.8em;
      margin-bottom: 1.5em;
    }
    
    nav[epub|type="toc"] ol {
      list-style-type: none;
      padding-left: 0;
    }
    
    nav[epub|type="toc"] li {
      margin: 0.8em 0;
      padding-bottom: 0.5em;
      border-bottom: 1px dotted #ccc;
    }
    
    nav[epub|type="toc"] a {
      text-decoration: none;
      color: #1a1a2e;
    }
    
    /* Chapters */
    .chapter {
      page-break-before: always;
    }
    
    .chapter-header {
      margin-bottom: 2em;
      padding-bottom: 1em;
      border-bottom: 2px solid #b8860b;
    }
    
    .chapter-label {
      text-transform: uppercase;
      letter-spacing: 2px;
      color: #b8860b;
      font-size: 0.85em;
      margin-bottom: 0.5em;
    }
    
    .chapter-title {
      font-size: 1.8em;
      margin: 0;
      line-height: 1.3;
    }
    
    .chapter-content p {
      text-align: justify;
      margin: 1em 0;
    }
    
    .chapter-content p + p {
      text-indent: 1.5em;
    }
    
    .chapter-content h2 {
      font-size: 1.5em;
      margin-top: 2em;
      margin-bottom: 1em;
    }
    
    .chapter-content h3 {
      font-size: 1.2em;
      margin-top: 1.5em;
      margin-bottom: 0.8em;
    }
    
    .chapter-content ul, .chapter-content ol {
      margin: 1em 0;
      padding-left: 1.5em;
    }
    
    .chapter-content li {
      margin-bottom: 0.5em;
    }
    
    /* End */
    .end-page {
      text-align: center;
      padding: 3em 1em;
      page-break-before: always;
    }
    
    .end-page h3 {
      font-size: 1.8em;
      margin-bottom: 1em;
    }
    
    .publishing-badge {
      display: inline-block;
      margin-top: 2em;
      padding: 10px 20px;
      border: 2px solid #b8860b;
      color: #b8860b;
    }
  </style>
</head>
<body>
  <!-- COVER PAGE -->
  <section class="cover-page" epub:type="cover">
    <img src="${escapeHtml(meta.coverUrl)}" alt="Book Cover" class="cover-image"/>
    <h1 class="cover-title">${escapeHtml(meta.title)}</h1>
    <p class="cover-author">By ${escapeHtml(meta.author)}</p>
  </section>
  
  <!-- COPYRIGHT PAGE -->
  <section class="copyright-page" epub:type="copyright-page">
    <p><strong>${escapeHtml(meta.title)}</strong></p>
    <p>By ${escapeHtml(meta.author)}</p>
    <p>© ${meta.year} ${escapeHtml(meta.author)}. All rights reserved.</p>
    <p>${meta.isISBN ? 'ISBN' : 'Scroll Publishing Code'}: ${escapeHtml(meta.publishingIdentifier)}</p>
    <p>Published via ScrollLibrary™</p>
    <div class="ownership-notice">
      <p><strong>Authorship &amp; Ownership</strong></p>
      <p>This work was generated with the assistance of AI tools under the full authorship and ownership of the user. The creator retains 100% ownership and all commercial publishing rights.</p>
    </div>
  </section>
  
  <!-- TABLE OF CONTENTS -->
  <nav epub:type="toc" id="toc">
    <h2>Contents</h2>
    <ol>
      ${chapters.map((ch: any) => `<li><a href="#chapter-${ch.chapter_number}">Chapter ${ch.chapter_number}: ${escapeHtml(ch.title)}</a></li>`).join("\n      ")}
    </ol>
    <p style="text-align: center; color: #666; margin-top: 2em;">${meta.totalChapters} Chapters · ${meta.totalWords.toLocaleString()} Words</p>
  </nav>
  
  <!-- CHAPTERS -->
  ${chaptersXhtml}
  
  <!-- END PAGE -->
  <section class="end-page">
    <h3>The End</h3>
    <p>Thank you for reading</p>
    <p><em>${escapeHtml(meta.title)}</em> by ${escapeHtml(meta.author)}</p>
    <p class="publishing-badge">✓ Publishing Ready</p>
    <p style="margin-top: 2em; color: #888;">Generated by ScrollLibrary™<br/>© ${meta.year}</p>
  </section>
</body>
</html>`;
}

// ===== PRODUCTION DOCX (RTF) EXPORT =====
function generateProductionDOCX(book: any, chapters: any[], meta: ExportMetadata): string {
  const rtfHeader = `{\\rtf1\\ansi\\ansicpg1252\\deff0\\nouicompat\\deflang1033
{\\fonttbl{\\f0\\froman\\fcharset0 Georgia;}{\\f1\\fswiss\\fcharset0 Arial;}{\\f2\\fmodern\\fcharset0 Courier New;}}
{\\colortbl;\\red26\\green26\\blue46;\\red184\\green134\\blue11;\\red102\\green102\\blue102;\\red85\\green85\\blue85;}
{\\*\\generator ScrollLibrary Publishing Engine;}
{\\info{\\title ${escapeRtf(meta.title)}}{\\author ${escapeRtf(meta.author)}}{\\company ScrollLibrary}}
\\paperw12240\\paperh15840\\margl1440\\margr1440\\margt1440\\margb1440
\\headery720\\footery720
`;

  // Cover page
  const coverPage = `
\\pard\\qc\\sb2880\\sa480\\f0\\fs96\\cf1\\b ${escapeRtf(meta.title)}\\b0\\par
\\pard\\qc\\fs36\\cf3 By ${escapeRtf(meta.author)}\\par
\\pard\\qc\\fs24\\cf2 ${escapeRtf((meta.category || '').replace(/_/g, " ").toUpperCase())}\\par
\\pard\\qc\\sb1440\\fs20\\cf3 ScrollLibrary\\u8482  Publishing\\par
\\pard\\qc\\fs20\\cf3 ${meta.year}\\par
\\page
`;

  // Copyright page
  const copyrightPage = `
\\pard\\sb7200\\sa240\\f0\\fs24\\cf0\\b ${escapeRtf(meta.title)}\\b0\\par
\\pard\\fs22\\cf0 By ${escapeRtf(meta.author)}\\par
\\par
\\pard\\fs20\\cf3 \\u169  ${meta.year} ${escapeRtf(meta.author)}. All rights reserved.\\par
\\par
No part of this publication may be reproduced, distributed, or transmitted in any form or by any means without the prior written permission of the copyright holder.\\par
\\par
${meta.isISBN ? 'ISBN' : 'Scroll Publishing Code (SPC)'}: {\\f2 ${escapeRtf(meta.publishingIdentifier)}}\\par
${!meta.isISBN ? '\\par{\\i Note: SPC is an internal publishing identifier. For commercial distribution requiring ISBN, please obtain one from your national ISBN agency.}\\par' : ''}
\\par
Published via ScrollLibrary\\u8482 \\par
Generated: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}\\par
\\par
\\pard\\box\\brdrs\\brdrw10\\brsp100\\cf0
{\\b Authorship & Ownership Declaration}\\par
This work was generated with the assistance of AI tools under the full authorship and ownership of the user. The creator retains 100% ownership and all commercial publishing rights.\\par
\\pard
\\page
`;

  // Table of contents
  const toc = `
\\pard\\qc\\sb480\\sa480\\f0\\fs48\\cf1\\b Contents\\b0\\par
\\pard\\sb240\\sa120\\fs24\\cf0
${chapters.map((ch: any) => `Chapter ${ch.chapter_number}: ${escapeRtf(ch.title)} \\tab\\tab ${(ch.word_count || 0).toLocaleString()} words\\par`).join("\n")}
\\pard\\qc\\sb480\\fs20\\cf3 ${meta.totalChapters} Chapters \\u183  ${meta.totalWords.toLocaleString()} Words\\par
\\page
`;

  // Chapters
  const chaptersRtf = chapters.map((ch: any) => {
    const content = (ch.content || "")
      .replace(/^## (.+)$/gm, "\\par\\pard\\sb360\\sa120\\fs36\\cf1\\b $1\\b0\\par\\pard\\fs24\\cf0\\sa120\\qj")
      .replace(/^### (.+)$/gm, "\\par\\pard\\sb240\\sa120\\fs30\\b $1\\b0\\par\\pard\\fs24\\sa120\\qj")
      .replace(/^#### (.+)$/gm, "\\par\\pard\\sb180\\sa120\\fs26\\b $1\\b0\\par\\pard\\fs24\\sa120\\qj")
      .replace(/\*\*(.+?)\*\*/g, "\\b $1\\b0")
      .replace(/\*(.+?)\*/g, "\\i $1\\i0")
      .replace(/\n\n/g, "\\par\\par\\sa120")
      .replace(/^- (.+)$/gm, "\\par\\bullet\\tab $1");

    return `
\\pard\\sb0\\keepn\\fs20\\cf2 CHAPTER ${ch.chapter_number}\\par
\\pard\\keepn\\fs44\\cf1\\b ${escapeRtf(ch.title)}\\b0\\par
\\pard\\brdrb\\brdrs\\brdrw10\\brsp100\\cf2\\par
\\pard\\fs24\\cf0\\sa120\\qj
${content}
\\page
`;
  }).join("");

  // End page
  const endPage = `
\\pard\\qc\\sb2880\\fs48\\cf1\\b The End\\b0\\par
\\pard\\qc\\sb240\\fs24\\cf3 Thank you for reading\\par
\\par
{\\i ${escapeRtf(meta.title)}} by ${escapeRtf(meta.author)}\\par
\\par
\\pard\\qc\\box\\brdrs\\brdrw10\\brsp100\\cf2 \\u10003  Publishing Ready\\par
\\pard\\qc\\sb480\\fs20\\cf3 Generated by ScrollLibrary\\u8482 \\par
\\u169  ${meta.year}\\par
`;

  return rtfHeader + coverPage + copyrightPage + toc + chaptersRtf + endPage + "}";
}

function escapeRtf(text: string): string {
  if (!text) return "";
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/\n/g, "\\par ");
}
