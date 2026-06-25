// Page validation engine — runs every typography & pagination rule
// against a paginated document and returns a structured report.

import { SemanticBlock } from "./blocks.ts";
import { Page, PaginationResult } from "./pagination.ts";
import { TypographyTokens } from "./typography.ts";

export type Severity = "blocker" | "warning" | "info";
export type RuleCategory =
  | "Heading" | "Paragraph" | "Figure" | "Table"
  | "List" | "Citation" | "Layout" | "Typography";

export interface ValidationIssue {
  severity: Severity;
  category: RuleCategory;
  ruleViolated: string;
  pageNumber: number;
  blockId: string;
  message: string;
}

export interface ValidationReport {
  validationScore: number;     // 0–100
  totalPages: number;
  totalBlocks: number;
  issues: ValidationIssue[];
  blockerCount: number;
  warningCount: number;
  publicationReady: boolean;
  byCategory: Record<RuleCategory, number>;
}

const BLOCKER_PENALTY = 10;
const WARNING_PENALTY = 2;

export function validatePages(result: PaginationResult, t: TypographyTokens): ValidationReport {
  const { pages, blocks } = result;
  const issues: ValidationIssue[] = [];
  const blockMap = new Map<string, SemanticBlock>(blocks.map((b) => [b.id, b]));

  for (const page of pages) {
    runHeadingRules(page, pages, issues, t);
    runWidowOrphanRules(page, pages, issues, t);
    runFigureRules(page, pages, issues, blockMap);
    runTableRules(page, pages, issues);
    runListRules(page, pages, issues);
    runAtomicRules(page, issues);
    runChapterOpeningRules(page, pages, issues, t);
  }
  runNumberingRules(pages, issues);

  const blockerCount = issues.filter((i) => i.severity === "blocker").length;
  const warningCount = issues.filter((i) => i.severity === "warning").length;
  const penalty = blockerCount * BLOCKER_PENALTY + warningCount * WARNING_PENALTY;
  const validationScore = Math.max(0, 100 - penalty);
  const byCategory: Record<RuleCategory, number> = {
    Heading: 0, Paragraph: 0, Figure: 0, Table: 0, List: 0, Citation: 0, Layout: 0, Typography: 0,
  };
  for (const it of issues) byCategory[it.category]++;

  return {
    validationScore,
    totalPages: pages.length,
    totalBlocks: blocks.length,
    issues,
    blockerCount,
    warningCount,
    publicationReady: blockerCount === 0,
    byCategory,
  };
}

function runHeadingRules(page: Page, pages: Page[], issues: ValidationIssue[], t: TypographyTokens) {
  const last = page.placements[page.placements.length - 1];
  if (!last) return;
  if (last.kind === "Heading" || last.kind === "Chapter") {
    issues.push({
      severity: "blocker", category: "Heading", ruleViolated: "HeadingNotLast",
      pageNumber: page.pageNumber, blockId: last.blockId,
      message: "Heading appears as the last element on the page.",
    });
  }
  // Heading must be followed by ≥ headingMinFollowingLines of body content
  for (let i = 0; i < page.placements.length; i++) {
    const p = page.placements[i];
    if (p.kind !== "Heading" && p.kind !== "Chapter") continue;
    const follow = page.placements.slice(i + 1);
    let followLines = 0;
    for (const f of follow) {
      if (f.kind === "Paragraph") followLines += Math.max(1, Math.floor(f.height / t.bodyLeadingPt));
      if (followLines >= t.headingMinFollowingLines) break;
    }
    if (followLines < t.headingMinFollowingLines) {
      issues.push({
        severity: "blocker", category: "Heading", ruleViolated: "HeadingKeepWithNext",
        pageNumber: page.pageNumber, blockId: p.blockId,
        message: `Heading has fewer than ${t.headingMinFollowingLines} following body lines on the page.`,
      });
    }
  }
}

