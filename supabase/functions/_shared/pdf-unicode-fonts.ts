/* eslint-disable @typescript-eslint/no-explicit-any -- pdf-lib/fontkit monkey-patching crosses an intentionally dynamic runtime boundary. */
import fontkit from "npm:@pdf-lib/fontkit@1.1.1";
import bidiFactoryImport from "npm:bidi-js@1.1.0";
import {
  DEJAVU_SANS_BOLD_GZIP_BASE64,
  DEJAVU_SANS_BOLD_ITALIC_GZIP_BASE64,
  DEJAVU_SANS_ITALIC_GZIP_BASE64,
  DEJAVU_SANS_MONO_GZIP_BASE64,
  DEJAVU_SANS_REGULAR_GZIP_BASE64,
} from "./pdf-unicode-font-data.ts";
import {
  assertPdfGlyphCoverage,
  containsRtlScript,
  normalizePdfText,
} from "./pdf-unicode.ts";

export interface UnicodePdfFonts {
  regular: any;
  bold: any;
  sans: any;
  sansBold: any;
}

export interface UnicodePdfInteriorFonts extends UnicodePdfFonts {
  italic: any;
  boldItalic: any;
  mono: any;
}

interface BidiApi {
  getEmbeddingLevels(text: string): unknown;
  getReorderedString(text: string, levels: unknown): string;
}

type BidiFactory = () => BidiApi;
type BidiFactoryModule = BidiFactory | { default: BidiFactory };

// bidi-js is CommonJS-shaped. Deno and Node/Bun can expose that package either
// as the callable factory itself or as a module namespace with `default`.
// Normalize that interop boundary once rather than weakening type checking.
const bidiFactoryModule = bidiFactoryImport as unknown as BidiFactoryModule;
const createBidi: BidiFactory = typeof bidiFactoryModule === "function"
  ? bidiFactoryModule
  : bidiFactoryModule.default;
const bidi = createBidi();
const GUARDED_PAGE = Symbol("scrolllibrary-unicode-pdf-page");

let coreFontBytesPromise: Promise<{
  regular: Uint8Array;
  bold: Uint8Array;
}> | null = null;

let interiorExtraFontBytesPromise: Promise<{
  italic: Uint8Array;
  boldItalic: Uint8Array;
  mono: Uint8Array;
}> | null = null;

function decodeBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function gunzipBase64(base64: string): Promise<Uint8Array> {
  const compressed = decodeBase64(base64);
  // BlobPart requires an ArrayBuffer-backed view. Copy into an explicit
  // ArrayBuffer instead of casting ArrayBufferLike so Deno/DOM type checking
  // remains strict and SharedArrayBuffer cannot leak across this boundary.
  const compressedBuffer = new ArrayBuffer(compressed.byteLength);
  new Uint8Array(compressedBuffer).set(compressed);
  const decompressed = new Blob([compressedBuffer])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(decompressed).arrayBuffer());
}

async function loadCoreFontBytes() {
  if (!coreFontBytesPromise) {
    coreFontBytesPromise = Promise.all([
      gunzipBase64(DEJAVU_SANS_REGULAR_GZIP_BASE64),
      gunzipBase64(DEJAVU_SANS_BOLD_GZIP_BASE64),
    ]).then(([regular, bold]) => ({ regular, bold }));
  }
  return await coreFontBytesPromise;
}

async function loadInteriorExtraFontBytes() {
  if (!interiorExtraFontBytesPromise) {
    interiorExtraFontBytesPromise = Promise.all([
      gunzipBase64(DEJAVU_SANS_ITALIC_GZIP_BASE64),
      gunzipBase64(DEJAVU_SANS_BOLD_ITALIC_GZIP_BASE64),
      gunzipBase64(DEJAVU_SANS_MONO_GZIP_BASE64),
    ]).then(([italic, boldItalic, mono]) => ({ italic, boldItalic, mono }));
  }
  return await interiorExtraFontBytesPromise;
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
 * Embed the same regular/bold font pair qualified by the KDP-cover slice.
 * Keeping this function core-only preserves the already-green cover runtime
 * and avoids paying to inflate/embed interior styles that a cover never uses.
 */
export async function embedUnicodePdfFonts(pdfDoc: any): Promise<UnicodePdfFonts> {
  pdfDoc.registerFontkit(fontkit);
  const bytes = await loadCoreFontBytes();

  const [regular, bold] = await Promise.all([
    pdfDoc.embedFont(bytes.regular, { subset: true }),
    pdfDoc.embedFont(bytes.bold, { subset: true }),
  ]);

  return {
    regular,
    bold,
    sans: regular,
    sansBold: bold,
  };
}

/**
 * Embed the full interior style set without changing the cover API above.
 * Canonical, legacy and KDP interiors keep bold/italic/code semantics while
 * using Unicode-capable embedded fonts throughout.
 */
export async function embedUnicodePdfInteriorFonts(pdfDoc: any): Promise<UnicodePdfInteriorFonts> {
  pdfDoc.registerFontkit(fontkit);
  const [core, extra] = await Promise.all([
    loadCoreFontBytes(),
    loadInteriorExtraFontBytes(),
  ]);

  const [regular, bold, italic, boldItalic, mono] = await Promise.all([
    pdfDoc.embedFont(core.regular, { subset: true }),
    pdfDoc.embedFont(core.bold, { subset: true }),
    pdfDoc.embedFont(extra.italic, { subset: true }),
    pdfDoc.embedFont(extra.boldItalic, { subset: true }),
    pdfDoc.embedFont(extra.mono, { subset: true }),
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
