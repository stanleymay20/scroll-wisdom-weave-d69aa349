/* eslint-disable @typescript-eslint/no-explicit-any -- pdf-lib/fontkit monkey-patching crosses an intentionally dynamic runtime boundary. */
import fontkit from "npm:@pdf-lib/fontkit@1.1.1";
import bidiFactoryImport from "npm:bidi-js@1.1.0";
import {
  DEJAVU_SANS_BOLD_GZIP_BASE64,
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

let fontBytesPromise: Promise<{
  regular: Uint8Array;
  bold: Uint8Array;
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

async function loadFontBytes() {
  if (!fontBytesPromise) {
    // Font bytes are generated deterministically from DejaVu 2.37.3 and kept
    // inside the TypeScript module graph. This deliberately avoids runtime
    // filesystem permissions, external font downloads and deployment-specific
    // static-file handling. Source hashes and the redistribution license live
    // in `_shared/fonts/`.
    fontBytesPromise = Promise.all([
      gunzipBase64(DEJAVU_SANS_REGULAR_GZIP_BASE64),
      gunzipBase64(DEJAVU_SANS_BOLD_GZIP_BASE64),
    ]).then(([regular, bold]) => ({ regular, bold }));
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
 * Embed redistribution-safe DejaVu Sans subsets into the output PDF. The cover
 * slice intentionally carries only regular and bold because those are the only
 * styles the existing KDP cover renderer uses. Interior italic/mono fonts stay
 * out of this PR until the interior renderer is separately qualified.
 */
export async function embedUnicodePdfFonts(pdfDoc: any): Promise<UnicodePdfFonts> {
  pdfDoc.registerFontkit(fontkit);
  const bytes = await loadFontBytes();

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
