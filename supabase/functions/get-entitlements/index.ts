// get-entitlements — returns the caller's creator entitlements (free defaults
// if no row). Lightweight read used by the client to gate UI.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-name, x-supabase-client-version",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const url = Deno.env.get("SUPABASE_URL")!;
  const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(url, svc, { auth: { persistSession: false } });

  try {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token) {
      return new Response(JSON.stringify({ tier: "free", is_default: true, can_publish_external: false }), {
        status: 200, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const { data: claims } = await admin.auth.getClaims(token);
    const userId = claims?.claims?.sub;
    if (!userId) {
      return new Response(JSON.stringify({ tier: "free", is_default: true, can_publish_external: false }), {
        status: 200, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const { data, error } = await admin.rpc("get_user_entitlements", { _user_id: userId });
    if (error) throw error;
    return new Response(JSON.stringify(data), {
      status: 200, headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
