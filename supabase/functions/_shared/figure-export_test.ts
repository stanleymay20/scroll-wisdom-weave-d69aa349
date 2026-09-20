import { assert, assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { parseChapterToCanonical, type CanonicalDiagram } from "./canonicalContent.ts";
import { parseFigureData, type FigureData } from "./figure-data.ts";
import {
  diagramCaption,
  diagramIsDrawn,
  diagramToDocxXml,
  diagramToPlainText,
  diagramToXhtml,
} from "./figure-export.ts";
import { auditBookForPublishability } from "./qaPublishability.ts";

const FLOW_JSON =
  '{"kind":"flow","direction":"down","nodes":[{"id":"a","label":"Submission"},{"id":"b","label":"Triage"},{"id":"c","label":"Decision"}],"edges":[{"from":"a","to":"b"},{"from":"b","to":"c","label":"accepted"}]}';
const TABLE_JSON =
  '{"kind":"table","columns":["Approach","Strength"],"rows":[["Manual","Precise"],["Automated","Fast"]]}';
const SERIES_JSON =
  '{"kind":"series","unit":"%","points":[{"label":"Agree","value":62},{"label":"Disagree","value":38}]}';

function diagram(json: string, visualType = "flowchart"): CanonicalDiagram {
  const data = parseFigureData(json);
  assert(data, "fixture data must validate");
  return {
    figureNumber: 3,
    caption: "The review lifecycle",
    description: "A flowchart of the review process.",
    visualType,
    data: data as FigureData,
  };
}

function marker(num: number, type: string, json?: string): string {
  const lines = [
    `[FIGURE ${num}`,
    `TYPE: ${type}`,
    `CAPTION: Figure caption ${num}`,
    `DESCRIPTION: A description of figure ${num}.`,
  ];
  if (json) lines.push(`DATA: ${json}`);
  return `${lines.join("\n")}]`;
}

/** The same balanced-tag check the layout tests use; an EPUB is XHTML. */
function assertWellFormedXml(xml: string): void {
  const stack: string[] = [];
  let i = 0;
  while (i < xml.length) {
    const lt = xml.indexOf("<", i);
    if (lt === -1) break;
    let j = lt + 1;
    let quote: string | null = null;
    while (j < xml.length) {
      const ch = xml[j];
      if (quote) { if (ch === quote) quote = null; }
      else if (ch === '"' || ch === "'") quote = ch;
      else if (ch === ">") break;
      j++;
    }
    assert(j < xml.length, `unterminated tag at ${lt}`);
    const body = xml.slice(lt + 1, j);
    if (!body.startsWith("?") && !body.startsWith("!")) {
      if (body.startsWith("/")) assertEquals(stack.pop(), body.slice(1).trim(), "mismatched close");
      else if (!body.endsWith("/")) stack.push(body.split(/[\s>]/)[0]);
    }
    i = j + 1;
  }
  assertEquals(stack, [], `unclosed: ${stack.join(", ")}`);
}

// ---------------------------------------------------------------------------
// canonicalContent — the figure must survive the strip that used to delete it.
// ---------------------------------------------------------------------------

Deno.test("a diagram marker becomes a canonical diagram block", () => {
  const chapter = parseChapterToCanonical(
    1,
    "Review",
    `Opening prose.\n\n${marker(1, "flowchart", FLOW_JSON)}\n\nClosing prose.`,
  );
  const kinds = chapter.blocks.map((b) => b.kind);
  assertEquals(kinds, ["paragraph", "diagram", "paragraph"]);

  const block = chapter.blocks[1];
  assertEquals(block.diagram?.figureNumber, 1);
  assertEquals(block.diagram?.data.kind, "flow");
  assertEquals(block.diagram?.caption, "Figure caption 1");
});

Deno.test("an artwork marker is still stripped", () => {
  // No DATA means nothing to draw; it was an image prompt and is removed, as
  // it always has been.
  const chapter = parseChapterToCanonical(
    1,
    "Review",
    `Before.\n\n${marker(1, "children_illustration")}\n\nAfter.`,
  );
  assertEquals(chapter.blocks.map((b) => b.kind), ["paragraph", "paragraph"]);
});

Deno.test("prose around a diagram is preserved intact", () => {
  const chapter = parseChapterToCanonical(
    1,
    "T",
    `First para.\n\n${marker(1, "chart", SERIES_JSON)}\n\nSecond para.`,
  );
  const paragraphs = chapter.blocks.filter((b) => b.kind === "paragraph").map((b) => b.text);
  assertEquals(paragraphs, ["First para.", "Second para."]);
});

Deno.test("a diagram counts as a figure in chapter stats", () => {
  const chapter = parseChapterToCanonical(1, "T", `P.\n\n${marker(1, "flowchart", FLOW_JSON)}`);
  assertEquals(chapter.stats.images, 1);
});

Deno.test("several diagrams in one chapter all survive", () => {
  const chapter = parseChapterToCanonical(
    1,
    "T",
    [
      "A.",
      marker(1, "flowchart", FLOW_JSON),
      "B.",
      marker(2, "comparison_visual", TABLE_JSON),
      "C.",
      marker(3, "chart", SERIES_JSON),
    ].join("\n\n"),
  );
  const diagrams = chapter.blocks.filter((b) => b.kind === "diagram");
  assertEquals(diagrams.length, 3);
  assertEquals(diagrams.map((b) => b.diagram!.data.kind), ["flow", "table", "series"]);
});

Deno.test("a marker with a broken payload is stripped, not rendered", () => {
  const chapter = parseChapterToCanonical(1, "T", `A.\n\n${marker(1, "flowchart", "{oops")}\n\nB.`);
  assertEquals(chapter.blocks.filter((b) => b.kind === "diagram").length, 0);
  for (const block of chapter.blocks) {
    assert(!(block.text ?? "").includes("FIGURE"), block.text);
  }
});

// ---------------------------------------------------------------------------
// EPUB
// ---------------------------------------------------------------------------

Deno.test("a flow becomes an svg figure with a caption", () => {
  const xhtml = diagramToXhtml(diagram(FLOW_JSON), "3-0");
  assertWellFormedXml(xhtml);
  assertStringIncludes(xhtml, "<svg");
  assertStringIncludes(xhtml, "<figcaption>Figure 3: The review lifecycle</figcaption>");
});

Deno.test("a table becomes an html table, not a drawing", () => {
  const xhtml = diagramToXhtml(diagram(TABLE_JSON, "comparison_visual"), "3-0");
  assertWellFormedXml(xhtml);
  assert(!xhtml.includes("<svg"), "a table is a table in every format");
  assertStringIncludes(xhtml, "<th>Approach</th>");
  assertStringIncludes(xhtml, "<td>Automated</td>");
});

Deno.test("two diagrams in one document get distinct marker ids", () => {
  // Duplicate ids are an XHTML validity error and EPUBCheck fails the whole
  // book over one.
  const first = diagramToXhtml(diagram(FLOW_JSON), "1-0");
  const second = diagramToXhtml(diagram(FLOW_JSON), "2-1");
  const idOf = (xml: string) => /<marker id="([^"]+)"/.exec(xml)?.[1];
  assert(idOf(first), "first marker id missing");
  assert(idOf(first) !== idOf(second), `ids collided: ${idOf(first)}`);
  assertStringIncludes(first, `url(#${idOf(first)})`);
  assertStringIncludes(second, `url(#${idOf(second)})`);
});

