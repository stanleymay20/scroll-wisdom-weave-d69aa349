// cancel-ownership-transfer
// Either the initiator or the target may cancel a pending transfer.
import { preflight, requireUser, validateBody, json, serverError, serviceClient, z } from "../_shared/http.ts";
import { logAuthorshipEvent } from "../_shared/authorshipGuard.ts";

const Body = z.object({ transfer_id: z.string().uuid(), reason: z.string().max(500).optional() });

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    const auth = await requireUser(req); if (auth instanceof Response) return auth;
    const body = await validateBody(req, Body); if (body instanceof Response) return body;

    const sc = serviceClient();
    const { data: tr } = await sc.from("ownership_transfers")
      .select("id, work_id, to_rights_holder_id, requested_by, status")
      .eq("id", body.transfer_id).maybeSingle();
    if (!tr) return json({ error: "transfer_not_found" }, 404);
    if (tr.status !== "pending") return json({ error: "not_pending", status: tr.status }, 409);

    const { data: target } = await sc.from("rights_holders")
      .select("user_id").eq("id", tr.to_rights_holder_id).maybeSingle();
    const isInitiator = tr.requested_by === auth.userId;
    const isTarget = target?.user_id === auth.userId;
    if (!isInitiator && !isTarget) {
      await logAuthorshipEvent(sc, {
        workId: tr.work_id, userId: auth.userId, action: "denied", allowed: false,
        reason: "not_party_to_transfer", metadata: { transfer_id: tr.id },
      });
      return json({ error: "forbidden" }, 403);
    }

    await sc.from("ownership_transfers").update({
      status: "cancelled", cancelled_at: new Date().toISOString(),
      reason: body.reason ?? null,
    }).eq("id", tr.id);

    await logAuthorshipEvent(sc, {
      workId: tr.work_id, userId: auth.userId, action: "ownership_transfer_cancel",
      allowed: true, metadata: { transfer_id: tr.id, by: isInitiator ? "initiator" : "target" },
    });

    return json({ ok: true });
  } catch (e) {
    return serverError(e);
  }
});
