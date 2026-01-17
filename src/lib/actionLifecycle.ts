/**
 * CONTRACT 5D: Interaction Integrity & Anti-Stall Guarantees
 * 
 * INVARIANT: No user action is ever ambiguous, abandoned, or silently dropped.
 * 
 * Every meaningful action follows this lifecycle:
 * INTENT → ACKNOWLEDGED → IN_PROGRESS → RESOLVED | FAILED | TIMEOUT
 */

import { createLogger } from './logger';

const logger = createLogger('ActionLifecycle');

// ============= TYPES =============

export type ActionState = 
  | 'idle'           // No action started
  | 'intent'         // User initiated action
  | 'acknowledged'   // Visual feedback shown (≤100ms)
  | 'in_progress'    // Action is running
  | 'resolved'       // Action completed successfully
  | 'partial'        // Action partially succeeded
  | 'failed'         // Action failed
  | 'timeout'        // Action timed out
  | 'paused'         // Action paused (can resume)
  | 'cancelled';     // User cancelled action

export interface ActionLifecycle {
  id: string;
  type: ActionType;
  state: ActionState;
  startedAt: number;
  acknowledgedAt?: number;
  resolvedAt?: number;
  message?: string;
  error?: string;
  retryCount: number;
  maxRetries: number;
  canRetry: boolean;
  canResume: boolean;
  canCancel: boolean;
  progress?: number;        // 0-100 for progress bars
  metadata?: Record<string, unknown>;
}

export type ActionType = 
  | 'generate-chapter'
  | 'generate-book'
  | 'audio-tts'
  | 'audio-stt'
  | 'voice-conversation'
  | 'save-progress'
  | 'publish'
  | 'export'
  | 'payment'
  | 'quiz-submit'
  | 'regenerate'
  | 'upload'
  | 'generic';

// ============= TIMING CONSTANTS (Contract 5D-2) =============

export const ACTION_TIMEOUTS = {
  ACKNOWLEDGE: 100,       // ≤100ms visual acknowledgement
  SHOW_WORKING: 300,      // >300ms show "working" state
  SHOW_STATUS: 2000,      // >2s show status message
  OFFER_RETRY: 5000,      // >5s offer retry/cancel
  AUTO_TIMEOUT: 10000,    // >10s auto-timeout
  
  // Extended timeouts for AI operations
  AI_GENERATE: 60000,     // 60s for chapter generation
  AI_AUDIO: 30000,        // 30s for TTS
  EXPORT: 45000,          // 45s for export
  PAYMENT: 30000,         // 30s for payment
} as const;

export const ACTION_CONFIG: Record<ActionType, {
  timeout: number;
  maxRetries: number;
  canResume: boolean;
  canCancel: boolean;
}> = {
  'generate-chapter': { timeout: ACTION_TIMEOUTS.AI_GENERATE, maxRetries: 3, canResume: true, canCancel: true },
  'generate-book': { timeout: ACTION_TIMEOUTS.AI_GENERATE, maxRetries: 2, canResume: true, canCancel: true },
  'audio-tts': { timeout: ACTION_TIMEOUTS.AI_AUDIO, maxRetries: 3, canResume: true, canCancel: true },
  'audio-stt': { timeout: ACTION_TIMEOUTS.AI_AUDIO, maxRetries: 2, canResume: false, canCancel: true },
  'voice-conversation': { timeout: ACTION_TIMEOUTS.AI_AUDIO, maxRetries: 2, canResume: true, canCancel: true },
  'save-progress': { timeout: ACTION_TIMEOUTS.AUTO_TIMEOUT, maxRetries: 3, canResume: false, canCancel: false },
  'publish': { timeout: ACTION_TIMEOUTS.EXPORT, maxRetries: 2, canResume: false, canCancel: true },
  'export': { timeout: ACTION_TIMEOUTS.EXPORT, maxRetries: 2, canResume: false, canCancel: true },
  'payment': { timeout: ACTION_TIMEOUTS.PAYMENT, maxRetries: 1, canResume: false, canCancel: true },
  'quiz-submit': { timeout: ACTION_TIMEOUTS.AUTO_TIMEOUT, maxRetries: 2, canResume: false, canCancel: false },
  'regenerate': { timeout: ACTION_TIMEOUTS.AI_GENERATE, maxRetries: 3, canResume: false, canCancel: true },
  'upload': { timeout: ACTION_TIMEOUTS.EXPORT, maxRetries: 2, canResume: true, canCancel: true },
  'generic': { timeout: ACTION_TIMEOUTS.AUTO_TIMEOUT, maxRetries: 2, canResume: false, canCancel: true },
};

