// Minimal EPUB 3.0.1 builder.
//
// Why hand-rolled: the Deno edge runtime can't load most npm EPUB packages
// without polyfills, and the EPUB container format is just "a deterministic
// ZIP of a handful of XML files." Building it directly costs ~300 LOC, has
// zero runtime deps beyond the JSZip we already import for the bundle, and
// produces files that pass `epubcheck`.
//
// Spec references:
//   https://www.w3.org/TR/epub-33/
//   https://www.w3.org/TR/epub-packages-33/

import type JSZip from "https://esm.sh/jszip@3.10.1";
import type { BundleChapter, BundleBook, BundleListing, BundleAuthor } from "./bundle-content.ts";

export interface EpubInput {
  book: BundleBook;
  listing: BundleListing | null;
  author: BundleAuthor | null;
  chapters: BundleChapter[];
  coverBytes: Uint8Array | null;
  coverMime: string | null;
  language?: string;
  generatedAt: string;
  /** Optional ISBN to emit as dc:identifier. */
  isbn?: string | null;
  /** Optional subjects emitted as dc:subject entries — categories + keywords. */
  subjects?: string[];
  /** Optional AI assistance disclosure — emitted as a meta property so
   *  Apple Books / Kobo catalog the work correctly. */
  aiAssistanceLevel?: "none" | "assisted" | "generated" | null;
}

const NS_PACKAGE = "http://www.idpf.org/2007/opf";
const NS_DC = "http://purl.org/dc/elements/1.1/";

function uuid(): string {
  return crypto.randomUUID();
}

function escXml(s: string | null | undefined): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function escAttr(s: string | null | undefined): string {
  return escXml(s);
}

function pad(n: number, w = 4): string {
  return String(n).padStart(w, "0");
}

function chapterSlug(ch: BundleChapter, idx: number): string {
  const base = (ch.title || `chapter-${ch.chapter_number}`).toLowerCase().normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "chapter";
  return `chapter-${pad(idx + 1, 4)}-${base}`;
}

/**
 * Render chapter markdown content to EPUB-safe XHTML.
 * We deliberately handle a small markdown subset and escape everything else —
 * the goal is "passes epubcheck and renders cleanly on Kindle Previewer,"
 * not "supports every markdown extension." Anything fancier should be
 * pre-flattened by the canonical parser before reaching this stage.
 */
function chapterXhtml(title: string, content: string, lang: string): string {
  const body = renderMarkdownToXhtml(content);
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${escAttr(lang)}">
<head>
  <meta charset="utf-8"/>
  <title>${escXml(title)}</title>
  <link rel="stylesheet" type="text/css" href="../style/main.css"/>
</head>
<body epub:type="bodymatter">
  <section epub:type="chapter">
    <h1>${escXml(title)}</h1>
    ${body}
  </section>
</body>
</html>`;
}

function renderMarkdownToXhtml(md: string): string {
  const lines = (md || "").replace(/\r\n?/g, "\n").split("\n");
  const out: string[] = [];
  let i = 0;
  let inUl = false;
  let inOl = false;
  let inCode = false;
  let codeBuf: string[] = [];
  let para: string[] = [];

  const flushPara = () => {
    if (para.length) {
      out.push(`<p>${inlineXhtml(para.join(" "))}</p>`);
      para = [];
    }
  };
  const flushList = () => {
    if (inUl) { out.push(`</ul>`); inUl = false; }
    if (inOl) { out.push(`</ol>`); inOl = false; }
  };

  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.replace(/\t/g, "    ");

    if (line.startsWith("```")) {
      flushPara(); flushList();
      if (inCode) {
        out.push(`<pre><code>${escXml(codeBuf.join("\n"))}</code></pre>`);
        codeBuf = []; inCode = false;
      } else {
        inCode = true;
      }
      i++; continue;
    }
    if (inCode) { codeBuf.push(raw); i++; continue; }

    if (!line.trim()) { flushPara(); flushList(); i++; continue; }

    const h = line.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flushPara(); flushList();
      const level = Math.min(6, Math.max(2, h[1].length + 1)); // shift down 1 because chapter title is h1
      out.push(`<h${level}>${inlineXhtml(h[2])}</h${level}>`);
      i++; continue;
    }
    if (/^\s*[-*+]\s+/.test(line)) {
      flushPara();
      if (!inUl) { flushList(); out.push(`<ul>`); inUl = true; }
      out.push(`<li>${inlineXhtml(line.replace(/^\s*[-*+]\s+/, ""))}</li>`);
      i++; continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      flushPara();
      if (!inOl) { flushList(); out.push(`<ol>`); inOl = true; }
      out.push(`<li>${inlineXhtml(line.replace(/^\s*\d+\.\s+/, ""))}</li>`);
      i++; continue;
    }
    if (/^>\s?/.test(line)) {
      flushPara(); flushList();
      out.push(`<blockquote><p>${inlineXhtml(line.replace(/^>\s?/, ""))}</p></blockquote>`);
      i++; continue;
    }
    if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      flushPara(); flushList();
      out.push(`<hr/>`);
      i++; continue;
    }
    para.push(line.trim());
    i++;
  }
  flushPara(); flushList();
  if (inCode && codeBuf.length) out.push(`<pre><code>${escXml(codeBuf.join("\n"))}</code></pre>`);
  return out.join("\n    ");
}

