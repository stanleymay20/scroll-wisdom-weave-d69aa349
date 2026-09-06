import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import {
  preflight,
  json,
  forbidden,
  serverError,
  requireUser,
  validateBody,
  enforceRateLimit,
  serviceClient,
  z,
} from "../_shared/http.ts";

const ClaimSchema = z.object({
  code: z.string().min(8).max(256),
});

serve(async (req) => {
  const pre = preflight(req);
  if (pre) return pre;

  try {
    if (req.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    // Authenticate before exposing any bootstrap state or parsing a claim code.
    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;

    const admin = serviceClient();

    // Existing admins never need to re-claim; return an idempotent success.
    const { data: existing, error: existingError } = await admin
      .from("user_roles")
      .select("id")
      .eq("user_id", auth.userId)
      .eq("role", "admin")
      .maybeSingle();

    if (existingError) {
      console.error("[claim-admin] role lookup failed", existingError);
      return serverError(new Error("Unable to verify admin state"));
    }

    if (existing) {
      return json({ success: true, message: "Already admin" });
    }

    // Bootstrap is one-time only. Once any canonical admin exists, the shared
    // claim secret is permanently out of the authorization path. Further role
    // grants must be performed by an authenticated canonical admin through
    // user_roles/admin tooling.
    const { data: anyAdmin, error: anyAdminError } = await admin
      .from("user_roles")
      .select("id")
      .eq("role", "admin")
      .limit(1)
      .maybeSingle();

    if (anyAdminError) {
      console.error("[claim-admin] bootstrap-state lookup failed", anyAdminError);
      return serverError(new Error("Unable to verify admin bootstrap state"));
    }

    if (anyAdmin) {
      console.warn("[claim-admin] bootstrap claim rejected after initialization", {
        userId: auth.userId,
      });
      return forbidden("Admin bootstrap is closed");
    }

    // Aggressive per-user limit — first-admin bootstrap attempts should be rare.
    const limited = enforceRateLimit({
      name: "claim-admin",
      key: auth.userId,
      limit: 5,
      windowSec: 600,
    });
    if (limited) return limited;

    const body = await validateBody(req, ClaimSchema);
    if (body instanceof Response) return body;

    const adminClaimCode = Deno.env.get("ADMIN_CLAIM_CODE");
    if (!adminClaimCode) {
      return json(
        {
          error: "Admin bootstrap is not configured.",
          code: "not_configured",
        },
        400,
      );
    }

    // Constant-time comparison to defeat timing attacks during the one-time
    // bootstrap window.
    if (!safeEqual(body.code, adminClaimCode)) {
      console.warn("[claim-admin] invalid bootstrap code attempt", {
        userId: auth.userId,
      });
      return forbidden("Invalid claim code");
    }

    const { error: insertError } = await admin
      .from("user_roles")
      .insert({ user_id: auth.userId, role: "admin" });

    if (insertError) {
      console.error("[claim-admin] insert failed", insertError);
      return serverError(new Error("Failed to grant admin"));
    }

    console.log("[claim-admin] initial admin granted", { userId: auth.userId });
    return json({ success: true, message: "Admin access granted" });
  } catch (err) {
    console.error("[claim-admin] unexpected error", err);
    return serverError(err);
  }
});

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
