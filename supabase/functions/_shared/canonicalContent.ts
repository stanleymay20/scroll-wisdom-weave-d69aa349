/**
 * Canonical chapter content normalizer.
 *
 * Provides a shared intermediate representation (CanonicalBlock[]) so the
 * reader, export preview, and downstream export pipelines can speak the same
 * structural language. Today this is used by the export-quality auditor and
 * the in-app Export Preview. Edge function exporters (PDF/EPUB/DOCX/KDP)
 * should migrate to consuming `parseChapterToCanonical()` next.
 */

import { figureDataFor, parseRawFigureMarkers } from "./visual-intelligence.ts";
import type { FigureData } from "./figure-data.ts";

export type CanonicalBlockKind =
  | "heading"
  | "paragraph"
  | "list"
  | "quote"
  | "table"
  | "code"
  | "image"
  | "callout"
  | "reference"
  | "diagram"
  | "hr";

export interface CanonicalBlock {
  kind: CanonicalBlockKind;
  /** Heading level (1-6) for `heading`. */
  level?: number;
  text?: string;
  /** Raw markdown content (preserved for round-tripping when needed). */
  raw?: string;
  /** Ordered or unordered, with item strings. */
  list?: { ordered: boolean; items: string[] };
  /** Header row + body rows. */
  table?: { header: string[]; rows: string[][] };
  /** Fenced code block. */
  code?: { language: string | null; source: string };
  /** Image source + alt text. */
  image?: { src: string; alt: string };
  /**
   * A figure drawn from structure rather than fetched as a picture.
   *
   * Until now every `[FIGURE ...]` marker was stripped before parsing, on the
   * grounds that it was a prompt for an image pipeline rather than prose. That
   * is true of artwork and false of a diagram: a flowchart's nodes and edges
   * ARE the content, and dropping them deleted the figure from the PDF, the
   * EPUB and the DOCX alike. A marker carrying a validated DATA payload now
   * survives as one of these.
   */
  diagram?: CanonicalDiagram;
}

export interface CanonicalDiagram {
  figureNumber: number;
  caption: string;
  /** Prose description, used as the accessible alternative to the graphic. */
  description: string;
  visualType: string;
  data: FigureData;
}

export interface CanonicalChapter {
  chapter_number: number;
  title: string;
  blocks: CanonicalBlock[];
  /** Quick stats useful for QA + telemetry. */
  stats: {
    words: number;
    headings: number;
    paragraphs: number;
    images: number;
    tables: number;
    codeBlocks: number;
    lists: number;
  };
}

const DIAGRAM_TOKEN_RE = /^<<<SCROLL_DIAGRAM_(\d+)>>>$/;