function inlineXhtml(text: string): string {
  // Order: escape first, then re-introduce safe inline markup.
  let s = escXml(text);
  // **bold** and *italic* and `code`
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  s = s.replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
  // [label](url) — restrict url scheme. Kindle's web view honours mailto:
  // and tel: links; everything else is downgraded to plain text so a hostile
  // chapter can't slip a javascript: payload past us.
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
    const url = String(href).trim();
    if (!/^(?:https?:\/\/|mailto:|tel:|#|\/)/i.test(url)) return label;
    return `<a href="${escAttr(url)}">${label}</a>`;
  });
  return s;
}

function packageOpf(input: EpubInput, bookId: string, manifestItems: string, spineItems: string): string {
  const title = escXml(input.book.title || "Untitled");
  const author = escXml(input.author?.display_name || "Unknown");
  const lang = escXml(input.language || "en");
  const subtitle = input.listing?.subtitle ? `<meta property="dcterms:alternative">${escXml(input.listing.subtitle)}</meta>` : "";
  const description = escXml(input.listing?.amazon_description || input.listing?.blurb || input.book.description || "");
  const modified = new Date(input.generatedAt).toISOString().replace(/\.\d+Z$/, "Z");

  // ISBN as a secondary dc:identifier. Apple Books and Kobo index on this.
  const isbn = (input.isbn || "").trim();
  const isbnTag = isbn
    ? `<dc:identifier opf:scheme="ISBN" xmlns:opf="http://www.idpf.org/2007/opf">${escXml(isbn)}</dc:identifier>`
    : "";

  // dc:subject — Kindle / Apple Books surface these in genre search.
  const subjects = (input.subjects ?? []).slice(0, 12)
    .map((s) => `<dc:subject>${escXml(s)}</dc:subject>`).join("\n    ");

  // AI assistance disclosure — emitted as a refinable meta property so
  // platform catalogs that opt to surface AI content notices can.
  const aiTag = input.aiAssistanceLevel && input.aiAssistanceLevel !== "none"
    ? `<meta property="schema:disambiguatingDescription">AI-${input.aiAssistanceLevel}</meta>`
    : "";

  return `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="${NS_PACKAGE}" version="3.0" unique-identifier="bookid" xml:lang="${lang}">
  <metadata xmlns:dc="${NS_DC}">
    <dc:identifier id="bookid">urn:uuid:${bookId}</dc:identifier>
    ${isbnTag}
    <dc:title>${title}</dc:title>
    <dc:language>${lang}</dc:language>
    <dc:creator id="author">${author}</dc:creator>
    <meta refines="#author" property="role" scheme="marc:relators">aut</meta>
    <dc:publisher>ScrollLibrary</dc:publisher>
    <dc:date>${modified}</dc:date>
    <meta property="dcterms:modified">${modified}</meta>
    ${description ? `<dc:description>${description}</dc:description>` : ""}
    ${subtitle}
    ${subjects}
    ${aiTag}
    ${input.coverBytes ? `<meta name="cover" content="cover-image"/>` : ""}
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="style" href="style/main.css" media-type="text/css"/>
    ${input.coverBytes ? `<item id="cover-image" href="images/cover.${input.coverMime === "image/png" ? "png" : "jpg"}" media-type="${escAttr(input.coverMime || "image/jpeg")}" properties="cover-image"/>` : ""}
    ${input.coverBytes ? `<item id="cover-page" href="xhtml/cover.xhtml" media-type="application/xhtml+xml"/>` : ""}
    ${manifestItems}
  </manifest>
  <spine>
    ${input.coverBytes ? `<itemref idref="cover-page"/>` : ""}
    <itemref idref="nav"/>
    ${spineItems}
  </spine>
</package>`;
}

