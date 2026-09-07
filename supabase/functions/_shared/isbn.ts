export type PublicationProductForm = "paperback" | "hardcover" | "epub" | "pdf" | "audiobook";

export interface SnapshotIdentifier {
  scheme?: string;
  value?: string;
  product_form?: string;
  language?: string;
  edition_label?: string;
  source?: string;
}

export function normalizeIsbn13(value: string): string {
  return (value || "").replace(/[^0-9]/g, "");
}

export function isValidIsbn13(value: string): boolean {
  const isbn = normalizeIsbn13(value);
  if (!/^(978|979)\d{10}$/.test(isbn)) return false;
  let total = 0;
  for (let i = 0; i < 12; i += 1) {
    total += Number(isbn[i]) * (i % 2 === 0 ? 1 : 3);
  }
  return ((10 - (total % 10)) % 10) === Number(isbn[12]);
}

export function productFormForExport(format: string): PublicationProductForm | null {
  switch (format) {
    case "kdp-pdf":
      return "paperback";
    case "epub":
      return "epub";
    case "pdf":
      return "pdf";
    default:
      return null;
  }
}

export function identifierStrategyRequiresIsbn(strategy: unknown): boolean {
  return strategy === "own_isbn" || strategy === "platform_isbn";
}

export function isbnForPublicationSnapshot(
  snapshot: Record<string, unknown> | null | undefined,
  exportFormat: string,
): string | null {
  if (!snapshot) return null;
  const form = productFormForExport(exportFormat);
  const byFormat = snapshot.isbn_by_format;
  const hasByFormat = !!byFormat && typeof byFormat === "object" && !Array.isArray(byFormat);
  if (form && hasByFormat) {
    const candidate = (byFormat as Record<string, unknown>)[form];
    if (typeof candidate === "string" && isValidIsbn13(candidate)) return normalizeIsbn13(candidate);
  }

  const identifiers = Array.isArray(snapshot.identifiers)
    ? snapshot.identifiers as SnapshotIdentifier[]
    : [];
  if (form) {
    const match = identifiers.find((id) =>
      id?.scheme === "ISBN-13"
      && id.product_form === form
      && typeof id.value === "string"
      && isValidIsbn13(id.value)
    );
    if (match?.value) return normalizeIsbn13(match.value);
  }

  // A current format-aware snapshot must never fall back from paperback to a
  // hardcover compatibility ISBN. KDP's current print bundle is a paperback
  // product, so an own/platform ISBN strategy requires an explicit paperback
  // assignment. KDP-free remains intentionally null because Amazon allocates it.
  if (exportFormat === "kdp-pdf" && identifierStrategyRequiresIsbn(snapshot.print_identifier_strategy)) {
    throw new Error("KDP_PAPERBACK_ISBN_REQUIRED");
  }

  // Legacy compatibility is print-only and is permitted only for historical
  // snapshots that pre-date format-aware identifiers. This prevents a current
  // hardcover ISBN stored in the legacy compatibility field from leaking into a
  // paperback export.
  if (exportFormat === "kdp-pdf" && !hasByFormat && identifiers.length === 0) {
    const legacy = typeof snapshot.isbn_13 === "string"
      ? snapshot.isbn_13
      : typeof snapshot.isbn === "string" ? snapshot.isbn : null;
    if (legacy && isValidIsbn13(legacy)) return normalizeIsbn13(legacy);
  }
  return null;
}

export function publisherFromPublicationSnapshot(snapshot: Record<string, unknown> | null | undefined): {
  publisherName: string | null;
  imprintName: string | null;
  mode: string | null;
} {
  if (!snapshot) return { publisherName: null, imprintName: null, mode: null };
  const publisher = snapshot.publisher;
  if (publisher && typeof publisher === "object" && !Array.isArray(publisher)) {
    const row = publisher as Record<string, unknown>;
    return {
      publisherName: typeof row.publisher_name === "string" ? row.publisher_name : null,
      imprintName: typeof row.imprint_name === "string" ? row.imprint_name : null,
      mode: typeof row.mode === "string" ? row.mode : null,
    };
  }
  return {
    publisherName: typeof snapshot.publisher_name === "string" ? snapshot.publisher_name : null,
    imprintName: typeof snapshot.publisher_imprint === "string" ? snapshot.publisher_imprint : null,
    mode: null,
  };
}
