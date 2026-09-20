/**
 * Structured data for figures that are drawn rather than photographed.
 *
 * ScrollLibrary's Visual Intelligence Engine already classifies a figure as a
 * flowchart, a matrix, a comparison or a chart, and the reader ships live
 * components for each. What it has never had is the data those components need.
 * MermaidDiagram.descriptionToMermaid, DataChart.parseDescriptionToData and
 * ComparisonTable.parseDescriptionToRows all do the same thing: split the
 * DESCRIPTION prose on full stops and hope each fragment is a node, a bar or a
 * row. A sentence is not a node, so the result is a diagram-shaped object whose
 * labels are clauses, wired together in the order they happened to be written.
 *
 * The exporters, meanwhile, dropped the figure entirely, because there was
 * nothing to export but the prose.
 *
 * So a figure marker may now carry a DATA field holding this structure, emitted
 * by the same generation call that writes the chapter. One description of the
 * figure, authored once, rendered from the same numbers by the reader, the PDF,
 * the EPUB and the DOCX.
 *
 * Everything here is pure and total: parseFigureData never throws and returns
 * null for anything it cannot vouch for, because a malformed diagram must
 * degrade to prose rather than propagate a broken structure into a book.
 */

export type FigureDataKind = 'flow' | 'table' | 'series';

/** A node in a flow, lifecycle, taxonomy, architecture or concept diagram. */
export interface FlowNode {
  id: string;
  label: string;
  /** Visual emphasis only; never changes meaning. */
  shape?: 'box' | 'round' | 'diamond';
}

export interface FlowEdge {
  from: string;
  to: string;
  label?: string;
}

export interface FlowData {
  kind: 'flow';
  /** 'down' for hierarchies and processes, 'right' for cycles and pipelines. */
  direction: 'down' | 'right';
  nodes: FlowNode[];
  edges: FlowEdge[];
}

/** A comparison, step sequence or matrix. Matrices are tables with a corner header. */
export interface TableData {
  kind: 'table';
  columns: string[];
  rows: string[][];
}

/** A single-measure chart. One series only — a book figure that needs two is two figures. */
export interface SeriesData {
  kind: 'series';
  /** Axis label, e.g. "% of respondents". Optional. */
  unit?: string;
  points: Array<{ label: string; value: number }>;
}

export type FigureData = FlowData | TableData | SeriesData;

// ---------------------------------------------------------------------------
// Bounds
//
// These are page-layout limits, not arbitrary ones. A figure that exceeds them
// cannot be drawn legibly at the width of a book page, and silently rendering
// an illegible one is worse than falling back to the prose description.
// ---------------------------------------------------------------------------

export const FIGURE_LIMITS = {
  maxNodes: 12,
  maxEdges: 24,
  maxColumns: 6,
  maxRows: 14,
  maxPoints: 12,
  maxLabelChars: 80,
  /** Serialized DATA payload ceiling, to bound what a marker can carry. */
  maxSerializedChars: 4000,
} as const;

function cleanLabel(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  // Newlines and tabs would break the single-line DATA field and the SVG text
  // runs alike, so labels are flattened here rather than at each renderer.
  const text = value.replace(/\s+/g, ' ').trim();
  if (!text) return null;
  return text.slice(0, FIGURE_LIMITS.maxLabelChars);
}

function cleanId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const id = value.trim();
  if (!id || id.length > 40) return null;
  return id;
}

function parseFlow(raw: Record<string, unknown>): FlowData | null {
  const rawNodes = Array.isArray(raw.nodes) ? raw.nodes : null;
  if (!rawNodes || rawNodes.length === 0) return null;

  const nodes: FlowNode[] = [];
  const seen = new Set<string>();
  for (const item of rawNodes.slice(0, FIGURE_LIMITS.maxNodes)) {
    if (!item || typeof item !== 'object') continue;
    const node = item as Record<string, unknown>;
    const id = cleanId(node.id);
    const label = cleanLabel(node.label);
    // A node without a label is a box with nothing in it — the reader learns
    // less from it than from the sentence it replaced.
    if (!id || !label || seen.has(id)) continue;
    seen.add(id);
    const shape = node.shape === 'round' || node.shape === 'diamond' ? node.shape : 'box';
    nodes.push({ id, label, shape });
  }
  if (nodes.length === 0) return null;

  const edges: FlowEdge[] = [];
  const rawEdges = Array.isArray(raw.edges) ? raw.edges : [];
  for (const item of rawEdges.slice(0, FIGURE_LIMITS.maxEdges)) {
    if (!item || typeof item !== 'object') continue;
    const edge = item as Record<string, unknown>;
    const from = cleanId(edge.from);
    const to = cleanId(edge.to);
    // An edge to a node that does not exist would be drawn as an arrow into
    // empty space, so it is dropped rather than guessed at.
    if (!from || !to || from === to || !seen.has(from) || !seen.has(to)) continue;
    if (edges.some((e) => e.from === from && e.to === to)) continue;
    const label = cleanLabel(edge.label);
    edges.push(label ? { from, to, label } : { from, to });
  }

  // A single node needs no edge; two or more unconnected boxes are a list
  // pretending to be a diagram, and a list renders better as a list.
  if (nodes.length > 1 && edges.length === 0) return null;

  const direction = raw.direction === 'right' ? 'right' : 'down';
  return { kind: 'flow', direction, nodes, edges };
}

