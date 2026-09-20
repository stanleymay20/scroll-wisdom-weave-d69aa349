/**
 * Geometry for drawn figures.
 *
 * ScrollLibrary renders a book into four places — the reader, a PDF built with
 * pdf-lib, an EPUB and a DOCX — and only one of them can run a browser. Mermaid
 * needs a DOM, Recharts needs React, and pdf-lib cannot embed an SVG, so there
 * is no single library that can draw a diagram in all four.
 *
 * What they do share is primitives: every one of them can place a rectangle, a
 * line and a run of text at a coordinate. So the layout is computed once, here,
 * as pure geometry, and each format does nothing but translate primitives into
 * its own drawing calls. The arithmetic that decides whether a diagram is
 * legible lives in one tested place instead of being reimplemented three times
 * against three APIs, two of which cannot be run in CI.
 *
 * Coordinates are top-left origin, y increasing downward, in points. That
 * matches SVG and the reader; the PDF emitter flips y once on the way out.
 */

import type { FigureData, FlowData, SeriesData } from './figure-data.ts';

export interface LayoutText {
  /** Wrapped lines, already truncated to fit the box. */
  lines: string[];
  /** Point size the lines were measured at. */
  size: number;
}

export interface LayoutBox {
  x: number;
  y: number;
  width: number;
  height: number;
  shape: 'box' | 'round' | 'diamond';
  text: LayoutText;
}

export interface LayoutArrow {
  /** Polyline points; at least two. The last point is the arrow head. */
  points: Array<{ x: number; y: number }>;
  label?: string;
}

export interface LayoutBar {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  value: number;
  /** Where to print the label, to the left of the bar. */
  labelX: number;
  labelY: number;
}

export interface FigureLayout {
  kind: 'flow' | 'series';
  width: number;
  height: number;
  boxes: LayoutBox[];
  arrows: LayoutArrow[];
  bars: LayoutBar[];
  /** Baseline for a series chart, absent for a flow. */
  axisX?: number;
}

// ---------------------------------------------------------------------------
// Metrics
//
// Helvetica's average advance is about 0.5em over mixed-case prose. Exact
// per-glyph widths would need the font, which the layout deliberately does not
// depend on, so boxes are sized with a conservative factor and text that would
// overflow is truncated rather than allowed to spill.
// ---------------------------------------------------------------------------

const AVG_CHAR_WIDTH_RATIO = 0.52;
const NODE_FONT_SIZE = 9;
const NODE_LINE_HEIGHT = 11;
const NODE_PADDING_X = 8;
const NODE_PADDING_Y = 6;
const NODE_MIN_HEIGHT = 26;
const NODE_MAX_LINES = 3;
const LAYER_GAP = 26;
const COLUMN_GAP = 16;

const BAR_HEIGHT = 16;
const BAR_GAP = 8;
const BAR_LABEL_WIDTH_RATIO = 0.32;
const SERIES_FONT_SIZE = 9;

export function measureTextWidth(text: string, size: number): number {
  return text.length * size * AVG_CHAR_WIDTH_RATIO;
}

/**
 * Wrap a label to a width, truncating with an ellipsis past maxLines.
 *
 * Truncation is deliberate. A node whose label overruns its box makes the
 * diagram unreadable in every format at once, whereas an elided label still
 * identifies the step and the full wording remains in the caption and the
 * description beneath the figure.
 */
export function wrapLabel(text: string, maxWidth: number, size: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [''];

  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (measureTextWidth(candidate, size) <= maxWidth || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
      if (lines.length === maxLines) break;
    }
  }
  if (lines.length < maxLines && current) lines.push(current);

  if (lines.length === 0) return [''];

  // A single word longer than the box still has to fit.
  const maxChars = Math.max(4, Math.floor(maxWidth / (size * AVG_CHAR_WIDTH_RATIO)));
  const clipped = lines.map((line) => (line.length > maxChars ? `${line.slice(0, maxChars - 1)}…` : line));

  const consumed = clipped.join(' ');
  if (consumed.replace(/…/g, '').length < text.replace(/\s+/g, ' ').length - 1) {
    const last = clipped[clipped.length - 1];
    if (!last.endsWith('…')) {
      clipped[clipped.length - 1] = last.length >= maxChars
        ? `${last.slice(0, maxChars - 1)}…`
        : `${last}…`;
    }
  }
  return clipped;
}

/**
 * Assign each node to a layer by longest path from a root.
 *
 * Longest path rather than shortest: a node that can be reached both directly
 * and through three intermediate steps belongs below all of them, or its
 * incoming arrow would point backwards up the page.
 *
 * Cycles are expected — a lifecycle diagram is a cycle by definition — so the
 * walk is depth-bounded instead of assuming a DAG. The edge that closes the
 * loop simply runs back up the diagram.
 */
