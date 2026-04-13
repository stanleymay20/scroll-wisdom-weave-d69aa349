/**
 * Interruption Priority Manager v2
 * Ensures only one high-attention UI element is shown at a time.
 * 
 * v2: Proper same-priority handling, integration with calmness budget,
 * timestamp tracking for last interruption.
 *
 * Priority order (highest first):
 *  1. hook_screen      (100)
 *  2. streak_recovery  (80)
 *  3. achievement      (65)
 *  4. level_milestone  (60)
 *  5. reward_popup     (40)
 *  6. ai_companion     (20)
 */

export type InterruptionType =
  | 'hook_screen'
  | 'streak_recovery'
  | 'achievement'
  | 'level_milestone'
  | 'reward_popup'
  | 'ai_companion';

const PRIORITY: Record<InterruptionType, number> = {
  hook_screen: 100,
  streak_recovery: 80,
  achievement: 65, // Higher than level_milestone to avoid collision
  level_milestone: 60,
  reward_popup: 40,
  ai_companion: 20,
};

export interface InterruptionState {
  active: Set<InterruptionType>;
  lastShownAt: number;
  shownCount: number;
}

export function createInterruptionState(): InterruptionState {
  return { active: new Set(), lastShownAt: 0, shownCount: 0 };
}

/** Register an interruption as active */
export function activateInterruption(state: InterruptionState, type: InterruptionType) {
  const wasEmpty = state.active.size === 0;
  state.active.add(type);
  if (wasEmpty && state.active.size > 0) {
    state.lastShownAt = Date.now();
    state.shownCount++;
  }
}

/** De-register an interruption */
export function deactivateInterruption(state: InterruptionState, type: InterruptionType) {
  state.active.delete(type);
}

/** Check if a given type is allowed to show (no higher-priority element is active) */
export function canShow(state: InterruptionState, type: InterruptionType): boolean {
  if (!state.active.has(type)) return false; // Not even active
  
  const myPriority = PRIORITY[type];
  for (const active of state.active) {
    if (active === type) continue;
    if (PRIORITY[active] > myPriority) return false;
  }
  return true;
}

/** Get the highest-priority active interruption */
export function highestActive(state: InterruptionState): InterruptionType | null {
  let best: InterruptionType | null = null;
  let bestP = -1;
  for (const t of state.active) {
    if (PRIORITY[t] > bestP) { best = t; bestP = PRIORITY[t]; }
  }
  return best;
}

/** Check if session budget is exhausted */
export function isOverBudget(state: InterruptionState, maxPerSession: number): boolean {
  return state.shownCount >= maxPerSession;
}