function runWidowOrphanRules(page: Page, pages: Page[], issues: ValidationIssue[], t: TypographyTokens) {
  for (const p of page.placements) {
    if (p.kind !== "Paragraph") continue;
    if (p.splitOf && p.splitOf > 1) {
      const lines = Math.max(1, Math.floor(p.height / t.bodyLeadingPt));
      if (p.splitIndex === 0 && lines < t.orphanMinLines) {
        issues.push({
          severity: "blocker", category: "Paragraph", ruleViolated: "ParagraphOrphan",
          pageNumber: page.pageNumber, blockId: p.blockId,
          message: `Paragraph leaves only ${lines} line(s) on the page (orphan).`,
        });
      }
      if ((p.splitIndex ?? 0) > 0 && lines < t.widowMinLines) {
        issues.push({
          severity: "blocker", category: "Paragraph", ruleViolated: "ParagraphWidow",
          pageNumber: page.pageNumber, blockId: p.blockId,
          message: `Paragraph carries only ${lines} line(s) to the next page (widow).`,
        });
      }
    }
  }
}

function runFigureRules(page: Page, pages: Page[], issues: ValidationIssue[], blockMap: Map<string, SemanticBlock>) {
  for (const p of page.placements) {
    if (p.kind === "Figure" && p.splitOf && p.splitOf > 1) {
      issues.push({
        severity: "blocker", category: "Figure", ruleViolated: "FigureAtomic",
        pageNumber: page.pageNumber, blockId: p.blockId,
        message: "Figure was split across pages.",
      });
    }
    if (p.kind === "FigureCaption" && p.splitOf && p.splitOf > 1) {
      issues.push({
        severity: "blocker", category: "Figure", ruleViolated: "FigureCaptionAttached",
        pageNumber: page.pageNumber, blockId: p.blockId,
        message: "Figure caption was split.",
      });
    }
  }
}

function runTableRules(page: Page, pages: Page[], issues: ValidationIssue[]) {
  const placedTables = page.placements.filter((p) => p.kind === "Table");
  for (const p of placedTables) {
    if (p.splitOf && p.splitOf > 1 && (p.splitIndex ?? 0) > 0) {
      const hasHeader = page.placements.some((x) => x.isHeaderRepeat);
      if (!hasHeader) {
        issues.push({
          severity: "warning", category: "Table", ruleViolated: "TableRepeatHeader",
          pageNumber: page.pageNumber, blockId: p.blockId,
          message: "Continued table is missing repeated header row.",
        });
      }
    }
  }
}

function runListRules(page: Page, pages: Page[], issues: ValidationIssue[]) {
  for (const p of page.placements) {
    if ((p.kind === "BulletList" || p.kind === "NumberedList") && p.splitOf && p.splitOf > 1) {
      // Splitting between items is OK; flagged only if a single item was split — currently impossible
      // because items are keepTogether. Leave as info trace.
      issues.push({
        severity: "info", category: "List", ruleViolated: "ListSplitBetweenItems",
        pageNumber: page.pageNumber, blockId: p.blockId,
        message: "List continues onto another page (split between items).",
      });
    }
  }
}

function runAtomicRules(page: Page, issues: ValidationIssue[]) {
  for (const p of page.placements) {
    const atomic = ["Quote", "Callout", "Sidebar", "Checklist", "Glossary", "Reference"];
    if (atomic.includes(p.kind) && p.splitOf && p.splitOf > 1) {
      issues.push({
        severity: "blocker", category: "Layout", ruleViolated: `${p.kind}Atomic`,
        pageNumber: page.pageNumber, blockId: p.blockId,
        message: `${p.kind} was split across pages — must remain atomic.`,
      });
    }
  }
}

function runChapterOpeningRules(page: Page, pages: Page[], issues: ValidationIssue[], t: TypographyTokens) {
  const first = page.placements[0];
  if (!first) return;
  if (first.kind === "Chapter") {
    // OK — chapter opening detected. No-op (the renderer applies top margin).
    return;
  }
  // A Chapter block somewhere mid-page = inconsistent opening
  const midChapter = page.placements.slice(1).find((p) => p.kind === "Chapter");
  if (midChapter) {
    issues.push({
      severity: "blocker", category: "Typography", ruleViolated: "ChapterStartsNewPage",
      pageNumber: page.pageNumber, blockId: midChapter.blockId,
      message: "Chapter heading must begin a fresh page.",
    });
  }
}

function runNumberingRules(pages: Page[], issues: ValidationIssue[]) {
  for (let i = 0; i < pages.length; i++) {
    if (pages[i].pageNumber !== i + 1) {
      issues.push({
        severity: "blocker", category: "Layout", ruleViolated: "PageNumberingMonotonic",
        pageNumber: pages[i].pageNumber, blockId: "",
        message: `Page numbering broken at index ${i}.`,
      });
    }
  }
}
