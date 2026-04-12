/**
 * Reading Calmness Rules
 * Caps high-attention interventions and manages session interruption budget.
 */

const SESSION_KEY = 'scroll_session_interruptions';

interface SessionInterruptions {
  count: number;
  sessionStart: number;
}

function getSession(): SessionInterruptions {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // Reset if session is older than 2 hours
      if (Date.now() - parsed.sessionStart > 2 * 60 * 60 * 1000) {
        return { count: 0, sessionStart: Date.now() };
      }
      return parsed;
    }
  } catch { /* noop */ }
  return { count: 0, sessionStart: Date.now() };
}

function saveSession(session: SessionInterruptions): void {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch { /* noop */ }
}

/** Record an interruption and return whether it should be shown */
export function requestInterruptionSlot(maxPerSession: number): boolean {
  const session = getSession();
  if (session.count >= maxPerSession) {
    return false;
  }
  session.count++;
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

/** Check if user is in "deep reading flow" — reading progress moving steadily */
export function isInDeepFlow(
  readingProgress: number,
  elapsedSeconds: number,
  lastInterruptionAt: number
): boolean {
  // User is in flow if:
  // 1. They've been reading for >3 minutes
  // 2. Progress is between 20-80% (middle of chapter)
  // 3. Last interruption was >60 seconds ago
  const minFlowTime = 180; // 3 minutes
  const minSinceInterruption = 60_000; // 60 seconds
  
  return (
    elapsedSeconds >= minFlowTime &&
    readingProgress >= 20 &&
    readingProgress <= 80 &&
    (Date.now() - lastInterruptionAt) > minSinceInterruption
  );
}
