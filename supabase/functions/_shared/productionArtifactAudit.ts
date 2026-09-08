import { PDFDocument } from "https://esm.sh/pdf-lib@1.17.1";
import {
  checkKdpPageCount,
  kdpExpectedPageSizePt,
  KDP_PRINT_PROFILES,
  KDP_STRUCTURAL_RULESET_VERSION,
  type KdpPrintProfileId,
  type KdpTrimSize,
} from "./kdp-print-rules.ts";

export type ProductionArtifactStatus = "ready" | "needs_review" | "blocked";
export type ProductionArtifactSeverity = "blocker" | "warning";
export const GENERIC_PDF_INTEGRITY_RULESET_VERSION = "generic-pdf-integrity-v1" as const;

/**
 * Preflight profiles.
 *
 * `generic`       — byte-level integrity only. Never implies print compliance.
 * `kdp_paperback` — structural KDP paperback preflight: uniform geometry,
 *                   exact trim/bleed page size and page-count limits for the
 *                   selected print option. This deliberately is not a full
 *                   KDP compliance certification.
 */
export type ProductionArtifactProfile =
  | { kind: "generic" }
  | { kind: "kdp_paperback"; trimSize: KdpTrimSize; bleed: boolean; printProfile: KdpPrintProfileId };

export interface ProductionArtifactAuditOptions {
  profile?: ProductionArtifactProfile;
  /** Tolerance (points) for PDF floating-point page dimensions. */
  geometryTolerancePt?: number;
}

export type ProductionPreflightLevel = "structural";

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
  uniformPageGeometry: boolean | null;
  expectedPageWidth: number | null;
  expectedPageHeight: number | null;
}

export interface ProductionArtifactReport {
  status: ProductionArtifactStatus;
  score: number;
  issues: ProductionArtifactIssue[];
  metrics: ProductionArtifactMetrics;
  profile: ProductionArtifactProfile;
  preflightLevel: ProductionPreflightLevel;
  ruleSetVersion: string;
  /**
   * Checks a full commercial print preflight would perform that this
   * structural auditor does NOT implement. A `ready` status never asserts
   * these. Empty for the generic profile because it makes no print claim.
   */
  unverifiedCapabilities: string[];
  /** Human-readable claim boundary, safe to surface in UI/attestations. */
  claim: string;
}

/**
 * Capabilities explicitly outside the current byte-level KDP structural
 * preflight. Keep this list visible in persisted evidence and user-facing
 * status so `ready` cannot be mistaken for full KDP compliance.
 */
export const KDP_UNVERIFIED_CAPABILITIES = [
  "font_embedding",
  "image_effective_dpi",
  "color_space",
  "text_safe_area",
  "true_minimum_type_size",
  "pdf_x",
  "annotations",
  "crop_and_printer_marks",
  "transparency",
  "optional_content_layers",
] as const;

// File size is only a corruption floor, not a quality proxy. A standards-valid,
// parseable one-page PDF can legitimately be below 1 KiB; structural checks below
// are the authoritative evidence of a usable artifact.
const MIN_PDF_BYTES = 256;
const MIN_PAGE_POINTS = 144; // 2 inches — anything smaller is not a plausible book page.
const MAX_PAGE_POINTS = 2000;
const DEFAULT_GEOMETRY_TOLERANCE_PT = 0.05; // ~0.0007" — PDF float noise only.

function startsWithPdfHeader(bytes: Uint8Array): boolean {
  if (bytes.length < 5) return false;
  return String.fromCharCode(...bytes.slice(0, 5)) === "%PDF-";
}

function hasPdfEof(bytes: Uint8Array): boolean {
  if (bytes.length === 0) return false;
  const tail = bytes.slice(Math.max(0, bytes.length - 4096));
  return new TextDecoder().decode(tail).includes("%%EOF");
}

function pt(n: number): string {
  return (Math.round(n * 1000) / 1000).toString();
}

/**
 * Inspect the ACTUAL rendered bytes, not the canonical manuscript model.
 *
 * Without options this is a generic PDF integrity check and must never be
 * presented as KDP compliance. Pass `{ profile: { kind: "kdp_paperback", ... } }`
 * to run the structural KDP paperback preflight on the exact artifact.
 */
