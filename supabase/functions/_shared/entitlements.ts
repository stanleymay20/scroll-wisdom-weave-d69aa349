// Shared entitlement helper for edge functions.
// Calls the SECURITY DEFINER RPC get_user_entitlements(_user_id) using the
// service-role client so we never trust the caller's claims for tier checks.

export interface CreatorEntitlements {
  user_id: string;
  tier: "free" | "creator" | "creator_pro";
  can_publish_external: boolean;
  can_schedule_releases: boolean;
  can_use_collections_unlimited: boolean;
  priority_generation: boolean;
  monthly_generation_bonus: number;
  rev_share_surcharge_bps: number;
  source: string;
  expires_at: string | null;
  is_default: boolean;
}

const FREE_DEFAULT: CreatorEntitlements = {
  user_id: "",
  tier: "free",
  can_publish_external: false,
  can_schedule_releases: false,
  can_use_collections_unlimited: false,
  priority_generation: false,
  monthly_generation_bonus: 0,
  rev_share_surcharge_bps: 1000,
  source: "default",
  expires_at: null,
  is_default: true,
};

export async function getUserEntitlements(
  admin: any,
  userId: string,
): Promise<CreatorEntitlements> {
  try {
    const { data, error } = await admin.rpc("get_user_entitlements", { _user_id: userId });
    if (error || !data) return { ...FREE_DEFAULT, user_id: userId };
    return data as CreatorEntitlements;
  } catch {
    return { ...FREE_DEFAULT, user_id: userId };
  }
}

/** Returns a 402 Response if user lacks the capability, otherwise null. */
export async function requireCreatorCapability(
  admin: any,
  userId: string,
  capability: keyof CreatorEntitlements,
  opts: {
    auditEventType?: string;
    auditMetadata?: Record<string, unknown>;
    correlationId?: string | null;
    platform?: string | null;
  } = {},
): Promise<{ entitlements: CreatorEntitlements; blocked: Response | null }> {
  const ent = await getUserEntitlements(admin, userId);
  const ok = Boolean(ent[capability]);
  if (ok) return { entitlements: ent, blocked: null };

  // Audit log entry for the block.
  try {
    await admin.from("publishing_audit_log").insert({
      user_id: userId,
      platform: opts.platform ?? null,
      event_type: "publish_blocked_by_tier",
      severity: "warning",
      message: `Blocked by tier: missing ${String(capability)}`,
      correlation_id: opts.correlationId ?? null,
      metadata: {
        capability,
        current_tier: ent.tier,
        ...(opts.auditMetadata ?? {}),
      },
    });
  } catch { /* best-effort */ }

  const headers: Record<string, string> = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-client-name, x-supabase-client-version",
    "Content-Type": "application/json",
  };
  if (opts.correlationId) headers["x-correlation-id"] = opts.correlationId;

  return {
    entitlements: ent,
    blocked: new Response(
      JSON.stringify({
        error: "entitlement_required",
        capability,
        current_tier: ent.tier,
        upgrade_url: "/pricing#creator",
        message: "Upgrade to Creator to use this feature.",
        correlation_id: opts.correlationId ?? null,
      }),
      { status: 402, headers },
    ),
  };
}

/**
 * Capture an immutable snapshot of the user's current entitlement state and
 * return the snapshot id, so downstream rows (export_jobs, external_publications,
 * release_schedule_items) can prove the effective tier at the time of action.
 *
 * Returns null on failure — callers must not block on snapshot capture.
 */
export async function snapshotEntitlement(
  admin: any,
  userId: string,
  contextType: "export_job" | "external_publish" | "scheduled_release" | "manual",
  contextId?: string | null,
): Promise<string | null> {
  try {
    const { data, error } = await admin.rpc("snapshot_creator_entitlement", {
      _user_id: userId,
      _context_type: contextType,
      _context_id: contextId ?? null,
    });
    if (error) {
      console.warn("[entitlements] snapshot failed:", error.message);
      return null;
    }
    return (data as string) ?? null;
  } catch (e) {
    console.warn("[entitlements] snapshot threw:", e);
    return null;
  }
}