// ============= RESOLUTION MESSAGES (Contract 5D-4) =============

export interface ActionResolution {
  type: 'success' | 'partial' | 'failed' | 'paused' | 'timeout' | 'cancelled';
  title: string;
  message: string;
  nextStep?: string;
  action?: {
    label: string;
    handler: () => void;
  };
}

export function createResolution(
  type: ActionResolution['type'],
  context: {
    actionType: ActionType;
    error?: string;
    details?: string;
    retryHandler?: () => void;
    resumeHandler?: () => void;
  }
): ActionResolution {
  const actionName = getActionDisplayName(context.actionType);
  
  switch (type) {
    case 'success':
      return {
        type: 'success',
        title: `${actionName} Complete`,
        message: context.details || `Your ${actionName.toLowerCase()} has completed successfully.`,
      };
      
    case 'partial':
      return {
        type: 'partial',
        title: `${actionName} Partially Complete`,
        message: context.details || `Some items were skipped. ${context.error || ''}`,
        nextStep: 'Review the results and retry failed items if needed.',
      };
      
    case 'failed':
      return {
        type: 'failed',
        title: `${actionName} Failed`,
        message: context.error || 'An unexpected error occurred.',
        nextStep: 'Please try again or contact support if the issue persists.',
        action: context.retryHandler ? {
          label: 'Retry',
          handler: context.retryHandler,
        } : undefined,
      };
      
    case 'paused':
      return {
        type: 'paused',
        title: `${actionName} Paused`,
        message: context.details || 'The action has been paused.',
        nextStep: 'You can resume when ready.',
        action: context.resumeHandler ? {
          label: 'Resume',
          handler: context.resumeHandler,
        } : undefined,
      };
      
    case 'timeout':
      return {
        type: 'timeout',
        title: `${actionName} Timed Out`,
        message: 'The operation took too long to complete.',
        nextStep: 'Please check your connection and try again.',
        action: context.retryHandler ? {
          label: 'Retry',
          handler: context.retryHandler,
        } : undefined,
      };
      
    case 'cancelled':
      return {
        type: 'cancelled',
        title: `${actionName} Cancelled`,
        message: 'The action was cancelled.',
      };
  }
}

function getActionDisplayName(type: ActionType): string {
  const names: Record<ActionType, string> = {
    'generate-chapter': 'Chapter Generation',
    'generate-book': 'Book Generation',
    'audio-tts': 'Audio Playback',
    'audio-stt': 'Voice Recognition',
    'voice-conversation': 'Voice Conversation',
    'save-progress': 'Save',
    'publish': 'Publishing',
    'export': 'Export',
    'payment': 'Payment',
    'quiz-submit': 'Quiz Submission',
    'regenerate': 'Regeneration',
    'upload': 'Upload',
    'generic': 'Action',
  };
  return names[type];
}

// ============= LIFECYCLE FACTORY =============

export function createActionLifecycle(
  type: ActionType,
  metadata?: Record<string, unknown>
): ActionLifecycle {
  const config = ACTION_CONFIG[type];
  
  return {
    id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type,
    state: 'idle',
    startedAt: 0,
    retryCount: 0,
    maxRetries: config.maxRetries,
    canRetry: config.maxRetries > 0,
    canResume: config.canResume,
    canCancel: config.canCancel,
    metadata,
  };
}

