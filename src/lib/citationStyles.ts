// Phase 2.1 — Client-side citation formatter (mirror of edge module).
import type { CitationStyle } from "./publisherDesign";

export interface CitationAuthor {
  family?: string;
  given?: string;
  literal?: string;
  orcid?: string;
}

export interface CitationRecord {
  id: string;
  citation_key: string;
  source_type: string;
  citation_text?: string | null;
  authors?: CitationAuthor[] | null;
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
  author?: string | null;
  notes?: string | null;
  confidence?: string | null;
}

function year(r: CitationRecord): string {
  const m = (r.publication_date ?? "").match(/\d{4}/);
  return m ? m[0] : "n.d.";
}

function normalize(r: CitationRecord): CitationAuthor[] {
  if (Array.isArray(r.authors) && r.authors.length > 0) return r.authors;
  if (r.author) {
    return r.author.split(/[;,]/).map((raw) => {
      const parts = raw.trim().split(/\s+/);
      if (parts.length === 1) return { literal: parts[0] };
      const family = parts.pop()!;
      return { family, given: parts.join(" ") };
    });
  }
  return [{ literal: "Unknown" }];
}

function fmtAPA(authors: CitationAuthor[]): string {
  const out = authors.map((a) => {
    if (a.literal) return a.literal;
    const init = (a.given ?? "").split(/\s+/).filter(Boolean).map((g) => g[0].toUpperCase() + ".").join(" ");
    return [a.family, init].filter(Boolean).join(", ");
  });
  if (out.length <= 1) return out[0] ?? "";
  if (out.length === 2) return `${out[0]} & ${out[1]}`;
  return `${out.slice(0, -1).join(", ")}, & ${out[out.length - 1]}`;
}

function trailing(r: CitationRecord): string {
  if (r.doi) return ` https://doi.org/${r.doi}`;
  if (r.url) return ` ${r.url}${r.accessed_at ? ` (accessed ${r.accessed_at})` : ""}`;
  return "";
}

export function formatCitation(r: CitationRecord, style: CitationStyle = "apa"): string {
  const a = normalize(r);
  const yr = year(r);
  const title = (r.citation_text ?? "Untitled source").trim();
  const container = r.container_title ?? r.publisher ?? "";
  const vol = r.volume ? `, ${r.volume}` : "";
  const iss = r.issue ? `(${r.issue})` : "";
  const pp = r.pages ? `, ${r.pages}` : "";
  switch (style) {
    case "harvard":
      return `${fmtAPA(a).replace(" & ", " and ")} (${yr}) '${title}', ${container}${vol}${iss}${pp}.${trailing(r)}`.trim();
    case "chicago":
      return `${fmtAPA(a)}. ${yr}. "${title}." ${container}${vol}${iss}${pp}.${trailing(r)}`.trim();
    case "ieee":
      return `${a.map((x) => x.literal ?? `${(x.given ?? "").split(/\s+/).filter(Boolean).map((g) => g[0] + ".").join(" ")} ${x.family ?? ""}`).join(", ")}, "${title}," ${container}${vol}${iss}${pp}, ${yr}.${trailing(r)}`.trim();
    case "apa":
    default:
      return `${fmtAPA(a)} (${yr}). ${title}. ${container}${vol}${iss}${pp}.${trailing(r)}`.trim();
  }
}

export function sourceTypeLabel(t: string): string {
  return ({
    journal_article: "Journal article",
    book: "Book",
    government_report: "Government report",
    company_report: "Company report",
    white_paper: "White paper",
    news_article: "News article",
    standard: "Standard",
    regulation: "Regulation",
    website: "Website",
    dataset: "Dataset",
  } as Record<string, string>)[t] ?? "Source";
}
