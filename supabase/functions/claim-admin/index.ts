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

    const adminClaimCode = Deno.env.get("ADMIN_CLAIM_CODE");
    if (!adminClaimCode) {
      return json(
        {
          error: "Admin claim not configured. Set ADMIN_CLAIM_CODE secret first.",
          code: "not_configured",
        },
        400,
      );
    }

    // Authenticate before parsing body to keep brute-force surface small.
    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;

    // Aggressive per-user limit — claim attempts should be rare.
    const limited = enforceRateLimit({
      name: "claim-admin",
      key: auth.userId,
      limit: 5,
      windowSec: 600,
    });
    if (limited) return limited;

    const body = await validateBody(req, ClaimSchema);
    if (body instanceof Response) return body;

    // Constant-time comparison to defeat timing attacks.
    if (!safeEqual(body.code, adminClaimCode)) {
      console.warn("[claim-admin] invalid code attempt", { userId: auth.userId });
      return forbidden("Invalid claim code");
    }

    const admin = serviceClient();

    const { data: existing } = await admin
      .from("user_roles")
      .select("id")
      .eq("user_id", auth.userId)
      .eq("role", "admin")
      .maybeSingle();

    if (existing) {
      return json({ success: true, message: "Already admin" });
    }

    const { error: insertError } = await admin
      .from("user_roles")
      .insert({ user_id: auth.userId, role: "admin" });

    if (insertError) {
      console.error("[claim-admin] insert failed", insertError);
      return serverError(new Error("Failed to grant admin"));
    }

    console.log("[claim-admin] admin granted", { userId: auth.userId });
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
