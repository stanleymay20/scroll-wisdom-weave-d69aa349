import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, rgb, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";
import * as zip from "https://deno.land/x/zipjs@v2.7.32/index.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

function stripMarkdown(text: string): string {
  if (!text) return "";
  return text
    .replace(/^#{1,6}\s+/gm, "") // Headers
    .replace(/\*\*([^*]+)\*\*/g, "$1") // Bold
    .replace(/\*([^*]+)\*/g, "$1") // Italic
    .replace(/`[^`]+`/g, "") // Inline code
    .replace(/```[\s\S]*?```/g, "") // Code blocks
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // Links
    .replace(/^\s*[-*]\s+/gm, "• ") // List items
    .replace(/^\s*\d+\.\s+/gm, "") // Numbered lists
    .replace(/\n{3,}/g, "\n\n") // Multiple newlines
    .trim();
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

    // Fetch book
    const { data: book, error: bookError } = await supabase
      .from("books")
      .select("*")
      .eq("id", bookId)
      .single();

    if (bookError || !book) throw new Error("Book not found");
    if (!book.cover_image_url) throw new Error("Export requires a cover image");

    // Fetch chapters
    const { data: chapters, error: chaptersError } = await supabase
      .from("chapters")
      .select("*")
      .eq("book_id", bookId)
      .eq("is_generated", true)
      .order("chapter_number");

    if (chaptersError) throw new Error("Failed to fetch chapters");
    if (!chapters || chapters.length === 0) throw new Error("No generated chapters found");

    const finalAuthorName = authorName || book.author_ai_agent || "ScrollLibrary Author";
    const publishingIdentifier = isbn && isValidISBN(isbn) ? isbn : generateSPC(bookId);
    const isISBN = isbn && isValidISBN(isbn);
    const year = new Date().getFullYear();

    console.log(`[EXPORT] Found ${chapters.length} chapters, generating ${format}`);

    let content: string;
    let contentType: string;
    let filename: string;
    let isBase64 = false;

    switch (format) {
      case "pdf": {
        // Generate real PDF using pdf-lib
        const pdfBytes = await generatePDF(book, chapters, finalAuthorName, publishingIdentifier, isISBN, year);
        content = btoa(String.fromCharCode(...pdfBytes));
        contentType = "application/pdf";
        filename = `${sanitizeFilename(book.title)}.pdf`;
        isBase64 = true;
        break;
      }
      
      case "epub": {
        // Generate real EPUB (ZIP-based)
        const epubBytes = await generateEPUB(book, chapters, finalAuthorName, publishingIdentifier, isISBN, year);
        content = btoa(String.fromCharCode(...new Uint8Array(epubBytes)));
        contentType = "application/epub+zip";
        filename = `${sanitizeFilename(book.title)}.epub`;
        isBase64 = true;
        break;
      }
      
      case "docx": {
        // Generate real DOCX (ZIP-based)
        const docxBytes = await generateDOCX(book, chapters, finalAuthorName, publishingIdentifier, isISBN, year);
        content = btoa(String.fromCharCode(...new Uint8Array(docxBytes)));
        contentType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        filename = `${sanitizeFilename(book.title)}.docx`;
        isBase64 = true;
        break;
      }
      
      default:
        throw new Error(`Unsupported format: ${format}`);
    }

    console.log(`[EXPORT] Export complete: ${format}, ${content.length} base64 chars`);

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

// ===== PDF Generation with Page Numbers =====
async function generatePDF(book: any, chapters: any[], author: string, identifier: string, isISBN: boolean, year: number): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const timesRoman = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  const timesRomanBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  
  const pageWidth = 612; // Letter size
  const pageHeight = 792;
  const margin = 72; // 1 inch margins
  const textWidth = pageWidth - (margin * 2);
  
  // Track pages for numbering
  let pageNumber = 0;
  
  // Helper function to add page number
  const addPageNumber = (page: any, num: number) => {
    if (num > 2) { // Skip page numbers on title and copyright pages
      page.drawText(String(num - 2), { // Subtract 2 for front matter
        x: pageWidth / 2 - 5,
        y: 30,
        size: 10,
        font: helvetica,
        color: rgb(0.5, 0.5, 0.5),
      });
    }
  };

  // Title Page
  let page = pdfDoc.addPage([pageWidth, pageHeight]);
  pageNumber++;
  let y = pageHeight - 200;
  
  // Category
  page.drawText(book.category?.toUpperCase() || "BOOK", {
    x: margin,
    y,
    size: 12,
    font: helvetica,
    color: rgb(0.6, 0.5, 0.1),
  });
  y -= 50;
  
  // Title
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
  
  // Author
  page.drawText(`by ${author}`, {
    x: margin,
    y,
    size: 16,
    font: timesRoman,
    color: rgb(0.3, 0.3, 0.3),
  });
  
  // Publisher at bottom
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

  // Chapters
  for (const chapter of chapters) {
    // New page for each chapter
    page = pdfDoc.addPage([pageWidth, pageHeight]);
    pageNumber++;
    addPageNumber(page, pageNumber);
    y = pageHeight - margin - 50;
    
    // Chapter header
    page.drawText(`CHAPTER ${chapter.chapter_number}`, {
      x: margin,
      y,
      size: 10,
      font: helvetica,
      color: rgb(0.6, 0.5, 0.1),
    });
    y -= 30;
    
    // Chapter title
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
    
    // Chapter content
    const cleanContent = stripMarkdown(chapter.content || "");
    const paragraphs = cleanContent.split(/\n\n+/);
    
    for (const paragraph of paragraphs) {
      if (!paragraph.trim()) continue;
      
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
      y -= 8; // Paragraph spacing
    }
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

// ===== EPUB Generation =====
async function generateEPUB(book: any, chapters: any[], author: string, identifier: string, isISBN: boolean, year: number): Promise<ArrayBuffer> {
  const blobWriter = new zip.BlobWriter("application/epub+zip");
  const zipWriter = new zip.ZipWriter(blobWriter);

  // mimetype (must be first, uncompressed)
  await zipWriter.add("mimetype", new zip.TextReader("application/epub+zip"), { level: 0 });

  // META-INF/container.xml
  const containerXml = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;
  await zipWriter.add("META-INF/container.xml", new zip.TextReader(containerXml));

  // Generate chapter IDs
  const chapterItems = chapters.map((ch, i) => ({
    id: `chapter${i + 1}`,
    href: `chapter${i + 1}.xhtml`,
    chapter: ch,
  }));

  // OEBPS/content.opf
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
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="title" href="title.xhtml" media-type="application/xhtml+xml"/>
    ${chapterItems.map(c => `<item id="${c.id}" href="${c.href}" media-type="application/xhtml+xml"/>`).join('\n    ')}
  </manifest>
  <spine>
    <itemref idref="title"/>
    ${chapterItems.map(c => `<itemref idref="${c.id}"/>`).join('\n    ')}
  </spine>
</package>`;
  await zipWriter.add("OEBPS/content.opf", new zip.TextReader(contentOpf));

  // OEBPS/nav.xhtml (Navigation)
  const navXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>Table of Contents</title></head>
<body>
  <nav epub:type="toc">
    <h1>Table of Contents</h1>
    <ol>
      <li><a href="title.xhtml">Title Page</a></li>
      ${chapterItems.map(c => `<li><a href="${c.href}">Chapter ${c.chapter.chapter_number}: ${escapeXml(c.chapter.title)}</a></li>`).join('\n      ')}
    </ol>
  </nav>
</body>
</html>`;
  await zipWriter.add("OEBPS/nav.xhtml", new zip.TextReader(navXhtml));

  // OEBPS/title.xhtml
  const titleXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>${escapeXml(book.title)}</title></head>
<body style="text-align:center; padding:2em;">
  <h1 style="font-size:2em; margin-top:3em;">${escapeXml(book.title)}</h1>
  <p style="margin-top:2em; font-size:1.2em;">by ${escapeXml(author)}</p>
  <p style="margin-top:4em; font-size:0.9em; color:#666;">© ${year} ${escapeXml(author)}</p>
  <p style="font-size:0.8em; color:#888;">${isISBN ? `ISBN: ${identifier}` : `SPC: ${identifier}`}</p>
  <p style="margin-top:2em; font-size:0.8em; color:#888;">ScrollLibrary Publishing</p>
</body>
</html>`;
  await zipWriter.add("OEBPS/title.xhtml", new zip.TextReader(titleXhtml));

  // Add chapters
  for (const item of chapterItems) {
    const cleanContent = stripMarkdown(item.chapter.content || "");
    const paragraphs = cleanContent.split(/\n\n+/).filter(p => p.trim());
    
    const chapterXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>Chapter ${item.chapter.chapter_number}</title></head>
<body style="font-family:serif; line-height:1.6; padding:1em;">
  <h2 style="color:#b8860b; font-size:0.9em; text-transform:uppercase; letter-spacing:2px;">Chapter ${item.chapter.chapter_number}</h2>
  <h1 style="font-size:1.5em; margin-bottom:1em;">${escapeXml(item.chapter.title)}</h1>
  ${paragraphs.map(p => `<p style="margin-bottom:1em; text-align:justify;">${escapeXml(p.trim())}</p>`).join('\n  ')}
</body>
</html>`;
    await zipWriter.add(`OEBPS/${item.href}`, new zip.TextReader(chapterXhtml));
  }

  await zipWriter.close();
  const blob = await blobWriter.getData();
  return blob.arrayBuffer();
}

// ===== DOCX Generation =====
async function generateDOCX(book: any, chapters: any[], author: string, identifier: string, isISBN: boolean, year: number): Promise<ArrayBuffer> {
  const blobWriter = new zip.BlobWriter("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  const zipWriter = new zip.ZipWriter(blobWriter);

  // [Content_Types].xml
  const contentTypes = `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;
  await zipWriter.add("[Content_Types].xml", new zip.TextReader(contentTypes));

  // _rels/.rels
  const rels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;
  await zipWriter.add("_rels/.rels", new zip.TextReader(rels));

  // word/_rels/document.xml.rels
  const documentRels = `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
  await zipWriter.add("word/_rels/document.xml.rels", new zip.TextReader(documentRels));

  // word/styles.xml
  const styles = `<?xml version="1.0" encoding="UTF-8"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:style w:type="paragraph" w:styleId="Title">
    <w:name w:val="Title"/>
    <w:pPr><w:jc w:val="center"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="56"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="Heading 1"/>
    <w:pPr><w:spacing w:before="400" w:after="200"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="32"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="Heading 2"/>
    <w:pPr><w:spacing w:before="300" w:after="100"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="28"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Normal">
    <w:name w:val="Normal"/>
    <w:pPr><w:spacing w:after="200" w:line="276" w:lineRule="auto"/></w:pPr>
    <w:rPr><w:sz w:val="24"/></w:rPr>
  </w:style>
</w:styles>`;
  await zipWriter.add("word/styles.xml", new zip.TextReader(styles));

  // word/document.xml
  let documentContent = `<?xml version="1.0" encoding="UTF-8"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>`;

  // Title page
  documentContent += `
    <w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr><w:r><w:t>${escapeXml(book.title)}</w:t></w:r></w:p>
    <w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:t>by ${escapeXml(author)}</w:t></w:r></w:p>
    <w:p><w:pPr><w:jc w:val="center"/></w:pPr></w:p>
    <w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:sz w:val="20"/></w:rPr><w:t>© ${year} ${escapeXml(author)}</w:t></w:r></w:p>
    <w:p><w:pPr><w:jc w:val="center"/></w:pPr><w:r><w:rPr><w:sz w:val="20"/></w:rPr><w:t>${isISBN ? `ISBN: ${identifier}` : `SPC: ${identifier}`}</w:t></w:r></w:p>
    <w:p><w:r><w:br w:type="page"/></w:r></w:p>`;

  // Table of Contents
  documentContent += `
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Table of Contents</w:t></w:r></w:p>`;
  
  for (const chapter of chapters) {
    documentContent += `
    <w:p><w:r><w:t>Chapter ${chapter.chapter_number}: ${escapeXml(chapter.title)}</w:t></w:r></w:p>`;
  }
  
  documentContent += `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`;

  // Chapters
  for (const chapter of chapters) {
    documentContent += `
    <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>CHAPTER ${chapter.chapter_number}</w:t></w:r></w:p>
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>${escapeXml(chapter.title)}</w:t></w:r></w:p>`;
    
    const cleanContent = stripMarkdown(chapter.content || "");
    const paragraphs = cleanContent.split(/\n\n+/).filter(p => p.trim());
    
    for (const para of paragraphs) {
      documentContent += `
    <w:p><w:pPr><w:pStyle w:val="Normal"/></w:pPr><w:r><w:t>${escapeXml(para.trim())}</w:t></w:r></w:p>`;
    }
    
    documentContent += `<w:p><w:r><w:br w:type="page"/></w:r></w:p>`;
  }

  documentContent += `
  </w:body>
</w:document>`;

  await zipWriter.add("word/document.xml", new zip.TextReader(documentContent));
  await zipWriter.close();
  const blob = await blobWriter.getData();
  return blob.arrayBuffer();
}

function escapeXml(text: string): string {
  if (!text) return "";
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