export async function auditRenderedPdf(
  bytes: Uint8Array,
  options: ProductionArtifactAuditOptions = {},
): Promise<ProductionArtifactReport> {
  const profile: ProductionArtifactProfile = options.profile ?? { kind: "generic" };
  const tolerance = options.geometryTolerancePt ?? DEFAULT_GEOMETRY_TOLERANCE_PT;
  const isPrintProfile = profile.kind !== "generic";

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
    uniformPageGeometry: null,
    expectedPageWidth: null,
    expectedPageHeight: null,
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
      issues.push({ severity: "blocker", code: "pdf_no_pages", message: "Rendered PDF contains no pages." });
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

    if (pages.length > 0) {
      const uniform =
        (metrics.maxPageWidth! - metrics.minPageWidth!) <= tolerance
        && (metrics.maxPageHeight! - metrics.minPageHeight!) <= tolerance;
      metrics.uniformPageGeometry = uniform;
      if (!uniform) {
        issues.push({
          severity: isPrintProfile ? "blocker" : "warning",
          code: "pdf_mixed_page_geometry",
          message: `Pages are not uniform: width ${pt(metrics.minPageWidth!)}–${pt(metrics.maxPageWidth!)} pt, height ${pt(metrics.minPageHeight!)}–${pt(metrics.maxPageHeight!)} pt (tolerance ${tolerance} pt).`,
        });
      }
    }

    if (pages.length > 0 && pagesWithoutContentStreams === pages.length) {
      issues.push({ severity: "blocker", code: "pdf_all_pages_without_content", message: "Every rendered PDF page lacks a content stream." });
    }

    if (pages.length > 0 && bytes.length / pages.length < 300) {
      issues.push({ severity: "warning", code: "pdf_suspiciously_sparse", message: "Rendered PDF has unusually few bytes per page; inspect for missing text or assets." });
    }

    if (profile.kind === "kdp_paperback") {
      const expected = kdpExpectedPageSizePt(profile.trimSize, profile.bleed);
      metrics.expectedPageWidth = expected.widthPt;
      metrics.expectedPageHeight = expected.heightPt;

      pages.forEach((page, index) => {
        const { width, height } = page.getSize();
        if (Math.abs(width - expected.widthPt) > tolerance || Math.abs(height - expected.heightPt) > tolerance) {
          issues.push({
            severity: "blocker",
            code: "kdp_page_size_mismatch",
            message: `Page ${index + 1} is ${pt(width)} × ${pt(height)} pt; KDP ${profile.trimSize} ${profile.bleed ? "with bleed" : "no bleed"} requires exactly ${pt(expected.widthPt)} × ${pt(expected.heightPt)} pt.`,
            page: index + 1,
          });
        }
      });

      const print = KDP_PRINT_PROFILES[profile.printProfile];
      if (!print) {
        issues.push({
          severity: "blocker",
          code: "kdp_print_profile_invalid",
          message: `Unknown KDP print profile "${String(profile.printProfile)}".`,
        });
      } else if (pages.length > 0) {
        const count = checkKdpPageCount(pages.length, profile.trimSize, print.paperType);
        if (!count.ok) {
          issues.push({
            severity: "blocker",
            code: count.reason === "below_minimum" ? "kdp_page_count_below_minimum" : "kdp_page_count_above_maximum",
            message: `Interior has ${pages.length} pages; KDP ${profile.trimSize} with ${print.label} allows ${count.min}–${count.max} pages.`,
          });
        }
      }
    }
  }

  // Collapse per-page repeats of the same KDP mismatch code into the score so
  // a 300-page wrong-size book is not scored differently from a 30-page one.
  const distinctBlockers = new Set(issues.filter((issue) => issue.severity === "blocker").map((i) => i.code)).size;
  const warnings = issues.filter((issue) => issue.severity === "warning").length;
  const score = Math.max(0, 100 - distinctBlockers * 40 - warnings * 8);
  const status: ProductionArtifactStatus = distinctBlockers > 0
    ? "blocked"
    : warnings > 0
      ? "needs_review"
      : "ready";

  const unverifiedCapabilities = profile.kind === "kdp_paperback" ? [...KDP_UNVERIFIED_CAPABILITIES] : [];
  const claim = profile.kind === "kdp_paperback"
    ? "KDP paperback structural preflight passed only for the checks listed in this report (PDF integrity, uniform geometry, selected trim/bleed page size and selected print-profile page-count range). This is not KDP compliance certification; font embedding, effective image DPI, color space, text safe area, true minimum type size, PDF/X, annotations, crop/printer marks, transparency and optional-content layers are unverified."
    : "Generic PDF integrity check. Makes no print-compliance claim.";
  const ruleSetVersion = profile.kind === "kdp_paperback"
    ? KDP_STRUCTURAL_RULESET_VERSION
    : GENERIC_PDF_INTEGRITY_RULESET_VERSION;

  return {
    status,
    score,
    issues,
    metrics,
    profile,
    preflightLevel: "structural",
    ruleSetVersion,
    unverifiedCapabilities,
    claim,
  };
}
