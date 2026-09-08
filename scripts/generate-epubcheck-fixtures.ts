import JSZip from "npm:jszip@3.10.1";
import { generateCanonicalEPUB } from "../supabase/functions/export-book/index.ts";
import { buildEpub } from "../supabase/functions/_shared/epub-builder.ts";

const outputDir = Deno.args[0] ?? ".tmp/epubcheck";
await Deno.mkdir(outputDir, { recursive: true });

const chapters = [
  {
    chapter_number: 1,
    title: "Introduction & Scope",
    content: [
      "# Why this matters",
      "",
      "A publication-ready EPUB must preserve **semantic structure**, Unicode, and safe links.",
      "",
      "## Core checks",
      "",
      "- Package metadata",
      "- Navigation",
      "- Spine order",
      "- XHTML validity",
      "",
      "> Validation should fail closed on conformance errors.",
      "",
      "See [W3C Publishing](" + "https://www.w3.org/publishing/" + ") for the standards context.",
    ].join("\n"),
  },
  {
    chapter_number: 2,
    title: "Technical Examples",
    content: [
      "## Ordered workflow",
      "",
      "1. Normalize manuscript content.",
      "2. Render the EPUB archive.",
      "3. Validate the exact bytes.",
      "",
      "```ts",
      "const status = errors.length === 0 ? 'ready' : 'blocked';",
      "console.log(status);",
      "```",
      "",
      "Characters: café — naïve — © 2026.",
    ].join("\n"),
  },
];

const book = {
  id: "00000000-0000-4000-8000-000000000001",
  title: "ScrollLibrary EPUBCheck Fixture",
  description: "A deterministic non-production fixture used only for EPUB conformance validation.",
  category: "technology",
  book_type: "non_fiction",
  cover_image_url: null,
};

const exportContext = {
  pub: {
    transparency_mode: "invisible" as const,
    show_scrolllibrary_branding: false,
    show_ai_assistance_notice: false,
    show_powered_by: false,
    publisher_name: "ScrollLibrary Test Publisher",
    publisher_imprint: null,
    sanitize_metadata: true,
    confidential_mode: false,
  },
  showAINotice: false,
  showAILongDisclosure: false,
  showBranding: false,
  showPoweredBy: false,
  effectivePublisher: "ScrollLibrary Test Publisher",
  sanitizeMeta: true,
};

const canonical = new Uint8Array(await generateCanonicalEPUB(
  { ...book },
  chapters,
  "ScrollLibrary Test Author",
  "TEST-ID-EPUB-CI",
  false,
  2026,
  null,
  false,
  "APA",
  [],
  exportContext,
));
await Deno.writeFile(`${outputDir}/canonical-export.epub`, canonical);

const bundle = await buildEpub(JSZip as any, {
  book: { ...book, subtitle: "Official validator fixture" } as any,
  listing: {
    subtitle: "Official validator fixture",
    blurb: "ScrollLibrary CI fixture.",
    amazon_description: "ScrollLibrary CI fixture for official EPUBCheck validation.",
  } as any,
  author: { display_name: "ScrollLibrary Test Author" } as any,
  chapters: chapters as any,
  coverBytes: null,
  coverMime: null,
  language: "en",
  generatedAt: "2026-09-08T00:00:00.000Z",
  isbn: null,
  subjects: ["EPUB", "Publishing", "Validation"],
  aiAssistanceLevel: "assisted",
});
await Deno.writeFile(`${outputDir}/distribution-bundle.epub`, bundle);

for (const [name, bytes] of [["canonical-export.epub", canonical], ["distribution-bundle.epub", bundle]] as const) {
  if (bytes.byteLength < 1000) throw new Error(`${name} unexpectedly small: ${bytes.byteLength} bytes`);
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 0x03 || bytes[3] !== 0x04) {
    throw new Error(`${name} is not a ZIP/EPUB archive`);
  }
  console.log(`${name}: ${bytes.byteLength} bytes`);
}

// export-book registers an Edge Function listener when imported. CI only needs
// the renderer exports, so terminate after fixture bytes have been persisted.
Deno.exit(0);
