import {
  assert,
  assertEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { PDFDocument, StandardFonts } from "https://esm.sh/pdf-lib@1.17.1";
import { auditRenderedPdf } from "./productionArtifactAudit.ts";

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

Deno.test("auditRenderedPdf passes a structurally valid rendered PDF", async () => {
  const bytes = await renderedPdfWithText();
  const report = await auditRenderedPdf(bytes);

  assertEquals(report.status, "ready");
  assertEquals(report.metrics.pageCount, 1);
  assertEquals(report.metrics.pagesWithoutContentStreams, 0);
  assert(report.metrics.byteSize >= 1024);
  assertEquals(report.issues.length, 0);
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
