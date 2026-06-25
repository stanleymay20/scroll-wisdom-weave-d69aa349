// _shared/publicationSnapshot.ts
// Canonical resolver for Publication metadata.
//
// RULE: exporters and rendering pipelines MUST call resolvePublication()
// and use ONLY the returned snapshot. Client-supplied author, copyright,
// publisher, ISBN, pricing, and distribution fields are IGNORED.
//
// TODO(phase2): citation freezing, asset provenance manifest, plugin
// export provider registry, asymmetric publication signatures.

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export interface PublicationSnapshotAuthor {
  user_id: string | null;
  display_name: string;
  author_role: string;
  sort_order: number;
  contribution_percentage: number | null;
}

export interface PublicationSnapshotRightsHolder {
  id: string;
  display_name: string;
  holder_type: string;
  country_code: string | null;
}

export interface ResolvedPublication {
  id: string;
  work_id: string;
  book_id: string | null;
  version: string;
  status: string;
  integrity_level: string;
  content_hash: string | null;
  certificate_id: string | null;
  published_at: string | null;
  title: string;
  language: string;
  authors: PublicationSnapshotAuthor[];
  rights_holders: PublicationSnapshotRightsHolder[];
  snapshot: Record<string, unknown>;
  publish_locked: boolean;
}

/**
 * Strip any author/rights/publisher/pricing fields a client may have sent.
 * Use BEFORE handing the request payload to any downstream renderer.
 */
export function stripProtectedExportFields<T extends Record<string, unknown>>(payload: T): T {
  const forbidden = new Set([
    "author", "authors", "author_name", "author_names",
    "copyright", "copyright_holder", "copyright_holder_name",
    "publisher", "publisher_name",
    "isbn", "isbn_10", "isbn_13",
    "price", "pricing", "currency", "list_price",
    "distribution", "distribution_channels",
    "rights_holder", "rights_holders",
    "publication_version", "version",
    "content_hash", "signature_value", "certificate_id",
  ]);
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload ?? {})) {
    if (!forbidden.has(k)) clean[k] = v;
  }
  return clean as T;
}

export async function resolvePublication(
  sc: SupabaseClient,
  publicationId: string,
): Promise<ResolvedPublication | null> {
  const { data: pub } = await sc
    .from("publications")
    .select("id, work_id, version, status, integrity_level, content_hash, certificate_id, published_at, language, snapshot")
    .eq("id", publicationId)
    .maybeSingle();
  if (!pub) return null;

  const { data: work } = await sc
    .from("works")
    .select("id, title, publish_locked_at")
    .eq("id", pub.work_id)
    .maybeSingle();

  // Snapshot is the source of truth for authorship/rights at publication time.
  const snap = (pub.snapshot ?? {}) as Record<string, unknown>;
  const snapAuthors = Array.isArray(snap.authors) ? (snap.authors as PublicationSnapshotAuthor[]) : [];
  const snapHolders = Array.isArray(snap.rights_holders) ? (snap.rights_holders as PublicationSnapshotRightsHolder[]) : [];

  const { data: bookRow } = await sc
    .from("books")
    .select("id")
    .eq("current_publication_id", pub.id)
    .maybeSingle();

  return {
    id: pub.id,
    work_id: pub.work_id,
    book_id: bookRow?.id ?? null,
    version: pub.version,
    status: pub.status,
    integrity_level: pub.integrity_level,
    content_hash: pub.content_hash,
    certificate_id: pub.certificate_id,
    published_at: pub.published_at,
    title: (snap.title as string) ?? work?.title ?? "Untitled",
    language: pub.language ?? "en",
    authors: snapAuthors,
    rights_holders: snapHolders,
    snapshot: snap,
    publish_locked: !!work?.publish_locked_at,
  };
}
