/**
 * Centralized demo analytics — single-fire events
 */

const firedEvents = new Set<string>();

export type DemoEvent =
  | "demo_opened"
  | "demo_started_timer"
  | "demo_timeout"
  | "demo_completed"
  | "demo_correct"
  | "demo_incorrect"
  | "demo_retry"
  | "demo_attempt_limit"
  | "demo_signup_click"
  | "demo_signup_conversion"
  | "demo_percentile_viewed";

export function trackDemoEvent(event: DemoEvent, payload?: Record<string, unknown>) {
  const key = `${event}_${JSON.stringify(payload ?? {})}`;
  if (firedEvents.has(key)) return;
  firedEvents.add(key);

  try {
    window.dispatchEvent(
      new CustomEvent("sl_analytics", { detail: { event, ...payload } })
    );
  } catch {
    /* silent */
  }
}

export function resetDemoEvents() {
  firedEvents.clear();
}

/** Session-scoped attempt counter */
const ATTEMPT_KEY = "sl_demo_attempt_count";

export function getDemoAttemptCount(): number {
  try {
    return parseInt(sessionStorage.getItem(ATTEMPT_KEY) || "0", 10);
  } catch {
    return 0;
  }
}

export function incrementDemoAttempt(): number {
  const count = getDemoAttemptCount() + 1;
  try {
    sessionStorage.setItem(ATTEMPT_KEY, String(count));
  } catch { /* private browsing */ }
  return count;
}

/** Safe localStorage wrapper */
export function safePersistResult(result: Record<string, unknown>) {
  try {
    const prev = JSON.parse(localStorage.getItem("sl_demo_results") || "[]");
    prev.push(result);
    localStorage.setItem("sl_demo_results", JSON.stringify(prev));
  } catch {
    /* localStorage unavailable — private browsing */
  }
}