export function assignLayers(data: FlowData): Map<string, number> {
  const layers = new Map<string, number>();
  for (const node of data.nodes) layers.set(node.id, 0);

  const outgoing = new Map<string, string[]>();
  const incoming = new Map<string, string[]>();
  for (const node of data.nodes) {
    outgoing.set(node.id, []);
    incoming.set(node.id, []);
  }
  for (const edge of data.edges) {
    outgoing.get(edge.from)?.push(edge.to);
    incoming.get(edge.to)?.push(edge.from);
  }

  const roots = data.nodes.filter((n) => (incoming.get(n.id) ?? []).length === 0);
  // An all-cycle graph has no root; start from the first declared node so the
  // diagram is still drawn in the order its author wrote it.
  const starts = (roots.length > 0 ? roots : [data.nodes[0]]).map((n) => n.id);

  // Pass 1 — find the edges that close a cycle.
  //
  // A back edge points at a node already on the current path. It must not
  // contribute to any node's depth: in a three-step lifecycle the edge from
  // the last step to the first would otherwise push the FIRST step below the
  // other two, inverting the diagram and leaving its opening arrow running
  // backwards up the page.
  const backEdges = new Set<string>();
  const key = (from: string, to: string) => `${from}\u0000${to}`;
  const onPath = new Set<string>();
  const done = new Set<string>();

  const findBackEdges = (id: string) => {
    onPath.add(id);
    for (const next of outgoing.get(id) ?? []) {
      if (onPath.has(next)) {
        backEdges.add(key(id, next));
      } else if (!done.has(next)) {
        findBackEdges(next);
      }
    }
    onPath.delete(id);
    done.add(id);
  };
  for (const start of starts) if (!done.has(start)) findBackEdges(start);
  // Nodes unreachable from any start still need classifying.
  for (const node of data.nodes) if (!done.has(node.id)) findBackEdges(node.id);

  // Pass 2 — longest path by relaxation over the remaining acyclic edges.
  //
  // Relaxation rather than a path-enumerating search: the node cap allows
  // twelve nodes and twenty-four edges, and enumerating every simple path
  // through a dense graph that size is factorial work for a figure on one
  // page. This is O(nodes × edges) — under three hundred steps at the cap —
  // and settles on the same answer.
  const forward = data.edges.filter((e) => !backEdges.has(key(e.from, e.to)));
  for (let pass = 0; pass < data.nodes.length; pass++) {
    let changed = false;
    for (const edge of forward) {
      const candidate = (layers.get(edge.from) ?? 0) + 1;
      if (candidate > (layers.get(edge.to) ?? 0)) {
        layers.set(edge.to, candidate);
        changed = true;
      }
    }
    if (!changed) break;
  }

  return layers;
}

