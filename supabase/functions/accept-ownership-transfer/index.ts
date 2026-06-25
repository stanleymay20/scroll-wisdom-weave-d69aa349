// accept-ownership-transfer
// Target rights-holder accepts. Atomically flips works.owner_rights_holder_id.
// Direct UPDATEs to ownership are never permitted; this is the only path.
import { preflight, requireUser, validateBody, json, serverError, serviceClient, z } from "../_shared/http.ts";
import { logAuthorshipEvent } from "../_shared/authorshipGuard.ts";

const Body = z.object({ transfer_id: z.string().uuid() });

Deno.serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  try {
    const auth = await requireUser(req); if (auth instanceof Response) return auth;
    const body = await validateBody(req, Body); if (body instanceof Response) return body;

    const sc = serviceClient();
    const { data: tr } = await sc.from("ownership_transfers")
      .select("id, work_id, to_rights_holder_id, status, expires_at")
      .eq("id", body.transfer_id)
      .maybeSingle();
    if (!tr) return json({ error: "transfer_not_found" }, 404);
    if (tr.status !== "pending") return json({ error: "transfer_not_pending", status: tr.status }, 409);
    if (tr.expires_at && new Date(tr.expires_at).getTime() < Date.now()) {
      await sc.from("ownership_transfers").update({ status: "expired" }).eq("id", tr.id);
      return json({ error: "transfer_expired" }, 410);
    }

    // Verify caller is the target rights holder (individual mapping only in phase 1).
    const { data: target } = await sc.from("rights_holders")
      .select("user_id, holder_type").eq("id", tr.to_rights_holder_id).maybeSingle();
    if (!target || target.holder_type !== "individual" || target.user_id !== auth.userId) {
      await logAuthorshipEvent(sc, {
        workId: tr.work_id, userId: auth.userId, action: "denied", allowed: false,
        reason: "not_target_rights_holder", metadata: { transfer_id: tr.id },
      });
      return json({ error: "forbidden" }, 403);
    }

    const now = new Date().toISOString();
    await sc.from("ownership_transfers").update({ status: "accepted", accepted_at: now }).eq("id", tr.id);
    await sc.from("works").update({ owner_rights_holder_id: tr.to_rights_holder_id }).eq("id", tr.work_id);

    await logAuthorshipEvent(sc, {
      workId: tr.work_id, userId: auth.userId, action: "ownership_transfer_accept",
      allowed: true, metadata: { transfer_id: tr.id, new_owner_rights_holder_id: tr.to_rights_holder_id },
    });

    return json({ ok: true, work_id: tr.work_id });
  } catch (e) {
    return serverError(e);
  }
});