Deno.test("a caption containing markup cannot break the xhtml", () => {
  const d = diagram(FLOW_JSON);
  d.caption = '</figcaption><script>alert(1)</script>';
  const xhtml = diagramToXhtml(d, "1-0");
  assert(!xhtml.includes("<script>"), xhtml);
  assertWellFormedXml(xhtml);
});

Deno.test("diagramIsDrawn separates graphics from tables", () => {
  assertEquals(diagramIsDrawn(diagram(FLOW_JSON)), true);
  assertEquals(diagramIsDrawn(diagram(SERIES_JSON, "chart")), true);
  assertEquals(diagramIsDrawn(diagram(TABLE_JSON, "comparison_visual")), false);
});

// ---------------------------------------------------------------------------
// DOCX
// ---------------------------------------------------------------------------

Deno.test("every diagram kind produces a well-formed docx table", () => {
  for (const [json, type] of [[FLOW_JSON, "flowchart"], [TABLE_JSON, "comparison_visual"], [SERIES_JSON, "chart"]]) {
    const xml = diagramToDocxXml(diagram(json, type));
    assertWellFormedXml(`<root>${xml}</root>`);
    assertStringIncludes(xml, "<w:tbl>");
    assertStringIncludes(xml, "Figure 3: The review lifecycle");
  }
});

