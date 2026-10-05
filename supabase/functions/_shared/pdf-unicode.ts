export interface PdfFontLike {
  getCharacterSet(): number[];
}

export interface UnsupportedPdfGlyph {
  codePoint: number;
  character: string;
}

const NON_PRINTING_CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const RTL_SCRIPT = /[\u0590-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/u;

/**
 * Keep printable manuscript Unicode intact. The only characters removed here
 * are C0/DEL control codes that have no printable glyph semantics in a PDF.
 * Newlines, carriage returns and tabs are preserved for layout code.
 */
export function normalizePdfText(text: string): string {
  if (!text) return "";
  return text.normalize("NFC").replace(NON_PRINTING_CONTROL, "");
}

export function containsRtlScript(text: string): boolean {
  return RTL_SCRIPT.test(text);
}

export function findUnsupportedPdfGlyphs(
  text: string,
  font: PdfFontLike,
): UnsupportedPdfGlyph[] {
  const normalized = normalizePdfText(text);
  const supported = new Set(font.getCharacterSet());
  const missing = new Map<number, UnsupportedPdfGlyph>();

  for (const character of normalized) {
    const codePoint = character.codePointAt(0)!;
    // Layout controls are never emitted as glyphs by the renderer.
    if (character === "\n" || character === "\r" || character === "\t") continue;
    if (!supported.has(codePoint) && !missing.has(codePoint)) {
      missing.set(codePoint, { codePoint, character });
    }
  }

  return [...missing.values()].sort((a, b) => a.codePoint - b.codePoint);
}

function formatCodePoint(codePoint: number): string {
  return `U+${codePoint.toString(16).toUpperCase().padStart(4, "0")}`;
}

export class UnsupportedPdfGlyphError extends Error {
  readonly code = "PDF_UNSUPPORTED_GLYPH";
  readonly glyphs: UnsupportedPdfGlyph[];
  readonly context: string;

  constructor(context: string, glyphs: UnsupportedPdfGlyph[]) {
    const detail = glyphs
      .slice(0, 12)
      .map(({ codePoint, character }) => `${formatCodePoint(codePoint)} ${JSON.stringify(character)}`)
      .join(", ");
    const remainder = glyphs.length > 12 ? ` (+${glyphs.length - 12} more)` : "";
    super(`PDF export cannot render ${context}: unsupported glyphs ${detail}${remainder}`);
    this.name = "UnsupportedPdfGlyphError";
    this.context = context;
    this.glyphs = glyphs;
  }
}

/**
 * Fail loudly before pdf-lib can substitute, drop or throw an opaque encoding
 * error. The caller supplies the exact font that will materially draw the text.
 */
export function assertPdfGlyphCoverage(
  text: string,
  font: PdfFontLike,
  context = "text",
): void {
  const missing = findUnsupportedPdfGlyphs(text, font);
  if (missing.length > 0) throw new UnsupportedPdfGlyphError(context, missing);
}
