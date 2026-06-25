// generate-publication-certificate
// Public endpoint: renders a downloadable Publication Certificate PDF for a
// given publication_id or certificate_id. The certificate is meant to be
// independently verifiable, so this is intentionally unauthenticated — it
// reads only fields already exposed by verify_export_public-equivalent
// projections (publication_certificates + publications + works.title).
//
// This is the first deliverable of the Phase 2 Publisher Export Engine.
// It exercises the typography + layout stack end-to-end on a single,
// low-risk artifact before we invest in the full book renderer.
//
// TODO(phase2): replace Standard Helvetica with embedded Inter/Source Serif,
// add QR code linking to /verify/<export_id>, asymmetric signature panel.

import { preflight, json, corsHeaders, serverError, serviceClient } from "../_shared/http.ts";
import { PDFDocument, StandardFonts, rgb, PageSizes } from "npm:pdf-lib@1.17.1";
import { logAuthorshipEvent } from "../_shared/authorshipGuard.ts";

interface CertRow {
  id: string;
  publication_id: string;
  work_id: string;
  authors_snapshot: Array<{ display_name: string; author_role?: string }>;
  rights_holders_snapshot: Array<{ display_name: string; holder_type?: string }>;
  content_hash: string;
  signature_algorithm: string;
  public_key_id: string;
  issuer: string;
  scrolllibrary_version: string | null;
  issued_at: string;
  revoked_at: string | null;
}

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    const url = new URL(req.url);
    const publicationId = url.searchParams.get("publication_id");
    const certificateId = url.searchParams.get("certificate_id");
    if (!publicationId && !certificateId) {
      return json({ error: "missing_id", message: "Provide publication_id or certificate_id" }, 400);
    }

    const sc = serviceClient();

    // Resolve the certificate row.
    let certQuery = sc.from("publication_certificates").select(
      "id, publication_id, work_id, authors_snapshot, rights_holders_snapshot, content_hash, signature_algorithm, public_key_id, issuer, scrolllibrary_version, issued_at, revoked_at",
    );
    certQuery = certificateId
      ? certQuery.eq("id", certificateId)
      : certQuery.eq("publication_id", publicationId!);
    const { data: cert } = await certQuery.order("issued_at", { ascending: false }).limit(1).maybeSingle();
    if (!cert) return json({ error: "certificate_not_found" }, 404);
    const c = cert as CertRow;

    const { data: pub } = await sc
      .from("publications")
      .select("id, version, status, integrity_level, published_at, language, content_hash, work_id")
      .eq("id", c.publication_id)
      .maybeSingle();
    if (!pub) return json({ error: "publication_not_found" }, 404);

    const { data: work } = await sc
      .from("works")
      .select("id, title")
      .eq("id", c.work_id)
      .maybeSingle();

    // -----------------------------------------------------------------------
    // PDF rendering (US Letter, generous margins, calm academic typography).
    // -----------------------------------------------------------------------
    const pdf = await PDFDocument.create();
    pdf.setTitle(`Publication Certificate — ${work?.title ?? "Untitled"}`);
    pdf.setAuthor("ScrollLibrary");
    pdf.setProducer("ScrollLibrary Publisher Export Engine (Phase 2.0.0)");
    pdf.setCreator("ScrollLibrary");
    pdf.setSubject("Publication Certificate");
    pdf.setCreationDate(new Date());
    pdf.setModificationDate(new Date());

    const page = pdf.addPage(PageSizes.Letter);
    const { width: W, height: H } = page.getSize();

    const serif = await pdf.embedFont(StandardFonts.TimesRoman);
    const serifBold = await pdf.embedFont(StandardFonts.TimesRomanBold);
    const serifItalic = await pdf.embedFont(StandardFonts.TimesRomanItalic);
    const mono = await pdf.embedFont(StandardFonts.Courier);
    const sans = await pdf.embedFont(StandardFonts.Helvetica);

    // Academic Blue palette.
    const ink = rgb(0.08, 0.10, 0.16);
    const muted = rgb(0.40, 0.44, 0.52);
    const accent = rgb(0.13, 0.32, 0.58);
    const hair = rgb(0.82, 0.84, 0.88);
    const seal = rgb(0.13, 0.32, 0.58);

    const MARGIN = 72; // 1 inch
    const contentW = W - MARGIN * 2;
    let y = H - MARGIN;

    // ---- Header band -------------------------------------------------------
    page.drawRectangle({ x: 0, y: H - 6, width: W, height: 6, color: accent });

    y -= 8;
    page.drawText("SCROLLLIBRARY", {
      x: MARGIN, y: y - 14, size: 10, font: sans, color: muted,
    });
    page.drawText("PUBLICATION CERTIFICATE", {
      x: MARGIN, y: y - 30, size: 10, font: sans, color: muted,
    });

    // Certificate ID, right-aligned.
    const certIdLabel = "CERTIFICATE ID";
    const certIdValue = c.id;
    const certIdLabelW = sans.widthOfTextAtSize(certIdLabel, 9);
    page.drawText(certIdLabel, {
      x: W - MARGIN - certIdLabelW, y: y - 14, size: 9, font: sans, color: muted,
    });
    const certIdValueW = mono.widthOfTextAtSize(certIdValue, 9);
    page.drawText(certIdValue, {
      x: W - MARGIN - certIdValueW, y: y - 30, size: 9, font: mono, color: ink,
    });

    y -= 58;
    page.drawLine({
      start: { x: MARGIN, y }, end: { x: W - MARGIN, y },
      thickness: 0.75, color: hair,
    });

    // ---- Title block -------------------------------------------------------
    y -= 56;
    const title = work?.title ?? "Untitled Work";
    drawWrappedText(page, title, {
      x: MARGIN, y, maxWidth: contentW,
      font: serifBold, size: 30, lineHeight: 36, color: ink,
    });
    y -= titleHeight(title, serifBold, 30, 36, contentW);

    y -= 8;
    page.drawText(
      `Version ${pub.version} · ${humanIntegrity(pub.integrity_level)}`,
      { x: MARGIN, y, size: 11, font: serifItalic, color: muted },
    );

    // ---- Authorship --------------------------------------------------------
    y -= 40;
    sectionLabel(page, "AUTHORSHIP", MARGIN, y, sans, muted);
    y -= 18;
    const authors = normalizeAuthors(c.authors_snapshot);
    if (authors.length === 0) {
      page.drawText("—", { x: MARGIN, y, size: 12, font: serif, color: ink });
      y -= 16;
    } else {
      for (const a of authors) {
        const role = a.role && a.role !== "primary" ? `  (${a.role})` : "";
        page.drawText(a.name + role, { x: MARGIN, y, size: 13, font: serif, color: ink });
        y -= 18;
      }
    }

    // ---- Rights ------------------------------------------------------------
    y -= 20;
    sectionLabel(page, "RIGHTS HOLDER", MARGIN, y, sans, muted);
    y -= 18;
    const holders = normalizeHolders(c.rights_holders_snapshot);
    if (holders.length === 0) {
      page.drawText("—", { x: MARGIN, y, size: 12, font: serif, color: ink });
      y -= 16;
    } else {
      for (const h of holders) {
        page.drawText(`© ${h}`, { x: MARGIN, y, size: 13, font: serif, color: ink });
        y -= 18;
      }
    }

    // ---- Two-column metadata ----------------------------------------------
    y -= 28;
    page.drawLine({
      start: { x: MARGIN, y }, end: { x: W - MARGIN, y },
      thickness: 0.5, color: hair,
    });
    y -= 24;

    const colGap = 28;
    const colW = (contentW - colGap) / 2;
    const leftX = MARGIN;
    const rightX = MARGIN + colW + colGap;
    const rowY = y;

    metaPair(page, leftX, rowY, "Publisher", c.issuer ?? "—", sans, serif, muted, ink);
    metaPair(page, rightX, rowY, "Issued", fmtDate(c.issued_at), sans, serif, muted, ink);

    const rowY2 = rowY - 44;
    metaPair(page, leftX, rowY2, "Published", fmtDate(pub.published_at), sans, serif, muted, ink);
    metaPair(page, rightX, rowY2, "Language", (pub.language ?? "—").toUpperCase(), sans, serif, muted, ink);

    const rowY3 = rowY2 - 44;
    metaPair(page, leftX, rowY3, "Signature algorithm", c.signature_algorithm, sans, mono, muted, ink, 11);
    metaPair(page, rightX, rowY3, "Public key ID", c.public_key_id, sans, mono, muted, ink, 11);

    y = rowY3 - 44;

    // ---- Content hash ------------------------------------------------------
    sectionLabel(page, "CONTENT HASH (SHA-256)", MARGIN, y, sans, muted);
    y -= 16;
    const hashLines = chunk(c.content_hash, 32);
    for (const line of hashLines) {
      page.drawText(line, { x: MARGIN, y, size: 11, font: mono, color: ink });
      y -= 14;
    }

    // ---- Revocation notice -------------------------------------------------
    if (c.revoked_at) {
      y -= 18;
      page.drawRectangle({
        x: MARGIN, y: y - 28, width: contentW, height: 36,
        color: rgb(0.98, 0.92, 0.92), borderColor: rgb(0.70, 0.20, 0.20), borderWidth: 0.75,
      });
      page.drawText("REVOKED", {
        x: MARGIN + 14, y: y - 12, size: 11, font: sans, color: rgb(0.55, 0.10, 0.10),
      });
      page.drawText(`Revoked ${fmtDate(c.revoked_at)}`, {
        x: MARGIN + 90, y: y - 12, size: 11, font: serifItalic, color: rgb(0.55, 0.10, 0.10),
      });
      y -= 40;
    }

    // ---- Seal (footer right) ----------------------------------------------
    const sealCX = W - MARGIN - 36;
    const sealCY = MARGIN + 36;
    page.drawCircle({ x: sealCX, y: sealCY, size: 32, borderColor: seal, borderWidth: 1.25, color: rgb(1, 1, 1) });
    page.drawCircle({ x: sealCX, y: sealCY, size: 26, borderColor: seal, borderWidth: 0.5, color: rgb(1, 1, 1) });
    page.drawText("S·L", {
      x: sealCX - sans.widthOfTextAtSize("S·L", 14) / 2,
      y: sealCY - 5, size: 14, font: serifBold, color: seal,
    });

    // ---- Footer ------------------------------------------------------------
    page.drawLine({
      start: { x: MARGIN, y: MARGIN + 18 }, end: { x: W - MARGIN - 90, y: MARGIN + 18 },
      thickness: 0.5, color: hair,
    });
    page.drawText(
      "Verify the integrity of this certificate at scrolllibrary.org/verify-certificate",
      { x: MARGIN, y: MARGIN, size: 9, font: sans, color: muted },
    );

    const bytes = await pdf.save();

    // Audit trail — read-only event but useful to track distribution.
    await logAuthorshipEvent(sc, {
      workId: c.work_id, publicationId: c.publication_id, userId: null,
      action: "export", allowed: true,
      metadata: { kind: "publication_certificate_pdf", certificate_id: c.id },
    });

    const filename = `publication-certificate-${(work?.title ?? "untitled")
      .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60)}-v${pub.version}.pdf`;

    return new Response(bytes, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    return serverError(e);
  }
});