const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const FENCE_RE = /^```([\w+-]*)\s*$/;
const TABLE_SEP_RE = /^\|?\s*:?-{2,}:?(\s*\|\s*:?-{2,}:?)+\s*\|?\s*$/;
const IMAGE_RE = /^!\[([^\]]*)\]\(([^)]+)\)\s*$/;
const HR_RE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/;
const OL_RE = /^\s*\d+\.\s+(.*)$/;
const UL_RE = /^\s*[-*+]\s+(.*)$/;
const QUOTE_RE = /^>\s?(.*)$/;
const REF_RE = /^\s*\[\^?([^\]]+)\]:\s+(.*)$/;

/**
 * Remove generation-only visual directives before structural parsing.
 * These blocks are prompts for an image pipeline, not manuscript prose; if they
 * leak into exports they become raw, unpublishable text such as
 * "[FIGURE 1 TYPE: ... DESCRIPTION: ...]".
 */
function stripExportOnlyArtifacts(input: string): string {
  let text = input.replace(/\r\n?/g, "\n");

  // Scrub historical AI-disclosure blockquotes that older generation runs
  // appended after every chapter. Removes an optional leading `---` separator
  // plus the entire blockquote (header line + any continuation `>` lines).
  text = text.replace(
    /(?:^|\n)\s*(?:-{3,}\s*\n\s*)?>\s*\*\*\s*AI[- ]?(?:Assisted|Generated)[^*\n]*\*\*[^\n]*(?:\n>[^\n]*)*/gi,
    "\n\n",
  );

  const out: string[] = [];
  let skippingFigure = false;

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();

    if (/^\[FIGURE\b/i.test(line)) {
      skippingFigure = !line.includes("]");
      continue;
    }

    if (skippingFigure) {
      if (line.includes("]")) skippingFigure = false;
      continue;
    }

    if (/^\[(?:Image not available|Image|Illustration)\b[^\]]*\]$/i.test(line)) {
      continue;
    }

    out.push(rawLine);
  }


  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function splitTableRow(line: string): string[] {
  const trimmed = line.replace(/^\||\|$/g, "");
  return trimmed.split("|").map((c) => c.trim());
}

export function parseChapterToCanonical(
  chapterNumber: number,
  chapterTitle: string,
  content: string | null | undefined,
): CanonicalChapter {
  const blocks: CanonicalBlock[] = [];
  const stats = { words: 0, headings: 0, paragraphs: 0, images: 0, tables: 0, codeBlocks: 0, lists: 0 };

  // Lift drawable figures out before stripExportOnlyArtifacts runs, because
  // that function's job is to delete every `[FIGURE ...]` block and it cannot
  // tell a diagram from an image prompt. Each is replaced by a single-line
  // token that survives the strip and is recognised by the parse loop below.
  const raw = content ?? "";
  const diagrams = new Map<string, CanonicalDiagram>();
  let prepared = raw;
  for (const marker of parseRawFigureMarkers(raw)) {
    const data = figureDataFor(marker);
    if (!data) continue;
    const token = `<<<SCROLL_DIAGRAM_${diagrams.size}>>>`;
    diagrams.set(token, {
      figureNumber: marker.num,
      caption: marker.caption?.trim() || `Figure ${marker.num}`,
      description: marker.description.trim(),
      visualType: marker.type || "flowchart",
      data,
    });
    // Replaced with a function so a '$' anywhere in the marker is not read as
    // a replacement pattern.
    prepared = prepared.replace(marker.fullMatch, () => `\n\n${token}\n\n`);
  }

  const text = stripExportOnlyArtifacts(prepared);
  const lines = text.split("\n");

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Fenced code
    const fence = line.match(FENCE_RE);
    if (fence) {
      const lang = fence[1] || null;
      const src: string[] = [];
      i++;
      while (i < lines.length && !lines[i].match(/^```\s*$/)) {
        src.push(lines[i]);
        i++;
      }
      i++; // closing fence (or EOF)
      blocks.push({ kind: "code", code: { language: lang, source: src.join("\n") } });
      stats.codeBlocks++;
      continue;
    }

    // Heading
    const h = line.match(HEADING_RE);
    if (h) {
      const level = h[1].length;
      const t = h[2].trim();
      blocks.push({ kind: "heading", level, text: t, raw: line });
      stats.headings++;
      stats.words += t.split(/\s+/).filter(Boolean).length;
      i++;
      continue;
    }

    // Horizontal rule
    if (HR_RE.test(line)) {
      blocks.push({ kind: "hr" });
      i++;
      continue;
    }

    // A drawable figure, lifted out above.
    const diagramToken = line.trim();
    if (DIAGRAM_TOKEN_RE.test(diagramToken) && diagrams.has(diagramToken)) {
      const diagram = diagrams.get(diagramToken)!;
      blocks.push({ kind: "diagram", diagram });
      // Counted as a figure: export-quality asks whether a book has visuals,
      // and a diagram is one.
      stats.images++;
      stats.words += diagram.caption.split(/\s+/).filter(Boolean).length;
      i++;
      continue;
    }

    // Image-only line
    const img = line.match(IMAGE_RE);
    if (img) {
      blocks.push({ kind: "image", image: { alt: img[1], src: img[2] } });
      stats.images++;
      i++;
      continue;
    }

    // Reference / footnote definition
    const ref = line.match(REF_RE);
    if (ref) {
      blocks.push({ kind: "reference", text: ref[2], raw: line });
      i++;
      continue;
    }

    // Table: header row then separator
    if (line.includes("|") && i + 1 < lines.length && TABLE_SEP_RE.test(lines[i + 1])) {
      const header = splitTableRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim() !== "") {
        rows.push(splitTableRow(lines[i]));
        i++;
      }
      blocks.push({ kind: "table", table: { header, rows } });
      stats.tables++;
      continue;
    }

    // Quote block
    if (QUOTE_RE.test(line)) {
      const buf: string[] = [];
      while (i < lines.length && QUOTE_RE.test(lines[i])) {
        buf.push(lines[i].replace(QUOTE_RE, "$1"));
        i++;
      }
      const joined = buf.join("\n").trim();
      blocks.push({ kind: "quote", text: joined });
      stats.words += joined.split(/\s+/).filter(Boolean).length;
      continue;
    }

    // List (ordered or unordered) — tolerate blank lines between items so that
    // model output like "1. foo\n\n1. bar\n\n1. baz" still merges into a single
    // list (otherwise each item becomes its own list and re-numbers to "1.").
    if (OL_RE.test(line) || UL_RE.test(line)) {
      const ordered = OL_RE.test(line);
      const matcher = ordered ? OL_RE : UL_RE;
      const items: string[] = [];
      while (i < lines.length) {
        const m = lines[i].match(matcher);
        if (m) {
          items.push(m[1]);
          i++;
          continue;
        }
        // Allow a single blank line between items if the next non-blank line
        // is another list item of the same kind.
        if (lines[i].trim() === "" && i + 1 < lines.length && matcher.test(lines[i + 1])) {
          i++;
          continue;
        }
        break;
      }
      blocks.push({ kind: "list", list: { ordered, items } });
      stats.lists++;
      stats.words += items.join(" ").split(/\s+/).filter(Boolean).length;
      continue;
    }


    // Blank line — flush
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Paragraph (collect until blank or block-starter)
    const buf: string[] = [line];
    i++;
    while (i < lines.length && lines[i].trim() !== "") {
      const ln = lines[i];
      if (
        HEADING_RE.test(ln) ||
        FENCE_RE.test(ln) ||
        HR_RE.test(ln) ||
        IMAGE_RE.test(ln) ||
        QUOTE_RE.test(ln) ||
        OL_RE.test(ln) ||
        UL_RE.test(ln)
      ) break;
      buf.push(ln);
      i++;
    }
    const paragraph = buf.join(" ").trim();
    blocks.push({ kind: "paragraph", text: paragraph });
    stats.paragraphs++;
    stats.words += paragraph.split(/\s+/).filter(Boolean).length;
  }

  return {
    chapter_number: chapterNumber,
    title: chapterTitle,
    blocks,
    stats,
  };
}

export function parseBookToCanonical(
  chapters: { chapter_number: number; title: string; content: string | null }[],
): CanonicalChapter[] {
  return chapters
    .slice()
    .sort((a, b) => a.chapter_number - b.chapter_number)
    .map((c) => parseChapterToCanonical(c.chapter_number, c.title, c.content));
}
