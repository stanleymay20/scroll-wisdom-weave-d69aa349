import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { PDFDocument, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";
import {
  auditRenderedPdf,
  GENERIC_PDF_INTEGRITY_RULESET_VERSION,
  KDP_UNVERIFIED_CAPABILITIES,
} from "./productionArtifactAudit.ts";
import { KDP_STRUCTURAL_RULESET_VERSION, type KdpPrintProfileId } from "./kdp-print-rules.ts";

async function renderedPdfWithText(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([432, 648]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText("ScrollLibrary production certification fixture", {
    x: 54,
    y: 594,
    size: 12,
    font,
  });
  return await pdf.save();
}

async function uniformPdf(pages: number, width: number, height: number): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < pages; i++) {
    const page = pdf.addPage([width, height]);
    page.drawText(`p${i + 1}`, { x: 36, y: Math.max(36, height - 54), size: 9, font });
  }
  return await pdf.save();
}

Deno.test("auditRenderedPdf passes a structurally valid generic rendered PDF without making a print claim", async () => {
  const bytes = await renderedPdfWithText();
  const report = await auditRenderedPdf(bytes);

  assertEquals(report.status, "ready");
  assertEquals(report.metrics.pageCount, 1);
  assertEquals(report.metrics.pagesWithoutContentStreams, 0);
  assert(report.metrics.byteSize >= 256);
  assertEquals(report.issues.length, 0);
  assertEquals(report.profile.kind, "generic");
  assertEquals(report.ruleSetVersion, GENERIC_PDF_INTEGRITY_RULESET_VERSION);
  assertEquals(report.unverifiedCapabilities, []);
  assert(report.claim.includes("Makes no print-compliance claim"));
});

Deno.test("auditRenderedPdf blocks non-PDF and truncated payloads", async () => {
  const bytes = new TextEncoder().encode("not a pdf");
  const report = await auditRenderedPdf(bytes);

  assertEquals(report.status, "blocked");
  const codes = new Set(report.issues.map((issue) => issue.code));
  assert(codes.has("pdf_too_small"));
  assert(codes.has("pdf_header_missing"));
  assert(codes.has("pdf_eof_missing"));
  assert(codes.has("pdf_parse_failed"));
});

Deno.test("auditRenderedPdf blocks implausible page geometry", async () => {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([50, 50]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  page.drawText("x", { x: 5, y: 25, size: 8, font });
  const bytes = await pdf.save();

  const report = await auditRenderedPdf(bytes);
  assertEquals(report.status, "blocked");
  assert(report.issues.some((issue) => issue.code === "pdf_invalid_page_geometry"));
});

Deno.test("mixed page sizes block under KDP profile but only warn generically", async () => {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  for (let i = 0; i < 24; i++) {
    const page = pdf.addPage(i === 5 ? [433, 648] : [432, 648]);
    page.drawText("x", { x: 40, y: 600, size: 10, font });
  }
  const bytes = await pdf.save();

  const kdp = await auditRenderedPdf(bytes, {
    profile: { kind: "kdp_paperback", trimSize: "6x9", bleed: false, printProfile: "black_white" },
  });
  assertEquals(kdp.status, "blocked");
  assert(kdp.issues.some((i) => i.code === "pdf_mixed_page_geometry" && i.severity === "blocker"));

  const generic = await auditRenderedPdf(bytes);
  assert(generic.issues.some((i) => i.code === "pdf_mixed_page_geometry" && i.severity === "warning"));
});

Deno.test("KDP 6x9 no-bleed exact geometry passes structural profile with explicit claim boundary", async () => {
  const report = await auditRenderedPdf(await uniformPdf(24, 432, 648), {
    profile: { kind: "kdp_paperback", trimSize: "6x9", bleed: false, printProfile: "black_white" },
  });

  assertEquals(report.status, "ready");
  assertEquals(report.metrics.pageCount, 24);
  assertEquals(report.metrics.expectedPageWidth, 432);
  assertEquals(report.metrics.expectedPageHeight, 648);
  assertEquals(report.ruleSetVersion, KDP_STRUCTURAL_RULESET_VERSION);
  for (const capability of KDP_UNVERIFIED_CAPABILITIES) {
    assert(report.unverifiedCapabilities.includes(capability));
  }
  assert(report.claim.includes("not KDP compliance certification"));
});

Deno.test("KDP 6x9 bleed geometry requires exactly 6.125x9.25 inches", async () => {
  const report = await auditRenderedPdf(await uniformPdf(24, 6.125 * 72, 9.25 * 72), {
    profile: { kind: "kdp_paperback", trimSize: "6x9", bleed: true, printProfile: "black_cream" },
  });
  assertEquals(report.status, "ready");
  assertEquals(report.metrics.expectedPageWidth, 441);
  assertEquals(report.metrics.expectedPageHeight, 666);
});

Deno.test("KDP wrong trim geometry blocks", async () => {
  const report = await auditRenderedPdf(await uniformPdf(24, 612, 792), {
    profile: { kind: "kdp_paperback", trimSize: "6x9", bleed: false, printProfile: "black_white" },
  });
  assertEquals(report.status, "blocked");
  assert(report.issues.some((i) => i.code === "kdp_page_size_mismatch"));
});

Deno.test("KDP below-minimum page count blocks for black/white profile", async () => {
  const report = await auditRenderedPdf(await uniformPdf(10, 432, 648), {
    profile: { kind: "kdp_paperback", trimSize: "6x9", bleed: false, printProfile: "black_white" },
  });
  assertEquals(report.status, "blocked");
  assert(report.issues.some((i) => i.code === "kdp_page_count_below_minimum"));
});

Deno.test("KDP above-maximum page count blocks for 8.5x11 premium color profile", async () => {
  const report = await auditRenderedPdf(await uniformPdf(591, 612, 792), {
    profile: { kind: "kdp_paperback", trimSize: "8.5x11", bleed: false, printProfile: "premium_color_white" },
  });
  assertEquals(report.status, "blocked");
  assert(report.issues.some((i) => i.code === "kdp_page_count_above_maximum"));
});

Deno.test("unknown KDP print profile fails closed", async () => {
  const report = await auditRenderedPdf(await uniformPdf(24, 432, 648), {
    profile: {
      kind: "kdp_paperback",
      trimSize: "6x9",
      bleed: false,
      printProfile: "not-a-profile" as KdpPrintProfileId,
    },
  });
  assertEquals(report.status, "blocked");
  assert(report.issues.some((i) => i.code === "kdp_print_profile_invalid"));
});
