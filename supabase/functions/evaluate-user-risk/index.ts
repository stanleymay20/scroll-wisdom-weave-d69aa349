// Phase 2.1c.2 — Heuristic user risk scoring.
// Inputs: { user_id?: string }  (no user_id => batch over recent active users)
// Heuristics only — no ML, no buyer PII echoed.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  preflight, json, badRequest, serverError, requireUser, validateBody, z,
  serviceClient,
} from "../_shared/http.ts";

const Body = z.object({
  user_id: z.string().uuid().optional(),
  batch_limit: z.number().int().min(1).max(500).optional(),
  source: z.string().max(40).optional(),
});

interface Signal { code: string; weight: number; detail?: string; }

function tierFromScore(score: number): "low" | "medium" | "high" | "blocked" {
  if (score >= 80) return "blocked";
  if (score >= 50) return "high";
  if (score >= 25) return "medium";
  return "low";
}

async function scoreOne(sc: any, userId: string): Promise<{ score: number; tier: string; reasons: Signal[] }> {
  const reasons: Signal[] = [];
  const since30 = new Date(Date.now() - 30 * 86400_000).toISOString();
  const since24h = new Date(Date.now() - 86400_000).toISOString();

  // 1. Chargebacks via fraud_signals
  const { data: cb } = await sc.from("fraud_signals")
    .select("score, metadata, created_at")
    .eq("subject_type", "user").eq("subject_value", userId)
    .eq("signal_type", "chargeback_received")
    .gte("created_at", since30);
  if ((cb?.length ?? 0) > 0) {
    reasons.push({ code: "chargeback_received", weight: Math.min(60, 40 + (cb!.length - 1) * 10), detail: `${cb!.length} dispute(s) 30d` });
  }

  // 2. Repeated subscription failures
  const { data: failedSubs } = await sc.from("financial_events")
    .select("id")
    .eq("user_id", userId).eq("event_type", "subscription_payment_failed")
    .gte("created_at", since30);
  if ((failedSubs?.length ?? 0) >= 3) {
    reasons.push({ code: "repeated_payment_failures", weight: 15, detail: `${failedSubs!.length} failures 30d` });
  }

  // 3. Free-book farming attempts (velocity_buckets count > limit triggered recently)
  // Heuristic proxy: count free_unlock purchases in 24h.
  const { data: freeUnlocks } = await sc.from("book_purchases")
    .select("id, created_at, metadata")
    .eq("buyer_user_id", userId)
    .eq("amount_cents", 0)
    .gte("created_at", since24h);
  const freeCount = freeUnlocks?.length ?? 0;
  if (freeCount >= 8) reasons.push({ code: "free_book_farming", weight: 30, detail: `${freeCount} free unlocks 24h` });
  else if (freeCount >= 5) reasons.push({ code: "free_book_velocity", weight: 12, detail: `${freeCount} free unlocks 24h` });

  // 4. Export velocity breaches
  const { data: exports24 } = await sc.from("export_jobs")
    .select("id").eq("user_id", userId).gte("created_at", since24h);
  if ((exports24?.length ?? 0) >= 15) {
    reasons.push({ code: "export_velocity_breach", weight: 20, detail: `${exports24!.length} exports 24h` });
  }

  // 5. Checkout velocity breaches (failed/abandoned > completed)
  const { data: checkouts24 } = await sc.from("storefront_events")
    .select("event_type").eq("user_id", userId)
    .in("event_type", ["checkout_started", "checkout_failed", "checkout_completed"])
    .gte("created_at", since24h);
  const started = checkouts24?.filter((e: any) => e.event_type === "checkout_started").length ?? 0;
  const failed = checkouts24?.filter((e: any) => e.event_type === "checkout_failed").length ?? 0;
  if (started >= 10 && failed >= 5) {
    reasons.push({ code: "checkout_velocity_breach", weight: 15, detail: `${started} starts / ${failed} failed 24h` });
  }

  // 6. Shared UA hash across many accounts (device clustering)
  const { data: mySessions } = await sc.from("attribution_sessions")
    .select("user_agent_hash").eq("user_id", userId)
    .not("user_agent_hash", "is", null).limit(5);
  const uaHashes = Array.from(new Set((mySessions ?? []).map((r: any) => r.user_agent_hash).filter(Boolean)));
  if (uaHashes.length > 0) {
    const { data: shared } = await sc.from("attribution_sessions")
      .select("user_id").in("user_agent_hash", uaHashes).not("user_id", "is", null);
    const distinctUsers = new Set((shared ?? []).map((r: any) => r.user_id).filter((u: any) => u !== userId));
    if (distinctUsers.size >= 5) {
      reasons.push({ code: "shared_device_hash", weight: Math.min(25, 10 + distinctUsers.size), detail: `${distinctUsers.size} other accounts share UA hash` });
    }
  }

  // 7. Suspicious attribution source (no source + many sessions)
  const { data: directSessions } = await sc.from("attribution_sessions")
    .select("id").eq("user_id", userId).eq("first_touch_source", "direct")
    .gte("first_seen_at", since30);
  if ((directSessions?.length ?? 0) >= 20) {
    reasons.push({ code: "suspicious_attribution_pattern", weight: 8, detail: `${directSessions!.length} direct sessions 30d` });
  }

  // 8. Refund rate (>50% of purchases refunded over 30d, min 4 purchases)
  const { data: purchases30 } = await sc.from("book_purchases")
    .select("status").eq("buyer_user_id", userId)
    .gte("created_at", since30);
  const totalP = purchases30?.length ?? 0;
  const refundedP = purchases30?.filter((p: any) => p.status === "refunded").length ?? 0;
  if (totalP >= 4 && refundedP / totalP > 0.5) {
    reasons.push({ code: "high_refund_rate", weight: 25, detail: `${refundedP}/${totalP} refunded 30d` });
  }

  const score = Math.min(100, reasons.reduce((s, r) => s + r.weight, 0));
  return { score, tier: tierFromScore(score), reasons };
}

