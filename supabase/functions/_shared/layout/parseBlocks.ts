// Markdown → SemanticBlock[]. Pure, deterministic, no DOM.
// Recognises: ATX headings, paragraphs, blank-line separation,
// bullet lists (-/*/+), numbered lists (1.), block quotes (>),
// fenced code (```), tables (| ... |), figures ([FIGURE] / ![alt](url)),
// callouts (> [!NOTE] / > [!TIP]), checklists ([- ] / - [x]).
import { block, SemanticBlock } from "./blocks.ts";
import { contentWidthPt, TypographyTokens } from "./typography.ts";

interface Ctx { width: number; t: TypographyTokens }

function linesFor(text: string, ctx: Ctx, fontSize?: number): number {
  const cw = (fontSize ? (fontSize / ctx.t.bodyFontSizePt) : 1) * ctx.t.bodyAvgCharWidthPt;
  const charsPerLine = Math.max(20, Math.floor(ctx.width / cw));
  if (!text.trim()) return 1;
  // Account for explicit newlines + word wrap
  return text.split("\n").reduce((sum, ln) => {
    return sum + Math.max(1, Math.ceil(ln.length / charsPerLine));
  }, 0);
}

function para(text: string, ctx: Ctx): SemanticBlock {
  const ln = linesFor(text, ctx);
  return block("Paragraph", {
    width: ctx.width,
    height: ln * ctx.t.bodyLeadingPt + ctx.t.paragraphSpacingPt,
    lines: ln,
    payload: { text },
  });
}

function heading(text: string, level: number, ctx: Ctx): SemanticBlock {
  const size = level === 1 ? ctx.t.h1SizePt : level === 2 ? ctx.t.h2SizePt : ctx.t.h3SizePt;
  const ln = linesFor(text, ctx, size);
  const lead = size * 1.25;
  return block(level === 1 ? "Chapter" : "Heading", {
    width: ctx.width,
    height: ln * lead + ctx.t.paragraphSpacingPt * 2,
    lines: ln,
    level,
    payload: { text },
  });
}

function listBlock(kind: "BulletList" | "NumberedList", items: string[], ctx: Ctx): SemanticBlock {
  const children = items.map((it) => {
    const ln = linesFor(it, ctx);
    return block("Paragraph", {
      width: ctx.width,
      height: ln * ctx.t.bodyLeadingPt + 2,
      lines: ln,
      payload: { text: it, listItem: true },
      maximumSplit: 0,
      keepTogether: true,
    });
  });
  const height = children.reduce((s, c) => s + c.height, 0) + ctx.t.paragraphSpacingPt;
  return block(kind, { width: ctx.width, height, children, payload: { items } });
}

function checklistBlock(items: string[], ctx: Ctx): SemanticBlock {
  const ln = items.reduce((s, it) => s + linesFor(it, ctx), 0);
  return block("Checklist", {
    width: ctx.width,
    height: ln * ctx.t.bodyLeadingPt + ctx.t.paragraphSpacingPt,
    lines: ln,
    payload: { items },
  });
}

function quoteBlock(text: string, ctx: Ctx): SemanticBlock {
  const ln = linesFor(text, ctx);
  return block("Quote", {
    width: ctx.width,
    height: ln * ctx.t.bodyLeadingPt + ctx.t.paragraphSpacingPt * 2,
    lines: ln,
    payload: { text },
  });
}

function calloutBlock(kind: string, text: string, ctx: Ctx): SemanticBlock {
  const ln = linesFor(text, ctx);
  return block("Callout", {
    width: ctx.width,
    height: ln * ctx.t.bodyLeadingPt + ctx.t.paragraphSpacingPt * 3,
    lines: ln,
    payload: { kind, text },
  });
}

function codeBlock(text: string, ctx: Ctx): SemanticBlock {
  const ln = Math.max(1, text.split("\n").length);
  return block("CodeBlock", {
    width: ctx.width,
    height: ln * ctx.t.bodyLeadingPt + ctx.t.paragraphSpacingPt * 2,
    lines: ln,
    payload: { text },
  });
}

function figureBlock(payload: { url?: string; alt?: string; caption?: string }, ctx: Ctx): SemanticBlock {
  // Reserve ~2.5 inches for the image + caption — actual renderer can override.
  const imgH = 180;
  const capLines = payload.caption ? linesFor(payload.caption, ctx) : 0;
  const fig = block("Figure", {
    width: ctx.width,
    height: imgH + capLines * ctx.t.bodyLeadingPt + ctx.t.paragraphSpacingPt * 2,
    payload,
  });
  return fig;
}

