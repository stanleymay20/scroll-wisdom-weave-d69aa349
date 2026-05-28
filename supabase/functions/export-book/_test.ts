/**
 * Canonical PDF renderer tests.
 *
 * Covers the new `generateCanonicalPDF` path used by paid publishing exports.
 * Does NOT exercise DOCX / EPUB / KDP renderers.
 *
 * Run: deno test --allow-net --allow-env --allow-read supabase/functions/export-book/_test.ts
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { generateCanonicalPDF } from "./index.ts";

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
