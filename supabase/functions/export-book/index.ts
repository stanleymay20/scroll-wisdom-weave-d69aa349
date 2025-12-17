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

    // PRODUCTION FORMATS ONLY - No HTML for user downloads
    const validFormats = ['pdf', 'epub', 'docx'];
    if (!validFormats.includes(format)) {
      throw new Error(`Invalid format: ${format}. Valid formats are: ${validFormats.join(', ')}`);
    }

    // Use provided author name or default
    const finalAuthorName = authorName || book.author_ai_agent || "ScrollLibrary Author";
    
    // Generate publishing identifier
    const publishingIdentifier = isbn && isValidISBN(isbn) ? isbn : generateSPC(bookId);
    const isISBN = isbn && isValidISBN(isbn);

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
      language: book.language || 'en',
    };

    // Generate content based on format
    let content: string;
    let contentType: string;
    let filename: string;

    switch (format) {
      case "pdf":
        // Generate print-ready HTML document
        content = generatePrintReadyHTML(book, chapters, exportMetadata);
        contentType = "text/html";
        filename = `${sanitizeFilename(book.title)}_PrintReady.html`;
        break;
      
      case "epub":
        // Generate EPUB-compatible XHTML
        content = generateEPUBContent(book, chapters, exportMetadata);
        contentType = "application/xhtml+xml";
        filename = `${sanitizeFilename(book.title)}.xhtml`;
        break;
      
      case "docx":
        // Generate RTF (Word-compatible)
        content = generateRTFDocument(book, chapters, exportMetadata);
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
        instructions: getExportInstructions(format),
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

function getExportInstructions(format: string): string {
  switch (format) {
    case 'pdf':
      return 'Open this HTML file in your browser, then use Print (Ctrl/Cmd+P) and select "Save as PDF" for a professional PDF.';
    case 'epub':
      return 'This XHTML file can be opened in e-reader applications. For best results, use Calibre to convert to EPUB format.';
    case 'docx':
      return 'This RTF file opens directly in Microsoft Word, Google Docs, or LibreOffice Writer for editing.';
    default:
      return '';
  }
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
  language: string;
}

// ===== PRINT-READY HTML (for PDF) =====
function generatePrintReadyHTML(book: any, chapters: any[], meta: ExportMetadata): string {
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
<html lang="${meta.language}">
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
    }
    
    @media print {
      .no-print { display: none !important; }
      body { font-size: 11pt; }
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
      max-width: 8.5in;
      margin: 0 auto;
      padding: 20px;
    }
    
    /* Print Instructions Banner */
    .print-instructions {
      background: #f0f4ff;
      border: 2px solid #4a5568;
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 30px;
      text-align: center;
    }
    
    .print-instructions h3 {
      color: #2d3748;
      margin-bottom: 10px;
    }
    
    .print-instructions p {
      color: #4a5568;
      font-size: 14px;
    }
    
    /* Cover Page */
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
    
    /* Copyright Page */
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
    
    /* Table of Contents */
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
      padding: 12px 0;
      border-bottom: 1px dotted #ccc;
    }
    
    .toc-item a {
      color: #1a1a2e;
      text-decoration: none;
    }
    
    .toc-summary {
      margin-top: 40px;
      text-align: center;
      color: #666;
      font-size: 10pt;
    }
    
    /* Chapters */
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
    }
    
    .chapter-content {
      text-align: justify;
    }
    
    .chapter-content p {
      margin-bottom: 14px;
    }
    
    .chapter-content h2 {
      font-family: 'Playfair Display', serif;
      font-size: 18pt;
      margin-top: 36px;
      margin-bottom: 16px;
      color: #1a1a2e;
    }
    
    .chapter-content h3 {
      font-family: 'Playfair Display', serif;
      font-size: 14pt;
      margin-top: 28px;
      margin-bottom: 12px;
    }
    
    .chapter-content ul, .chapter-content ol {
      margin: 16px 0;
      padding-left: 24px;
    }
    
    .chapter-content li {
      margin-bottom: 8px;
    }
    
    .chapter-content blockquote {
      margin: 20px 0;
      padding: 15px 20px;
      border-left: 4px solid #b8860b;
      background: #fafafa;
      font-style: italic;
    }
  </style>