// ============= STATE TRANSITIONS =============

export function transitionAction(
  action: ActionLifecycle,
  newState: ActionState,
  details?: { message?: string; error?: string; progress?: number }
): ActionLifecycle {
  const now = Date.now();
  
  // Validate transition
  if (!isValidTransition(action.state, newState)) {
    logger.warn(`Invalid state transition: ${action.state} → ${newState}`, { actionId: action.id });
    return action;
  }
  
  const updated: ActionLifecycle = {
    ...action,
    state: newState,
    message: details?.message ?? action.message,
    error: details?.error ?? action.error,
    progress: details?.progress ?? action.progress,
  };
  
  // Set timestamps
  if (newState === 'intent') {
    updated.startedAt = now;
  } else if (newState === 'acknowledged') {
    updated.acknowledgedAt = now;
  } else if (['resolved', 'partial', 'failed', 'timeout', 'cancelled'].includes(newState)) {
    updated.resolvedAt = now;
  }
  
  // Update retry status
  if (newState === 'failed' || newState === 'timeout') {
    updated.canRetry = action.retryCount < action.maxRetries;
  }
  
  logger.debug(`Action ${action.id}: ${action.state} → ${newState}`, details);
  
  return updated;
}

function isValidTransition(from: ActionState, to: ActionState): boolean {
  const validTransitions: Record<ActionState, ActionState[]> = {
    'idle': ['intent'],
    'intent': ['acknowledged', 'failed', 'cancelled'],
    'acknowledged': ['in_progress', 'failed', 'cancelled'],
    'in_progress': ['resolved', 'partial', 'failed', 'timeout', 'paused', 'cancelled'],
    'resolved': ['idle'],
    'partial': ['idle', 'intent'],
    'failed': ['idle', 'intent'],
    'timeout': ['idle', 'intent'],
    'paused': ['in_progress', 'cancelled', 'idle'],
    'cancelled': ['idle', 'intent'],
  };
  
  return validTransitions[from]?.includes(to) ?? false;
}

// ============= STALL DETECTION (Contract 5D-2) =============

export interface StallStatus {
  isStalled: boolean;
  duration: number;
  shouldShowWorking: boolean;
  shouldShowStatus: boolean;
  shouldOfferRetry: boolean;
  shouldAutoTimeout: boolean;
  timeUntilTimeout: number;
}

export function getStallStatus(action: ActionLifecycle): StallStatus {
  if (!['in_progress', 'acknowledged'].includes(action.state)) {
    return {
      isStalled: false,
      duration: 0,
      shouldShowWorking: false,
      shouldShowStatus: false,
      shouldOfferRetry: false,
      shouldAutoTimeout: false,
      timeUntilTimeout: 0,
    };
  }
  
  const config = ACTION_CONFIG[action.type];
  const elapsed = Date.now() - action.startedAt;
  
  return {
    isStalled: elapsed > ACTION_TIMEOUTS.SHOW_STATUS,
    duration: elapsed,
    shouldShowWorking: elapsed >= ACTION_TIMEOUTS.SHOW_WORKING,
    shouldShowStatus: elapsed >= ACTION_TIMEOUTS.SHOW_STATUS,
    shouldOfferRetry: elapsed >= ACTION_TIMEOUTS.OFFER_RETRY && action.canRetry,
    shouldAutoTimeout: elapsed >= config.timeout,
    timeUntilTimeout: Math.max(0, config.timeout - elapsed),
  };
}

// ============= EVENT EMITTER =============

export function emitActionEvent(
  action: ActionLifecycle,
  eventType: 'started' | 'acknowledged' | 'progress' | 'resolved' | 'failed' | 'timeout' | 'cancelled'
): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('action-lifecycle', {
        detail: { action, eventType },
      })
    );
  }
}
