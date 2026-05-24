// materialize-release-schedules — pg_cron worker.
// Finds release_schedule_items whose release_at has passed, marks them released,
// and broadcasts a followed_author_release notification to the author's followers
// (deduped at the DB level by uniq_creator_notifications_follow_release).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const url = Deno.env.get("SUPABASE_URL")!;
  const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, svc);

  const started = Date.now();
  const results: any[] = [];
  let processed = 0, released = 0, failed = 0, notified = 0;

  try {
    const { data: due, error } = await admin
      .from("release_schedule_items")
      .select("id, schedule_id, chapter_id, chapter_number, release_at")
      .eq("status", "scheduled")
      .lte("release_at", new Date().toISOString())
      .order("release_at", { ascending: true })
      .limit(200);
    if (error) throw error;

    for (const item of due ?? []) {
      processed++;
      try {
        // Phase 4.0 — verify the schedule owner still has entitlement.
        // Resolve owner via release_schedules -> books.user_id.
        const { data: sched } = await admin
          .from("release_schedules")
          .select("book_id, books:book_id(user_id)")
          .eq("id", item.schedule_id)
          .maybeSingle();
        const ownerId = (sched as any)?.books?.user_id;
        if (ownerId) {
          const { data: ent } = await admin.rpc("get_user_entitlements", { _user_id: ownerId });
          if (!ent?.can_schedule_releases) {
            await admin.from("release_schedule_items")
              .update({ status: "failed", error_message: "entitlement_revoked" })
              .eq("id", item.id)
              .eq("status", "scheduled");
            await admin.from("publishing_audit_log").insert({
              user_id: ownerId, platform: null,
              event_type: "publish_blocked_by_tier", severity: "warning",
              message: "Scheduled release skipped: owner lost can_schedule_releases",
              metadata: { release_schedule_item_id: item.id, current_tier: ent?.tier ?? "free" },
            });
            failed++;
            results.push({ id: item.id, skipped: "entitlement_revoked" });
            continue;
          }
        }

        // Mark released first (idempotent: only flip from scheduled)
        const { data: upd, error: updErr } = await admin
          .from("release_schedule_items")
          .update({ status: "released", released_at: new Date().toISOString() })
          .eq("id", item.id)
          .eq("status", "scheduled")
          .select("id")
          .maybeSingle();
        if (updErr) throw updErr;
        if (!upd) { results.push({ id: item.id, skipped: "already_processed" }); continue; }
        released++;

        // Fan out notifications via SECURITY DEFINER helper
        const { data: n, error: nErr } = await admin.rpc(
          "notify_followers_on_schedule_release",
          { _item_id: item.id },
        );
        if (nErr) throw nErr;
        const count = Number(n ?? 0);
        notified += count;
        results.push({ id: item.id, released: true, notified: count });
      } catch (e) {
        failed++;
        await admin.from("release_schedule_items")
          .update({ status: "failed", error_message: String((e as Error)?.message ?? e).slice(0, 500) })
          .eq("id", item.id)
          .eq("status", "scheduled");
        results.push({ id: item.id, error: String((e as Error)?.message ?? e) });
      }
    }

    return new Response(JSON.stringify({
      ok: true,
      processed, released, failed, notified,
      elapsed_ms: Date.now() - started,
      results,
    }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({
      ok: false, error: String((e as Error)?.message ?? e),
      processed, released, failed, notified,
    }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
