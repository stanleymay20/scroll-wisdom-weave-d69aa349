/**
 * Server-side mirror of src/lib/usageGate.ts
 * Edge functions return this canonical shape so the frontend can render a
 * consistent upgrade UI without parsing free-text errors.
 */

export type UsageGateReason =
  | "PLAN_REQUIRED"
  | "BOOK_LIMIT_REACHED"
  | "AUDIO_LIMIT_REACHED"
  | "AI_QUOTA_EXHAUSTED"
  | "MONTHLY_LIMIT_REACHED"
  | "FEATURE_NOT_IN_PLAN"
  | "TRIAL_EXPIRED"
  | "RATE_LIMITED"
  | "SERVICE_UNAVAILABLE"
  | "UNKNOWN";

export interface UsageGateUsage {
  booksGenerated?: number;
  booksLimit?: number | null;
  audioMinutesUsed?: number;
  audioMinutesLimit?: number | null;
  aiRequestsUsed?: number;
  aiRequestsLimit?: number | null;
}

export interface UsageGateResult {
  allowed: boolean;
  reason: UsageGateReason;
  message: string;
  upgradeRequired: boolean;
  currentPlan?: string;
  recommendedPlan?: string;
  usage?: UsageGateUsage;
  resetAt?: string | null;
}

const STATUS_MAP: Record<UsageGateReason, number> = {
  PLAN_REQUIRED: 403,
  BOOK_LIMIT_REACHED: 429,
  AUDIO_LIMIT_REACHED: 429,
  AI_QUOTA_EXHAUSTED: 402,
  MONTHLY_LIMIT_REACHED: 429,
  FEATURE_NOT_IN_PLAN: 403,
  TRIAL_EXPIRED: 402,
  RATE_LIMITED: 429,
  SERVICE_UNAVAILABLE: 503,
  UNKNOWN: 500,
};

const TIER_NEXT: Record<string, string | undefined> = {
  free: "student",
  student: "premium",
  premium: "prophet_tier",
  prophet_tier: undefined,
};

export function recommendNextPlan(plan?: string | null): string | undefined {
  if (!plan) return "premium";
  return TIER_NEXT[plan] ?? "premium";
}

const DEFAULT_MESSAGES: Record<UsageGateReason, string> = {
  PLAN_REQUIRED: "This action requires a paid plan.",
  BOOK_LIMIT_REACHED: "You've reached your monthly book generation limit.",
  AUDIO_LIMIT_REACHED: "Your audio listening minutes are exhausted for this billing cycle.",
  AI_QUOTA_EXHAUSTED: "Our AI capacity for your current plan is exhausted right now. Upgrade to continue immediately.",
  MONTHLY_LIMIT_REACHED: "You've reached this month's usage limit on your current plan.",
  FEATURE_NOT_IN_PLAN: "This feature is available on a higher plan.",
  TRIAL_EXPIRED: "Your trial has ended. Upgrade to continue using premium features.",
  RATE_LIMITED: "Please slow down and try again shortly.",
  SERVICE_UNAVAILABLE: "We're having a brief issue. Please try again in a moment.",
  UNKNOWN: "Action could not be completed.",
};

const UPGRADE_REASONS = new Set<UsageGateReason>([
  "PLAN_REQUIRED",
  "BOOK_LIMIT_REACHED",
  "AUDIO_LIMIT_REACHED",
  "AI_QUOTA_EXHAUSTED",
  "MONTHLY_LIMIT_REACHED",
  "FEATURE_NOT_IN_PLAN",
  "TRIAL_EXPIRED",
]);

export function gateDenied(
  reason: UsageGateReason,
  opts: Partial<Omit<UsageGateResult, "allowed" | "reason">> = {}
): UsageGateResult {
  return {
    allowed: false,
    reason,
    message: opts.message ?? DEFAULT_MESSAGES[reason],
    upgradeRequired: opts.upgradeRequired ?? UPGRADE_REASONS.has(reason),
    currentPlan: opts.currentPlan,
    recommendedPlan: opts.recommendedPlan ?? recommendNextPlan(opts.currentPlan),
    usage: opts.usage,
    resetAt: opts.resetAt ?? null,
  };
}

export function gateAllowed(
  opts: Partial<Pick<UsageGateResult, "currentPlan" | "usage">> = {}
): UsageGateResult {
  return {
    allowed: true,
    reason: "UNKNOWN",
    message: "OK",
    upgradeRequired: false,
    currentPlan: opts.currentPlan,
    usage: opts.usage,
  };
}

export function gateResponse(
  result: UsageGateResult,
  corsHeaders: Record<string, string>
): Response {
  const status = result.allowed ? 200 : STATUS_MAP[result.reason] ?? 403;
  return new Response(
    JSON.stringify({
      gate: result,
      // legacy compat: keep `error` field so old client paths still toast something useful
      error: result.allowed ? undefined : { code: result.reason, message: result.message },
    }),
    {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
}

/**
 * Best-effort write to public.usage_gate_events. Never throws.
 */
// deno-lint-ignore no-explicit-any
export async function recordGateEvent(
  supabase: any,
  payload: {
    user_id: string;
    feature: string;
    reason: UsageGateReason;
    allowed: boolean;
    plan?: string;
    usage_snapshot?: Record<string, unknown>;
  }
): Promise<void> {
  try {
    await supabase.from("usage_gate_events").insert({
      user_id: payload.user_id,
      feature: payload.feature,
      reason: payload.reason,
      allowed: payload.allowed,
      plan: payload.plan ?? null,
      usage_snapshot: payload.usage_snapshot ?? {},
    });
  } catch (e) {
    // best-effort; don't fail the gate over telemetry
    // eslint-disable-next-line no-console
    console.warn("[usage-gate] recordGateEvent failed", e);
  }
}
