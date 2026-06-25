// _shared/permissions.ts
// Centralized authorship & publishing capability checks.
// Backend is the source of truth. Every edge function that mutates
// authorship, rights, publication state, or exports MUST consume
// hasCapability() — never inline role-string comparisons.
//
// Phase 1 surface (kept intentionally small):
//   - canEditWork              ownership/role gate
//   - canEditAuthorship        author identity, attribution, ordering
//   - canEditRights            commercial + moral rights
//   - canPublishWork           mint a new immutable Publication
//   - canExportPublication     produce signed export bundles
//   - canTransferOwnership     initiate or accept transfers
//   - canConsentToIntegrityChange  override of locked publication
//
// TODO(phase2): asset provenance, organization role inheritance,
// citation freezing, signed event bus, plugin export registry.

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export type Capability =
  | "canEditWork"
  | "canEditAuthorship"
  | "canEditRights"
  | "canPublishWork"
  | "canUnpublishWork"
  | "canExportPublication"
  | "canTransferOwnership"
  | "canAcceptTransfer"
  | "canConsentToIntegrityChange";

export interface CapabilityContext {
  userId: string;
  workId: string;
  // Pre-resolved Work row when caller already has it.
  work?: {
    id: string;
    owner_rights_holder_id: string | null;
    created_by: string | null;
    publish_locked_at: string | null;
  };
}

export interface CapabilityDecision {
  allowed: boolean;
  reason?: string;
  ownerRightsHolderId?: string | null;
  isOwner: boolean;
  isAuthor: boolean;
  isCollaborator: boolean;
  publishLocked: boolean;
}

// ---------------------------------------------------------------------------
// Internal: resolve membership in a single round-trip when possible.
// Uses a service client because we need to read across tables that may have
// per-role RLS. The decision itself is the authorization boundary.
// ---------------------------------------------------------------------------
async function resolveContext(
  sc: SupabaseClient,
  ctx: CapabilityContext,
): Promise<{
  work: { id: string; owner_rights_holder_id: string | null; created_by: string | null; publish_locked_at: string | null } | null;
  ownerUserId: string | null;
  isAuthor: boolean;
  isCollaborator: boolean;
}> {
  let work = ctx.work ?? null;
  if (!work) {
    const { data } = await sc
      .from("works")
      .select("id, owner_rights_holder_id, created_by, publish_locked_at")
      .eq("id", ctx.workId)
      .maybeSingle();
    work = data ?? null;
  }
  if (!work) {
    return { work: null, ownerUserId: null, isAuthor: false, isCollaborator: false };
  }

  let ownerUserId: string | null = null;
  if (work.owner_rights_holder_id) {
    const { data: rh } = await sc
      .from("rights_holders")
      .select("user_id, holder_type")
      .eq("id", work.owner_rights_holder_id)
      .maybeSingle();
    if (rh?.holder_type === "individual") ownerUserId = rh.user_id ?? null;
    // TODO(phase2): resolve organization membership → role-based ownership.
  }
  if (!ownerUserId) ownerUserId = work.created_by;

  const [{ data: authorRow }, { data: collabRow }] = await Promise.all([
    sc.from("work_authors").select("id").eq("work_id", work.id).eq("user_id", ctx.userId).maybeSingle(),
    // Legacy collaborator table on the underlying book — read-only signal,
    // never grants authorship-level capabilities.
    sc
      .from("book_collaborators")
      .select("id, role")
      .eq("user_id", ctx.userId)
      .limit(1)
      .maybeSingle(),
  ]);

  return {
    work,
    ownerUserId,
    isAuthor: !!authorRow,
    isCollaborator: !!collabRow,
  };
}

export async function hasCapability(
  sc: SupabaseClient,
  capability: Capability,
  ctx: CapabilityContext,
): Promise<CapabilityDecision> {
  const { work, ownerUserId, isAuthor, isCollaborator } = await resolveContext(sc, ctx);

  if (!work) {
    return {
      allowed: false,
      reason: "work_not_found",
      isOwner: false,
      isAuthor: false,
      isCollaborator: false,
      publishLocked: false,
    };
  }

  const isOwner = !!ownerUserId && ownerUserId === ctx.userId;
  const publishLocked = !!work.publish_locked_at;
  const base: CapabilityDecision = {
    allowed: false,
    isOwner,
    isAuthor,
    isCollaborator,
    publishLocked,
    ownerRightsHolderId: work.owner_rights_holder_id ?? null,
  };

  switch (capability) {
    case "canEditWork":
      return { ...base, allowed: isOwner || isAuthor || isCollaborator, reason: !isOwner && !isAuthor && !isCollaborator ? "not_a_participant" : undefined };

    case "canEditAuthorship":
    case "canEditRights":
      // Only the verified owner can change identity / rights.
      // Collaborators NEVER have these capabilities — UI must lock the fields.
      if (!isOwner) return { ...base, reason: "owner_only" };
      if (publishLocked && capability === "canEditAuthorship") {
        return { ...base, reason: "publish_locked" };
      }
      return { ...base, allowed: true };

    case "canPublishWork":
    case "canUnpublishWork":
      return { ...base, allowed: isOwner, reason: isOwner ? undefined : "owner_only" };

    case "canExportPublication":
      // Anyone with at least read access on the Work could in principle
      // be allowed by future policy. Phase 1: owner, authors, collaborators.
      return {
        ...base,
        allowed: isOwner || isAuthor || isCollaborator,
        reason: !isOwner && !isAuthor && !isCollaborator ? "no_access" : undefined,
      };

    case "canTransferOwnership":
      return { ...base, allowed: isOwner, reason: isOwner ? undefined : "owner_only" };

    case "canAcceptTransfer":
      // Validated at the function level against the transfer row (target user).
      return { ...base, allowed: true };

    case "canConsentToIntegrityChange":
      return { ...base, allowed: isOwner, reason: isOwner ? undefined : "owner_only" };

    default:
      return { ...base, reason: "unknown_capability" };
  }
}

/**
 * Convenience: throw a structured 403 payload from an edge function when
 * a capability is denied. Returns null when allowed.
 */
export function denyResponse(decision: CapabilityDecision, capability: Capability) {
  return {
    error: "forbidden",
    code: "capability_denied",
    capability,
    reason: decision.reason ?? "denied",
    publish_locked: decision.publishLocked,
  };
}
