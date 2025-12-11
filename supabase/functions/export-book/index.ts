import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { bookId, format } = await req.json();
    
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Supabase configuration is missing");
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    console.log(`Exporting book ${bookId} as ${format}`);

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
          console.error(`Book fetch attempt ${retryCount + 1} failed:`, bookError);
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

    console.log(`Found ${chapters.length} chapters to export`);

    // Validate input
    const validFormats = ['pdf', 'epub', 'docx', 'markdown', 'mobi'];
    if (!validFormats.includes(format)) {
      throw new Error(`Invalid format: ${format}. Valid formats are: ${validFormats.join(', ')}`);
    }

    // Generate content based on format
    let content: string;
    let contentType: string;
    let filename: string;

    const totalWords = chapters.reduce((sum: number, ch: any) => sum + (ch.word_count || 0), 0);

    switch (format) {
      case "pdf":
        content = generatePDFContent(book, chapters);
        contentType = "text/html";
        filename = `${sanitizeFilename(book.title)}.html`;
        break;
      
      case "epub":
        content = generateEPUBContent(book, chapters);
        contentType = "application/xhtml+xml";
        filename = `${sanitizeFilename(book.title)}.xhtml`;
        break;
      
      case "docx":
        content = generateDOCXContent(book, chapters);
        contentType = "application/rtf";
        filename = `${sanitizeFilename(book.title)}.rtf`;
        break;
      
      case "mobi":
        // Generate EPUB-compatible content for MOBI conversion
        content = generateEPUBContent(book, chapters);
        contentType = "application/xhtml+xml";
        filename = `${sanitizeFilename(book.title)}_kindle.xhtml`;
        break;
      
      case "markdown":
        content = generateMarkdownContent(book, chapters);
        contentType = "text/markdown";
        filename = `${sanitizeFilename(book.title)}.md`;
        break;
      
      default:
        throw new Error(`Unsupported format: ${format}`);
    }

    console.log(`Export complete: ${content.length} characters`);

    return new Response(
      JSON.stringify({
        success: true,
        content,
        contentType,
        filename,
        metadata: {
          title: book.title,
          author: book.author_ai_agent || "ScrollAuthorGPT",
          category: book.category,
          totalChapters: chapters.length,
          totalWords,
        },
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in export-book function:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

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

function generatePDFContent(book: any, chapters: any[]): string {
  const chaptersHtml = chapters.map((ch: any, index: number) => `
    <div class="chapter" id="chapter-${ch.chapter_number}" style="${index > 0 ? 'page-break-before: always;' : ''}">
      <h2 style="color: #1a1a2e; border-bottom: 2px solid #d4af37; padding-bottom: 15px; margin-top: 40px; font-size: 28px;">
        Chapter ${ch.chapter_number}: ${escapeHtml(ch.title)}
      </h2>
      <p style="color: #666; font-size: 14px; margin-bottom: 30px;">${(ch.word_count || 0).toLocaleString()} words</p>
      <div class="chapter-content" style="text-align: justify; line-height: 1.8;">
        ${markdownToHtml(ch.content || "")}
      </div>
    </div>
  `).join("\n");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(book.title)}</title>
  <meta name="author" content="${escapeHtml(book.author_ai_agent || 'ScrollAuthorGPT')}">
  <meta name="description" content="${escapeHtml(book.description || '')}">
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=Source+Sans+3:wght@400;500;600&display=swap');
    
    * {
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Source Sans 3', Georgia, serif;
      line-height: 1.8;
      max-width: 800px;
      margin: 0 auto;
      padding: 40px 60px;
      color: #333;
      font-size: 16px;
    }
    
    .cover-page {
      text-align: center;
      padding: 150px 40px;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
    }
    
    .cover-page h1 {
      font-family: 'Playfair Display', serif;
      font-size: 52px;
      color: #1a1a2e;
      margin-bottom: 20px;
      line-height: 1.2;
    }
    
    .cover-page .author {
      font-size: 24px;
      color: #666;
      margin-top: 40px;
    }
    
    .cover-page .category {
      font-size: 16px;
      color: #d4af37;
      text-transform: uppercase;
      letter-spacing: 3px;
      margin-bottom: 20px;
    }
    
    .cover-page .publisher {
      margin-top: 80px;
      color: #999;
      font-size: 14px;
    }
    
    h2 {
      font-family: 'Playfair Display', serif;
      font-size: 28px;
      margin-top: 50px;
      margin-bottom: 20px;
    }
    
    h3 {
      font-family: 'Playfair Display', serif;
      font-size: 22px;
      color: #444;
      margin-top: 30px;
    }
    
    h4 {
      font-size: 18px;
      color: #555;
      margin-top: 25px;
    }
    
    p {
      text-align: justify;
      margin-bottom: 16px;
      text-indent: 0;
    }
    
    ul, ol {
      margin: 20px 0;
      padding-left: 30px;
    }
    
    li {
      margin-bottom: 10px;
    }
    
    .toc {
      padding: 40px 0;
    }
    
    .toc h2 {
      text-align: center;
      border: none;
      margin-bottom: 40px;
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
    
    .toc-item a:hover {
      color: #d4af37;
    }
    
    @media print {
      body { 
        margin: 0; 
        padding: 0.75in;
        font-size: 11pt;
      }
      .chapter { 
        page-break-before: always; 
      }
      .cover-page {
        page-break-after: always;
      }
      .toc {
        page-break-after: always;
      }
    }
  </style>
</head>
<body>
  <div class="cover-page">
    ${book.cover_image_url ? `<img src="${escapeHtml(book.cover_image_url)}" alt="Book Cover" style="max-width: 300px; margin-bottom: 40px; box-shadow: 0 10px 30px rgba(0,0,0,0.3);">` : ''}
    <p class="category">${escapeHtml((book.category || '').replace(/_/g, " "))}</p>
    <h1>${escapeHtml(book.title)}</h1>
    <p class="author">By ${escapeHtml(book.author_ai_agent || "ScrollAuthorGPT")}</p>
    <p class="publisher">Generated by ScrollLibrary™<br>${new Date().getFullYear()}</p>
  </div>
  
  <div class="toc" style="page-break-before: always; page-break-after: always;">
    <h2 style="font-family: 'Playfair Display', serif;">Table of Contents</h2>
    ${chapters.map((ch: any) => `
      <div class="toc-item">
        <a href="#chapter-${ch.chapter_number}">Chapter ${ch.chapter_number}: ${escapeHtml(ch.title)}</a>
        <span style="color: #666;">${(ch.word_count || 0).toLocaleString()} words</span>
      </div>
    `).join("")}
    <div style="margin-top: 40px; text-align: center; color: #666;">
      <p>Total: ${chapters.reduce((sum: number, ch: any) => sum + (ch.word_count || 0), 0).toLocaleString()} words</p>
    </div>
  </div>
  
  ${chaptersHtml}
  
  <div style="text-align: center; margin-top: 80px; padding: 60px 40px; border-top: 2px solid #d4af37; page-break-before: always;">
    <p style="font-family: 'Playfair Display', serif; font-size: 24px; color: #1a1a2e; margin-bottom: 20px;">The End</p>
    <p style="color: #666;">This book was generated by ScrollLibrary™</p>
    <p style="color: #999; font-size: 14px; margin-top: 40px;">© ${new Date().getFullYear()} All rights reserved</p>
    <p style="color: #999; font-size: 12px; margin-top: 20px;">ISBN: Pending Assignment</p>
  </div>
</body>
</html>`;
}

function generateEPUBContent(book: any, chapters: any[]): string {
  const chaptersXhtml = chapters.map((ch: any) => `
    <section id="chapter-${ch.chapter_number}" epub:type="chapter">
      <h2>Chapter ${ch.chapter_number}: ${escapeHtml(ch.title)}</h2>
      <p class="word-count">${(ch.word_count || 0).toLocaleString()} words</p>
      ${markdownToHtml(ch.content || "")}
    </section>
  `).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en">
<head>
  <title>${escapeHtml(book.title)}</title>
  <meta charset="UTF-8"/>
  <meta name="author" content="${escapeHtml(book.author_ai_agent || 'ScrollAuthorGPT')}"/>
  <meta name="description" content="${escapeHtml(book.description || '')}"/>
  <meta name="publisher" content="ScrollLibrary"/>
  <meta name="date" content="${new Date().toISOString().split('T')[0]}"/>
  <style type="text/css">
    body { 
      font-family: Georgia, 'Times New Roman', serif; 
      line-height: 1.6; 
      padding: 20px;
      margin: 0;
    }
    h1 { 
      text-align: center; 
      font-size: 2.5em;
      margin-bottom: 0.5em;
    }
    h2 { 
      font-size: 1.8em; 
      border-bottom: 2px solid #d4af37; 
      padding-bottom: 10px; 
      margin-top: 3em;
      page-break-before: always;
    }
    h3 { 
      font-size: 1.4em;
      margin-top: 2em;
    }
    p { 
      text-align: justify; 
      margin: 1em 0;
      text-indent: 1.5em;
    }
    p:first-of-type {
      text-indent: 0;
    }
    .word-count {
      color: #666;
      font-size: 0.9em;
      font-style: italic;
      text-indent: 0;
    }
    .author {
      text-align: center;
      font-size: 1.2em;
      color: #666;
    }
    .category {
      text-align: center;
      text-transform: uppercase;
      letter-spacing: 2px;
      color: #d4af37;
    }
    nav[epub|type="toc"] ol {
      list-style-type: none;
      padding-left: 0;
    }
    nav[epub|type="toc"] li {
      margin: 0.5em 0;
    }
    nav[epub|type="toc"] a {
      text-decoration: none;
      color: #1a1a2e;
    }
  </style>
</head>
<body>
  <header>
    <p class="category">${escapeHtml((book.category || '').replace(/_/g, " "))}</p>
    <h1>${escapeHtml(book.title)}</h1>
    <p class="author">By ${escapeHtml(book.author_ai_agent || "ScrollAuthorGPT")}</p>
    <p style="text-align: center; color: #999; margin-top: 3em;">Generated by ScrollLibrary™</p>
  </header>
  
  <nav epub:type="toc" id="toc">
    <h2>Table of Contents</h2>
    <ol>
      ${chapters.map((ch: any) => `<li><a href="#chapter-${ch.chapter_number}">Chapter ${ch.chapter_number}: ${escapeHtml(ch.title)}</a></li>`).join("\n      ")}
    </ol>
  </nav>
  
  ${chaptersXhtml}
  
  <footer style="text-align: center; margin-top: 4em; padding-top: 2em; border-top: 1px solid #ccc;">
    <p>© ${new Date().getFullYear()} ScrollLibrary™</p>
  </footer>
</body>
</html>`;
}

function generateDOCXContent(book: any, chapters: any[]): string {
  // Generate RTF format which can be opened in Word
  const rtfHeader = `{\\rtf1\\ansi\\ansicpg1252\\deff0\\nouicompat\\deflang1033
{\\fonttbl{\\f0\\froman\\fcharset0 Georgia;}{\\f1\\fswiss\\fcharset0 Arial;}}
{\\colortbl;\\red26\\green26\\blue46;\\red212\\green175\\blue55;\\red102\\green102\\blue102;}
{\\*\\generator ScrollLibrary Export Engine;}
\\paperw12240\\paperh15840\\margl1440\\margr1440\\margt1440\\margb1440
\\headery720\\footery720
`;

  const titlePage = `
\\pard\\qc\\sb0\\sa480\\f0\\fs72\\cf1\\b ${escapeRtf(book.title)}\\b0\\par
\\pard\\qc\\fs36\\cf3 By ${escapeRtf(book.author_ai_agent || "ScrollAuthorGPT")}\\par
\\pard\\qc\\fs24\\cf2 ${escapeRtf((book.category || '').replace(/_/g, " ").toUpperCase())}\\par
\\pard\\qc\\fs20\\cf3\\sb480 Generated by ScrollLibrary™\\par
\\pard\\qc\\fs20\\cf3 ${new Date().getFullYear()}\\par
\\page
`;

  const toc = `
\\pard\\qc\\f0\\fs48\\cf1\\b Table of Contents\\b0\\par
\\pard\\sb240\\sa120\\fs24\\cf0
${chapters.map((ch: any) => `Chapter ${ch.chapter_number}: ${escapeRtf(ch.title)} \\tab\\tab ${(ch.word_count || 0).toLocaleString()} words\\par`).join("\n")}
\\pard\\qc\\sb480\\fs20\\cf3 Total: ${chapters.reduce((sum: number, ch: any) => sum + (ch.word_count || 0), 0).toLocaleString()} words\\par
\\page
`;

  const chaptersRtf = chapters.map((ch: any) => {
    const content = (ch.content || "")
      .replace(/^## (.+)$/gm, "\\par\\pard\\sb360\\sa120\\fs36\\cf1\\b $1\\b0\\par\\pard\\fs24\\cf0\\sa120")
      .replace(/^### (.+)$/gm, "\\par\\pard\\sb240\\sa120\\fs30\\b $1\\b0\\par\\pard\\fs24\\sa120")
      .replace(/^#### (.+)$/gm, "\\par\\pard\\sb180\\sa120\\fs26\\b $1\\b0\\par\\pard\\fs24\\sa120")
      .replace(/\*\*(.+?)\*\*/g, "\\b $1\\b0")
      .replace(/\*(.+?)\*/g, "\\i $1\\i0")
      .replace(/\n\n/g, "\\par\\par\\sa120")
      .replace(/^- (.+)$/gm, "\\par\\bullet\\tab $1");

    return `
\\pard\\sb0\\keepn\\fs44\\cf1\\b Chapter ${ch.chapter_number}: ${escapeRtf(ch.title)}\\b0\\par
\\pard\\fs20\\cf3\\sa240 ${(ch.word_count || 0).toLocaleString()} words\\par
\\pard\\fs24\\cf0\\sa120\\qj
${content}
\\page
`;
  }).join("");

  const footer = `
\\pard\\qc\\sb480\\fs24\\cf1\\b The End\\b0\\par
\\pard\\qc\\fs20\\cf3\\sa240 This book was generated by ScrollLibrary™\\par
\\pard\\qc\\fs18\\cf3 © ${new Date().getFullYear()} All rights reserved\\par
`;

  return rtfHeader + titlePage + toc + chaptersRtf + footer + "}";
}

function escapeRtf(text: string): string {
  if (!text) return "";
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/\n/g, "\\par ");
}

function generateMarkdownContent(book: any, chapters: any[]): string {
  const totalWords = chapters.reduce((sum: number, ch: any) => sum + (ch.word_count || 0), 0);
  
  const header = `# ${book.title}

**Author:** ${book.author_ai_agent || "ScrollAuthorGPT"}  
**Category:** ${(book.category || '').replace(/_/g, " ")}  
**Total Words:** ${totalWords.toLocaleString()}  
**Generated by:** ScrollLibrary™  
**Date:** ${new Date().toLocaleDateString()}

---

## Table of Contents

${chapters.map((ch: any) => `- [Chapter ${ch.chapter_number}: ${ch.title}](#chapter-${ch.chapter_number}-${ch.title.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')}) (${(ch.word_count || 0).toLocaleString()} words)`).join("\n")}

---

`;

  const chaptersContent = chapters.map((ch: any) => `
# Chapter ${ch.chapter_number}: ${ch.title}

*${(ch.word_count || 0).toLocaleString()} words*

${ch.content || ""}

---
`).join("\n");

  const footer = `
## About This Book

This book was generated by ScrollLibrary™, an AI-powered book generation platform.

© ${new Date().getFullYear()} All rights reserved.
`;

  return header + chaptersContent + footer;
}
