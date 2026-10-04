import { BILLING_PLAN_LIMITS, billingPlanFor } from "./billing-plans.ts";

const WEBM_BYTES_PER_SECOND = 8_000; // recorder is fixed at 64 kbps
const SPEECH_CHARS_PER_MINUTE = 750;
const MIN_CONVERSATION_SECONDS = 15;
// Interactive voice is intentionally more expensive than passive narration.
// 1 second of interactive voice consumes 3 audio units; 60 audio units = 1
// standard narration credit.
const INTERACTIVE_AUDIO_UNIT_MULTIPLIER = 3;

export type InteractiveVoiceReservation = {
  allowed: boolean;
  plan: string;
  isAdmin: boolean;
  requestedSeconds: number;
  secondsUsed: number;
  remainingSeconds: number;
  limitSeconds: number;
};

export function normalizeVoicePlan(plan: unknown): string {
  return billingPlanFor(plan);
}

export function estimateWebmSeconds(byteLength: number): number {
  if (!Number.isFinite(byteLength) || byteLength <= 0) return 1;
  return Math.max(1, Math.ceil(byteLength / WEBM_BYTES_PER_SECOND));
}

export function estimateSpeechSeconds(text: string, minimum = 1): number {
  const normalized = text?.trim() ?? "";
  if (!normalized) return Math.max(1, minimum);
  const seconds = Math.ceil((normalized.length / SPEECH_CHARS_PER_MINUTE) * 60);
  return Math.max(minimum, seconds);
}

export function estimateConversationSeconds(text: string): number {
  return estimateSpeechSeconds(text, MIN_CONVERSATION_SECONDS);
}

// deno-lint-ignore no-explicit-any
async function resolvePlanAndAdmin(supabase: any, userId: string) {
  const [
    { data: roleData, error: roleError },
    { data: subscription, error: subscriptionError },
  ] = await Promise.all([
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle(),
    supabase
      .from("subscriptions")
      .select("tier,status,current_period_end")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  if (roleError) throw new Error(`voice_admin_resolution_failed:${roleError.message}`);
  if (subscriptionError) throw new Error(`voice_subscription_resolution_failed:${subscriptionError.message}`);

  const isAdmin = !!roleData;
  const subscriptionHasAccess =
    subscription?.status === "active" || subscription?.status === "trialing";
  const periodIsCurrent =
    !subscription?.current_period_end
    || new Date(subscription.current_period_end).getTime() > Date.now();
  const subscribedPlan = subscriptionHasAccess && periodIsCurrent
    ? subscription?.tier
    : null;

  // profiles.plan is a UI/cache mirror synchronized by the webhook and
  // check-subscription. It is deliberately not an authority for paid compute:
  // a delayed/missed sync must never preserve paid voice quota after the
  // subscription authority has expired or become inactive.
  const plan = billingPlanFor(subscribedPlan);
  return { isAdmin, plan };
}

// deno-lint-ignore no-explicit-any
export async function reserveInteractiveVoiceSeconds(
  supabase: any,
  userId: string,
  requestedSeconds: number,
): Promise<InteractiveVoiceReservation> {
  if (!userId) throw new Error("voice_user_required");
  if (!Number.isInteger(requestedSeconds) || requestedSeconds <= 0) {
    throw new Error("voice_invalid_requested_seconds");
  }

  const { isAdmin, plan } = await resolvePlanAndAdmin(supabase, userId);
  const audioCredits = BILLING_PLAN_LIMITS[plan].audioCreditsPerMonth;
  const baseAudioUnits = isAdmin ? -1 : audioCredits * 60;
  const requestedAudioUnits = requestedSeconds * INTERACTIVE_AUDIO_UNIT_MULTIPLIER;
  const month = new Date().toISOString().slice(0, 7);

  const { data, error } = await supabase.rpc("reserve_billing_usage", {
    _user_id: userId,
    _month: month,
    _metric: "audio_units",
    _units: requestedAudioUnits,
    _base_limit: baseAudioUnits,
  });

  if (error) throw new Error(`voice_quota_reservation_failed:${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("voice_quota_reservation_empty");

  const effectiveAudioUnitLimit = Number(row.effective_limit ?? baseAudioUnits);
  const usedAudioUnits = Number(row.used ?? 0);
  const remainingAudioUnits = Number(row.remaining ?? 0);

  return {
    allowed: !!row.allowed,
    plan,
    isAdmin,
    requestedSeconds,
    secondsUsed: Math.floor(usedAudioUnits / INTERACTIVE_AUDIO_UNIT_MULTIPLIER),
    remainingSeconds: remainingAudioUnits < 0
      ? -1
      : Math.floor(remainingAudioUnits / INTERACTIVE_AUDIO_UNIT_MULTIPLIER),
    limitSeconds: effectiveAudioUnitLimit < 0
      ? -1
      : Math.floor(effectiveAudioUnitLimit / INTERACTIVE_AUDIO_UNIT_MULTIPLIER),
  };
}

// deno-lint-ignore no-explicit-any
export async function releaseInteractiveVoiceSeconds(
  supabase: any,
  userId: string,
  seconds: number,
): Promise<void> {
  if (!userId || !Number.isInteger(seconds) || seconds <= 0) return;
  const month = new Date().toISOString().slice(0, 7);
  const { error } = await supabase.rpc("release_billing_usage", {
    _user_id: userId,
    _month: month,
    _metric: "audio_units",
    _units: seconds * INTERACTIVE_AUDIO_UNIT_MULTIPLIER,
  });
  if (error) throw new Error(`voice_quota_release_failed:${error.message}`);
}