import { generateCanonicalPDF, generatePDF, generateKDPPDF } from "../supabase/functions/export-book/index.ts";

// An integration fixture, not a real generated-book qualification or KDP
// Previewer acceptance. Keep that distinction in the archived evidence.
const ctx = {
  pub: {
    transparency_mode: "invisible" as const, show_scrolllibrary_branding: false,
    show_ai_assistance_notice: false, show_powered_by: false, publisher_name: null,
    publisher_imprint: null, sanitize_metadata: true, confidential_mode: false,
  },
  showAINotice: false, showAILongDisclosure: false, showBranding: false,
  showPoweredBy: false, effectivePublisher: "Fixture Publisher", sanitizeMeta: true,
};
const fixture = {
  id: "unicode-interior-v1", title: "Unicode Interior Evidence", category: "Nonfiction",
};
const chapters = [{
  chapter_number: 1, title: "Languages and notation",
  content: [
    "Regular: ɛ ɔ α β ∑ ∫ ≤ ≥. Hebrew: שלום. Mixed: English שלום English.", "",
    "**Bold: ɛ ɔ α β ∑ ∫ ≤ ≥.**", "",
    "*Italic: ɛ ɔ α β ∑ ∫ ≤ ≥.*", "",
    "***Both: ɛ ɔ α β ∑ ∫ ≤ ≥.***", "",
    "```text", "Mono: ɛ ɔ α β ∑ ∫ ≤ ≥", "```", "",
    "| Letter | Symbol |", "| --- | --- |", "| ɛ | ∑ |", "| ɔ | ∫ |", "",
    "> A quoted passage with ɛ ɔ α β ∑ ∫ ≤ ≥.", "",
    "| LeftSlot | MiddleSlot | RightSlot |", "| --- | --- | --- |",
    "| LeftMarker | | RightMarker |", "| | MiddleMarker | |", "",
    "| HeadLeft | | HeadRight |", "| --- | --- | --- |",
    "| BlankHeaderLeft | | BlankHeaderRight |",
  ].join("\n"),
}, {
  chapter_number: 2, title: "Pagination contract",
  content: Array.from({ length: 30 }, (_, i) =>
    `Paragraph ${i + 1}. ` + "This manuscript fixture exercises wrapping and page transitions with ɛ and ɔ. ".repeat(12)
  ).join("\n\n"),
}];

try {
  const output = Deno.args[0];
  if (!output) throw new Error("Usage: render-unicode-interior-evidence.ts OUTPUT_DIRECTORY");
  await Deno.mkdir(output, { recursive: true });
  const args: Parameters<typeof generatePDF> = [fixture, chapters, "Ɔsɛi", "FIXTURE-UNICODE-V1", false, 2026, null, false, "APA", [], ctx];
  const files = [
    ["canonical", await generateCanonicalPDF(...args)],
    ["legacy", await generatePDF(...args)],
    ["kdp", await generateKDPPDF(fixture, chapters, "Ɔsɛi", "FIXTURE-UNICODE-V1", false, 2026, null, false,
      "APA", [], { width: 432, height: 648, name: "6x9" }, false, ctx)],
  ] as const;
  const manifest: Record<string, unknown> = { fixture_id: fixture.id, qualification: "integration-only", files: {} };
  for (const [name, bytes] of files) {
    await Deno.writeFile(`${output}/${name}.pdf`, bytes);
    const digest = await crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
    (manifest.files as Record<string, unknown>)[name] = {
      bytes: bytes.length,
      sha256: Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join(""),
    };
  }
  await Deno.writeTextFile(`${output}/manifest.json`, JSON.stringify(manifest, null, 2) + "\n");
  // The production entry starts its server on import. Evidence never invokes
  // that handler or connects to Supabase; stop it after local rendering.
  Deno.exit(0);
} catch (error) {
  console.error(error);
  Deno.exit(1);
}
