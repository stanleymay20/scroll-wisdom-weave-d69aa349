import fontkit from "npm:@pdf-lib/fontkit@1.1.1";
import bidiFactory from "npm:bidi-js@1.1.0";
import dejavuPackage from "npm:dejavu-fonts-ttf@2.37.3/package.json" with { type: "json" };
import {
  assertPdfGlyphCoverage,
  containsRtlScript,
  normalizePdfText,
} from "./pdf-unicode.ts";

export interface UnicodePdfFonts {
  regular: any;
  bold: any;
  italic: any;
  boldItalic: any;
  sans: any;
  sansBold: any;
  mono: any;
}

if (dejavuPackage.version !== "2.37.3") {
  throw new Error(`Unexpected DejaVu font package version: ${dejavuPackage.version}`);
}
const DEJAVU_PACKAGE_JSON = import.meta.resolve("npm:dejavu-fonts-ttf@2.37.3/package.json");
const bidi = bidiFactory();
const GUARDED_PAGE = Symbol("scrolllibrary-unicode-pdf-page");

let fontBytesPromise: Promise<{
  regular: Uint8Array;
  bold: Uint8Array;
  italic: Uint8Array;
  boldItalic: Uint8Array;
  mono: Uint8Array;
}> | null = null;

async function readDejaVuFont(fileName: string): Promise<Uint8Array> {
  const asset = new URL(`./ttf/${fileName}`, DEJAVU_PACKAGE_JSON);
  return await Deno.readFile(asset);
}

async function loadFontBytes() {
  if (!fontBytesPromise) {
    fontBytesPromise = (async () => {
      const [regular, bold, italic, boldItalic, mono] = await Promise.all([
        readDejaVuFont("DejaVuSans.ttf"),
        readDejaVuFont("DejaVuSans-Bold.ttf"),
        readDejaVuFont("DejaVuSans-Oblique.ttf"),
        readDejaVuFont("DejaVuSans-BoldOblique.ttf"),
        readDejaVuFont("DejaVuSansMono.ttf"),
      ]);
      return { regular, bold, italic, boldItalic, mono };
    })();
  }
  return await fontBytesPromise;
}

/**
 * pdf-lib positions glyphs in draw order. Apply the Unicode Bidirectional
 * Algorithm only at the final draw boundary, after wrapping/measurement, so
 * Hebrew and mixed-direction lines are visually ordered without corrupting the
 * logical source used by layout and semantic export checks.
 */
export function preparePdfVisualText(text: string): string {
  const normalized = normalizePdfText(text);
  if (!containsRtlScript(normalized)) return normalized;
  const levels = bidi.getEmbeddingLevels(normalized);
  return bidi.getReorderedString(normalized, levels);
}

function guardPdfPage(page: any): any {
  if (!page || page[GUARDED_PAGE]) return page;

  const originalDrawText = page.drawText.bind(page);
  page.drawText = (text: string, options: Record<string, any> = {}) => {
    const normalized = normalizePdfText(String(text ?? ""));
    const font = options.font;
    if (font && typeof font.getCharacterSet === "function") {
      assertPdfGlyphCoverage(normalized, font, `PDF text ${JSON.stringify(normalized.slice(0, 80))}`);
    }
    return originalDrawText(preparePdfVisualText(normalized), options);
  };

  Object.defineProperty(page, GUARDED_PAGE, { value: true });
  return page;
}

/**
 * Cover every page created by this document. This central boundary means a
 * future direct `page.drawText(...)` call cannot bypass glyph validation or RTL
 * ordering simply because a caller forgot a helper.
 */
export function installUnicodePdfTextGuard(pdfDoc: any): void {
  for (const page of pdfDoc.getPages?.() ?? []) guardPdfPage(page);

  const originalAddPage = pdfDoc.addPage.bind(pdfDoc);
  pdfDoc.addPage = (...args: any[]) => guardPdfPage(originalAddPage(...args));
}

/**
 * Load redistribution-safe DejaVu 2.37 fonts from the pinned npm package and
 * embed subsets into the output PDF. DejaVu Sans is intentionally the primary
 * family because the print blocker requires one embedded family that covers
 * Akan Latin extensions, Greek, Hebrew and common mathematical symbols. The
 * package is resolved from the Deno npm cache/bundle; no runtime HTTP font
 * request is made.
 */
export async function embedUnicodePdfFonts(pdfDoc: any): Promise<UnicodePdfFonts> {
  pdfDoc.registerFontkit(fontkit);
  const bytes = await loadFontBytes();

  const [regular, bold, italic, boldItalic, mono] = await Promise.all([
    pdfDoc.embedFont(bytes.regular, { subset: true }),
    pdfDoc.embedFont(bytes.bold, { subset: true }),
    pdfDoc.embedFont(bytes.italic, { subset: true }),
    pdfDoc.embedFont(bytes.boldItalic, { subset: true }),
    pdfDoc.embedFont(bytes.mono, { subset: true }),
  ]);

  return {
    regular,
    bold,
    italic,
    boldItalic,
    sans: regular,
    sansBold: bold,
    mono,
  };
}
