/**
 * Interruption Priority Manager
 * Ensures only one high-attention UI element is shown at a time.
 *
 * Priority order (highest first):
 *  1. hook_screen
 *  2. streak_recovery
 *  3. achievement / level_milestone
 *  4. reward_popup
 *  5. ai_companion
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
  achievement: 60,
  level_milestone: 60,
  reward_popup: 40,
  ai_companion: 20,
};

export interface InterruptionState {
  active: Set<InterruptionType>;
}

export function createInterruptionState(): InterruptionState {
  return { active: new Set() };
}

/** Register an interruption as active */
export function activateInterruption(state: InterruptionState, type: InterruptionType) {
  state.active.add(type);
}

/** De-register an interruption */
export function deactivateInterruption(state: InterruptionState, type: InterruptionType) {
  state.active.delete(type);
}

/** Check if a given type is allowed to show (no higher-priority element is active) */
export function canShow(state: InterruptionState, type: InterruptionType): boolean {
  const myPriority = PRIORITY[type];
  for (const active of state.active) {
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
