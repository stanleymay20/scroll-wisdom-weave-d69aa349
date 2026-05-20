// Phase 2.1d — Cohort rollup. Admin- or cron-callable.
// Recomputes the last N days of cohort_metrics: cohort_size (new users that day),
// paying_users, gross/refund/net, visitors (unique sessions), exports_count,
// RPV (revenue per visitor) and RPE (revenue per export). Idempotent UPSERT.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  preflight, json, badRequest, forbidden, serverError,
  requireUser, validateQuery, z, serviceClient,
} from "../_shared/http.ts";
import { correlationId, logFinancialEvent } from "../_shared/observability.ts";

const Query = z.object({ days: z.string().regex(/^\d+$/).optional() });

serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  if (req.method !== "GET" && req.method !== "POST") return badRequest("GET or POST");

  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;

  const sc = serviceClient();
  const { data: roleData } = await sc.from("user_roles").select("role").eq("user_id", auth.userId).maybeSingle();
  if (!roleData || roleData.role !== "admin") return forbidden("Admin required");

  const q = validateQuery(req, Query); if (q instanceof Response) return q;
  const days = Math.min(Math.max(parseInt(q.days ?? "30", 10), 1), 180);
  const corr = correlationId(req);

  try {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    let upserts = 0;
    for (let i = 0; i < days; i++) {
      const day = new Date(today);
      day.setUTCDate(today.getUTCDate() - i);
      const dayStr = day.toISOString().slice(0, 10);
      const nextStr = new Date(day.getTime() + 86400000).toISOString().slice(0, 10);

      // Revenue from daily rollup
      const { data: rev } = await sc.from("creator_revenue_daily")
        .select("gross_cents, refund_cents, net_cents")
        .eq("day", dayStr);
      const gross = (rev ?? []).reduce((s, r) => s + Number(r.gross_cents ?? 0), 0);
      const refund = (rev ?? []).reduce((s, r) => s + Number(r.refund_cents ?? 0), 0);
      const net = (rev ?? []).reduce((s, r) => s + Number(r.net_cents ?? 0), 0);

      // Paying users that day
      const { data: paying } = await sc.from("book_purchases")
        .select("buyer_user_id")
        .eq("status", "paid")
        .gte("purchased_at", dayStr)
        .lt("purchased_at", nextStr);
      const payingSet = new Set((paying ?? []).map(p => p.buyer_user_id).filter(Boolean));

      // Visitors (unique attribution sessions seen that day)
      const { count: visitorsCount } = await sc.from("attribution_sessions")
        .select("id", { count: "exact", head: true })
        .gte("first_seen_at", dayStr).lt("first_seen_at", nextStr);

      // Exports completed that day
      const { count: exportsCount } = await sc.from("export_jobs")
        .select("id", { count: "exact", head: true })
        .eq("status", "completed")
        .gte("completed_at", dayStr).lt("completed_at", nextStr);

      const visitors = visitorsCount ?? 0;
      const exports = exportsCount ?? 0;
      const rpv = visitors > 0 ? gross / visitors : null;
      const rpe = exports > 0 ? gross / exports : null;

      await sc.from("cohort_metrics").upsert({
        cohort_date: dayStr, metric_date: dayStr,
        cohort_size: 0, // reserved for new-user cohort joins later
        paying_users: payingSet.size,
        active_users: payingSet.size,
        gross_cents: gross, refund_cents: refund, net_cents: net,
        visitors, exports_count: exports,
        rpv_cents: rpv, rpe_cents: rpe,
        computed_at: new Date().toISOString(),
        metadata: { source: "analytics-cohort-rollup" },
      }, { onConflict: "cohort_date,metric_date" });
      upserts++;
    }

    await logFinancialEvent(sc, {
      event_type: "cohort_rollup_completed", severity: "info", actor: "admin",
      correlation_id: corr, user_id: auth.userId,
      payload: { days, upserts },
    });

    return json({ ok: true, days, upserts, correlation_id: corr });
  } catch (e) { return serverError(e); }
});