function layoutFlow(data: FlowData, width: number): FigureLayout {
  const layers = assignLayers(data);

  const byLayer = new Map<number, string[]>();
  for (const node of data.nodes) {
    const layer = layers.get(node.id) ?? 0;
    if (!byLayer.has(layer)) byLayer.set(layer, []);
    byLayer.get(layer)!.push(node.id);
  }
  const layerKeys = [...byLayer.keys()].sort((a, b) => a - b);

  const labelOf = new Map(data.nodes.map((n) => [n.id, n.label]));
  const shapeOf = new Map(data.nodes.map((n) => [n.id, n.shape ?? 'box']));

  const boxes: LayoutBox[] = [];
  const positions = new Map<string, LayoutBox>();
  let y = 0;

  for (const key of layerKeys) {
    const ids = byLayer.get(key)!;
    const columns = ids.length;
    const available = width - COLUMN_GAP * (columns - 1);
    const boxWidth = Math.max(60, Math.floor(available / columns));
    const innerWidth = boxWidth - NODE_PADDING_X * 2;

    let layerHeight = NODE_MIN_HEIGHT;
    const wrapped = ids.map((id) => {
      const lines = wrapLabel(labelOf.get(id) ?? id, innerWidth, NODE_FONT_SIZE, NODE_MAX_LINES);
      layerHeight = Math.max(layerHeight, lines.length * NODE_LINE_HEIGHT + NODE_PADDING_Y * 2);
      return { id, lines };
    });

    // Every box in a layer shares a height so the row reads as one band.
    wrapped.forEach(({ id, lines }, index) => {
      const box: LayoutBox = {
        x: index * (boxWidth + COLUMN_GAP),
        y,
        width: boxWidth,
        height: layerHeight,
        shape: shapeOf.get(id) ?? 'box',
        text: { lines, size: NODE_FONT_SIZE },
      };
      boxes.push(box);
      positions.set(id, box);
    });

    y += layerHeight + LAYER_GAP;
  }

  const height = Math.max(0, y - LAYER_GAP);

  const arrows: LayoutArrow[] = [];
  for (const edge of data.edges) {
    const from = positions.get(edge.from);
    const to = positions.get(edge.to);
    if (!from || !to) continue;

    const fromCx = from.x + from.width / 2;
    const toCx = to.x + to.width / 2;

    if (to.y > from.y) {
      // Forward edge: leave the bottom, enter the top.
      const start = { x: fromCx, y: from.y + from.height };
      const end = { x: toCx, y: to.y };
      arrows.push({
        points: fromCx === toCx
          ? [start, end]
          : [start, { x: fromCx, y: start.y + LAYER_GAP / 2 }, { x: toCx, y: start.y + LAYER_GAP / 2 }, end],
        label: edge.label,
      });
    } else if (to.y < from.y) {
      // Back edge, which closes a cycle. Routed around the right margin so it
      // never crosses the boxes it passes.
      const lane = width + COLUMN_GAP / 2;
      arrows.push({
        points: [
          { x: from.x + from.width, y: from.y + from.height / 2 },
          { x: lane, y: from.y + from.height / 2 },
          { x: lane, y: to.y + to.height / 2 },
          { x: to.x + to.width, y: to.y + to.height / 2 },
        ],
        label: edge.label,
      });
    } else {
      // Same layer: a short horizontal hop.
      const leftFirst = from.x < to.x;
      arrows.push({
        points: [
          { x: leftFirst ? from.x + from.width : from.x, y: from.y + from.height / 2 },
          { x: leftFirst ? to.x : to.x + to.width, y: to.y + to.height / 2 },
        ],
        label: edge.label,
      });
    }
  }

  return { kind: 'flow', width, height, boxes, arrows, bars: [] };
}

function layoutSeries(data: SeriesData, width: number): FigureLayout {
  const labelWidth = Math.max(60, Math.floor(width * BAR_LABEL_WIDTH_RATIO));
  const axisX = labelWidth + 6;
  const trackWidth = Math.max(40, width - axisX);

  // Bars measure from zero, so a set of negative values scales against its own
  // magnitude rather than collapsing to nothing.
  const magnitude = Math.max(...data.points.map((p) => Math.abs(p.value)), 0);
  const scale = magnitude > 0 ? trackWidth / magnitude : 0;

  const bars: LayoutBar[] = data.points.map((point, index) => {
    const y = index * (BAR_HEIGHT + BAR_GAP);
    const barWidth = Math.max(1, Math.abs(point.value) * scale);
    return {
      x: axisX,
      y,
      width: barWidth,
      height: BAR_HEIGHT,
      label: point.label,
      value: point.value,
      labelX: 0,
      labelY: y + BAR_HEIGHT / 2,
    };
  });

  const height = data.points.length * (BAR_HEIGHT + BAR_GAP) - BAR_GAP;
  return { kind: 'series', width, height: Math.max(0, height), boxes: [], arrows: [], bars, axisX };
}

/**
 * Compute geometry for a figure, or null if it is not a drawn kind.
 *
 * Tables return null on purpose: every export format already renders a table
 * natively and far better than a hand-placed grid would, so they take the
 * table path rather than this one.
 */
export function layoutFigure(data: FigureData, width: number): FigureLayout | null {
  const safeWidth = Math.max(120, Math.floor(width));
  if (data.kind === 'flow') return layoutFlow(data, safeWidth);
  if (data.kind === 'series') return layoutSeries(data, safeWidth);
  return null;
}

// ---------------------------------------------------------------------------
// SVG emitter — used by the EPUB (EPUB 3 renders SVG natively) and the reader.
// ---------------------------------------------------------------------------

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export interface SvgOptions {
  /** Accessible name for the figure, announced in place of the graphic. */
  title?: string;
  /** Longer accessible description. */
  description?: string;
  /**
   * Suffix for element ids, unique within the document.
   *
   * Two diagrams in one chapter would otherwise both define a marker called
   * "fig-arrow". Duplicate ids are an XHTML validity error, and EPUBCheck
   * fails the entire book over one.
   */
  idSuffix?: string;
}

/**
 * Render a layout as standalone SVG.
 *
 * Colours are literal rather than CSS variables: the same markup is embedded
 * in an EPUB, where no stylesheet of the reader's is in scope. Text uses a
 * generic sans-serif stack for the same reason.
 */
