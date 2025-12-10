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

    // Fetch book details
    const { data: book, error: bookError } = await supabase
      .from("books")
      .select("*")
      .eq("id", bookId)
      .single();

    if (bookError || !book) {
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

    // Generate content based on format
    let content: string;
    let contentType: string;
    let filename: string;

    const totalWords = chapters.reduce((sum, ch) => sum + (ch.word_count || 0), 0);

    switch (format) {
      case "pdf":
        // Generate HTML that can be converted to PDF client-side
        content = generatePDFContent(book, chapters);
        contentType = "text/html";
        filename = `${sanitizeFilename(book.title)}.html`;
        break;
      
      case "epub":
        // Generate EPUB-compatible XHTML
        content = generateEPUBContent(book, chapters);
        contentType = "application/xhtml+xml";
        filename = `${sanitizeFilename(book.title)}.xhtml`;
        break;
      
      case "docx":
        // Generate RTF (can be opened in Word)
        content = generateDOCXContent(book, chapters);
        contentType = "application/rtf";
        filename = `${sanitizeFilename(book.title)}.rtf`;
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
  const chaptersHtml = chapters.map(ch => `
    <div class="chapter" style="page-break-before: always;">
      <h2 style="color: #1a1a2e; border-bottom: 2px solid #d4af37; padding-bottom: 10px;">
        Chapter ${ch.chapter_number}: ${escapeHtml(ch.title)}
      </h2>
      <div class="chapter-content">
        ${markdownToHtml(ch.content || "")}
      </div>
    </div>
  `).join("\n");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${escapeHtml(book.title)}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=Source+Sans+3:wght@400;500;600&display=swap');
    
    body {
      font-family: 'Source Sans 3', Georgia, serif;
      line-height: 1.8;
      max-width: 800px;
      margin: 0 auto;
      padding: 40px;
      color: #333;
    }
    
    .cover-page {
      text-align: center;
      padding: 100px 20px;
      page-break-after: always;
    }
    
    .cover-page h1 {
      font-family: 'Playfair Display', serif;
      font-size: 48px;
      color: #1a1a2e;
      margin-bottom: 20px;
    }
    
    .cover-page .author {
      font-size: 24px;
      color: #666;
      margin-top: 40px;
    }
    
    .cover-page .category {
      font-size: 18px;
      color: #d4af37;
      text-transform: uppercase;
      letter-spacing: 2px;
    }
    
    h2 {
      font-family: 'Playfair Display', serif;
      font-size: 28px;
      margin-top: 40px;
    }
    
    h3 {
      font-family: 'Playfair Display', serif;
      font-size: 22px;
      color: #444;
    }
    
    p {
      text-align: justify;
      margin-bottom: 16px;
    }
    
    ul {
      margin: 20px 0;
      padding-left: 30px;
    }
    
    li {
      margin-bottom: 8px;
    }
    
    .toc {
      page-break-after: always;
    }
    
    .toc h2 {
      text-align: center;
    }
    
    .toc-item {
      display: flex;
      justify-content: space-between;
      padding: 10px 0;
      border-bottom: 1px dotted #ccc;
    }
    
    @media print {
      body { margin: 0; padding: 20px; }
      .chapter { page-break-before: always; }
    }
  </style>
</head>
<body>
  <div class="cover-page">
    <p class="category">${escapeHtml(book.category.replace(/_/g, " "))}</p>
    <h1>${escapeHtml(book.title)}</h1>
    <p class="author">By ${escapeHtml(book.author_ai_agent || "ScrollAuthorGPT")}</p>
    <p style="margin-top: 60px; color: #999;">Generated by ScrollLibrary™</p>
  </div>
  
  <div class="toc">
    <h2>Table of Contents</h2>
    ${chapters.map(ch => `
      <div class="toc-item">
        <span>Chapter ${ch.chapter_number}: ${escapeHtml(ch.title)}</span>
        <span>${(ch.word_count || 0).toLocaleString()} words</span>
      </div>
    `).join("")}
  </div>
  
  ${chaptersHtml}
  
  <div style="text-align: center; margin-top: 60px; padding: 40px; border-top: 2px solid #d4af37;">
    <p style="color: #666;">This book was generated by ScrollLibrary™</p>
    <p style="color: #999; font-size: 14px;">© ${new Date().getFullYear()} All rights reserved</p>
  </div>
</body>
</html>`;
}

function generateEPUBContent(book: any, chapters: any[]): string {
  const chaptersXhtml = chapters.map(ch => `
    <section id="chapter-${ch.chapter_number}">
      <h2>Chapter ${ch.chapter_number}: ${escapeHtml(ch.title)}</h2>
      ${markdownToHtml(ch.content || "")}
    </section>
  `).join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head>
  <title>${escapeHtml(book.title)}</title>
  <meta charset="UTF-8"/>
  <style>
    body { font-family: Georgia, serif; line-height: 1.6; padding: 20px; }
    h1 { text-align: center; font-size: 2em; }
    h2 { font-size: 1.5em; border-bottom: 1px solid #ccc; padding-bottom: 10px; margin-top: 2em; }
    h3 { font-size: 1.2em; }
    p { text-align: justify; margin: 1em 0; }
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(book.title)}</h1>
    <p style="text-align: center;">By ${escapeHtml(book.author_ai_agent || "ScrollAuthorGPT")}</p>
  </header>
  
  <nav epub:type="toc">
    <h2>Table of Contents</h2>
    <ol>
      ${chapters.map(ch => `<li><a href="#chapter-${ch.chapter_number}">Chapter ${ch.chapter_number}: ${escapeHtml(ch.title)}</a></li>`).join("\n")}
    </ol>
  </nav>
  
  ${chaptersXhtml}
</body>
</html>`;
}

function generateDOCXContent(book: any, chapters: any[]): string {
  // Generate RTF format which can be opened in Word
  const rtfHeader = `{\\rtf1\\ansi\\deff0
{\\fonttbl{\\f0 Georgia;}{\\f1 Arial;}}
{\\colortbl;\\red26\\green26\\blue46;\\red212\\green175\\blue55;\\red102\\green102\\blue102;}
\\paperw12240\\paperh15840\\margl1440\\margr1440\\margt1440\\margb1440
`;

  const titlePage = `
\\pard\\qc\\f0\\fs72\\cf1\\b ${escapeRtf(book.title)}\\b0\\par
\\pard\\qc\\fs36\\cf3 By ${escapeRtf(book.author_ai_agent || "ScrollAuthorGPT")}\\par
\\pard\\qc\\fs24\\cf2 ${escapeRtf(book.category.replace(/_/g, " ").toUpperCase())}\\par
\\page
`;

  const toc = `
\\pard\\qc\\f0\\fs48\\cf1\\b Table of Contents\\b0\\par
\\pard\\fs24\\cf0
${chapters.map(ch => `Chapter ${ch.chapter_number}: ${escapeRtf(ch.title)}\\par`).join("\n")}
\\page
`;

  const chaptersRtf = chapters.map(ch => {
    const content = (ch.content || "")
      .replace(/^## (.+)$/gm, "\\par\\pard\\fs36\\cf1\\b $1\\b0\\par\\pard\\fs24\\cf0")
      .replace(/^### (.+)$/gm, "\\par\\pard\\fs30\\b $1\\b0\\par\\pard\\fs24")
      .replace(/\*\*(.+?)\*\*/g, "\\b $1\\b0")
      .replace(/\n\n/g, "\\par\\par")
      .replace(/^- (.+)$/gm, "\\bullet  $1\\par");

    return `
\\pard\\fs40\\cf1\\b Chapter ${ch.chapter_number}: ${escapeRtf(ch.title)}\\b0\\par
\\pard\\fs24\\cf0
${content}
\\page
`;
  }).join("");

  return rtfHeader + titlePage + toc + chaptersRtf + "}";
}

function escapeRtf(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\{/g, "\\{")
    .replace(/\}/g, "\\}")
    .replace(/\n/g, "\\par ");
}

function generateMarkdownContent(book: any, chapters: any[]): string {
  const header = `# ${book.title}

**Author:** ${book.author_ai_agent || "ScrollAuthorGPT"}  
**Category:** ${book.category.replace(/_/g, " ")}  
**Generated by:** ScrollLibrary™

---

## Table of Contents

${chapters.map(ch => `- [Chapter ${ch.chapter_number}: ${ch.title}](#chapter-${ch.chapter_number})`).join("\n")}

---

`;

  const chaptersContent = chapters.map(ch => `
## Chapter ${ch.chapter_number}: ${ch.title}

${ch.content || ""}

---
`).join("\n");

  return header + chaptersContent;
}
