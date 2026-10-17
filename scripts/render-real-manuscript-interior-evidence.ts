/**
 * Local real-manuscript KDP rendering from an operator-owned PRIVATE JSON file.
 * Reuses the existing PDF/KDP renderer, never queries live database or AI.
 * Do not commit private input or generated output.
 *
 * RELEASE_COMMIT_SHA=$(git rev-parse HEAD) deno run \
 * --config supabase/functions/deno.json --allow-net \
 * --allow-read=/private/book.json --allow-write=/private/kdp-qa \
 * --allow-env=RELEASE_COMMIT_SHA \
 * scripts/render-real-manuscript-interior-evidence.ts \
 * /private/book.json /private/kdp-qa
 *
 * Offline output is NOT proof of hosted function performance, print platform
 * acceptance or commercial GA. Imported export-book module starts HTTP server:
 * this script calls Deno.exit explicitly after rendering, as does the existing
 * synthetic Unicode renderer.
 */
import { generateCanonicalPDF, generatePDF, generateKDPPDF } from "../supabase/functions/export-book/index.ts";

type BookChapter = {
  chapter_number: number;
  title: string;
  content: string;
  is_generated: true;
};

function nonempty(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(name + "_REQUIRED");
  return value.trim();
}
async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function validateChapters(value: unknown): BookChapter[] {
  if (!Array.isArray(value) || value.length < 10) throw new Error("COMPLETE_REAL_BOOK_REQUIRED");
  const chapters = value as Partial<BookChapter>[];
  for (let i = 0; i < chapters.length; i++) {
    const chapter = chapters[i];
    if (chapter?.chapter_number !== i + 1 || chapter.is_generated !== true
      || typeof chapter.title !== "string" || !chapter.title.trim()
      || typeof chapter.content !== "string" || chapter.content.length < 500) {
      throw new Error("INCOMPLETE_GENERATED_CHAPTER_" + String(i + 1));
    }
  }
  if (chapters.reduce((sum, ch) => sum + (ch.content?.length ?? 0), 0) < 100_000) {
    throw new Error("REAL_BOOK_CONTENT_TOO_SHORT");
  }
  return chapters as BookChapter[];
}
function makeContext(author: string, publisher: string) {
  return {
    pub: {
      transparency_mode: "invisible" as const,
      show_scrolllibrary_branding: false,
      show_ai_assistance_notice: false,
      show_powered_by: false,
      publisher_name: publisher,
      publisher_imprint: null,
      sanitize_metadata: true,
      confidential_mode: false,
    },
    showAINotice: false,
    showAILongDisclosure: false,
    showBranding: false,
    showPoweredBy: false,
    effectivePublisher: publisher,
    sanitizeMeta: true,
  };
}

async function main() {
  const [input, directory] = Deno.args;
  if (!input || !directory) throw new Error("ARGUMENTS_REQUIRED");
  const exactSource = nonempty(Deno.env.get("RELEASE_COMMIT_SHA"), "RELEASE_COMMIT_SHA");
  if (!/^[0-9a-f]{40}$/.test(exactSource)) throw new Error("INVALID_RELEASE_SHA");

  const raw = await Deno.readFile(input);
  const source = JSON.parse(new TextDecoder().decode(raw));
  if (source.release_sha !== exactSource) throw new Error("SOURCE_AND_RENDERER_SHA_MISMATCH");
  const title = nonempty(source.title, "TITLE");
  const author = nonempty(source.author_name, "AUTHOR");
  const publisher = nonempty(source.publisher_name ?? author, "PUBLISHER");
  const chapters = validateChapters(source.chapters);
  const book = {
    id: nonempty(source.book_id, "BOOK_ID"), title,
    category: typeof source.category === "string" ? source.category : "Nonfiction",
  };
  const context = makeContext(author, publisher);
  const identifier = "PRIVATE-QA-NO-ISBN";
  const args: Parameters<typeof generatePDF> = [
    book, chapters, author, identifier, false, 2026, null, false, "APA", [], context,
  ];

  await Deno.mkdir(directory, { recursive: true });
  const manifest: Record<string, unknown> = {
    schema_version: 1,
    qualification: "LOCAL_REAL_BOOK_RENDER_ONLY_NOT_HOSTED_NOT_KDP_APPROVED",
    release_sha: exactSource,
    source_sha256: await sha256(raw),
    chapter_count: chapters.length,
    files: {},
    hosted_export_delivery: "NOT_VERIFIED",
    kdp_previewer: "PENDING",
    commercial_ga: "NO_GO",
  };
  const variant = chapters.length > 18 ? "legacy" : "canonical";
  const ordinaryStart = performance.now();
  const ordinary = variant === "legacy"
    ? await generatePDF(...args)
    : await generateCanonicalPDF(...args);
  const ordinaryMs = Math.round(performance.now() - ordinaryStart);
  const kdpStart = performance.now();
  const kdp = await generateKDPPDF(
    book, chapters, author, identifier, false, 2026, null, false,
    "APA", [], { width: 432, height: 648, name: "6x9" }, false, context,
  );
  const kdpMs = Math.round(performance.now() - kdpStart);
  const files = [["ordinary", ordinary, ordinaryMs], ["kdp", kdp, kdpMs]] as const;
  for (const [name, bytes, durationMs] of files) {
    await Deno.writeFile(directory + "/" + name + ".pdf", bytes);
    (manifest.files as Record<string, unknown>)[name] = {
      sha256: await sha256(bytes), byte_size: bytes.byteLength, duration_ms: durationMs,
      renderer: name === "ordinary" ? variant : "kdp-6x9-no-bleed",
    };
  }
  await Deno.writeTextFile(directory + "/offline-render-manifest.json",
    JSON.stringify(manifest, null, 2) + "\n");
  console.log(JSON.stringify({ outcome: "OFFLINE_RENDER_COMPLETE_NOT_GA",
    chapter_count: chapters.length, release_sha: exactSource, renderer: variant,
    files: Object.keys(manifest.files as object) }));
}

try {
  await main();
  Deno.exit(0);
} catch (error) {
  // Never log raw source content, book title, customer ID or local paths.
  const message = error instanceof Error ? error.message : "UNKNOWN_ERROR";
  const code = /^[A-Z_0-9]+$/.test(message) ? message : "LOCAL_RENDER_FAILED";
  console.error(JSON.stringify({ outcome: "FAILED", code, commercial_ga: "NO_GO" }));
  Deno.exit(1);
}
