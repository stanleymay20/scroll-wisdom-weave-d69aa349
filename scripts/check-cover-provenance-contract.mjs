import { readFileSync } from "node:fs";

const generated = readFileSync("supabase/functions/generate-cover/index.ts", "utf8");
const custom = readFileSync("supabase/functions/register-custom-cover/index.ts", "utf8");
const header = readFileSync("src/components/books/BookDetailHeader.tsx", "utf8");
const detail = readFileSync("src/pages/BookDetail.tsx", "utf8");
const integrity = readFileSync(
  "drizzle/migrations/0013_converge_certified_publication_manuscript_integrity.sql",
  "utf8",
);

const failures = [];

function requireText(source, needle, label) {
  if (!source.includes(needle)) failures.push(label + " is missing");
}

function requireBefore(source, first, second, label) {
  const a = source.indexOf(first);
  const b = source.indexOf(second);
  if (a < 0 || b < 0 || a >= b) failures.push(label + " is not fail-fast");
}

requireText(generated, '.from("book_asset_provenance")', "generated cover provenance write");
requireText(generated, 'rights_basis: "platform_generated_output"', "generated cover rights basis");
requireText(generated, '.from(COVER_BUCKET)\n    .upload', "generated cover storage materialization");
requireText(generated, 'error: "CERTIFIED_PUBLICATION_IMMUTABLE"', "generated certified-cover guard");
requireBefore(
  generated,
  "if (ownership.certified)",
  "const generated = await invokeRawGenerator",
  "generated cover certified check before provider call",
);

requireText(custom, "confirmPublicationRights: z.literal(true)", "custom cover explicit rights contract");
requireText(custom, "isOwnedCoverStorageUrl", "custom cover owned-storage validation");
requireText(custom, '.from("book_asset_provenance")', "custom cover provenance write");
requireText(custom, 'rights_basis: "user_attested_publication_rights"', "custom cover rights basis");
requireText(custom, 'error: "CERTIFIED_PUBLICATION_IMMUTABLE"', "custom certified-cover guard");
requireBefore(
  custom,
  "if (book.current_publication_id != null)",
  "const inspected = await inspectStoredCover",
  "custom cover certified check before storage inspection/provenance",
);

requireText(
  header,
  "isOwner && !book.current_publication_id",
  "desktop certified cover mutation suppression",
);
requireText(
  detail,
  "isMobile && isOwner && !book.current_publication_id",
  "mobile certified cover mutation suppression",
);

requireText(
  integrity,
  "COALESCE(b.cover_image_url,'')",
  "cover URL in certified publication hash",
);
requireText(
  integrity,
  "FROM public.book_asset_provenance p",
  "cover provenance in certified publication hash",
);
requireText(
  integrity,
  "AND p.asset_url = COALESCE(b.cover_image_url,'')",
  "hash binds only the active cover provenance",
);
requireText(
  integrity,
  "OR NEW.cover_image_url IS DISTINCT FROM OLD.cover_image_url",
  "certified cover immutability trigger",
);

if (failures.length) {
  console.error("Cover provenance/certified immutability contract failed:");
  for (const failure of failures) console.error("  - " + failure);
  process.exit(1);
}

console.log("Cover provenance/certified immutability contract: PASS");