// ---------------------------------------------------------------------------
// Layout helpers
// ---------------------------------------------------------------------------
function sectionLabel(page: ReturnType<PDFDocument["addPage"]>, label: string, x: number, y: number, font: import("npm:pdf-lib@1.17.1").PDFFont, color: ReturnType<typeof rgb>) {
  page.drawText(label, { x, y, size: 9, font, color });
}

function metaPair(
  page: ReturnType<PDFDocument["addPage"]>,
  x: number, y: number, label: string, value: string,
  labelFont: import("npm:pdf-lib@1.17.1").PDFFont,
  valueFont: import("npm:pdf-lib@1.17.1").PDFFont,
  labelColor: ReturnType<typeof rgb>, valueColor: ReturnType<typeof rgb>,
  valueSize = 13,
) {
  page.drawText(label.toUpperCase(), { x, y, size: 9, font: labelFont, color: labelColor });
  page.drawText(value, { x, y: y - 16, size: valueSize, font: valueFont, color: valueColor });
}

function drawWrappedText(
  page: ReturnType<PDFDocument["addPage"]>,
  text: string,
  opts: { x: number; y: number; maxWidth: number; font: import("npm:pdf-lib@1.17.1").PDFFont; size: number; lineHeight: number; color: ReturnType<typeof rgb> },
) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const w of words) {
    const tentative = line ? line + " " + w : w;
    if (opts.font.widthOfTextAtSize(tentative, opts.size) > opts.maxWidth && line) {
      lines.push(line); line = w;
    } else {
      line = tentative;
    }
  }
  if (line) lines.push(line);
  let y = opts.y;
  for (const ln of lines) {
    page.drawText(ln, { x: opts.x, y, size: opts.size, font: opts.font, color: opts.color });
    y -= opts.lineHeight;
  }
}

