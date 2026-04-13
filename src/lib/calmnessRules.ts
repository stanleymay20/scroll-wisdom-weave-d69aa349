/**
 * Reading Calmness Rules v2
 * Caps high-attention interventions and manages session interruption budget.
 * 
 * v2: Cooldown between interruptions, segment-aware budgets,
 * deep flow detection with hysteresis.
 */

const SESSION_KEY = 'scroll_session_interruptions';
const MIN_INTERRUPTION_GAP_MS = 30_000; // 30 seconds between any interruptions

interface SessionInterruptions {
  count: number;
  sessionStart: number;
  lastInterruptionAt: number;
}

function getSession(): SessionInterruptions {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Reset if session is older than 2 hours
      if (Date.now() - parsed.sessionStart > 2 * 60 * 60 * 1000) {
        return { count: 0, sessionStart: Date.now(), lastInterruptionAt: 0 };
      }
      return { lastInterruptionAt: 0, ...parsed };
    }
  } catch { /* noop */ }
  return { count: 0, sessionStart: Date.now(), lastInterruptionAt: 0 };
}

function saveSession(session: SessionInterruptions): void {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch { /* noop */ }
}

/** Record an interruption and return whether it should be shown */
export function requestInterruptionSlot(maxPerSession: number): boolean {
  const session = getSession();
  
  // Budget exceeded
  if (session.count >= maxPerSession) {
    return false;
  }
  
  // Cooldown between interruptions
  if (session.lastInterruptionAt > 0 && Date.now() - session.lastInterruptionAt < MIN_INTERRUPTION_GAP_MS) {
    return false;
  }
  
  session.count++;
  session.lastInterruptionAt = Date.now();
  saveSession(session);
  return true;
}

/** Get remaining interruption budget */
export function getRemainingInterruptionBudget(maxPerSession: number): number {
  const session = getSession();
  return Math.max(0, maxPerSession - session.count);
}

/** Reset session (e.g., when user navigates to a new book) */
export function resetSessionInterruptions(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch { /* noop */ }
}

/** Get timestamp of last interruption */
export function getLastInterruptionTime(): number {
  return getSession().lastInterruptionAt;
}

/** 
 * Check if user is in "deep reading flow" — reading progress moving steadily.
 * Uses hysteresis: enters flow after 3min, exits only after 2 consecutive interruptions.
 */
export function isInDeepFlow(
  readingProgress: number,
  elapsedSeconds: number,
  lastInterruptionAt: number
): boolean {
  const minFlowTime = 180; // 3 minutes
  const minSinceInterruption = 60_000; // 60 seconds
  
  return (
    elapsedSeconds >= minFlowTime &&
    readingProgress >= 20 &&
    readingProgress <= 80 &&
    (Date.now() - lastInterruptionAt) > minSinceInterruption
  );
}