export function figureLayoutToSvg(layout: FigureLayout, options: SvgOptions = {}): string {
  const stroke = '#475569';
  const fill = '#f1f5f9';
  const border = '#94a3b8';
  const textColor = '#0f172a';
  const barColor = '#1e3a5f';

  // Back edges are routed just outside the content width, so the viewBox is
  // widened to include the return lane rather than clipping it.
  const maxX = Math.max(
    layout.width,
    ...layout.arrows.flatMap((a) => a.points.map((p) => p.x)),
  );
  const pad = 4;
  const viewWidth = Math.ceil(maxX + pad * 2);
  const viewHeight = Math.ceil(layout.height + pad * 2);

  const arrowId = `fig-arrow-${(options.idSuffix ?? '0').replace(/[^A-Za-z0-9_-]/g, '')}`;

  const parts: string[] = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${viewWidth} ${viewHeight}" ` +
    `width="100%" role="img"${options.title ? ` aria-label="${escapeXml(options.title)}"` : ''}>`,
  );
  if (options.title) parts.push(`<title>${escapeXml(options.title)}</title>`);
  if (options.description) parts.push(`<desc>${escapeXml(options.description)}</desc>`);
  parts.push(
    `<defs><marker id="${arrowId}" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" ` +
    `orient="auto-start-reverse"><path d="M 0 0 L 8 4 L 0 8 z" fill="${stroke}"/></marker></defs>`,
  );
  parts.push(`<g transform="translate(${pad},${pad})">`);

  for (const arrow of layout.arrows) {
    const points = arrow.points.map((p) => `${round(p.x)},${round(p.y)}`).join(' ');
    parts.push(
      `<polyline points="${points}" fill="none" stroke="${stroke}" stroke-width="1.2" marker-end="url(#${arrowId})"/>`,
    );
    if (arrow.label) {
      const mid = arrow.points[Math.floor(arrow.points.length / 2)];
      parts.push(
        `<text x="${round(mid.x + 4)}" y="${round(mid.y - 3)}" font-family="Helvetica, Arial, sans-serif" ` +
        `font-size="8" fill="${stroke}">${escapeXml(arrow.label)}</text>`,
      );
    }
  }

  for (const box of layout.boxes) {
    const radius = box.shape === 'round' ? Math.min(12, box.height / 2) : 3;
    parts.push(
      `<rect x="${round(box.x)}" y="${round(box.y)}" width="${round(box.width)}" height="${round(box.height)}" ` +
      `rx="${round(radius)}" fill="${fill}" stroke="${border}" stroke-width="1"/>`,
    );
    const lineHeight = NODE_LINE_HEIGHT;
    const blockHeight = box.text.lines.length * lineHeight;
    // Centre the run of lines in the box, then step down a baseline at a time.
    let baseline = box.y + (box.height - blockHeight) / 2 + box.text.size;
    for (const line of box.text.lines) {
      parts.push(
        `<text x="${round(box.x + box.width / 2)}" y="${round(baseline)}" text-anchor="middle" ` +
        `font-family="Helvetica, Arial, sans-serif" font-size="${box.text.size}" fill="${textColor}">` +
        `${escapeXml(line)}</text>`,
      );
      baseline += lineHeight;
    }
  }

  if (layout.bars.length > 0 && layout.axisX !== undefined) {
    parts.push(
      `<line x1="${round(layout.axisX)}" y1="0" x2="${round(layout.axisX)}" y2="${round(layout.height)}" ` +
      `stroke="${border}" stroke-width="1"/>`,
    );
    for (const bar of layout.bars) {
      parts.push(
        `<rect x="${round(bar.x)}" y="${round(bar.y)}" width="${round(bar.width)}" height="${round(bar.height)}" ` +
        `fill="${barColor}"/>`,
      );
      parts.push(
        `<text x="${round(layout.axisX - 6)}" y="${round(bar.labelY + 3)}" text-anchor="end" ` +
        `font-family="Helvetica, Arial, sans-serif" font-size="${SERIES_FONT_SIZE}" fill="${textColor}">` +
        `${escapeXml(bar.label)}</text>`,
      );
      parts.push(
        `<text x="${round(bar.x + bar.width + 4)}" y="${round(bar.labelY + 3)}" ` +
        `font-family="Helvetica, Arial, sans-serif" font-size="${SERIES_FONT_SIZE}" fill="${stroke}">` +
        `${escapeXml(String(bar.value))}</text>`,
      );
    }
  }

  parts.push('</g></svg>');
  return parts.join('');
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
