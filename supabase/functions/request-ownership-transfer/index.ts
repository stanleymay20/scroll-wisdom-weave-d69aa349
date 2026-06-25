// request-ownership-transfer
// Owner-initiated. Creates a pending transfer; never mutates ownership.
import { preflight, requireUser, validateBody, json, serverError, serviceClient, z } from "../_shared/http.ts";
import { hasCapability, denyResponse } from "../_shared/permissions.ts";
import { logAuthorshipEvent } from "../_shared/authorshipGuard.ts";

const Body = z.object({
  work_id: z.string().uuid(),
  to_rights_holder_id: z.string().uuid(),
  reason: z.string().max(500).optional(),
  expires_in_days: z.number().int().min(1).max(60).default(14),
});

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    const auth = await requireUser(req); if (auth instanceof Response) return auth;
    const body = await validateBody(req, Body); if (body instanceof Response) return body;

    const sc = serviceClient();
    const decision = await hasCapability(sc, "canTransferOwnership", { userId: auth.userId, workId: body.work_id });
    if (!decision.allowed) {
      await logAuthorshipEvent(sc, {
        workId: body.work_id, userId: auth.userId, action: "denied",
        allowed: false, reason: decision.reason, metadata: { attempted: "ownership_transfer_request" },
      });
      return json(denyResponse(decision, "canTransferOwnership"), 403);
    }

    const { data: work } = await sc.from("works").select("owner_rights_holder_id").eq("id", body.work_id).maybeSingle();
    if (!work) return json({ error: "work_not_found" }, 404);

    const expiresAt = new Date(Date.now() + body.expires_in_days * 86400000).toISOString();
    const { data: tr, error } = await sc.from("ownership_transfers").insert({
      work_id: body.work_id,
      from_rights_holder_id: work.owner_rights_holder_id,
      to_rights_holder_id: body.to_rights_holder_id,
      requested_by: auth.userId,
      status: "pending",
      reason: body.reason ?? null,
      expires_at: expiresAt,
    }).select("id, status, expires_at").single();
    if (error) throw error;

    await logAuthorshipEvent(sc, {
      workId: body.work_id, userId: auth.userId, action: "ownership_transfer_request",
      allowed: true, metadata: { transfer_id: tr.id, to_rights_holder_id: body.to_rights_holder_id },
    });

    return json(tr);
  } catch (e) {
    return serverError(e);
  }
});
