// disconnect-platform — owner removes a creator_platform_connections row.
// Service-role only path (token decryption happens on next reconnect).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-name, x-supabase-client-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return new Response("method_not_allowed", { status: 405, headers: cors });
  try {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token) return new Response(JSON.stringify({ error: "auth_required" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const u = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: who } = await u.auth.getUser();
    const caller = who?.user?.id;
    if (!caller) return new Response(JSON.stringify({ error: "auth_required" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });

    const body = await req.json().catch(() => ({}));
    const platform = String(body?.platform ?? "");
    if (!["gumroad", "shopify", "patreon", "etsy", "substack"].includes(platform)) {
      return new Response(JSON.stringify({ error: "invalid_platform" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
    }
    const admin = createClient(url, svc);
    const { error } = await admin.from("creator_platform_connections")
      .delete().eq("user_id", caller).eq("platform", platform);
    if (error) throw error;
    return new Response(JSON.stringify({ ok: true }), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error)?.message ?? e) }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
