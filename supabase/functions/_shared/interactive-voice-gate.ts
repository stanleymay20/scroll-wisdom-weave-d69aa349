export const INTERACTIVE_VOICE_LIMIT_MINUTES: Record<string, number> = {
  free: 5,
  student: 30,
  premium: 120,
  prophet_tier: 300,
};

const WEBM_BYTES_PER_SECOND = 8_000; // recorder is fixed at 64 kbps
const SPEECH_CHARS_PER_MINUTE = 750;
const MIN_CONVERSATION_SECONDS = 15;

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
  return typeof plan === "string" && plan in INTERACTIVE_VOICE_LIMIT_MINUTES
    ? plan
    : "free";
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
  const [{ data: roleData, error: roleError }, { data: profile, error: profileError }] = await Promise.all([
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("plan")
      .or(`user_id.eq.${userId},id.eq.${userId}`)
      .maybeSingle(),
  ]);

  if (roleError) throw new Error(`voice_admin_resolution_failed:${roleError.message}`);
  if (profileError) throw new Error(`voice_plan_resolution_failed:${profileError.message}`);

  const isAdmin = !!roleData;
  const plan = normalizeVoicePlan(profile?.plan);
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
  const limitMinutes = INTERACTIVE_VOICE_LIMIT_MINUTES[plan] ?? INTERACTIVE_VOICE_LIMIT_MINUTES.free;
  const limitSeconds = isAdmin ? -1 : limitMinutes * 60;
  const month = new Date().toISOString().slice(0, 7);

  const { data, error } = await supabase.rpc("reserve_interactive_voice_seconds", {
    _user_id: userId,
    _month: month,
    _seconds: requestedSeconds,
    _limit_seconds: limitSeconds,
  });

  if (error) throw new Error(`voice_quota_reservation_failed:${error.message}`);
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw new Error("voice_quota_reservation_empty");

  return {
    allowed: !!row.allowed,
    plan,
    isAdmin,
    requestedSeconds,
    secondsUsed: Number(row.seconds_used ?? 0),
    remainingSeconds: Number(row.remaining_seconds ?? 0),
    limitSeconds,
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
  const { error } = await supabase.rpc("release_interactive_voice_seconds", {
    _user_id: userId,
    _month: month,
    _seconds: seconds,
  });
  if (error) throw new Error(`voice_quota_release_failed:${error.message}`);
}
