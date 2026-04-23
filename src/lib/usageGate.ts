/**
 * Canonical Usage Gate result shape.
 * Used by every premium-action gate (book gen, TTS, AI ops, etc.) so the
 * frontend can render a single consistent upgrade UI instead of guessing
 * from free-text error messages.
 *
 * SERVER is the source of truth. Client checks are supportive UX only.
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

/* ────────────────────────────────────────────────────────────────────── */

const REASON_COPY: Record<UsageGateReason, { title: string; body: string }> = {
  PLAN_REQUIRED: {
    title: "Upgrade required",
    body: "This action requires a paid plan.",
  },
  BOOK_LIMIT_REACHED: {
    title: "Book limit reached",
    body: "You've reached your monthly book generation limit.",
  },
  AUDIO_LIMIT_REACHED: {
    title: "Audio minutes exhausted",
    body: "Your audio listening minutes are exhausted for this billing cycle.",
  },
  AI_QUOTA_EXHAUSTED: {
    title: "AI capacity exhausted",
    body: "Our AI capacity for your current plan is exhausted right now. Upgrade to continue immediately.",
  },
  MONTHLY_LIMIT_REACHED: {
    title: "Monthly limit reached",
    body: "You've reached this month's usage limit on your current plan.",
  },
  FEATURE_NOT_IN_PLAN: {
    title: "Higher plan required",
    body: "This feature is available on a higher plan.",
  },
  TRIAL_EXPIRED: {
    title: "Trial ended",
    body: "Your trial has ended. Upgrade to continue using premium features.",
  },
  RATE_LIMITED: {
    title: "Slow down",
    body: "You're making requests too quickly. Please wait a moment and try again.",
  },
  SERVICE_UNAVAILABLE: {
    title: "Service temporarily unavailable",
    body: "We're having a brief issue. Please try again in a moment.",
  },
  UNKNOWN: {
    title: "Action blocked",
    body: "We couldn't complete this action. Please try again.",
  },
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

export function gateCopy(reason: UsageGateReason): { title: string; body: string } {
  return REASON_COPY[reason] ?? REASON_COPY.UNKNOWN;
}

export function shouldShowUpgrade(reason: UsageGateReason): boolean {
  return UPGRADE_REASONS.has(reason);
}

/**
 * Build a denied gate result with the canonical shape.
 * Used by both server (mirror in error-codes.ts) and client.
 */
export function denied(
  reason: UsageGateReason,
  opts: Partial<Omit<UsageGateResult, "allowed" | "reason">> = {}
): UsageGateResult {
  const copy = gateCopy(reason);
  return {
    allowed: false,
    reason,
    message: opts.message ?? copy.body,
    upgradeRequired: opts.upgradeRequired ?? UPGRADE_REASONS.has(reason),
    currentPlan: opts.currentPlan,
    recommendedPlan: opts.recommendedPlan,
    usage: opts.usage,
    resetAt: opts.resetAt ?? null,
  };
}

export function allowed(usage?: UsageGateUsage, currentPlan?: string): UsageGateResult {
  return {
    allowed: true,
    reason: "UNKNOWN",
    message: "OK",
    upgradeRequired: false,
    currentPlan,
    usage,
  };
}

/* ────────────────────────────────────────────────────────────────────── */
/* Parse arbitrary edge-function / fetch errors into a UsageGateResult.
 * Maps existing legacy shapes (errorResponse, raw 402, raw 429, plain text)
 * so existing call sites keep working while we migrate. */

interface AnyErrorish {
  message?: string;
  status?: number;
  code?: string;
  error?: unknown;
  data?: unknown;
}

const TIER_NEXT: Record<string, string | undefined> = {
  free: "student",
  student: "premium",
  premium: "prophet_tier",
  prophet_tier: undefined,
};

export function recommendNextPlan(currentPlan?: string | null): string | undefined {
  if (!currentPlan) return "premium";
  return TIER_NEXT[currentPlan] ?? "premium";
}

/**
 * Parse anything an edge function might throw / return into UsageGateResult.
 * Honours the canonical shape if the server already produced one.
 */
export function parseGateError(input: unknown, currentPlan?: string): UsageGateResult {
  const text = stringify(input).toLowerCase();
  const e = (input ?? {}) as AnyErrorish;

  // 1) Already canonical?
  const candidate = pickCanonical(input);
  if (candidate) return candidate;

  // 2) Structured edge-function shape: { error: { code, message } }
  const inner =
    (e.error && typeof e.error === "object" ? (e.error as AnyErrorish) : undefined) ??
    (e.data && typeof e.data === "object" ? ((e.data as AnyErrorish).error as AnyErrorish | undefined) : undefined);
  const code = (inner?.code ?? e.code ?? "").toString();
  const msg = inner?.message ?? e.message ?? "";

  const plan = currentPlan;
  const next = recommendNextPlan(plan);

  switch (code) {
    case "DAILY_LIMIT_REACHED":
    case "MONTHLY_LIMIT_REACHED":
      return denied("BOOK_LIMIT_REACHED", { message: String(msg) || gateCopy("BOOK_LIMIT_REACHED").body, currentPlan: plan, recommendedPlan: next });
    case "QUOTA_EXCEEDED":
      return denied("MONTHLY_LIMIT_REACHED", { message: String(msg), currentPlan: plan, recommendedPlan: next });
    case "PLAN_UPGRADE_REQUIRED":
      return denied("PLAN_REQUIRED", { message: String(msg), currentPlan: plan, recommendedPlan: next });
    case "AI_CREDITS_EXHAUSTED":
      return denied("AI_QUOTA_EXHAUSTED", { message: String(msg), currentPlan: plan, recommendedPlan: next });
    case "RATE_LIMITED":
      return denied("RATE_LIMITED", { message: String(msg) });
    case "SERVICE_UNAVAILABLE":
      return denied("SERVICE_UNAVAILABLE", { message: String(msg) });
  }

  // 3) Legacy plain-text patterns
  if (/payment required|insufficient.?quota|ai credits exhausted|402/i.test(text)) {
    return denied("AI_QUOTA_EXHAUSTED", { currentPlan: plan, recommendedPlan: next });
  }
  if (/monthly tts limit|audio.*limit|tts.*exhaust/i.test(text)) {
    return denied("AUDIO_LIMIT_REACHED", { currentPlan: plan, recommendedPlan: next });
  }
  if (/daily book limit|monthly book|book limit reach/i.test(text)) {
    return denied("BOOK_LIMIT_REACHED", { currentPlan: plan, recommendedPlan: next });
  }
  if (/plan.?required|upgrade/i.test(text)) {
    return denied("PLAN_REQUIRED", { currentPlan: plan, recommendedPlan: next });
  }
  if (/rate limit|too many request|429/i.test(text)) {
    return denied("RATE_LIMITED");
  }
  if (/service.*unavailable|temporarily unavailable|503/i.test(text)) {
    return denied("SERVICE_UNAVAILABLE");
  }

  return denied("UNKNOWN", { message: typeof msg === "string" && msg ? msg : "Action could not be completed." });
}

function pickCanonical(input: unknown): UsageGateResult | null {
  if (!input || typeof input !== "object") return null;
  const obj = input as Record<string, unknown>;
  // Direct shape
  if (typeof obj.allowed === "boolean" && typeof obj.reason === "string" && typeof obj.message === "string") {
    return obj as unknown as UsageGateResult;
  }
  // Nested under .data
  if (obj.data && typeof obj.data === "object") {
    const d = obj.data as Record<string, unknown>;
    if (typeof d.allowed === "boolean" && typeof d.reason === "string") {
      return d as unknown as UsageGateResult;
    }
    if (d.gate && typeof d.gate === "object") {
      const g = d.gate as Record<string, unknown>;
      if (typeof g.allowed === "boolean") return g as unknown as UsageGateResult;
    }
  }
  return null;
}

function stringify(x: unknown): string {
  if (x == null) return "";
  if (typeof x === "string") return x;
  if (x instanceof Error) return x.message;
  try {
    return JSON.stringify(x);
  } catch {
    return String(x);
  }
}

/* ────────────────────────────────────────────────────────────────────── */
/* Observability: emit a structured event without leaking content payloads. */

export interface GateEventPayload {
  feature: string;
  reason: UsageGateReason;
  allowed: boolean;
  plan?: string;
  usage?: UsageGateUsage;
  userId?: string;
}

export function logGateEvent(p: GateEventPayload): void {
  // Console marker for ops / structured log scrapers
  // eslint-disable-next-line no-console
  console.info("[usage-gate]", {
    ts: new Date().toISOString(),
    ...p,
  });
}
