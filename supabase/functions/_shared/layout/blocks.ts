// Semantic block model — every renderable unit becomes one of these.
// Heights are pre-computed (pt) so the paginator never re-measures.

export type BlockKind =
  | "Chapter" | "Section" | "Heading"
  | "Paragraph" | "BulletList" | "NumberedList"
  | "Figure" | "FigureCaption"
  | "Table" | "TableCaption"
  | "Quote" | "Callout" | "CodeBlock" | "Sidebar"
  | "Checklist" | "Glossary" | "Reference" | "Appendix";

export interface SemanticBlock {
  id: string;
  kind: BlockKind;
  // Layout metadata
  height: number;          // total height pt
  width: number;           // content width pt
  lines?: number;          // for text blocks (paragraphs, list items)
  level?: number;          // heading level 1-6
  keepTogether: boolean;
  keepWithNext: boolean;
  pageBreakBefore: boolean;
  pageBreakAfter: boolean;
  minimumLines: number;    // for atomic-ish text
  maximumSplit: number;    // 0 = atomic, Infinity = freely splittable
  priority: number;        // higher = harder to break
  // Children (rows, list items) — used for granular splitting
  children?: SemanticBlock[];
  // Source payload (text / cells / etc.) — opaque to the layout engine
  payload?: unknown;
}

export interface BlockDefaults {
  keepTogether?: boolean;
  keepWithNext?: boolean;
  pageBreakBefore?: boolean;
  pageBreakAfter?: boolean;
  minimumLines?: number;
  maximumSplit?: number;
  priority?: number;
}

const DEFAULTS: Record<BlockKind, BlockDefaults> = {
  Chapter:        { pageBreakBefore: true, keepWithNext: true, priority: 100 },
  Section:        { keepWithNext: true, priority: 60 },
  Heading:        { keepWithNext: true, minimumLines: 1, maximumSplit: 0, priority: 70 },
  Paragraph:      { minimumLines: 2, maximumSplit: Infinity, priority: 10 },
  BulletList:     { maximumSplit: Infinity, priority: 30 },
  NumberedList:   { maximumSplit: Infinity, priority: 30 },
  Figure:         { keepTogether: true, maximumSplit: 0, priority: 80 },
  FigureCaption:  { keepTogether: true, maximumSplit: 0, priority: 80 },
  Table:          { maximumSplit: Infinity, priority: 50 },
  TableCaption:   { keepWithNext: true, keepTogether: true, priority: 60 },
  Quote:          { keepTogether: true, maximumSplit: 0, priority: 50 },
  Callout:        { keepTogether: true, maximumSplit: 0, priority: 70 },
  CodeBlock:      { maximumSplit: Infinity, priority: 40 },
  Sidebar:        { keepTogether: true, maximumSplit: 0, priority: 60 },
  Checklist:      { keepTogether: true, maximumSplit: 0, priority: 60 },
  Glossary:       { keepTogether: true, maximumSplit: 0, priority: 50 },
  Reference:      { keepTogether: true, maximumSplit: 0, priority: 40 },
  Appendix:       { pageBreakBefore: true, priority: 70 },
};

let _id = 0;
const nextId = (k: BlockKind) => `${k.toLowerCase()}_${++_id}`;

export function block(
  kind: BlockKind,
  fields: Partial<SemanticBlock> & { height: number; width: number },
): SemanticBlock {
  const d = DEFAULTS[kind];
  return {
    id: fields.id ?? nextId(kind),
    kind,
    height: fields.height,
    width: fields.width,
    lines: fields.lines,
    level: fields.level,
    keepTogether: fields.keepTogether ?? d.keepTogether ?? false,
    keepWithNext: fields.keepWithNext ?? d.keepWithNext ?? false,
    pageBreakBefore: fields.pageBreakBefore ?? d.pageBreakBefore ?? false,
    pageBreakAfter: fields.pageBreakAfter ?? d.pageBreakAfter ?? false,
    minimumLines: fields.minimumLines ?? d.minimumLines ?? 1,
    maximumSplit: fields.maximumSplit ?? d.maximumSplit ?? Infinity,
    priority: fields.priority ?? d.priority ?? 0,
    children: fields.children,
    payload: fields.payload,
  };
}
