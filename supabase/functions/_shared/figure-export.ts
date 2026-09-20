/**
 * Format-specific markup for drawn figures.
 *
 * Each exporter has different reach. EPUB 3 renders SVG natively, so a diagram
 * is drawn there. DOCX has no dependable SVG support across Word versions and
 * the platforms ScrollLibrary's readers open files on, so a diagram degrades to
 * the table every DOCX reader renders correctly. The PDF is drawn with pdf-lib
 * primitives and lives in export-book, because only that module holds the
 * document, the fonts and the page cursor.
 *
 * What none of them do any more is drop the figure. Before this module a
 * `[FIGURE ...]` marker was stripped by canonicalContent on the way into every
 * export, so a book's diagrams existed only in the reader — and there only as a
 * guess reconstructed from the prose.
 */

import type { CanonicalDiagram } from './canonicalContent.ts';
import { figureDataToTable } from './figure-data.ts';
import { escapeXml, figureLayoutToSvg, layoutFigure } from './figure-layout.ts';

/** "Figure 3: The review lifecycle" — the printed label beneath a figure. */
export function diagramCaption(diagram: CanonicalDiagram): string {
  const caption = diagram.caption.replace(/\s+/g, ' ').trim();
  return `Figure ${diagram.figureNumber}: ${caption}`;
}

/** Whether this diagram is drawn as a graphic rather than laid out as a table. */
export function diagramIsDrawn(diagram: CanonicalDiagram): boolean {
  return diagram.data.kind !== 'table';
}

/**
 * Nominal content width, in points, that a diagram is laid out against.
 *
 * Matches the text column of the exporters' page setup. A diagram is scaled to
 * the available width on the way out, so this only fixes the aspect ratio.
 */
export const DIAGRAM_LAYOUT_WIDTH = 400;

function tableXhtml(header: string[], rows: string[][]): string {
  const thead = `<thead><tr>${header.map((h) => `<th>${escapeXml(h)}</th>`).join('')}</tr></thead>`;
  const tbody = `<tbody>${
    rows.map((row) =>
      `<tr>${header.map((_, i) => `<td>${escapeXml(row[i] ?? '')}</td>`).join('')}</tr>`
    ).join('')
  }</tbody>`;
  return `<table>${thead}${tbody}</table>`;
}

/**
 * XHTML for an EPUB, as a `<figure>` with its caption.
 *
 * `idSuffix` must be unique within the chapter document: two diagrams on one
 * page would otherwise both define an arrowhead marker with the same id, and
 * EPUBCheck fails the entire book over a duplicate id.
 */
export function diagramToXhtml(diagram: CanonicalDiagram, idSuffix: string): string {
  const caption = escapeXml(diagramCaption(diagram));

  if (!diagramIsDrawn(diagram)) {
    const { header, rows } = figureDataToTable(diagram.data);
    return `<figure class="scroll-figure">${tableXhtml(header, rows)}` +
      `<figcaption>${caption}</figcaption></figure>`;
  }

  const layout = layoutFigure(diagram.data, DIAGRAM_LAYOUT_WIDTH);
  if (!layout) {
    const { header, rows } = figureDataToTable(diagram.data);
    return `<figure class="scroll-figure">${tableXhtml(header, rows)}` +
      `<figcaption>${caption}</figcaption></figure>`;
  }

  const svg = figureLayoutToSvg(layout, {
    title: diagramCaption(diagram),
    description: diagram.description,
    idSuffix,
  });
  return `<figure class="scroll-figure">${svg}<figcaption>${caption}</figcaption></figure>`;
}

/**
 * WordprocessingML for a DOCX.
 *
 * Always a table. Word's SVG support depends on the version and the platform,
 * and a figure that renders on the author's machine and not on their reader's
 * is worse than one that renders plainly everywhere.
 */
export function diagramToDocxXml(diagram: CanonicalDiagram): string {
  const { header, rows } = figureDataToTable(diagram.data);
  const columnWidth = Math.floor(9000 / Math.max(1, header.length));

  const headerCells = header
    .map((h) =>
      `<w:tc><w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="F0F0F0"/></w:tcPr>` +
      `<w:p><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${escapeXml(h)}</w:t></w:r></w:p></w:tc>`
    )
    .join('');

  const bodyRows = rows
    .map((row, rowIndex) => {
      const shade = rowIndex % 2 === 1
        ? '<w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="FAFAFA"/></w:tcPr>'
        : '';
      const cells = header
        .map((_, i) =>
          `<w:tc>${shade}<w:p><w:r><w:t xml:space="preserve">${escapeXml(row[i] ?? '')}</w:t></w:r></w:p></w:tc>`
        )
        .join('');
      return `<w:tr>${cells}</w:tr>`;
    })
    .join('');

  return `<w:tbl>
  <w:tblPr><w:tblW w:w="0" w:type="auto"/>
    <w:tblBorders>
      <w:top w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>
      <w:left w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>
      <w:bottom w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>
      <w:right w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>
      <w:insideH w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>
      <w:insideV w:val="single" w:sz="4" w:space="0" w:color="CCCCCC"/>
    </w:tblBorders>
  </w:tblPr>
  <w:tblGrid>${header.map(() => `<w:gridCol w:w="${columnWidth}"/>`).join('')}</w:tblGrid>
  <w:tr>${headerCells}</w:tr>
  ${bodyRows}
</w:tbl>
<w:p><w:r><w:rPr><w:i/><w:sz w:val="18"/></w:rPr><w:t xml:space="preserve">${
    escapeXml(diagramCaption(diagram))
  }</w:t></w:r></w:p>`;
}

/**
 * Plain-text rendering, for any path that carries no markup.
 *
 * Used by the export-quality auditor and as the last fallback in the PDF if a
 * diagram cannot be laid out, so a figure is never silently missing.
 */
export function diagramToPlainText(diagram: CanonicalDiagram): string {
  const { header, rows } = figureDataToTable(diagram.data);
  const lines = [diagramCaption(diagram), header.join(' | ')];
  for (const row of rows) lines.push(header.map((_, i) => row[i] ?? '').join(' | '));
  return lines.join('\n');
}