async function persistScore(sc: any, userId: string, score: number, tier: string, reasons: Signal[]) {
  await sc.from("user_risk_scores").upsert({
    user_id: userId,
    score,
    tier,
    reasons,
    last_evaluated_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });

  if (tier === "high" || tier === "blocked") {
    await sc.from("financial_events").insert({
      event_type: "risk_tier_changed",
      severity: tier === "blocked" ? "critical" : "warn",
      actor: "system",
      user_id: userId,
      payload: { tier, score, reason_codes: reasons.map((r) => r.code) },
    }).select().maybeSingle().catch(() => null);
  }
}

serve(async (req) => {
  const pre = preflight(req); if (pre) return pre;
  if (req.method !== "POST") return badRequest("POST only");

  // Only admins or service-role callers (internal triggers pass service key).
  const isService = (req.headers.get("authorization") ?? "").includes(Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "____");
  let callerIsAdmin = false;
  let callerId: string | null = null;
  if (!isService) {
    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;
    const sc0 = serviceClient();
    const { data: role } = await sc0.rpc("has_role", { _user_id: auth.userId, _role: "admin" });
    callerIsAdmin = !!role;
    callerId = auth.userId;
    if (!callerIsAdmin) return json({ error: "admin_required" }, 403);
  }

  const parsed = await validateBody(req, Body);
  if (parsed instanceof Response) return parsed;

  try {
    const sc = serviceClient();

    if (parsed.user_id) {
      const r = await scoreOne(sc, parsed.user_id);
      await persistScore(sc, parsed.user_id, r.score, r.tier, r.reasons);
      return json({ ok: true, user_id: parsed.user_id, ...r, triggered_by: parsed.source ?? (callerId ?? "service") });
    }

    // Batch: re-score users with any activity in the last 24h.
    const since = new Date(Date.now() - 86400_000).toISOString();
    const { data: recent } = await sc.from("storefront_events")
      .select("user_id").not("user_id", "is", null).gte("created_at", since)
      .limit(parsed.batch_limit ?? 200);
    const userIds = Array.from(new Set((recent ?? []).map((r: any) => r.user_id).filter(Boolean)));

    const results: any[] = [];
    for (const uid of userIds) {
      const r = await scoreOne(sc, uid);
      await persistScore(sc, uid, r.score, r.tier, r.reasons);
      results.push({ user_id: uid, score: r.score, tier: r.tier });
    }
    return json({ ok: true, evaluated: results.length, by_tier: {
      blocked: results.filter((r) => r.tier === "blocked").length,
      high: results.filter((r) => r.tier === "high").length,
      medium: results.filter((r) => r.tier === "medium").length,
      low: results.filter((r) => r.tier === "low").length,
    } });
  } catch (e) { return serverError(e); }
});