function tableBlock(rows: string[][], ctx: Ctx): SemanticBlock {
  const rowH = ctx.t.bodyLeadingPt + 4;
  const children: SemanticBlock[] = rows.map((r, i) =>
    block("Section" /* row sentinel */, {
      width: ctx.width,
      height: rowH,
      payload: { row: r, header: i === 0 },
      keepTogether: true, maximumSplit: 0,
    })
  );
  return block("Table", {
    width: ctx.width,
    height: rows.length * rowH + ctx.t.paragraphSpacingPt,
    children,
    payload: { rows, headerRowIndex: 0 },
  });
}

export function parseMarkdownToBlocks(md: string, t: TypographyTokens): SemanticBlock[] {
  const ctx: Ctx = { width: contentWidthPt(t), t };
  const out: SemanticBlock[] = [];
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  let i = 0;

  while (i < lines.length) {
    const ln = lines[i];

    // Blank
    if (!ln.trim()) { i++; continue; }

    // Fenced code
    if (/^```/.test(ln)) {
      const buf: string[] = []; i++;
      while (i < lines.length && !/^```/.test(lines[i])) { buf.push(lines[i]); i++; }
      i++;
      out.push(codeBlock(buf.join("\n"), ctx));
      continue;
    }

    // ATX heading
    const h = /^(#{1,6})\s+(.*)$/.exec(ln);
    if (h) {
      out.push(heading(h[2].trim(), h[1].length, ctx));
      i++; continue;
    }

    // Callout: > [!NOTE] ...
    const callout = /^>\s*\[!(\w+)\]\s*(.*)$/.exec(ln);
    if (callout) {
      const buf = [callout[2]]; i++;
      while (i < lines.length && /^>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^>\s?/, "")); i++; }
      out.push(calloutBlock(callout[1], buf.join("\n").trim(), ctx));
      continue;
    }

    // Quote
    if (/^>\s?/.test(ln)) {
      const buf: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^>\s?/, "")); i++; }
      out.push(quoteBlock(buf.join("\n").trim(), ctx));
      continue;
    }

    // Table
    if (/^\s*\|.+\|\s*$/.test(ln)) {
      const rows: string[][] = [];
      while (i < lines.length && /^\s*\|.+\|\s*$/.test(lines[i])) {
        const row = lines[i].trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
        // Skip alignment separator row (---|---)
        if (!row.every((c) => /^:?-{3,}:?$/.test(c))) rows.push(row);
        i++;
      }
      out.push(tableBlock(rows, ctx));
      continue;
    }

    // Checklist
    if (/^\s*[-*+]\s*\[[ xX]\]\s+/.test(ln)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s*\[[ xX]\]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s*\[[ xX]\]\s+/, ""));
        i++;
      }
      out.push(checklistBlock(items, ctx));
      continue;
    }

    // Bullet list
    if (/^\s*[-*+]\s+/.test(ln)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*+]\s+/, ""));
        i++;
      }
      out.push(listBlock("BulletList", items, ctx));
      continue;
    }

    // Numbered list
    if (/^\s*\d+\.\s+/.test(ln)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i++;
      }
      out.push(listBlock("NumberedList", items, ctx));
      continue;
    }

    // Figure directive: [FIGURE caption="..." url="..."] or markdown image
    const figDir = /^\[FIGURE([^\]]*)\]$/.exec(ln);
    if (figDir) {
      const attrs = figDir[1] ?? "";
      const url = /url="([^"]+)"/.exec(attrs)?.[1];
      const cap = /caption="([^"]+)"/.exec(attrs)?.[1];
      out.push(figureBlock({ url, caption: cap }, ctx));
      i++; continue;
    }
    const mdImg = /^!\[([^\]]*)\]\(([^)]+)\)\s*$/.exec(ln);
    if (mdImg) {
      out.push(figureBlock({ alt: mdImg[1], url: mdImg[2], caption: mdImg[1] }, ctx));
      i++; continue;
    }

    // Paragraph: gather until blank
    const buf: string[] = [ln]; i++;
    while (i < lines.length && lines[i].trim() && !/^(#{1,6})\s/.test(lines[i])
           && !/^\s*[-*+]\s/.test(lines[i]) && !/^\s*\d+\.\s/.test(lines[i])
           && !/^>\s?/.test(lines[i]) && !/^```/.test(lines[i])
           && !/^\s*\|.+\|\s*$/.test(lines[i])) {
      buf.push(lines[i]); i++;
    }
    out.push(para(buf.join(" "), ctx));
  }
  return out;
}
