// Publication Guard — runs the validator over a draft and blocks
// certification when any P0 typography/pagination rule fails.

import { parseMarkdownToBlocks } from "./parseBlocks.ts";
import { paginate } from "./pagination.ts";
import { validatePages, ValidationReport } from "./pageValidator.ts";
import { DEFAULT_TYPOGRAPHY, TypographyTokens } from "./typography.ts";

export interface GuardChapter {
  id: string;
  chapter_number: number;
  title: string;
  content: string; // markdown
}

export interface GuardResult {
  publicationReady: boolean;
  report: ValidationReport;
  perChapter: Array<{ chapter_id: string; chapter_number: number; report: ValidationReport }>;
}

export function runPublicationGuard(
  chapters: GuardChapter[],
  tokens: Partial<TypographyTokens> = {},
): GuardResult {
  const t: TypographyTokens = { ...DEFAULT_TYPOGRAPHY, ...tokens };

  const perChapter = chapters.map((ch) => {
    const md = `# ${ch.title}\n\n${ch.content ?? ""}`;
    const blocks = parseMarkdownToBlocks(md, t);
    const paginated = paginate(blocks, t);
    return { chapter_id: ch.id, chapter_number: ch.chapter_number, report: validatePages(paginated, t) };
  });

  // Aggregate
  const allIssues = perChapter.flatMap((c) => c.report.issues.map((i) => ({ ...i, pageNumber: i.pageNumber })));
  const blockerCount = allIssues.filter((i) => i.severity === "blocker").length;
  const warningCount = allIssues.filter((i) => i.severity === "warning").length;
  const totalPages = perChapter.reduce((s, c) => s + c.report.totalPages, 0);
  const totalBlocks = perChapter.reduce((s, c) => s + c.report.totalBlocks, 0);
  const validationScore = Math.max(0, 100 - blockerCount * 10 - warningCount * 2);
  const byCategory = perChapter.reduce((acc, c) => {
    for (const k of Object.keys(c.report.byCategory) as Array<keyof typeof c.report.byCategory>) {
      acc[k] = (acc[k] ?? 0) + c.report.byCategory[k];
    }
    return acc;
  }, {} as ValidationReport["byCategory"]);

  const report: ValidationReport = {
    validationScore, totalPages, totalBlocks, issues: allIssues,
    blockerCount, warningCount, publicationReady: blockerCount === 0,
    byCategory,
  };

  return { publicationReady: report.publicationReady, report, perChapter };
}