</head>
<body>
  <!-- Print Instructions (hidden when printing) -->
  <div class="print-instructions no-print">
    <h3>📖 Ready to Create Your PDF</h3>
    <p>Press <strong>Ctrl+P</strong> (Windows) or <strong>Cmd+P</strong> (Mac) and select <strong>"Save as PDF"</strong></p>
    <p>For best results, use A4 or Letter size paper with default margins.</p>
  </div>

  <!-- Cover Page -->
  <div class="cover-page">
    <img src="${meta.coverUrl}" alt="Book Cover" class="cover-image" />
    <div class="cover-category">${escapeHtml(meta.category.replace(/_/g, " "))}</div>
    <h1 class="cover-title">${escapeHtml(meta.title)}</h1>
    <div class="cover-author">by ${escapeHtml(meta.author)}</div>
    <div class="cover-publisher">ScrollLibrary™ Publishing</div>
  </div>

  <!-- Copyright Page -->
  <div class="copyright-page">
    <p><strong>${escapeHtml(meta.title)}</strong></p>
    <p>Copyright © ${meta.year} ${escapeHtml(meta.author)}</p>
    <p>All rights reserved.</p>
    <p>
      ${meta.isISBN 
        ? `<span class="identifier">ISBN: ${meta.publishingIdentifier}</span>` 
        : `<span class="identifier">Publishing Code: ${meta.publishingIdentifier}</span><br><small>(Internal identifier - not an ISBN)</small>`
      }
    </p>
    <div class="ownership-notice">
      <p><strong>Ownership & Rights Notice</strong></p>
      <p>This work was created with AI assistance under the full authorship and ownership of ${escapeHtml(meta.author)}. The author retains 100% ownership and all commercial rights to this content.</p>
    </div>
    <p style="margin-top: 30px;">
      Published with ScrollLibrary™<br>
      ${meta.totalChapters} chapters • ${meta.totalWords.toLocaleString()} words
    </p>
  </div>

  <!-- Table of Contents -->
  <div class="toc-page">
    <h2 class="toc-title">Table of Contents</h2>
    ${chapters.map((ch: any) => `
      <div class="toc-item">
        <a href="#chapter-${ch.chapter_number}">${ch.chapter_number}. ${escapeHtml(ch.title)}</a>
      </div>
    `).join("")}
    <div class="toc-summary">
      ${meta.totalChapters} chapters • ${meta.totalWords.toLocaleString()} words
    </div>
  </div>

  <!-- Chapters -->
  ${chaptersHtml}
</body>
</html>`;
}

// ===== EPUB-COMPATIBLE XHTML =====
function generateEPUBContent(book: any, chapters: any[], meta: ExportMetadata): string {
  const chaptersXhtml = chapters.map((ch: any) => `
    <section epub:type="chapter" id="chapter-${ch.chapter_number}">
      <h2>${escapeHtml(ch.title)}</h2>
      ${markdownToHtml(ch.content || "")}
    </section>
  `).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${meta.language}">
<head>
  <meta charset="UTF-8"/>
  <title>${escapeHtml(meta.title)}</title>
  <meta name="author" content="${escapeHtml(meta.author)}"/>
  <meta name="dcterms.identifier" content="${meta.publishingIdentifier}"/>
  <style type="text/css">
    body { font-family: Georgia, serif; line-height: 1.6; margin: 2em; }
    h1 { font-size: 2em; text-align: center; margin: 2em 0; }
    h2 { font-size: 1.5em; margin-top: 2em; border-bottom: 1px solid #ccc; padding-bottom: 0.5em; }
    h3 { font-size: 1.2em; margin-top: 1.5em; }
    p { margin: 1em 0; text-align: justify; }
    .cover { text-align: center; page-break-after: always; }
    .cover img { max-width: 100%; max-height: 90vh; }
    .copyright { font-size: 0.9em; color: #666; page-break-after: always; }
    .toc { page-break-after: always; }
    .toc h2 { text-align: center; }
    .toc ul { list-style: none; padding: 0; }
    .toc li { margin: 0.5em 0; }
    .toc a { text-decoration: none; color: #333; }
    section { page-break-before: always; }
    blockquote { margin: 1em 2em; font-style: italic; border-left: 3px solid #ccc; padding-left: 1em; }
    ul, ol { margin: 1em 0; padding-left: 2em; }
  </style>
</head>
<body>
  <!-- Cover -->
  <section class="cover" epub:type="cover">
    <img src="${meta.coverUrl}" alt="Cover"/>
    <h1>${escapeHtml(meta.title)}</h1>
    <p>by ${escapeHtml(meta.author)}</p>
  </section>

  <!-- Copyright -->
  <section class="copyright" epub:type="copyright-page">
    <p><strong>${escapeHtml(meta.title)}</strong></p>
    <p>Copyright © ${meta.year} ${escapeHtml(meta.author)}</p>
    <p>All rights reserved.</p>
    <p>${meta.isISBN ? `ISBN: ${meta.publishingIdentifier}` : `Publishing Code: ${meta.publishingIdentifier} (Internal identifier)`}</p>
    <p>This work was created with AI assistance under the full authorship and ownership of ${escapeHtml(meta.author)}.</p>
    <p>Published with ScrollLibrary™ • ${meta.totalChapters} chapters • ${meta.totalWords.toLocaleString()} words</p>
  </section>

  <!-- Table of Contents -->
  <nav class="toc" epub:type="toc">
    <h2>Table of Contents</h2>
    <ul>
      ${chapters.map((ch: any) => `<li><a href="#chapter-${ch.chapter_number}">${ch.chapter_number}. ${escapeHtml(ch.title)}</a></li>`).join("\n      ")}
    </ul>
  </nav>

  <!-- Chapters -->
  ${chaptersXhtml}
</body>
</html>`;
}

