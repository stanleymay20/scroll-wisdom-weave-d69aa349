import {
  identifierStrategyRequiresIsbn,
  isValidIsbn13,
  isbnForPublicationSnapshot,
  normalizeIsbn13,
  productFormForExport,
  publisherFromPublicationSnapshot,
} from "./isbn.ts";

Deno.test("validates and normalizes ISBN-13", () => {
  if (normalizeIsbn13("978-0-306-40615-7") !== "9780306406157") throw new Error("normalization failed");
  if (!isValidIsbn13("978-0-306-40615-7")) throw new Error("known valid ISBN rejected");
  if (isValidIsbn13("9780306406158")) throw new Error("bad checksum accepted");
  if (isValidIsbn13("1234567890128")) throw new Error("non-ISBN prefix accepted");
});

Deno.test("maps export formats to separately sold product forms", () => {
  if (productFormForExport("kdp-pdf") !== "paperback") throw new Error("KDP mapping failed");
  if (productFormForExport("epub") !== "epub") throw new Error("EPUB mapping failed");
  if (productFormForExport("pdf") !== "pdf") throw new Error("PDF mapping failed");
  if (productFormForExport("docx") !== null) throw new Error("DOCX should not imply a public ISBN product");
});

Deno.test("recognizes strategies that require a real ISBN", () => {
  if (!identifierStrategyRequiresIsbn("own_isbn")) throw new Error("own ISBN strategy should require an ISBN");
  if (!identifierStrategyRequiresIsbn("platform_isbn")) throw new Error("platform ISBN strategy should require an ISBN");
  if (identifierStrategyRequiresIsbn("kdp_free")) throw new Error("KDP free ISBN is assigned by Amazon");
  if (identifierStrategyRequiresIsbn("unassigned")) throw new Error("unassigned must not require an ISBN");
});

Deno.test("never reuses a paperback ISBN for EPUB", () => {
  const snapshot = {
    isbn: "9780306406157",
    isbn_13: "9780306406157",
    isbn_by_format: { paperback: "9780306406157" },
    identifiers: [{ scheme: "ISBN-13", value: "9780306406157", product_form: "paperback" }],
  };
  if (isbnForPublicationSnapshot(snapshot, "kdp-pdf") !== "9780306406157") throw new Error("print ISBN missing");
  if (isbnForPublicationSnapshot(snapshot, "epub") !== null) throw new Error("print ISBN leaked into EPUB");
});

Deno.test("KDP paperback export never falls back to a hardcover ISBN", () => {
  const snapshot = {
    print_identifier_strategy: "own_isbn",
    isbn: "9780306406157",
    isbn_13: "9780306406157",
    isbn_by_format: { hardcover: "9780306406157" },
    identifiers: [{ scheme: "ISBN-13", value: "9780306406157", product_form: "hardcover" }],
  };
  let blocked = false;
  try {
    isbnForPublicationSnapshot(snapshot, "kdp-pdf");
  } catch (error) {
    blocked = error instanceof Error && error.message === "KDP_PAPERBACK_ISBN_REQUIRED";
  }
  if (!blocked) throw new Error("hardcover ISBN was allowed to satisfy a KDP paperback export");
});

Deno.test("KDP-free remains unassigned until Amazon supplies the ISBN", () => {
  const snapshot = {
    print_identifier_strategy: "kdp_free",
    isbn_by_format: {},
    identifiers: [],
  };
  if (isbnForPublicationSnapshot(snapshot, "kdp-pdf") !== null) throw new Error("KDP-free should not invent an ISBN");
});

Deno.test("legacy pre-format snapshots retain print-only compatibility", () => {
  const snapshot = { isbn_13: "9780306406157" };
  if (isbnForPublicationSnapshot(snapshot, "kdp-pdf") !== "9780306406157") throw new Error("legacy print ISBN compatibility broke");
  if (isbnForPublicationSnapshot(snapshot, "epub") !== null) throw new Error("legacy print ISBN leaked into EPUB");
});

Deno.test("selects explicit format ISBN and canonical publisher", () => {
  const snapshot = {
    isbn_by_format: {
      paperback: "9780306406157",
      epub: "9781861972712",
    },
    publisher: {
      publisher_name: "Example Publishing GmbH",
      imprint_name: "Example Press",
      mode: "own_imprint",
    },
  };
  if (isbnForPublicationSnapshot(snapshot, "epub") !== "9781861972712") throw new Error("EPUB ISBN not selected");
  const publisher = publisherFromPublicationSnapshot(snapshot);
  if (publisher.publisherName !== "Example Publishing GmbH" || publisher.imprintName !== "Example Press") {
    throw new Error("publisher snapshot resolution failed");
  }
});
