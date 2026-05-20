// One-shot backfill — admin only. Walks book_purchases and writes missing ledger rows.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { preflight, json, forbidden, serverError, requireUser, serviceClient } from "../_shared/http.ts";

serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const sc = serviceClient();
  const { data: role } = await sc.from("user_roles").select("role")
    .eq("user_id", auth.userId).eq("role", "admin").maybeSingle();
  if (!role) return forbidden("admin_only");

  try {
    const { data: purchases } = await sc.from("book_purchases")
      .select("id,status").in("status", ["paid", "refunded"]).limit(5000);
    let ok = 0, fail = 0;
    for (const p of purchases ?? []) {
      const { error } = await sc.rpc("record_purchase_ledger", { _purchase_id: p.id });
      if (error) fail += 1; else ok += 1;
    }
    return json({ scanned: purchases?.length ?? 0, written: ok, failed: fail });
  } catch (e) { return serverError(e); }
});
