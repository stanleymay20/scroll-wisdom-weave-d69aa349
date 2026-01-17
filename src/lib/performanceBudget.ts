/**
 * CONTRACT 5C-1: Global Speed Budgets
 * 
 * Hard limits for perceived performance across ScrollLibrary.
 * These are SLAs, not suggestions.
 * 
 * RULE: Nothing may block first paint or user acknowledgement. Ever.
 */

// ============= SPEED BUDGETS (Milliseconds) =============

export const SPEED_BUDGETS = {
  // App-level
  APP_COLD_LAUNCH: 500,        // Skeleton visible in ≤500ms
  ROUTE_CHANGE: 100,           // Cached shell visible in ≤100ms
  
  // Interaction-level
  BUTTON_TAP_FEEDBACK: 100,    // Visual acknowledgement in ≤100ms
  MODAL_OPEN: 100,             // Modal shell visible in ≤100ms
  AUDIO_PLAY_PAUSE: 100,       // UI response in ≤100ms
  
  // Page-level (already enforced by 5B)
  LIBRARY_ENTRY: 100,          // Library skeleton
  BOOK_DETAIL_ENTRY: 100,      // Book detail skeleton
  READER_ENTRY: 100,           // Reader skeleton
  
  // Network-dependent (graceful degradation allowed)
  CONTENT_HYDRATION: 2000,     // Full content load
  IMAGE_LOAD: 3000,            // Image lazy load
  AUDIO_BUFFER: 1500,          // Audio ready to play
} as const;

export type SpeedBudgetKey = keyof typeof SPEED_BUDGETS;

// ============= INTERACTION TYPES =============

export type InteractionType = 
  | 'cold-launch'
  | 'route-change'
  | 'button-tap'
  | 'modal-open'
  | 'audio-toggle'
  | 'library-entry'
  | 'book-entry'
  | 'reader-entry'
  | 'content-hydration';

// ============= PERFORMANCE THRESHOLDS =============

export interface PerformanceThreshold {
  budget: number;
  degradeAt: number;      // When to show degraded UI
  warnAt: number;         // When to log warning
  critical: boolean;      // Is this a critical path?
}

export const THRESHOLDS: Record<InteractionType, PerformanceThreshold> = {
  'cold-launch': {
    budget: SPEED_BUDGETS.APP_COLD_LAUNCH,
    degradeAt: 800,
    warnAt: 600,
    critical: true,
  },
  'route-change': {
    budget: SPEED_BUDGETS.ROUTE_CHANGE,
    degradeAt: 150,
    warnAt: 120,
    critical: true,
  },
  'button-tap': {
    budget: SPEED_BUDGETS.BUTTON_TAP_FEEDBACK,
    degradeAt: 150,
    warnAt: 120,
    critical: false,
  },
  'modal-open': {
    budget: SPEED_BUDGETS.MODAL_OPEN,
    degradeAt: 150,
    warnAt: 120,
    critical: false,
  },
  'audio-toggle': {
    budget: SPEED_BUDGETS.AUDIO_PLAY_PAUSE,
    degradeAt: 150,
    warnAt: 120,
    critical: true,
  },
  'library-entry': {
    budget: SPEED_BUDGETS.LIBRARY_ENTRY,
    degradeAt: 150,
    warnAt: 120,
    critical: true,
  },
  'book-entry': {
    budget: SPEED_BUDGETS.BOOK_DETAIL_ENTRY,
    degradeAt: 150,
    warnAt: 120,
    critical: true,
  },
  'reader-entry': {
    budget: SPEED_BUDGETS.READER_ENTRY,
    degradeAt: 150,
    warnAt: 120,
    critical: true,
  },
  'content-hydration': {
    budget: SPEED_BUDGETS.CONTENT_HYDRATION,
    degradeAt: 3000,
    warnAt: 2500,
    critical: false,
  },
};

// ============= BUDGET STATUS =============

export type BudgetStatus = 'ok' | 'warning' | 'exceeded' | 'critical';

export function getBudgetStatus(
  type: InteractionType,
  elapsed: number
): BudgetStatus {
  const threshold = THRESHOLDS[type];
  
  if (elapsed <= threshold.budget) return 'ok';
  if (elapsed <= threshold.warnAt) return 'warning';
  if (elapsed <= threshold.degradeAt) return 'exceeded';
  return 'critical';
}

// ============= GRACEFUL DEGRADATION RULES =============

export interface DegradationRule {
  trigger: BudgetStatus;
  action: 'show-cached' | 'show-skeleton' | 'queue-action' | 'pre-mount' | 'offline-cache';
  description: string;
}

export const DEGRADATION_RULES: Record<InteractionType, DegradationRule> = {
  'cold-launch': {
    trigger: 'exceeded',
    action: 'show-skeleton',
    description: 'Show app skeleton immediately',
  },
  'route-change': {
    trigger: 'exceeded',
    action: 'show-cached',
    description: 'Show cached/partial page shell',
  },
  'button-tap': {
    trigger: 'exceeded',
    action: 'queue-action',
    description: 'Show feedback immediately, queue actual action',
  },
  'modal-open': {
    trigger: 'exceeded',
    action: 'pre-mount',
    description: 'Pre-mount modal shell before content',
  },
  'audio-toggle': {
    trigger: 'exceeded',
    action: 'queue-action',
    description: 'Toggle UI immediately, queue audio operation',
  },
  'library-entry': {
    trigger: 'exceeded',
    action: 'show-cached',
    description: 'Show cached library data',
  },
  'book-entry': {
    trigger: 'exceeded',
    action: 'show-cached',
    description: 'Show cached book data',
  },
  'reader-entry': {
    trigger: 'exceeded',
    action: 'show-cached',
    description: 'Show cached chapter preview',
  },
  'content-hydration': {
    trigger: 'exceeded',
    action: 'offline-cache',
    description: 'Use offline cache if available',
  },
};
