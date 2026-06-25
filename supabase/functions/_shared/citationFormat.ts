// Phase 2.1 — Citation formatting (APA / Chicago / Harvard / IEEE).
// Operates on the structured `book_citations` row shape.

export type CitationStyle = "apa" | "chicago" | "harvard" | "ieee";

export interface CitationAuthor {
  family?: string;
  given?: string;
  literal?: string; // org/agency name
  orcid?: string;
}

export interface CitationRecord {
  id: string;
  citation_key: string;
  source_type: string;
  citation_text?: string | null;
  authors: CitationAuthor[];
  publisher?: string | null;
  container_title?: string | null;
  volume?: string | null;
  issue?: string | null;
  pages?: string | null;
  doi?: string | null;
  isbn?: string | null;
  url?: string | null;
  accessed_at?: string | null;
  publication_date?: string | null;
  author?: string | null; // legacy
  notes?: string | null;
  confidence?: string | null;
}

function year(rec: CitationRecord): string {
  const d = rec.publication_date ?? "";
  const m = d.match(/\d{4}/);
  return m ? m[0] : "n.d.";
}

function normalizeAuthors(rec: CitationRecord): CitationAuthor[] {
  if (Array.isArray(rec.authors) && rec.authors.length > 0) return rec.authors;
  if (rec.author) {
    // Legacy single string — split on comma/semicolon.
    return rec.author.split(/[;,]/).map((raw) => {
      const parts = raw.trim().split(/\s+/);
      if (parts.length === 1) return { literal: parts[0] };
      const family = parts.pop()!;
      return { family, given: parts.join(" ") };
    });
  }
  return [{ literal: "Unknown" }];
}

function fmtAuthorsAPA(authors: CitationAuthor[]): string {
  const out = authors.map((a) => {
    if (a.literal) return a.literal;
    const initials = (a.given ?? "")
      .split(/\s+/)
      .filter(Boolean)
      .map((g) => g[0].toUpperCase() + ".")
      .join(" ");
    return [a.family, initials].filter(Boolean).join(", ");
  });
  if (out.length <= 1) return out[0] ?? "";
  if (out.length === 2) return `${out[0]} & ${out[1]}`;
  return `${out.slice(0, -1).join(", ")}, & ${out[out.length - 1]}`;
}

function fmtAuthorsHarvard(authors: CitationAuthor[]): string {
  return fmtAuthorsAPA(authors).replace(" & ", " and ");
}

function fmtAuthorsIEEE(authors: CitationAuthor[]): string {
  return authors
    .map((a) => {
      if (a.literal) return a.literal;
      const initials = (a.given ?? "")
        .split(/\s+/)
        .filter(Boolean)
        .map((g) => g[0].toUpperCase() + ".")
        .join(" ");
      return [initials, a.family].filter(Boolean).join(" ");
    })
    .join(", ");
}

function trailingUrl(rec: CitationRecord): string {
  if (rec.doi) return ` https://doi.org/${rec.doi}`;
  if (rec.url) {
    const acc = rec.accessed_at ? ` (accessed ${rec.accessed_at})` : "";
    return ` ${rec.url}${acc}`;
  }
  return "";
}

export function formatCitation(rec: CitationRecord, style: CitationStyle = "apa"): string {
  const authors = normalizeAuthors(rec);
  const yr = year(rec);
  const title = (rec.citation_text ?? "Untitled source").replace(/\s+/g, " ").trim();
  const container = rec.container_title ?? rec.publisher ?? "";
  const vol = rec.volume ? `, ${rec.volume}` : "";
  const iss = rec.issue ? `(${rec.issue})` : "";
  const pp = rec.pages ? `, ${rec.pages}` : "";

  switch (style) {
    case "harvard":
      return `${fmtAuthorsHarvard(authors)} (${yr}) '${title}', ${container}${vol}${iss}${pp}.${trailingUrl(rec)}`.trim();
    case "chicago":
      return `${fmtAuthorsAPA(authors)}. ${yr}. "${title}." ${container}${vol}${iss}${pp}.${trailingUrl(rec)}`.trim();
    case "ieee":
      return `${fmtAuthorsIEEE(authors)}, "${title}," ${container}${vol}${iss}${pp}, ${yr}.${trailingUrl(rec)}`.trim();
    case "apa":
    default:
      return `${fmtAuthorsAPA(authors)} (${yr}). ${title}. ${container}${vol}${iss}${pp}.${trailingUrl(rec)}`.trim();
  }
}

export function buildReferencesSection(
  records: CitationRecord[],
  style: CitationStyle = "apa",
): { heading: string; entries: { key: string; formatted: string }[] } {
  const sorted = [...records].sort((a, b) => {
    const an = normalizeAuthors(a)[0]?.family ?? normalizeAuthors(a)[0]?.literal ?? "";
    const bn = normalizeAuthors(b)[0]?.family ?? normalizeAuthors(b)[0]?.literal ?? "";
    return an.localeCompare(bn);
  });
  return {
    heading: "References",
    entries: sorted.map((r) => ({ key: r.citation_key, formatted: formatCitation(r, style) })),
  };
}
