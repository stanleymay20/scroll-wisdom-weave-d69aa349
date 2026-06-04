// disconnect-platform — owner removes a creator_platform_connections row.
//
// Enterprise hardening:
//   * Best-effort upstream revocation: Gumroad has DELETE /v2/oauth/access_tokens
//     so we revoke before discarding the local copy. Shopify admin tokens can't
//     be revoked via API (the merchant must uninstall the app); we record the
//     intent so the dashboard can show "uninstall required".
//   * Audit log every disconnect; ops needs to see who pulled what and when
//     during incident triage (e.g. compromised token cleanup).
//   * Token decrypt failure is non-fatal — the row is deleted either way so we
//     don't strand the user behind a broken connection.
//   * Correlation IDs in response + audit row.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decryptToken } from "../_shared/crypto-tokens.ts";
import { logPublishEvent } from "../_shared/publishing-audit.ts";
import { fetchWithRetry } from "../_shared/upstream-retry.ts";
import { correlationId } from "../_shared/observability.ts";
import { sanitiseError } from "../_shared/publish-validation.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-correlation-id, x-supabase-client-name, x-supabase-client-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ALLOWED_PLATFORMS = new Set(["gumroad", "shopify", "patreon", "etsy", "substack"]);

function jsonResp(status: number, body: unknown, corr: string) {
  return new Response(JSON.stringify({ ...(typeof body === "object" && body ? body : {}), correlation_id: corr }), {
    status, headers: { ...cors, "Content-Type": "application/json", "x-correlation-id": corr },
  });
}

/**
 * Best-effort upstream revocation. Returns the outcome for audit logging.
 * Never throws: if we can't revoke, we still delete the local row.
 */
async function revokeUpstream(
  platform: string,
  conn: { encrypted_access_token: string },
): Promise<{ attempted: boolean; ok: boolean; reason: string | null }> {
  if (platform === "gumroad") {
    try {
      const token = await decryptToken(conn.encrypted_access_token);
      const form = new FormData();
      form.append("access_token", token);
      const res = await fetchWithRetry(
        "https://api.gumroad.com/v2/oauth/access_tokens",
        { method: "DELETE", body: form },
        { attempts: 2, timeoutMs: 8000 },
      );
      if (res.ok) return { attempted: true, ok: true, reason: null };
      return { attempted: true, ok: false, reason: `http_${res.status}` };
    } catch (e) {
      return { attempted: true, ok: false, reason: sanitiseError(e, 200) };
    }
  }
  if (platform === "shopify") {
    // Shopify doesn't expose a revoke endpoint for admin tokens; the merchant
    // must uninstall the app from their Shopify admin. We treat this as
    // not_supported so the audit log records the truth.
    return { attempted: false, ok: false, reason: "not_supported_by_platform" };
  }
  // patreon/etsy/substack: future support — record intent.
  return { attempted: false, ok: false, reason: "not_implemented" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const corr = correlationId(req);
  if (req.method !== "POST") return jsonResp(405, { error: "method_not_allowed" }, corr);

  try {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token) return jsonResp(401, { error: "auth_required" }, corr);
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const u = createClient(url, anon, { global: { headers: { Authorization: `Bearer ${token}` } } });
    const { data: who } = await u.auth.getUser();
    const caller = who?.user?.id;
    if (!caller) return jsonResp(401, { error: "auth_required" }, corr);

    const body = await req.json().catch(() => ({}));
    const platform = String(body?.platform ?? "");
    if (!ALLOWED_PLATFORMS.has(platform)) return jsonResp(400, { error: "invalid_platform" }, corr);

    const admin = createClient(url, svc);

    // Load the row so we can revoke upstream before discarding the token.
    const { data: conn } = await admin
      .from("creator_platform_connections")
      .select("id, encrypted_access_token, external_creator_id, external_creator_name, shop_domain")
      .eq("user_id", caller).eq("platform", platform).maybeSingle();

    if (!conn) {
      // Already disconnected — return idempotent success.
      await logPublishEvent(admin, {
        user_id: caller, platform, event_type: "connection_disconnected",
        correlation_id: corr,
        metadata: { idempotent: true },
      });
      return jsonResp(200, { ok: true, idempotent: true }, corr);
    }

    const revoke = await revokeUpstream(platform, conn);
    if (revoke.attempted) {
      await logPublishEvent(admin, {
        user_id: caller, platform,
        event_type: revoke.ok ? "connection_revoked_upstream" : "connection_failed",
        severity: revoke.ok ? "info" : "warning",
        correlation_id: corr,
        message: revoke.ok ? "upstream token revoked" : `upstream revoke failed: ${revoke.reason ?? "unknown"}`,
        metadata: { reason: revoke.reason },
      });
    }

    const { error: delErr } = await admin.from("creator_platform_connections")
      .delete().eq("id", conn.id);
    if (delErr) throw delErr;

    await logPublishEvent(admin, {
      user_id: caller, platform, event_type: "connection_disconnected",
      correlation_id: corr,
      metadata: {
        upstream_revoke_attempted: revoke.attempted,
        upstream_revoke_ok: revoke.ok,
        upstream_revoke_reason: revoke.reason,
        external_creator_name: conn.external_creator_name,
        shop_domain: conn.shop_domain,
      },
    });

    return jsonResp(200, {
      ok: true,
      upstream_revoked: revoke.ok,
      upstream_revoke_attempted: revoke.attempted,
      upstream_revoke_reason: revoke.reason,
    }, corr);
  } catch (e) {
    console.error("disconnect-platform error", e, { correlation_id: corr });
    return jsonResp(500, { error: sanitiseError(e) }, corr);
  }
});
