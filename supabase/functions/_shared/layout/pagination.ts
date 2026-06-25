// Pagination engine. Bin-packs SemanticBlocks into pages while honoring
// keep-together, keep-with-next, page-break-before/after, and splittability.

import { SemanticBlock } from "./blocks.ts";
import { contentHeightPt, TypographyTokens } from "./typography.ts";

export interface Placement {
  blockId: string;
  kind: SemanticBlock["kind"];
  level?: number;
  height: number;
  splitIndex?: number; // for split blocks, which slice
  splitOf?: number;    // total slices
  isHeaderRepeat?: boolean; // for tables that repeat header on new page
}

export interface Page {
  pageNumber: number;
  placements: Placement[];
  usedHeight: number;
  capacity: number;
}

export interface PaginationResult {
  pages: Page[];
  blocks: SemanticBlock[];
}

function splitChildren(b: SemanticBlock, remaining: number, leadingMin: number): [SemanticBlock | null, SemanticBlock | null] {
  // Split a block with children (list, table) between children only.
  if (!b.children || !b.children.length) return [null, b];
  const first: SemanticBlock[] = [];
  let used = 0;
  for (const c of b.children) {
    if (used + c.height > remaining) break;
    first.push(c);
    used += c.height;
  }
  if (first.length === 0) return [null, b];
  if (first.length === b.children.length) return [b, null];
  const rest = b.children.slice(first.length);
  // Don't leave a single orphan child
  if (rest.length === 0) return [b, null];
  const a: SemanticBlock = { ...b, children: first, height: used, payload: b.payload };
  const r: SemanticBlock = { ...b, id: `${b.id}__c`, children: rest, height: rest.reduce((s, c) => s + c.height, 0), payload: b.payload };
  // Tables: mark continuation so renderer repeats header
  return [a, r];
}

function splitParagraph(b: SemanticBlock, remaining: number, leadingPt: number, t: TypographyTokens): [SemanticBlock | null, SemanticBlock | null] {
  if (b.maximumSplit === 0) return [null, b];
  if (!b.lines) return [null, b];
  const linesFit = Math.floor((remaining - 2) / leadingPt);
  if (linesFit < t.orphanMinLines + 1) return [null, b]; // not enough for orphan rule
  const remainLines = b.lines - linesFit;
  if (remainLines < t.widowMinLines) return [null, b];
  const first: SemanticBlock = { ...b, height: linesFit * leadingPt, lines: linesFit, payload: { ...(b.payload as object), partial: "head" } };
  const rest: SemanticBlock = { ...b, id: `${b.id}__c`, height: remainLines * leadingPt + t.paragraphSpacingPt, lines: remainLines, payload: { ...(b.payload as object), partial: "tail" } };
  return [first, rest];
}

export function paginate(blocks: SemanticBlock[], t: TypographyTokens): PaginationResult {
  const cap = contentHeightPt(t);
  const pages: Page[] = [];
  let cur: Page = { pageNumber: 1, placements: [], usedHeight: 0, capacity: cap };
  pages.push(cur);

  const newPage = () => {
    cur = { pageNumber: pages.length + 1, placements: [], usedHeight: 0, capacity: cap };
    pages.push(cur);
  };

  const push = (b: SemanticBlock, extras: Partial<Placement> = {}) => {
    cur.placements.push({ blockId: b.id, kind: b.kind, level: b.level, height: b.height, ...extras });
    cur.usedHeight += b.height;
  };

  let i = 0;
  while (i < blocks.length) {
    const b = blocks[i];

    if (b.pageBreakBefore && cur.placements.length > 0) newPage();

    const remaining = cap - cur.usedHeight;

    // keep-with-next lookahead: if this block fits but the next doesn't,
    // push this block to next page (avoids orphan heading).
    const fitsWhole = b.height <= remaining;
    if (fitsWhole && b.keepWithNext) {
      const next = blocks[i + 1];
      if (next) {
        const nextNeeds = next.keepTogether || next.maximumSplit === 0
          ? next.height
          // Heading needs at least 3 body lines after it
          : t.headingMinFollowingLines * t.bodyLeadingPt;
        if (b.height + Math.min(next.height, nextNeeds) > remaining) {
          newPage();
          push(b);
          if (b.pageBreakAfter) newPage();
          i++; continue;
        }
      }
    }

    if (fitsWhole) {
      push(b);
      if (b.pageBreakAfter) newPage();
      i++; continue;
    }

    // Doesn't fit whole — try to split.
    if (b.keepTogether || b.maximumSplit === 0) {
      if (cur.placements.length === 0) {
        // Block is bigger than a page — accept overflow but mark.
        push(b, { splitIndex: 0, splitOf: 1 });
        i++; continue;
      }
      newPage();
      continue;
    }

    if (b.children && b.children.length) {
      const [head, tail] = splitChildren(b, remaining, t.bodyLeadingPt);
      if (head) {
        push(head, { splitIndex: 0, splitOf: 2 });
        newPage();
        if (tail) {
          // For tables: synthesize header-repeat placement
          if (b.kind === "Table" && b.payload && (b.payload as { headerRowIndex?: number }).headerRowIndex !== undefined) {
            const hdr = b.children[(b.payload as { headerRowIndex: number }).headerRowIndex];
            if (hdr) push(hdr, { isHeaderRepeat: true });
          }
          blocks.splice(i + 1, 0, tail);
        }
        i++; continue;
      }
      newPage();
      continue;
    }

    if (b.kind === "Paragraph") {
      const [head, tail] = splitParagraph(b, remaining, t.bodyLeadingPt, t);
      if (head && tail) {
        push(head, { splitIndex: 0, splitOf: 2 });
        newPage();
        blocks.splice(i + 1, 0, tail);
        i++; continue;
      }
    }

    // Fallback: move to next page
    if (cur.placements.length === 0) {
      push(b); i++; continue;
    }
    newPage();
  }

  return { pages, blocks };
}
