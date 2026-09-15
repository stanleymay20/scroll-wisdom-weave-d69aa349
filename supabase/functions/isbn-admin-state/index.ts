import {
  preflight,
  json,
  forbidden,
  serverError,
  requireUser,
  serviceClient,
  enforceDurableRateLimit,
} from "../_shared/http.ts";

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;

  try {
    if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;

    const sc = serviceClient();
    const { data: role, error: roleError } = await sc
      .from("user_roles")
      .select("role")
      .eq("user_id", auth.userId)
      .eq("role", "admin")
      .maybeSingle();
    if (roleError) return serverError(roleError);
    if (!role) return forbidden("Administrator role required");

    const limited = await enforceDurableRateLimit(sc, {
      name: "isbn-admin-state",
      key: auth.userId,
      limit: 30,
      windowSec: 60,
    });
    if (limited) return limited;

    const [platformResult, pendingImprintsResult, batchesResult, claimsResult] = await Promise.all([
      sc.from("publishing_imprints")
        .select("id,scope,publisher_name,imprint_name,country_code,isbn_agency_name,registrant_name,verified,verified_at,verification_reference,verification_method,verification_pending_reference,verification_pending_method,verification_pending_notes,verification_submitted_by,verification_submitted_at")
        .eq("scope", "platform")
        .order("publisher_name"),
      sc.from("publishing_imprints")
        .select("id,scope,owner_user_id,publisher_name,imprint_name,country_code,isbn_agency_name,registrant_name,verified,verification_pending_reference,verification_pending_method,verification_pending_notes,verification_submitted_by,verification_submitted_at")
        .not("verification_submitted_at", "is", null)
        .order("verification_submitted_at", { ascending: true })
        .limit(100),
      sc.from("platform_isbn_pool_verification_batches")
        .select("id,imprint_id,provenance_reference,status,submitted_by,submitted_at,reviewed_by,reviewed_at,review_notes,isbn_count")
        .order("submitted_at", { ascending: false })
        .limit(100),
      sc.from("isbn_claim_requests")
        .select("id,user_id,imprint_id,isbn13,agency_reference,status,reviewed_by,reviewed_at,review_notes,created_at,updated_at")
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(200),
    ]);

    const firstError = platformResult.error || pendingImprintsResult.error || batchesResult.error || claimsResult.error;
    if (firstError) return serverError(firstError);

    const platformImprints = [];
    for (const imprint of platformResult.data ?? []) {
      const [{ count: available, error: availableError }, { count: assigned, error: assignedError }, { count: total, error: totalError }] = await Promise.all([
        sc.from("isbn_inventory")
          .select("id", { count: "exact", head: true })
          .eq("imprint_id", imprint.id)
          .eq("source", "platform_pool")
          .eq("status", "available")
          .eq("provenance_status", "verified"),
        sc.from("isbn_inventory")
          .select("id", { count: "exact", head: true })
          .eq("imprint_id", imprint.id)
          .eq("source", "platform_pool")
          .eq("status", "assigned"),
        sc.from("isbn_inventory")
          .select("id", { count: "exact", head: true })
          .eq("imprint_id", imprint.id)
          .eq("source", "platform_pool"),
      ]);
      const inventoryError = availableError || assignedError || totalError;
      if (inventoryError) return serverError(inventoryError);
      platformImprints.push({
        ...imprint,
        inventory: {
          total: total ?? 0,
          availableVerified: available ?? 0,
          assigned: assigned ?? 0,
        },
      });
    }

    return json({
      currentAdminUserId: auth.userId,
      platformImprints,
      pendingImprints: pendingImprintsResult.data ?? [],
      poolBatches: batchesResult.data ?? [],
      ownedClaims: claimsResult.data ?? [],
    });
  } catch (error) {
    return serverError(error);
  }
});
