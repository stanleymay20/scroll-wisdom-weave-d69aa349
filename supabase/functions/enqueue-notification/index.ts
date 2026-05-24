// enqueue-notification — service-side helper to insert creator_notifications.
// Authenticated callers can enqueue notifications targeting themselves OR,
// when triggering "followed_author_release", broadcast to their followers.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-name, x-supabase-client-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const KINDS = new Set([
  "new_release",
  "followed_author_release",
  "collection_update",
  "recommendation_digest",
  "continue_reading",
  "publish_status",
  "system",
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), {
      status: 405,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  try {
    const auth = req.headers.get("Authorization") ?? "";
    const token = auth.replace(/^Bearer\s+/i, "");
    if (!token) {
      return new Response(JSON.stringify({ error: "auth_required" }), {
        status: 401,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const userClient = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: who } = await userClient.auth.getUser();
    const caller = who?.user?.id;
    if (!caller) {
      return new Response(JSON.stringify({ error: "auth_required" }), {
        status: 401,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const kind = String(body?.kind ?? "");
    if (!KINDS.has(kind)) {
      return new Response(JSON.stringify({ error: "invalid_kind" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const title = String(body?.title ?? "").slice(0, 200);
    if (!title) {
      return new Response(JSON.stringify({ error: "title_required" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const payload = {
      kind,
      title,
      body: body?.body ? String(body.body).slice(0, 1000) : null,
      link_url: body?.link_url ? String(body.link_url).slice(0, 500) : null,
      resource_type: body?.resource_type ?? null,
      resource_id: body?.resource_id ? String(body.resource_id).slice(0, 100) : null,
      metadata: body?.metadata ?? {},
    };

    const admin = createClient(url, svc);

    // Determine recipients
    let recipients: string[] = [];
    if (kind === "followed_author_release") {
      const { data: followers, error } = await admin
        .from("author_followers")
        .select("follower_user_id")
        .eq("author_user_id", caller)
        .limit(5000);
      if (error) throw error;
      recipients = (followers ?? []).map((r: any) => r.follower_user_id);
    } else {
      // Default: notify the caller themselves (publish_status, system, etc.)
      recipients = [caller];
    }

    if (!recipients.length) {
      return new Response(JSON.stringify({ ok: true, inserted: 0 }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const rows = recipients.map((uid) => ({ user_id: uid, ...payload }));
    const { error: insErr, count } = await admin
      .from("creator_notifications")
      .insert(rows, { count: "exact" });
    if (insErr) throw insErr;

    return new Response(JSON.stringify({ ok: true, inserted: count ?? rows.length }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error)?.message ?? e) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
