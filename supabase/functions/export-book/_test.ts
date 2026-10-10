/**
 * Canonical PDF renderer tests.
 *
 * Covers the new `generateCanonicalPDF` path used by paid publishing exports.
 * Does NOT exercise DOCX / EPUB / KDP renderers.
 *
 * Run: deno test --allow-net --allow-env --allow-read supabase/functions/export-book/_test.ts
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { generateCanonicalPDF, generatePDF, generateKDPPDF } from "./index.ts";

const PDF_MAGIC = "%PDF-";
const MIN_PDF_BYTES = 2000; // cover + title + copyright + 1 chapter page is well above this

const ctx = {
  pub: {
    transparency_mode: "invisible" as const,
    show_scrolllibrary_branding: false,
    show_ai_assistance_notice: false,
    show_powered_by: false,
    publisher_name: null,
    publisher_imprint: null,
    sanitize_metadata: true,
    confidential_mode: false,
  },
  showAINotice: false,
  showAILongDisclosure: false,
  showBranding: false,
  showPoweredBy: false,
  effectivePublisher: "Test Publisher",
  sanitizeMeta: true,
};

function makeBook(extra: Record<string, unknown> = {}) {
  return {
    id: "test-book",
    title: "Test Book",
    category: "Nonfiction",
    description: "Test",
    ...extra,
  };
}

async function renderPDF(chapters: { chapter_number: number; title: string; content: string }[]) {
  const book = makeBook();
  const bytes = await generateCanonicalPDF(
    book,
    chapters,
    "Test Author",
    "TEST-ID-0001",
    false,
    2026,
    null,
    false,
    "APA",
    [],
    ctx,
  );
  return bytes;
}

function assertValidPDF(bytes: Uint8Array, minLen = MIN_PDF_BYTES) {
  assert(bytes instanceof Uint8Array, "expected Uint8Array");
  assert(bytes.byteLength > minLen, `PDF too small: ${bytes.byteLength} bytes`);
  const header = new TextDecoder().decode(bytes.slice(0, 5));
  assertEquals(header, PDF_MAGIC, "missing %PDF- header");
}

Deno.test("canonical PDF: heading hierarchy (h1/h2/h3)", async () => {
  const bytes = await renderPDF([
    {
      chapter_number: 1,
      title: "Headings",
      content: [
        "# Top-Level Heading",
        "",
        "Intro paragraph.",
        "",
        "## Second Level",
        "",
        "More text under H2.",
        "",
        "### Third Level",
        "",
        "Deepest section paragraph.",
      ].join("\n"),
    },
  ]);
  assertValidPDF(bytes);
});

Deno.test("canonical PDF: nested ordered + unordered lists", async () => {
  const bytes = await renderPDF([
    {
      chapter_number: 1,
      title: "Lists",
      content: [
        "Unordered:",
        "",
        "- Alpha",
        "- Beta",
        "- Gamma with longer descriptive text that should wrap nicely",
        "",
        "Ordered:",
        "",
        "1. First step",
        "2. Second step",
        "3. Third step",
        "",
        "Indented continuation:",
        "",
        "- Outer item",
        "  - Inner-style item rendered as plain text",
        "  - Another nested-style item",
      ].join("\n"),
    },
  ]);
  assertValidPDF(bytes);
});

Deno.test("canonical PDF: markdown table renders", async () => {
  const bytes = await renderPDF([
    {
      chapter_number: 1,
      title: "Table",
      content: [
        "Comparison:",
        "",
        "| Name  | Score | Notes        |",
        "| ----- | ----- | ------------ |",
        "| Alice | 92    | Strong start |",
        "| Bob   | 87    | Improving    |",
        "| Carol | 95    | Top scorer   |",
        "",
        "Trailing paragraph.",
      ].join("\n"),
    },
  ]);
  assertValidPDF(bytes);
});

Deno.test("canonical PDF: wide code block does not crash", async () => {
  const longLine = "const veryLongIdentifier = " + "x".repeat(220) + ";";
  const bytes = await renderPDF([
    {
      chapter_number: 1,
      title: "Code",
      content: [
        "Example:",
        "",
        "```ts",
        "function demo() {",
        `  ${longLine}`,
        "  return veryLongIdentifier;",
        "}",
        "```",
        "",
        "After code.",
      ].join("\n"),
    },
  ]);
  assertValidPDF(bytes);
});

Deno.test("canonical PDF: long chapter forces page breaks and grows", async () => {
  const shortBytes = await renderPDF([
    { chapter_number: 1, title: "Short", content: "Just a single short paragraph." },
  ]);
  const para = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(20);
  const longContent = Array.from({ length: 40 }, (_, i) => `Paragraph ${i + 1}. ${para}`).join("\n\n");
  const longBytes = await renderPDF([
    { chapter_number: 1, title: "Long Chapter", content: longContent },
  ]);
  assertValidPDF(shortBytes);
  assertValidPDF(longBytes, MIN_PDF_BYTES * 2);
  assert(
    longBytes.byteLength > shortBytes.byteLength,
    `long PDF (${longBytes.byteLength}) should exceed short PDF (${shortBytes.byteLength})`,
  );
});

Deno.test("canonical PDF: mixed image / quote / reference content", async () => {
  // Use a tiny remote-style URL that the renderer should skip gracefully
  // (the canonical PDF path should not crash on un-fetchable images).
  const bytes = await renderPDF([
    {
      chapter_number: 1,
      title: "Mixed",
      content: [
        "Intro paragraph with **bold** and *italic*.",
        "",
        "![Alt text](https://example.invalid/missing.png)",
        "",
        "> A blockquote that should render as a callout-style block",
        "> spanning multiple lines for good measure.",
        "",
        "Body continues after the quote.",
        "",
        "## References",
        "",
        "[^1]: Smith, J. (2024). Example Work. Example Press.",
        "[^2]: Doe, A. (2023). Another Source. Sample Journal.",
      ].join("\n"),
    },
  ]);
  assertValidPDF(bytes);
});

Deno.test("canonical PDF: malformed/unsupported content does not crash", async () => {
  const bytes = await renderPDF([
    {
      chapter_number: 1,
      title: "Malformed",
      content: [
        "Unterminated code fence:",
        "",
        "```js",
        "const x = 1;",
        // no closing fence
        "",
        "| broken | table",
        "| --- |",
        "| only one col | extra | cells |",
        "",
        "Random control chars: \u0000\u0001\uFFFD inline.",
        "",
        "![](   )",
        "",
        "Trailing paragraph still renders.",
      ].join("\n"),
    },
  ]);
  // Renderer must complete without throwing; output must still be a valid PDF.
  assertValidPDF(bytes);
});

Deno.test("canonical PDF: preserves required Unicode fixture and Hebrew across styles", async () => {
  const bytes = await renderPDF([
    {
      chapter_number: 1,
      title: "Unicode",
      content: [
        "Required Unicode: ɛ ɔ α β ∑ ∫ ≤ ≥ — שלום.",
        "",
        "**Bold ɛ α ∑** and *italic ɔ β שלום*.",
        "",
        "```txt",
        "ɛ ɔ α β ∑ ∫ ≤ ≥",
        "```",
      ].join("\n"),
    },
  ]);
  assertValidPDF(bytes, 5_000);
});

Deno.test("canonical PDF: unsupported glyph fails loudly instead of disappearing", async () => {
  let caught: unknown = null;
  try {
    await renderPDF([
      {
        chapter_number: 1,
        title: "Unsupported",
        content: "This unsupported glyph must not disappear: 漢",
      },
    ]);
  } catch (error) {
    caught = error;
  }

  assert(caught instanceof Error, "unsupported glyph should reject the PDF export");
  assertEquals((caught as Error & { code?: string }).code, "PDF_UNSUPPORTED_GLYPH");
  assert(caught.message.includes("U+6F22"), `expected U+6F22 in error, got: ${caught.message}`);
});

const KDP_UNICODE_PRINT_FIXTURE = "Akan ɛ ɔ · Greek α β · Math ∑ ∫ ≤ ≥ · Hebrew שלום";
const KDP_UNICODE_CODE_FIXTURE = "ɛ ɔ α β ∑ ∫ ≤ ≥";

async function renderKdpInteriorForTest(content: string) {
  return await generateKDPPDF(
    makeBook({ title: `KDP ${KDP_UNICODE_PRINT_FIXTURE}` }),
    [{ chapter_number: 1, title: `Chapter ${KDP_UNICODE_PRINT_FIXTURE}`, content }],
    `Author ${KDP_UNICODE_PRINT_FIXTURE}`,
    "TEST-KDP-0001",
    false,
    2026,
    null,
    false,
    "APA",
    [],
    { width: 432, height: 648, name: '6" × 9"' },
    false,
    ctx,
  );
}

Deno.test("KDP interior PDF: preserves required Unicode fixture and Hebrew", async () => {
  const bytes = await renderKdpInteriorForTest([
    KDP_UNICODE_PRINT_FIXTURE,
    "",
    `**Bold ${KDP_UNICODE_PRINT_FIXTURE}** and *italic ${KDP_UNICODE_PRINT_FIXTURE}*.`,
    "",
    "```text",
    KDP_UNICODE_CODE_FIXTURE,
    "```",
  ].join("\n"));
  assertValidPDF(bytes, 5_000);
});

Deno.test("KDP interior PDF: unsupported glyph fails loudly with exact codepoint", async () => {
  let caught: unknown = null;
  try {
    await renderKdpInteriorForTest("This unsupported glyph must not disappear: 漢");
  } catch (error) {
    caught = error;
  }
  assert(caught instanceof Error, "unsupported KDP glyph should reject the PDF export");
  assertEquals((caught as Error & { code?: string }).code, "PDF_UNSUPPORTED_GLYPH");
  assert(caught.message.includes("U+6F22"), `expected U+6F22 in error, got: ${caught.message}`);
});

// =====================================================================
// Canonical DOCX renderer tests
// =====================================================================
import { generateCanonicalDOCX } from "./index.ts";

const MIN_DOCX_BYTES = 1500;

async function renderDOCX(chapters: { chapter_number: number; title: string; content: string }[]) {
  const book = makeBook();
  const buf = await generateCanonicalDOCX(
    book,
    chapters,
    "Test Author",
    "TEST-ID-0001",
    false,
    2026,
    null,
    false,
    "APA",
    [],
    ctx,
  );
  return new Uint8Array(buf);
}

function assertValidDOCX(bytes: Uint8Array, minLen = MIN_DOCX_BYTES) {
  assert(bytes instanceof Uint8Array, "expected Uint8Array");
  assert(bytes.byteLength > minLen, `DOCX too small: ${bytes.byteLength} bytes`);
  // .docx is a zip; magic bytes "PK\x03\x04"
  assertEquals(bytes[0], 0x50);
  assertEquals(bytes[1], 0x4b);
}

Deno.test("canonical DOCX: heading hierarchy (h1/h2/h3)", async () => {
  const bytes = await renderDOCX([
    {
      chapter_number: 1,
      title: "Headings",
      content: [
        "# Top-Level Heading",
        "",
        "Intro paragraph.",
        "",
        "## Second Level",
        "",
        "More text under H2.",
        "",
        "### Third Level",
        "",
        "Deepest section paragraph.",
      ].join("\n"),
    },
  ]);
  assertValidDOCX(bytes);
});

Deno.test("canonical DOCX: nested ordered + unordered lists", async () => {
  const bytes = await renderDOCX([
    {
      chapter_number: 1,
      title: "Lists",
      content: [
        "Unordered:",
        "",
        "- Alpha",
        "- Beta with **bold** text",
        "- Gamma",
        "",
        "Ordered:",
        "",
        "1. First step",
        "2. Second step",
        "3. Third step",
      ].join("\n"),
    },
  ]);
  assertValidDOCX(bytes);
});

Deno.test("canonical DOCX: markdown table renders", async () => {
  const bytes = await renderDOCX([
    {
      chapter_number: 1,
      title: "Table",
      content: [
        "Comparison:",
        "",
        "| Name  | Score | Notes        |",
        "| ----- | ----- | ------------ |",
        "| Alice | 92    | Strong start |",
        "| Bob   | 87    | Improving    |",
        "| Carol | 95    | Top scorer   |",
        "",
        "Trailing paragraph.",
      ].join("\n"),
    },
  ]);
  assertValidDOCX(bytes);
});

Deno.test("canonical DOCX: wide code block does not crash", async () => {
  const longLine = "const x = " + "y".repeat(220) + ";";
  const bytes = await renderDOCX([
    {
      chapter_number: 1,
      title: "Code",
      content: ["Example:", "", "```ts", "function demo() {", `  ${longLine}`, "}", "```", "", "After."].join("\n"),
    },
  ]);
  assertValidDOCX(bytes);
});

Deno.test("canonical DOCX: long chapter grows file size", async () => {
  const shortBytes = await renderDOCX([
    { chapter_number: 1, title: "Short", content: "Just one short paragraph." },
  ]);
  const para = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(20);
  const longContent = Array.from({ length: 40 }, (_, i) => `Paragraph ${i + 1}. ${para}`).join("\n\n");
  const longBytes = await renderDOCX([{ chapter_number: 1, title: "Long", content: longContent }]);
  assertValidDOCX(shortBytes);
  assertValidDOCX(longBytes, MIN_DOCX_BYTES * 2);
  assert(longBytes.byteLength > shortBytes.byteLength);
});

Deno.test("canonical DOCX: mixed image / quote / reference content", async () => {
  const bytes = await renderDOCX([
    {
      chapter_number: 1,
      title: "Mixed",
      content: [
        "Intro paragraph with **bold** and *italic*.",
        "",
        "![Alt text](https://example.invalid/missing.png)",
        "",
        "> A blockquote that should render as a styled block",
        "> spanning multiple lines.",
        "",
        "Body continues after the quote.",
        "",
        "## References",
        "",
        "[^1]: Smith, J. (2024). Example Work. Example Press.",
        "[^2]: Doe, A. (2023). Another Source. Sample Journal.",
      ].join("\n"),
    },
  ]);
  assertValidDOCX(bytes);
});

Deno.test("canonical DOCX: malformed/unsupported content does not crash", async () => {
  const bytes = await renderDOCX([
    {
      chapter_number: 1,
      title: "Malformed",
      content: [
        "Unterminated code fence:",
        "",
        "```js",
        "const x = 1;",
        "",
        "| broken | table",
        "| --- |",
        "| only one col | extra | cells |",
        "",
        "Random control chars: \u0000\u0001\uFFFD inline.",
        "",
        "![](   )",
        "",
        "Trailing paragraph still renders.",
      ].join("\n"),
    },
  ]);
  assertValidDOCX(bytes);
});

// =====================================================================
// Canonical EPUB renderer tests
// =====================================================================
import { generateCanonicalEPUB } from "./index.ts";

const MIN_EPUB_BYTES = 1500;

async function renderEPUB(chapters: { chapter_number: number; title: string; content: string }[]) {
  const book = makeBook();
  const buf = await generateCanonicalEPUB(
    book,
    chapters,
    "Test Author",
    "TEST-ID-0001",
    false,
    2026,
    null,
    false,
    "APA",
    [],
    ctx,
  );
  return new Uint8Array(buf);
}

function assertValidEPUB(bytes: Uint8Array, minLen = MIN_EPUB_BYTES) {
  assert(bytes instanceof Uint8Array, "expected Uint8Array");
  assert(bytes.byteLength > minLen, `EPUB too small: ${bytes.byteLength} bytes`);
  // .epub is a zip; magic bytes "PK\x03\x04"
  assertEquals(bytes[0], 0x50);
  assertEquals(bytes[1], 0x4b);
}

// Read a few central-directory file names out of the zip without a real
// unzip lib: scan for the "PK\x01\x02" central directory header and pull
// the filename that follows the 46-byte fixed record.
function listZipEntries(bytes: Uint8Array): string[] {
  const names: string[] = [];
  const dec = new TextDecoder();
  for (let i = 0; i < bytes.length - 4; i++) {
    if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 0x01 && bytes[i + 3] === 0x02) {
      const nameLen = bytes[i + 28] | (bytes[i + 29] << 8);
      const start = i + 46;
      if (start + nameLen <= bytes.length) {
        names.push(dec.decode(bytes.subarray(start, start + nameLen)));
      }
      i += 46 + nameLen - 1;
    }
  }
  return names;
}

Deno.test("canonical EPUB: heading hierarchy (h1/h2/h3)", async () => {
  const bytes = await renderEPUB([
    {
      chapter_number: 1,
      title: "Headings",
      content: [
        "# Top-Level Heading",
        "",
        "Intro paragraph.",
        "",
        "## Second Level",
        "",
        "More text under H2.",
        "",
        "### Third Level",
        "",
        "Deepest section paragraph.",
      ].join("\n"),
    },
  ]);
  assertValidEPUB(bytes);
});

Deno.test("canonical EPUB: nested ordered + unordered lists", async () => {
  const bytes = await renderEPUB([
    {
      chapter_number: 1,
      title: "Lists",
      content: [
        "Unordered:",
        "",
        "- Alpha",
        "- Beta with **bold** text",
        "- Gamma",
        "",
        "Ordered:",
        "",
        "1. First step",
        "2. Second step",
        "3. Third step",
      ].join("\n"),
    },
  ]);
  assertValidEPUB(bytes);
});

Deno.test("canonical EPUB: markdown table renders", async () => {
  const bytes = await renderEPUB([
    {
      chapter_number: 1,
      title: "Table",
      content: [
        "Comparison:",
        "",
        "| Name  | Score | Notes        |",
        "| ----- | ----- | ------------ |",
        "| Alice | 92    | Strong start |",
        "| Bob   | 87    | Improving    |",
        "| Carol | 95    | Top scorer   |",
        "",
        "Trailing paragraph.",
      ].join("\n"),
    },
  ]);
  assertValidEPUB(bytes);
});

Deno.test("canonical EPUB: wide code block does not crash", async () => {
  const longLine = "const x = " + "y".repeat(220) + ";";
  const bytes = await renderEPUB([
    {
      chapter_number: 1,
      title: "Code",
      content: ["Example:", "", "```ts", "function demo() {", `  ${longLine}`, "}", "```", "", "After."].join("\n"),
    },
  ]);
  assertValidEPUB(bytes);
});

Deno.test("canonical EPUB: long chapter grows file size", async () => {
  const shortBytes = await renderEPUB([
    { chapter_number: 1, title: "Short", content: "Just one short paragraph." },
  ]);
  const para = "Lorem ipsum dolor sit amet, consectetur adipiscing elit. ".repeat(20);
  const longContent = Array.from({ length: 40 }, (_, i) => `Paragraph ${i + 1}. ${para}`).join("\n\n");
  const longBytes = await renderEPUB([{ chapter_number: 1, title: "Long", content: longContent }]);
  assertValidEPUB(shortBytes);
  assertValidEPUB(longBytes, MIN_EPUB_BYTES * 2);
  assert(longBytes.byteLength > shortBytes.byteLength);
});

Deno.test("canonical EPUB: mixed image / quote / reference content", async () => {
  const bytes = await renderEPUB([
    {
      chapter_number: 1,
      title: "Mixed",
      content: [
        "Intro paragraph with **bold** and *italic*.",
        "",
        "![Alt text](https://example.invalid/missing.png)",
        "",
        "> A blockquote that should render as a styled block",
        "> spanning multiple lines.",
        "",
        "Body continues after the quote.",
        "",
        "## References",
        "",
        "[^1]: Smith, J. (2024). Example Work. Example Press.",
        "[^2]: Doe, A. (2023). Another Source. Sample Journal.",
      ].join("\n"),
    },
  ]);
  assertValidEPUB(bytes);
});

Deno.test("canonical EPUB: malformed/unsupported content does not crash", async () => {
  const bytes = await renderEPUB([
    {
      chapter_number: 1,
      title: "Malformed",
      content: [
        "Unterminated code fence:",
        "",
        "```js",
        "const x = 1;",
        "",
        "| broken | table",
        "| --- |",
        "| only one col | extra | cells |",
        "",
        "Random control chars: \u0000\u0001\uFFFD inline.",
        "",
        "![](   )",
        "",
        "Trailing paragraph still renders.",
      ].join("\n"),
    },
  ]);
  assertValidEPUB(bytes);
});

Deno.test("canonical EPUB: zip contains OPF + nav + chapter files", async () => {
  const bytes = await renderEPUB([
    { chapter_number: 1, title: "One", content: "First chapter." },
    { chapter_number: 2, title: "Two", content: "Second chapter." },
  ]);
  assertValidEPUB(bytes);
  const names = listZipEntries(bytes);
  assert(names.includes("mimetype"), `missing mimetype; got: ${names.join(", ")}`);
  assert(names.includes("META-INF/container.xml"), "missing container.xml");
  assert(names.includes("OEBPS/content.opf"), "missing content.opf");
  assert(names.includes("OEBPS/nav.xhtml"), "missing nav.xhtml");
  assert(names.includes("OEBPS/chapter1.xhtml"), "missing chapter1.xhtml");
  assert(names.includes("OEBPS/chapter2.xhtml"), "missing chapter2.xhtml");
  assert(names.includes("OEBPS/title.xhtml"), "missing title.xhtml");
  assert(names.includes("OEBPS/about-author.xhtml"), "missing about-author.xhtml");
  assert(names.includes("OEBPS/style.css"), "missing style.css");
});
// Unicode contracts exercise the same exported functions used by the handler,
// including the legacy fallback and direct KDP paths.
import { PDFDocument, PDFDict, PDFName, PDFRawStream } from "https://esm.sh/pdf-lib@1.17.1";
import { UnsupportedPdfGlyphError } from "../_shared/pdf-unicode.ts";

const unicodeFixture = "ɛ ɔ α β ∑ ∫ ≤ ≥ — שלום";
const pdfPaths = ["canonical", "legacy", "kdp"] as const;

async function renderUnicodePath(path: typeof pdfPaths[number], content: string, title = unicodeFixture) {
  const args: Parameters<typeof generatePDF> = [makeBook({ title }), [{ chapter_number: 1, title: "Unicode chapter", content }],
    "Ɔsɛi", "TEST-ID-0001", false, 2026, null, false, "APA", [], ctx];
  if (path === "canonical") return generateCanonicalPDF(...args);
  if (path === "legacy") return generatePDF(...args);
  return generateKDPPDF(args[0], args[1], args[2], args[3], args[4], args[5], args[6], args[7], args[8], args[9],
    { width: 432, height: 648, name: "6x9" }, false, ctx);
}

async function assertEmbeddedFonts(bytes: Uint8Array, expectedWidth: number, expectedHeight: number) {
  const pdf = await PDFDocument.load(bytes);
  for (const page of pdf.getPages()) {
    assertEquals(page.getWidth(), expectedWidth);
    assertEquals(page.getHeight(), expectedHeight);
  }
  let descriptors = 0;
  let unicodeMaps = 0;
  for (const [, object] of pdf.context.enumerateIndirectObjects()) {
    if (!(object instanceof PDFDict)) continue;
    if (object.get(PDFName.of("Type"))?.toString() === "/FontDescriptor") {
      descriptors++;
      const stream = pdf.context.lookup(object.get(PDFName.of("FontFile2")));
      assert(stream instanceof PDFRawStream && stream.getContents().length > 100,
        "every font descriptor must contain an embedded TrueType program");
    }
    if (object.get(PDFName.of("Subtype"))?.toString() === "/Type0") {
      unicodeMaps++;
      assert(pdf.context.lookup(object.get(PDFName.of("ToUnicode"))) instanceof PDFRawStream,
        "Unicode fonts must carry a ToUnicode mapping");
    }
    assert(object.get(PDFName.of("Subtype"))?.toString() !== "/Type1", "standard unembedded fonts are forbidden");
  }
  assertEquals(descriptors, 5, "regular/bold/italic/bold-italic/mono must all be embedded");
  assertEquals(unicodeMaps, 5);
}

for (const path of pdfPaths) {
  Deno.test(`${path} PDF: required Unicode and all interior font styles are embedded`, async () => {
    const bytes = await renderUnicodePath(path, [
      unicodeFixture, "", "**Bold ɛ ɔ α β ∑ ∫ ≤ ≥**", "", "*Italic ɛ ɔ α β ∑ ∫ ≤ ≥*",
      "", "***Both ɛ ɔ α β ∑ ∫ ≤ ≥***", "", "```text", "ɛ ɔ α β ∑ ∫ ≤ ≥", "```",
      "", "| Letter | Symbol |", "| --- | --- |", "| ɛ | ∑ |", "| ɔ | ∫ |",
    ].join("\n"));
    assertValidPDF(bytes);
    await assertEmbeddedFonts(bytes, path === "kdp" ? 432 : 612, path === "kdp" ? 648 : 792);
  });

  for (const [label, content] of [
    ["paragraph", "Unsupported 漢 glyph."],
    ["styled paragraph", "**Unsupported 漢 glyph.**"],
    ["code", "```text\nUnsupported 漢\n```"],
    ["table", "| Name |\n| --- |\n| 漢 |"],
    ["caption", "![Unsupported 漢 caption](https://example.invalid/image.png)"],
  ]) {
    Deno.test(`${path} PDF: ${label} cannot hide unsupported U+6F22`, async () => {
      let caught: unknown;
      try { await renderUnicodePath(path, content, "Ordinary title"); }
      catch (error) { caught = error; }
      assert(caught instanceof UnsupportedPdfGlyphError);
      assertEquals(caught.code, "PDF_UNSUPPORTED_GLYPH");
      assert(caught.glyphs.some((glyph) => glyph.codePoint === 0x6F22));
      assert(caught.message.includes("U+6F22"));
    });
  }
}
