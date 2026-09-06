import {
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