function parseTable(raw: Record<string, unknown>): TableData | null {
  const rawColumns = Array.isArray(raw.columns) ? raw.columns : null;
  const rawRows = Array.isArray(raw.rows) ? raw.rows : null;
  if (!rawColumns || !rawRows) return null;

  const columns = rawColumns
    .slice(0, FIGURE_LIMITS.maxColumns)
    .map((c) => cleanLabel(c) ?? '');
  if (columns.length < 2 || columns.every((c) => !c)) return null;

  const rows: string[][] = [];
  for (const item of rawRows.slice(0, FIGURE_LIMITS.maxRows)) {
    if (!Array.isArray(item)) continue;
    // Ragged rows are normalised to the column count rather than rejected: a
    // missing trailing cell is a blank cell, which is a legitimate table.
    const cells = columns.map((_, index) => cleanLabel(item[index]) ?? '');
    if (cells.every((c) => !c)) continue;
    rows.push(cells);
  }
  if (rows.length === 0) return null;

  return { kind: 'table', columns, rows };
}

function parseSeries(raw: Record<string, unknown>): SeriesData | null {
  const rawPoints = Array.isArray(raw.points) ? raw.points : null;
  if (!rawPoints) return null;

  const points: Array<{ label: string; value: number }> = [];
  for (const item of rawPoints.slice(0, FIGURE_LIMITS.maxPoints)) {
    if (!item || typeof item !== 'object') continue;
    const point = item as Record<string, unknown>;
    const label = cleanLabel(point.label);
    const value = typeof point.value === 'number' ? point.value : Number(point.value);
    // NaN and Infinity would produce a bar of undefined length. A negative
    // value is legitimate data but the bar renderer measures from zero, so it
    // is accepted here and handled there.
    if (!label || !Number.isFinite(value)) continue;
    points.push({ label, value });
  }
  // One bar is not a chart.
  if (points.length < 2) return null;

  const unit = cleanLabel(raw.unit);
  return unit ? { kind: 'series', unit, points } : { kind: 'series', points };
}

/**
 * Validate an already-parsed JSON value into FigureData, or null.
 *
 * Never throws. Unknown fields are ignored, malformed entries are dropped, and
 * a structure that cannot be drawn honestly returns null so the caller falls
 * back to the prose description.
 */
export function validateFigureData(value: unknown): FigureData | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  switch (raw.kind) {
    case 'flow': return parseFlow(raw);
    case 'table': return parseTable(raw);
    case 'series': return parseSeries(raw);
    default: return null;
  }
}

/** Parse the raw DATA field of a figure marker. Never throws. */
export function parseFigureData(raw: string | null | undefined): FigureData | null {
  if (!raw) return null;
  const text = raw.trim();
  if (!text || text.length > FIGURE_LIMITS.maxSerializedChars) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  return validateFigureData(parsed);
}

/**
 * Serialize FigureData for the DATA field of a figure marker.
 *
 * Square brackets inside strings are escaped to their \u form. Figure markers
 * are located by bracket matching — that is what lets a marker carry JSON at
 * all, since JSON's own brackets are balanced — but a bracket inside a *label*
 * need not be, and one stray `[` in "step [a" would end the marker in the wrong
 * place. Escaping them keeps every bracket in the payload balanced by
 * construction. JSON.parse restores the characters, so nothing is lost.
 */
export function serializeFigureData(data: FigureData): string {
  const json = JSON.stringify(data);
  let out = '';
  let inString = false;

  for (let i = 0; i < json.length; i++) {
    const ch = json[i];

    if (inString) {
      if (ch === '\\') {
        // Copy the escape and whatever it escapes, so a backslash before a
        // quote is not mistaken for the end of the string.
        out += ch + (json[i + 1] ?? '');
        i++;
        continue;
      }
      if (ch === '"') { inString = false; out += ch; continue; }
      // Only brackets INSIDE a string are escaped. JSON's own array delimiters
      // must stay literal or the payload stops being JSON at all.
      if (ch === '[') { out += '\\u005B'; continue; }
      if (ch === ']') { out += '\\u005D'; continue; }
      out += ch;
      continue;
    }

    if (ch === '"') inString = true;
    out += ch;
  }

  return out;
}

/**
 * Reduce any figure to a table.
 *
 * This is the universal fallback: every export format ScrollLibrary produces
 * renders a table already, so a figure that cannot be drawn as a diagram in
 * some format is still readable there rather than absent. A flow becomes its
 * steps and transitions; a series becomes labels and values.
 */
export function figureDataToTable(data: FigureData): { header: string[]; rows: string[][] } {
  if (data.kind === 'table') {
    return { header: data.columns, rows: data.rows };
  }

  if (data.kind === 'series') {
    return {
      header: ['', data.unit || 'Value'],
      rows: data.points.map((p) => [p.label, String(p.value)]),
    };
  }

  const labelOf = (id: string) => data.nodes.find((n) => n.id === id)?.label ?? id;
  if (data.edges.length === 0) {
    return { header: ['Step'], rows: data.nodes.map((n) => [n.label]) };
  }
  return {
    header: ['From', 'To', 'Transition'],
    rows: data.edges.map((e) => [labelOf(e.from), labelOf(e.to), e.label ?? '']),
  };
}
