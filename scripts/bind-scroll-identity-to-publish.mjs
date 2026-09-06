import { readFile, writeFile } from "node:fs/promises";

const path = "supabase/functions/publish-work/index.ts";
let source = await readFile(path, "utf8");

function replaceOnce(needle, replacement, label) {
  const first = source.indexOf(needle);
  if (first < 0) throw new Error(`${label}: expected source pattern not found`);
  if (source.indexOf(needle, first + needle.length) >= 0) throw new Error(`${label}: expected exactly one source pattern`);
  source = source.slice(0, first) + replacement + source.slice(first + needle.length);
}

replaceOnce(
  'import { runPublicationGuard } from "../_shared/layout/index.ts";\n',
  'import { runPublicationGuard } from "../_shared/layout/index.ts";\nimport { newScrollIdentifier } from "../_shared/scroll-identity.ts";\n',
  "scroll identity import",
);

replaceOnce(
  '      sc.from("works").select("id, title, original_language").eq("id", body.work_id).maybeSingle(),',
  '      sc.from("works").select("id, title, original_language, scroll_work_id").eq("id", body.work_id).maybeSingle(),',
  "work identifier select",
);

replaceOnce(
  '    if (!work) return json({ error: "work_not_found" }, 404);\n    if (!book?.id) return json({ error: "publication_blocked", reason: "book_record_required" }, 409);\n',
  '    if (!work) return json({ error: "work_not_found" }, 404);\n    if (!book?.id) return json({ error: "publication_blocked", reason: "book_record_required" }, 409);\n    if (typeof work.scroll_work_id !== "string" || !work.scroll_work_id.startsWith("SLW-")) {\n      return json({ error: "publication_blocked", reason: "scroll_work_identity_required" }, 409);\n    }\n    const scrollEditionId = newScrollIdentifier("SLE");\n',
  "work identity guard",
);

replaceOnce(
  '    const snapshot = {\n      title: work.title,\n',
  '    const snapshot = {\n      scroll_work_id: work.scroll_work_id,\n      scroll_edition_id: scrollEditionId,\n      title: work.title,\n',
  "snapshot scroll identifiers",
);

replaceOnce(
  '      .insert({\n        work_id: body.work_id,\n        edition_kind: body.edition_kind,',
  '      .insert({\n        work_id: body.work_id,\n        book_id: book.id,\n        scroll_edition_id: scrollEditionId,\n        edition_kind: body.edition_kind,',
  "publication book and edition identity",
);

replaceOnce(
  '      .select("id, version, content_hash")\n      .single();',
  '      .select("id, version, content_hash, scroll_edition_id")\n      .single();',
  "publication identity return",
);

replaceOnce(
  '    if (lockErr) return serverError(lockErr);\n\n    const { data: cert, error: certErr } = await sc',
  '    if (lockErr) return serverError(lockErr);\n\n    // Materialize the proprietary SLW → SLE → SLP graph only after ISBN\n    // assignments have been locked to this publication. This mapping never\n    // creates or substitutes an ISBN; it links external identifiers to SLP.\n    const { data: scrollIdentity, error: scrollIdentityErr } = await sc.rpc(\n      "materialize_scroll_publication_identity",\n      { p_publication_id: pub.id },\n    );\n    if (scrollIdentityErr) return serverError(scrollIdentityErr);\n\n    const { data: cert, error: certErr } = await sc',
  "product identity materialization",
);

replaceOnce(
  '        identifier_product_forms: identifiers.map((i) => i.product_form),\n',
  '        identifier_product_forms: identifiers.map((i) => i.product_form),\n        scroll_work_id: work.scroll_work_id,\n        scroll_edition_id: pub.scroll_edition_id,\n        scroll_products: scrollIdentity,\n',
  "identity audit metadata",
);

replaceOnce(
  '      publisher: publisherSnapshot,\n      identifiers,\n',
  '      publisher: publisherSnapshot,\n      scroll_identity: scrollIdentity,\n      identifiers,\n',
  "identity API response",
);

await writeFile(path, source);
console.log("Scroll identity bound to publish-work.");