function titleHeight(text: string, font: import("npm:pdf-lib@1.17.1").PDFFont, size: number, lineHeight: number, maxWidth: number): number {
  const words = text.split(/\s+/);
  let line = "", lines = 0;
  for (const w of words) {
    const tentative = line ? line + " " + w : w;
    if (font.widthOfTextAtSize(tentative, size) > maxWidth && line) {
      lines++; line = w;
    } else { line = tentative; }
  }
  if (line) lines++;
  return Math.max(1, lines) * lineHeight;
}

function normalizeAuthors(v: unknown): Array<{ name: string; role?: string }> {
  if (!v) return [];
  if (Array.isArray(v)) {
    return v.map((a) => {
      if (typeof a === "string") return { name: a };
      const o = a as Record<string, unknown>;
      return {
        name: String(o.display_name ?? o.name ?? o.full_name ?? "—"),
        role: (o.author_role ?? o.role) as string | undefined,
      };
    }).filter((a) => a.name && a.name !== "—" || true);
  }
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (o.name || o.display_name) return [{ name: String(o.display_name ?? o.name), role: o.role as string }];
  }
  return [];
}

function normalizeHolders(v: unknown): string[] {
  if (!v) return [];
  if (Array.isArray(v)) {
    return v.map((h) => {
      if (typeof h === "string") return h;
      const o = h as Record<string, unknown>;
      return String(o.display_name ?? o.name ?? o.copyright_holder ?? "—");
    }).filter(Boolean);
  }
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    const name = o.copyright_holder ?? o.display_name ?? o.name;
    if (name) return [String(name)];
  }
  return [];
}

function chunk(s: string, n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < s.length; i += n) out.push(s.slice(i, i + n));
  return out;
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  } catch { return d; }
}

function humanIntegrity(level: string | null | undefined): string {
  switch (level) {
    case "certified": return "Certified";
    case "verified": return "Verified";
    case "standard": return "Standard";
    case "draft": return "Draft";
    default: return level ?? "—";
  }
}