// ===== RTF DOCUMENT (Word-compatible) =====
function generateRTFDocument(book: any, chapters: any[], meta: ExportMetadata): string {
  const escapeRtf = (text: string): string => {
    return text
      .replace(/\\/g, '\\\\')
      .replace(/\{/g, '\\{')
      .replace(/\}/g, '\\}')
      .replace(/\n/g, '\\par ')
      .replace(/[^\x00-\x7F]/g, char => `\\u${char.charCodeAt(0)}?`);
  };

  const chaptersRtf = chapters.map((ch: any) => {
    const content = (ch.content || "")
      .replace(/^## (.+)$/gm, '\\par\\par{\\b\\fs32 $1}\\par\\par')
      .replace(/^### (.+)$/gm, '\\par\\par{\\b\\fs28 $1}\\par\\par')
      .replace(/\*\*(.+?)\*\*/g, '{\\b $1}')
      .replace(/\*(.+?)\*/g, '{\\i $1}')
      .replace(/^- (.+)$/gm, '\\par\\bullet  $1')
      .replace(/\n\n/g, '\\par\\par ')
      .replace(/\n/g, '\\par ');

    return `
\\page
{\\b\\fs36 CHAPTER ${ch.chapter_number}}\\par\\par
{\\b\\fs32 ${escapeRtf(ch.title)}}\\par
\\par\\par
${content}
`;
  }).join("\n");

  return `{\\rtf1\\ansi\\deff0
{\\fonttbl{\\f0 Georgia;}{\\f1 Arial;}}
{\\colortbl;\\red0\\green0\\blue0;\\red184\\green134\\blue11;}

\\paperw12240\\paperh15840
\\margl1440\\margr1440\\margt1440\\margb1440

{\\info
{\\title ${escapeRtf(meta.title)}}
{\\author ${escapeRtf(meta.author)}}
{\\creatim\\yr${meta.year}}
}

\\f0\\fs24

{\\pard\\qc\\sb2880
{\\b\\fs56 ${escapeRtf(meta.title)}}\\par\\par
{\\fs32 by ${escapeRtf(meta.author)}}\\par\\par\\par
{\\fs24\\cf2 ${escapeRtf(meta.category.replace(/_/g, " ").toUpperCase())}}\\par\\par\\par\\par
{\\fs20 ScrollLibrary\\super\\u8482?\\nosupersub  Publishing}
\\par}

\\page

{\\pard\\qj
{\\b ${escapeRtf(meta.title)}}\\par\\par
Copyright \\u169? ${meta.year} ${escapeRtf(meta.author)}\\par
All rights reserved.\\par\\par
${meta.isISBN 
  ? `ISBN: ${meta.publishingIdentifier}` 
  : `Publishing Code: ${meta.publishingIdentifier}\\par{\\fs18 (Internal identifier - not an ISBN)}`
}\\par\\par\\par
{\\b Ownership & Rights Notice}\\par
This work was created with AI assistance under the full authorship and ownership of ${escapeRtf(meta.author)}. The author retains 100% ownership and all commercial rights.\\par\\par\\par
Published with ScrollLibrary\\super\\u8482?\\nosupersub\\par
${meta.totalChapters} chapters \\bullet  ${meta.totalWords.toLocaleString()} words
\\par}

\\page

{\\pard\\qc\\sb720
{\\b\\fs36 Table of Contents}\\par\\par
}

${chapters.map((ch: any) => `{\\pard ${ch.chapter_number}. ${escapeRtf(ch.title)}\\par}`).join("\n")}

{\\pard\\qc\\sb360
{\\fs20 ${meta.totalChapters} chapters \\bullet  ${meta.totalWords.toLocaleString()} words}
\\par}

${chaptersRtf}

}`;
}
