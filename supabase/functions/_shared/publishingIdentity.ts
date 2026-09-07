type PublishingIdentityDb = { from: (table: string) => any };
import { isbnForPublicationSnapshot, publisherFromPublicationSnapshot } from "./isbn.ts";

interface AssignmentRow {
  id: string;
  isbn_id: string;
  product_form: string;
  language: string;
  edition_label: string;
  assigned_at: string;
}

interface InventoryRow {
  id: string;
  isbn13: string;
  source: string;
  imprint_id: string;
  provenance_status: string;
  provenance_reference: string | null;
}

export interface ResolvedPublishingIdentity {
  configured: boolean;
  publisherMode: string | null;
  publisherName: string | null;
  publisherImprint: string | null;
  editionLabel: string | null;
  language: string | null;
  printIdentifierStrategy: string | null;
  ebookIdentifierStrategy: string | null;
  distributionScope: string | null;
  isbnByFormat: Record<string, string>;
  isbnForExport: string | null;
  snapshot: Record<string, unknown>;
}

const emptyIdentity = (): ResolvedPublishingIdentity => ({
  configured: false,
  publisherMode: null,
  publisherName: null,
  publisherImprint: null,
  editionLabel: null,
  language: null,
  printIdentifierStrategy: null,
  ebookIdentifierStrategy: null,
  distributionScope: null,
  isbnByFormat: {},
  isbnForExport: null,
  snapshot: {},
});

/**
 * Resolve the canonical publishing identity before an immutable Publication exists.
 * This is used only for trusted server rendering/certification. Browser-supplied
 * publisher/ISBN values never enter this path.
 */
