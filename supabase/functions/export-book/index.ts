import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, rgb, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";
import * as zip from "https://deno.land/x/zipjs@v2.7.32/index.js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Format restrictions by tier
const TIER_FORMATS = {
  free: ["pdf"],
  student: ["pdf", "epub"],
  premium: ["pdf", "epub", "docx"],
  prophet_tier: ["pdf", "epub", "docx"],
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

    // Get user's subscription plan
    const { data: profile } = await supabase
      .from("profiles")
      .select("plan")
      .eq("id", user.id)
      .single();

    const userPlan = profile?.plan || "free";
    const allowedFormats = TIER_FORMATS[userPlan as keyof typeof TIER_FORMATS] || TIER_FORMATS.free;

    const { bookId, format, authorName, isbn } = await req.json();

    // Check format permissions
    if (!allowedFormats.includes(format)) {
      console.log(`[EXPORT] Format ${format} not allowed for ${userPlan} plan`);
      return new Response(JSON.stringify({ 
        error: `${format.toUpperCase()} export requires ${format === 'docx' ? 'Premium' : 'Student'} plan or higher.` 
      }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[EXPORT] Exporting book ${bookId.slice(0, 8)}... as ${format} (${userPlan} plan)`);

    // Fetch book and verify ownership
    const { data: book, error: bookError } = await supabase
      .from("books")
      .select("*")
      .eq("id", bookId)
      .single();

    if (bookError || !book) throw new Error("Book not found");
    
    // Verify user owns the book or it's published
    if (book.creator_id !== user.id && !book.is_published) {
      return new Response(JSON.stringify({ error: "Not authorized to export this book" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    // Fetch cover image
    console.log(`[EXPORT] Fetching cover image...`);
    const coverImageBytes = await fetchImageBytes(book.cover_image_url);
    
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
        const pdfBytes = await generatePDF(book, chapters, finalAuthorName, publishingIdentifier, isISBN, year, coverImageBytes);
        content = btoa(String.fromCharCode(...pdfBytes));
        contentType = "application/pdf";
        filename = `${sanitizeFilename(book.title)}.pdf`;
        isBase64 = true;
        break;
      }
      
      case "epub": {
        const epubBytes = await generateEPUB(book, chapters, finalAuthorName, publishingIdentifier, isISBN, year, coverImageBytes);
        content = btoa(String.fromCharCode(...new Uint8Array(epubBytes)));
        contentType = "application/epub+zip";
        filename = `${sanitizeFilename(book.title)}.epub`;
        isBase64 = true;
        break;
      }
      
      case "docx": {
        const docxBytes = await generateDOCX(book, chapters, finalAuthorName, publishingIdentifier, isISBN, year, coverImageBytes);
        content = btoa(String.fromCharCode(...new Uint8Array(docxBytes)));
        contentType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
        filename = `${sanitizeFilename(book.title)}.docx`;
        isBase64 = true;
        break;
      }
      
      default:
        throw new Error(`Unsupported format: ${format}`);
    }

    console.log(`[EXPORT] Export complete: ${format}`);

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

// ===== PDF Generation with Cover Page =====
async function generatePDF(book: any, chapters: any[], author: string, identifier: string, isISBN: boolean, year: number, coverImageBytes: Uint8Array | null): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const timesRoman = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  const timesRomanBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  
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
      y -= 8;
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

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ===== EPUB Generation with Cover =====
async function generateEPUB(book: any, chapters: any[], author: string, identifier: string, isISBN: boolean, year: number, coverImageBytes: Uint8Array | null): Promise<ArrayBuffer> {
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
    <item id="css" href="style.css" media-type="text/css"/>
  </manifest>
  <spine>
    ${hasCover ? '<itemref idref="cover"/>' : ''}
    <itemref idref="nav"/>
    <itemref idref="title"/>
    ${chapterItems.map(c => `<itemref idref="${c.id}"/>`).join('\n    ')}
  </spine>
</package>`;
  await zipWriter.add("OEBPS/content.opf", new zip.TextReader(contentOpf));

  const css = `body { font-family: Georgia, serif; margin: 2em; line-height: 1.6; }
h1 { font-size: 1.8em; margin-bottom: 0.5em; }
h2 { font-size: 1.4em; margin-top: 1.5em; }
p { margin: 0.8em 0; text-align: justify; }
.cover { text-align: center; }
.cover img { max-width: 100%; height: auto; }`;
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
  </ol>
</nav>
</body>
</html>`;
  await zipWriter.add("OEBPS/nav.xhtml", new zip.TextReader(navXhtml));

  const titleXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>${escapeXml(book.title)}</title><link rel="stylesheet" href="style.css"/></head>
<body>
<h1>${escapeXml(book.title)}</h1>
<p>by ${escapeXml(author)}</p>
<p>${escapeXml(book.category?.replace(/_/g, ' ') || 'Book')}</p>
<hr/>
<p>© ${year} ${escapeXml(author)}. All rights reserved.</p>
<p>${isISBN ? `ISBN: ${identifier}` : `SPC: ${identifier}`}</p>
<p>Published by ScrollLibrary Publishing</p>
</body>
</html>`;
  await zipWriter.add("OEBPS/title.xhtml", new zip.TextReader(titleXhtml));

  for (const item of chapterItems) {
    const content = stripMarkdown(item.chapter.content || "")
      .split(/\n\n+/)
      .map(p => `<p>${escapeXml(p.trim())}</p>`)
      .join('\n');
    
    const chapterXhtml = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>${escapeXml(item.chapter.title)}</title><link rel="stylesheet" href="style.css"/></head>
<body>
<h1>Chapter ${item.chapter.chapter_number}: ${escapeXml(item.chapter.title)}</h1>
${content}
</body>
</html>`;
    await zipWriter.add(`OEBPS/${item.href}`, new zip.TextReader(chapterXhtml));
  }

  await zipWriter.close();
  const blob = await blobWriter.getData();
  return await blob.arrayBuffer();
}

// ===== DOCX Generation with Cover =====
async function generateDOCX(book: any, chapters: any[], author: string, identifier: string, isISBN: boolean, year: number, coverImageBytes: Uint8Array | null): Promise<ArrayBuffer> {
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

  documentContent += `
<w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr><w:r><w:t>${escapeXml(book.title)}</w:t></w:r></w:p>
<w:p><w:r><w:t>by ${escapeXml(author)}</w:t></w:r></w:p>
<w:p><w:r><w:t>${escapeXml(book.category?.replace(/_/g, ' ') || 'Book')}</w:t></w:r></w:p>
<w:p><w:r><w:t></w:t></w:r></w:p>
<w:p><w:r><w:t>© ${year} ${escapeXml(author)}. All rights reserved.</w:t></w:r></w:p>
<w:p><w:r><w:t>${isISBN ? `ISBN: ${identifier}` : `Scroll Publishing Code: ${identifier}`}</w:t></w:r></w:p>
<w:p><w:r><w:t>Published by ScrollLibrary Publishing</w:t></w:r></w:p>
<w:p><w:r><w:br w:type="page"/></w:r></w:p>`;

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

  documentContent += `</w:body></w:document>`;
  await zipWriter.add("word/document.xml", new zip.TextReader(documentContent));

  await zipWriter.close();
  const blob = await blobWriter.getData();
  return await blob.arrayBuffer();
}