function navXhtml(input: EpubInput, chapters: Array<{ slug: string; title: string }>): string {
  const items = chapters.map((c) => `<li><a href="xhtml/${c.slug}.xhtml">${escXml(c.title)}</a></li>`).join("\n      ");
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${escAttr(input.language || "en")}">
<head>
  <meta charset="utf-8"/>
  <title>Table of contents</title>
  <link rel="stylesheet" type="text/css" href="style/main.css"/>
</head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>Table of contents</h1>
    <ol>
      ${items}
    </ol>
  </nav>
</body>
</html>`;
}

function coverXhtml(coverHref: string, title: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head>
  <meta charset="utf-8"/>
  <title>${escXml(title)}</title>
  <style>body{margin:0;padding:0;text-align:center}img{max-width:100%;height:auto}</style>
</head>
<body epub:type="cover">
  <img src="${escAttr(coverHref)}" alt="${escXml(title)} cover"/>
</body>
</html>`;
}

const CSS = `body{font-family:Georgia,serif;line-height:1.55;color:#111}
h1,h2,h3,h4{font-family:Helvetica,Arial,sans-serif;line-height:1.2}
h1{font-size:1.8em;margin:1em 0 .5em}
h2{font-size:1.4em;margin:1em 0 .4em}
p{margin:0 0 .9em;text-align:justify}
blockquote{margin:1em 1.5em;color:#444;font-style:italic;border-left:3px solid #ddd;padding-left:1em}
pre{font-family:Menlo,Consolas,monospace;font-size:.85em;background:#f5f5f5;padding:1em;border-radius:4px;white-space:pre-wrap;word-wrap:break-word}
code{font-family:Menlo,Consolas,monospace;font-size:.9em}
ul,ol{margin:0 0 1em 1.5em}
hr{border:none;border-top:1px solid #ccc;margin:2em 0}`;

function containerXml(): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`;
}

/**
 * Build an EPUB 3.0.1 byte stream. Returns Uint8Array. STORE the mimetype
 * file uncompressed (epubcheck requirement); everything else is DEFLATEd.
 */
export async function buildEpub(JSZipCtor: typeof JSZip, input: EpubInput): Promise<Uint8Array> {
  const zip = new JSZipCtor();
  const bookId = uuid();

  // STORE the mimetype file (no compression). This is a hard EPUB rule.
  zip.file("mimetype", "application/epub+zip", { compression: "STORE" });
  zip.file("META-INF/container.xml", containerXml());

  const oebps = zip.folder("OEBPS")!;
  oebps.file("style/main.css", CSS);

  // Render chapters
  const chapterDescriptors: Array<{ slug: string; title: string }> = [];
  const manifestParts: string[] = [];
  const spineParts: string[] = [];
  input.chapters.forEach((ch, idx) => {
    const title = (ch.title?.trim() || `Chapter ${ch.chapter_number}`);
    const slug = chapterSlug(ch, idx);
    chapterDescriptors.push({ slug, title });
    oebps.file(`xhtml/${slug}.xhtml`, chapterXhtml(title, ch.content || "", input.language || "en"));
    const id = `ch${pad(idx + 1, 4)}`;
    manifestParts.push(`<item id="${id}" href="xhtml/${slug}.xhtml" media-type="application/xhtml+xml"/>`);
    spineParts.push(`<itemref idref="${id}"/>`);
  });

  if (input.coverBytes) {
    const ext = input.coverMime === "image/png" ? "png" : "jpg";
    oebps.file(`images/cover.${ext}`, input.coverBytes);
    oebps.file("xhtml/cover.xhtml", coverXhtml(`../images/cover.${ext}`, input.book.title));
  }

  oebps.file("nav.xhtml", navXhtml(input, chapterDescriptors));
  oebps.file("content.opf", packageOpf(input, bookId, manifestParts.join("\n    "), spineParts.join("\n    ")));

  return await zip.generateAsync({ type: "uint8array" });
}
