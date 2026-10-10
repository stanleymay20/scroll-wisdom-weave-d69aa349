/** Reject table content that the current PDF layout would truncate or clip. */
export class PdfTableLayoutError extends Error {
  readonly code = "PDF_TABLE_LAYOUT_UNSUPPORTED";
  constructor(readonly context: string, detail: string) {
    super(`PDF export cannot preserve ${context}: ${detail}`);
    this.name = "PdfTableLayoutError";
  }
}

export function assertPdfTableContentFits(
  headers: string[],
  rows: string[][],
  limits: { columns: number; headerChars: number; cellChars: number },
  context: string,
): void {
  if (headers.length > limits.columns) {
    throw new PdfTableLayoutError(context, `${headers.length} columns exceeds supported ${limits.columns}`);
  }
  for (const [column, header] of headers.entries()) {
    if (header.length > limits.headerChars) {
      throw new PdfTableLayoutError(`${context} header ${column + 1}`, `exceeds ${limits.headerChars} characters`);
    }
  }
  for (const [rowIndex, row] of rows.entries()) {
    if (row.length > headers.length) {
      throw new PdfTableLayoutError(`${context} row ${rowIndex + 1}`, "has cells without corresponding headers");
    }
    for (const [column, cell] of row.entries()) {
      if (cell.length > limits.cellChars) {
        throw new PdfTableLayoutError(`${context} row ${rowIndex + 1} column ${column + 1}`, `exceeds ${limits.cellChars} characters`);
      }
    }
  }
}

export function assertPdfTableGeometryFits(
  headerHeight: number,
  rowHeights: number[],
  availableHeight: number,
  context: string,
): void {
  if (headerHeight > availableHeight) {
    throw new PdfTableLayoutError(`${context} header`, "exceeds the printable page height");
  }
  for (const [index, height] of rowHeights.entries()) {
    if (headerHeight + height > availableHeight) {
      throw new PdfTableLayoutError(`${context} row ${index + 1}`, "cannot fit with its header on a printable page");
    }
  }
}