export async function resolvePrepublicationIdentity(
  sc: PublishingIdentityDb,
  bookId: string,
  exportFormat: string,
): Promise<ResolvedPublishingIdentity> {
  const { data: profile, error: profileErr } = await sc
    .from("book_publishing_profiles")
    .select("imprint_id,publisher_mode,edition_label,publication_language,print_identifier_strategy,ebook_identifier_strategy,distribution_scope")
    .eq("book_id", bookId)
    .maybeSingle();
  if (profileErr) throw profileErr;
  if (!profile) return emptyIdentity();

  let publisher: Record<string, unknown> = {
    mode: profile.publisher_mode,
    publisher_name: null,
    imprint_name: null,
  };

  if (profile.publisher_mode === "kdp_independent") {
    publisher = {
      mode: "kdp_independent",
      publisher_name: null,
      imprint_name: "Independently published",
      verification: "kdp_free_isbn_at_submission",
    };
  } else {
    if (!profile.imprint_id) throw new Error("PUBLISHER_IMPRINT_REQUIRED");
    const { data: imprint, error: imprintErr } = await sc
      .from("publishing_imprints")
      .select("id,scope,publisher_name,imprint_name,country_code,isbn_agency_name,registrant_name,agency_record_attested,verified,verified_at,verification_reference,verification_method")
      .eq("id", profile.imprint_id)
      .maybeSingle();
    if (imprintErr) throw imprintErr;
    if (!imprint) throw new Error("PUBLISHER_IMPRINT_MISSING");

    if (profile.publisher_mode === "own_imprint") {
      if (imprint.agency_record_attested !== true) throw new Error("ISBN_AGENCY_MATCH_ATTESTATION_REQUIRED");
      if (imprint.verified !== true || !imprint.verification_reference) throw new Error("ISBN_IMPRINT_VERIFICATION_REQUIRED");
    }
    if (profile.publisher_mode === "platform_imprint" && (imprint.verified !== true || !imprint.verification_reference)) {
      throw new Error("VERIFIED_PLATFORM_IMPRINT_REQUIRED");
    }

    publisher = {
      mode: profile.publisher_mode,
      imprint_id: imprint.id,
      publisher_name: imprint.publisher_name,
      imprint_name: imprint.imprint_name,
      country_code: imprint.country_code,
      isbn_agency_name: imprint.isbn_agency_name,
      registrant_name: imprint.registrant_name,
      verification: profile.publisher_mode === "platform_imprint"
        ? "platform_agency_verified"
        : "user_imprint_agency_verified",
      verification_reference: imprint.verification_reference,
      verification_method: imprint.verification_method,
      verified_at: imprint.verified_at,
    };
  }

  const { data: assignmentData, error: assignmentErr } = await sc
    .from("book_isbn_assignments")
    .select("id,isbn_id,product_form,language,edition_label,assigned_at")
    .eq("book_id", bookId)
    .order("product_form");
  if (assignmentErr) throw assignmentErr;
  const assignmentRows = (assignmentData ?? []) as AssignmentRow[];

  const inventoryIds = [...new Set(assignmentRows.map((row: AssignmentRow) => row.isbn_id).filter(Boolean))];
  const inventoryById = new Map<string, InventoryRow>();
  if (inventoryIds.length > 0) {
    const { data: inventoryData, error: inventoryErr } = await sc
      .from("isbn_inventory")
      .select("id,isbn13,source,imprint_id,provenance_status,provenance_reference")
      .in("id", inventoryIds);
    if (inventoryErr) throw inventoryErr;
    const inventoryRows = (inventoryData ?? []) as InventoryRow[];
    for (const row of inventoryRows) inventoryById.set(row.id, row);
  }

  const identifiers = assignmentRows.map((assignment: AssignmentRow) => {
    const inventory = inventoryById.get(assignment.isbn_id);
    if (!inventory) throw new Error(`ISBN_INVENTORY_MISSING:${assignment.id}`);
    if (profile.imprint_id && inventory.imprint_id !== profile.imprint_id) {
      throw new Error(`ISBN_IMPRINT_MISMATCH:${assignment.id}`);
    }
    if (inventory.provenance_status !== "verified" || !inventory.provenance_reference) {
      throw new Error(`ISBN_PROVENANCE_NOT_VERIFIED:${assignment.id}`);
    }
    return {
      scheme: "ISBN-13",
      value: inventory.isbn13,
      product_form: assignment.product_form,
      language: assignment.language,
      edition_label: assignment.edition_label,
      source: inventory.source,
      provenance_status: inventory.provenance_status,
      provenance_reference: inventory.provenance_reference,
      assigned_at: assignment.assigned_at,
    };
  });

  const isbnByFormat: Record<string, string> = {};
  for (const identifier of identifiers) isbnByFormat[identifier.product_form] = identifier.value;

  const snapshot: Record<string, unknown> = {
    publisher,
    publisher_name: publisher.publisher_name ?? null,
    publisher_imprint: publisher.imprint_name ?? null,
    edition: profile.edition_label,
    language: profile.publication_language,
    identifiers,
    isbn_by_format: isbnByFormat,
    isbn: isbnByFormat.paperback ?? isbnByFormat.hardcover ?? null,
    isbn_13: isbnByFormat.paperback ?? isbnByFormat.hardcover ?? null,
    print_identifier_strategy: profile.print_identifier_strategy,
    ebook_identifier_strategy: profile.ebook_identifier_strategy,
    distribution_scope: profile.distribution_scope,
  };

  const resolvedPublisher = publisherFromPublicationSnapshot(snapshot);
  return {
    configured: true,
    publisherMode: profile.publisher_mode,
    publisherName: resolvedPublisher.publisherName,
    publisherImprint: resolvedPublisher.imprintName,
    editionLabel: profile.edition_label,
    language: profile.publication_language,
    printIdentifierStrategy: profile.print_identifier_strategy,
    ebookIdentifierStrategy: profile.ebook_identifier_strategy,
    distributionScope: profile.distribution_scope,
    isbnByFormat,
    isbnForExport: isbnForPublicationSnapshot(snapshot, exportFormat),
    snapshot,
  };
}
