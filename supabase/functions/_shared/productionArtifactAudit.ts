import { PDFDocument } from "https://esm.sh/pdf-lib@1.17.1";

export type ProductionArtifactStatus = "ready" | "needs_review" | "blocked";
export type ProductionArtifactSeverity = "blocker" | "warning";

export interface ProductionArtifactIssue {
  severity: ProductionArtifactSeverity;
  code: string;
  message: string;
  page?: number;
}

export interface ProductionArtifactMetrics {
  format: "pdf";
  byteSize: number;
  pageCount: number;
  pagesWithoutContentStreams: number;
  minPageWidth: number | null;
  maxPageWidth: number | null;
  minPageHeight: number | null;
  maxPageHeight: number | null;
}

export interface ProductionArtifactReport {
  status: ProductionArtifactStatus;
  score: number;
  issues: ProductionArtifactIssue[];
  metrics: ProductionArtifactMetrics;
}

// File size is only a corruption floor, not a quality proxy. A standards-valid,
// parseable one-page PDF can legitimately be below 1 KiB; structural checks below
// are the authoritative evidence of a usable artifact.
const MIN_PDF_BYTES = 256;
const MIN_PAGE_POINTS = 144; // 2 inches — anything smaller is not a plausible book page.
const MAX_PAGE_POINTS = 2000;

function startsWithPdfHeader(bytes: Uint8Array): boolean {
  if (bytes.length < 5) return false;
  return String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-";
}

function hasPdfEof(bytes: Uint8Array): boolean {
  if (bytes.length === 0) return false;
  const tail = bytes.slice(Math.max(0, bytes.length - 4096));
  return new TextDecoder().decode(tail).includes("%%EOF");
}

/**
 * Inspect the ACTUAL rendered bytes, not the canonical manuscript model.
 *
 * This deliberately starts with the canonical PDF because PDF is the production
 * proof format used across paid publishing/export paths. EPUB/DOCX have their own
 * pre-render structural checks today and should not be presented as post-render
 * certified until equivalent byte-level inspectors are implemented.
 */
export async function auditRenderedPdf(bytes: Uint8Array): Promise<ProductionArtifactReport> {
  const issues: ProductionArtifactIssue[] = [];
  const metrics: ProductionArtifactMetrics = {
    format: "pdf",
    byteSize: bytes.length,
    pageCount: 0,
    pagesWithoutContentStreams: 0,
    minPageWidth: null,
    maxPageWidth: null,
    minPageHeight: null,
    maxPageHeight: null,
  };

  if (bytes.length < MIN_PDF_BYTES) {
    issues.push({
      severity: "blocker",
      code: "pdf_too_small",
      message: `Rendered PDF is only ${bytes.length} bytes and is too small to be structurally plausible.`,
    });
  }

  if (!startsWithPdfHeader(bytes)) {
    issues.push({
      severity: "blocker",
      code: "pdf_header_missing",
      message: "Rendered artifact does not start with a valid PDF header.",
    });
  }

  if (!hasPdfEof(bytes)) {
    issues.push({
      severity: "blocker",
      code: "pdf_eof_missing",
      message: "Rendered PDF is missing its EOF marker and may be truncated.",
    });
  }

  let pdf: PDFDocument | null = null;
  try {
    pdf = await PDFDocument.load(bytes, {
      ignoreEncryption: false,
      updateMetadata: false,
    });
  } catch (error) {
    issues.push({
      severity: "blocker",
      code: "pdf_parse_failed",
      message: `Rendered PDF could not be parsed: ${error instanceof Error ? error.message : String(error)}`,
    });
  }

  if (pdf) {
    const pages = pdf.getPages();
    metrics.pageCount = pages.length;

    if (pages.length === 0) {
      issues.push({
        severity: "blocker",
        code: "pdf_no_pages",
        message: "Rendered PDF contains no pages.",
      });
    }

    const widths: number[] = [];
    const heights: number[] = [];
    let pagesWithoutContentStreams = 0;

    pages.forEach((page, index) => {
      const { width, height } = page.getSize();
      widths.push(width);
      heights.push(height);

      if (!Number.isFinite(width) || !Number.isFinite(height)
        || width < MIN_PAGE_POINTS || height < MIN_PAGE_POINTS
        || width > MAX_PAGE_POINTS || height > MAX_PAGE_POINTS) {
        issues.push({
          severity: "blocker",
          code: "pdf_invalid_page_geometry",
          message: `Page ${index + 1} has implausible dimensions (${width} × ${height} pt).`,
          page: index + 1,
        });
      }

      // pdf-lib exposes the page leaf through page.node. A missing /Contents
      // entry is a useful structural signal for a blank page. One blank page can
      // be intentional in print layout, so this is a warning rather than a hard
      // failure. An artifact where every page lacks content is blocked below.
      const contents = (page.node as unknown as { Contents?: () => unknown }).Contents?.();
      if (contents == null) {
        pagesWithoutContentStreams++;
        issues.push({
          severity: "warning",
          code: "pdf_page_without_content_stream",
          message: `Page ${index + 1} has no PDF content stream and may be blank.`,
          page: index + 1,
        });
      }
    });

    metrics.pagesWithoutContentStreams = pagesWithoutContentStreams;
    metrics.minPageWidth = widths.length ? Math.min(...widths) : null;
    metrics.maxPageWidth = widths.length ? Math.max(...widths) : null;
    metrics.minPageHeight = heights.length ? Math.min(...heights) : null;
    metrics.maxPageHeight = heights.length ? Math.max(...heights) : null;

    if (pages.length > 0 && pagesWithoutContentStreams === pages.length) {
      issues.push({
        severity: "blocker",
        code: "pdf_all_pages_without_content",
        message: "Every rendered PDF page lacks a content stream.",
      });
    }

    if (pages.length > 0 && bytes.length / pages.length < 300) {
      issues.push({
        severity: "warning",
        code: "pdf_suspiciously_sparse",
        message: "Rendered PDF has unusually few bytes per page; inspect for missing text or assets.",
      });
    }
  }

  const blockers = issues.filter((issue) => issue.severity === "blocker").length;
  const warnings = issues.filter((issue) => issue.severity === "warning").length;
  const score = Math.max(0, 100 - blockers * 40 - warnings * 8);
  const status: ProductionArtifactStatus = blockers > 0
    ? "blocked"
    : warnings > 0
      ? "needs_review"
      : "ready";

  return { status, score, issues, metrics };
}