Deno.test("a flow's transitions reach the docx table", () => {
  const xml = diagramToDocxXml(diagram(FLOW_JSON));
  assertStringIncludes(xml, "Submission");
  assertStringIncludes(xml, "Decision");
  assertStringIncludes(xml, "accepted");
});

Deno.test("an ampersand in a cell is escaped for docx", () => {
  const d = diagram('{"kind":"table","columns":["A & B","C"],"rows":[["x < y","z"]]}', "comparison_visual");
  const xml = diagramToDocxXml(d);
  assertStringIncludes(xml, "A &amp; B");
  assertStringIncludes(xml, "x &lt; y");
  assertWellFormedXml(`<root>${xml}</root>`);
});

// ---------------------------------------------------------------------------
// Plain text
// ---------------------------------------------------------------------------

Deno.test("plain text carries the caption and every row", () => {
  const text = diagramToPlainText(diagram(FLOW_JSON));
  assertStringIncludes(text, "Figure 3: The review lifecycle");
  assertStringIncludes(text, "Submission | Triage");
});

Deno.test("the caption is numbered consistently across formats", () => {
  const d = diagram(FLOW_JSON);
  const expected = "Figure 3: The review lifecycle";
  assertEquals(diagramCaption(d), expected);
  assertStringIncludes(diagramToXhtml(d, "1-0"), expected);
  assertStringIncludes(diagramToDocxXml(d), expected);
  assertStringIncludes(diagramToPlainText(d), expected);
});

// ---------------------------------------------------------------------------
// The publishability gate must not block a book for containing a real diagram.
// ---------------------------------------------------------------------------

Deno.test("a rendered diagram is not an orphan marker", () => {
  const report = auditBookForPublishability([
    {
      chapter_number: 1,
      title: "Review",
      content: `Opening prose that is long enough to look like a real chapter body, with several sentences so the short-chapter heuristics do not fire on it instead. ${
        "Filler sentence for length. ".repeat(20)
      }\n\n${marker(1, "flowchart", FLOW_JSON)}\n\nClosing prose.`,
    },
  ] as never, { hasCover: true });
  const orphans = report.issues.filter((i) => i.code === "orphan_figure_marker");
  assertEquals(orphans, [], JSON.stringify(orphans));
});

Deno.test("a marker without data still blocks publication", () => {
  const report = auditBookForPublishability([
    {
      chapter_number: 1,
      title: "Review",
      content: `Prose. ${"Filler sentence for length. ".repeat(20)}\n\n${marker(1, "flowchart")}\n\nMore.`,
    },
  ] as never, { hasCover: true });
  const orphans = report.issues.filter((i) => i.code === "orphan_figure_marker");
  assertEquals(orphans.length, 1, JSON.stringify(report.issues));
  assertEquals(orphans[0].severity, "blocker");
});

Deno.test("one broken marker beside a good one still blocks", () => {
  const report = auditBookForPublishability([
    {
      chapter_number: 1,
      title: "Review",
      content: `Prose. ${"Filler sentence for length. ".repeat(20)}\n\n${
        marker(1, "flowchart", FLOW_JSON)
      }\n\n${marker(2, "flowchart")}\n\nMore.`,
    },
  ] as never, { hasCover: true });
  assertEquals(report.issues.filter((i) => i.code === "orphan_figure_marker").length, 1);
});
