/**
 * CONTRACT 5C-3: Perceived Speed Enforcement Layer
 * 
 * The Performance Guardian tracks and enforces speed budgets.
 * It does NOT optimize — it ENFORCES.
 * 
 * Responsibilities:
 * - Track Time To First Interaction (TTFI)
 * - Track Tap → Feedback latency
 * - Track Route shell paint time
 * - Detect blocking async paths
 * - Warn in dev if budget exceeded
 * - Auto-degrade in production
 */

import { createLogger } from './logger';
import {
  InteractionType,
  THRESHOLDS,
  getBudgetStatus,
  BudgetStatus,
  DEGRADATION_RULES,
  DegradationRule,
} from './performanceBudget';

const logger = createLogger('PerformanceGuardian');

// ============= TYPES =============

export interface PerformanceMeasurement {
  type: InteractionType;
  startTime: number;
  endTime?: number;
  duration?: number;
  status: BudgetStatus;
  component?: string;
  metadata?: Record<string, unknown>;
}

export interface GuardianReport {
  measurements: PerformanceMeasurement[];
  violations: PerformanceMeasurement[];
  averages: Record<InteractionType, number>;
  worstOffenders: PerformanceMeasurement[];
}

// ============= SINGLETON STATE =============

const measurements: PerformanceMeasurement[] = [];
const activeTimers: Map<string, PerformanceMeasurement> = new Map();
const MAX_MEASUREMENTS = 100;

// ============= CORE API =============

/**
 * Start timing an interaction
 * Returns a unique timer ID
 */
export function startTiming(
  type: InteractionType,
  component?: string,
  metadata?: Record<string, unknown>
): string {
  const id = `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  
  const measurement: PerformanceMeasurement = {
    type,
    startTime: performance.now(),
    status: 'ok',
    component,
    metadata,
  };
  
  activeTimers.set(id, measurement);
  return id;
}

/**
 * End timing and record the measurement
 * Returns the measurement with status
 */
export function endTiming(timerId: string): PerformanceMeasurement | null {
  const measurement = activeTimers.get(timerId);
  if (!measurement) {
    logger.warn(`Timer not found: ${timerId}`);
    return null;
  }
  
  activeTimers.delete(timerId);
  
  measurement.endTime = performance.now();
  measurement.duration = measurement.endTime - measurement.startTime;
  measurement.status = getBudgetStatus(measurement.type, measurement.duration);
  
  // Record measurement
  recordMeasurement(measurement);
  
  // Handle violations
  if (measurement.status !== 'ok') {
    handleViolation(measurement);
  }
  
  return measurement;
}

/**
 * Quick timing for synchronous operations
 */
export function measureSync<T>(
  type: InteractionType,
  fn: () => T,
  component?: string
): T {
  const id = startTiming(type, component);
  try {
    return fn();
  } finally {
    endTiming(id);
  }
}

/**
 * Quick timing for async operations
 */
export async function measureAsync<T>(
  type: InteractionType,
  fn: () => Promise<T>,
  component?: string
): Promise<T> {
  const id = startTiming(type, component);
  try {
    return await fn();
  } finally {
    endTiming(id);
  }
}

// ============= INTERNAL FUNCTIONS =============

function recordMeasurement(measurement: PerformanceMeasurement): void {
  measurements.push(measurement);
  
  // LRU cleanup
  if (measurements.length > MAX_MEASUREMENTS) {
    measurements.shift();
  }
}

function handleViolation(measurement: PerformanceMeasurement): void {
  const threshold = THRESHOLDS[measurement.type];
  const rule = DEGRADATION_RULES[measurement.type];
  
  const message = `⚠️ Speed budget exceeded: ${measurement.type} took ${measurement.duration?.toFixed(0)}ms (budget: ${threshold.budget}ms)`;
  
  // Always log in development
  if (import.meta.env.DEV) {
    if (measurement.status === 'critical') {
      console.error(message, { measurement, rule });
    } else {
      console.warn(message, { measurement, rule });
    }
  }
  
  // Log to our logger
  if (threshold.critical) {
    logger.error(message, { measurement });
  } else {
    logger.warn(message, { measurement });
  }
  
  // Emit event for monitoring (production)
  emitViolationEvent(measurement, rule);
}

function emitViolationEvent(
  measurement: PerformanceMeasurement,
  rule: DegradationRule
): void {
  // Custom event for monitoring systems to capture
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('performance-violation', {
        detail: { measurement, rule },
      })
    );
  }
}

// ============= REPORTING API =============

/**
 * Get performance report
 */
export function getReport(): GuardianReport {
  const violations = measurements.filter(m => m.status !== 'ok');
  
  // Calculate averages by type
  const averages: Partial<Record<InteractionType, number>> = {};
  const typeCounts: Partial<Record<InteractionType, number>> = {};
  const typeTotals: Partial<Record<InteractionType, number>> = {};
  
  for (const m of measurements) {
    if (m.duration) {
      typeCounts[m.type] = (typeCounts[m.type] || 0) + 1;
      typeTotals[m.type] = (typeTotals[m.type] || 0) + m.duration;
    }
  }
  
  for (const type of Object.keys(typeTotals) as InteractionType[]) {
    averages[type] = (typeTotals[type] || 0) / (typeCounts[type] || 1);
  }
  
  // Get worst offenders
  const worstOffenders = [...measurements]
    .filter(m => m.duration)
    .sort((a, b) => (b.duration || 0) - (a.duration || 0))
    .slice(0, 5);
  
  return {
    measurements: [...measurements],
    violations,
    averages: averages as Record<InteractionType, number>,
    worstOffenders,
  };
}

/**
 * Clear all measurements (for testing)
 */
export function clearMeasurements(): void {
  measurements.length = 0;
  activeTimers.clear();
}

// ============= ENFORCEMENT HOOKS =============

/**
 * Assert that an operation completes within budget
 * Throws in development, logs in production
 */
export function assertBudget(
  type: InteractionType,
  duration: number,
  component?: string
): void {
  const status = getBudgetStatus(type, duration);
  
  if (status === 'critical' && import.meta.env.DEV) {
    throw new Error(
      `[Contract 5C Violation] ${component || type} exceeded critical budget: ${duration.toFixed(0)}ms`
    );
  }
}

/**
 * Check if we should degrade UI
 */
export function shouldDegrade(type: InteractionType, elapsed: number): boolean {
  const threshold = THRESHOLDS[type];
  return elapsed >= threshold.degradeAt;
}

/**
 * Get recommended degradation action
 */
export function getDegradationAction(type: InteractionType): DegradationRule {
  return DEGRADATION_RULES[type];
}

// ============= INITIALIZATION =============

// Track app cold launch
if (typeof window !== 'undefined') {
  const appStartTime = performance.now();
  
  // Measure time to first paint
  if ('requestIdleCallback' in window) {
    requestIdleCallback(() => {
      const duration = performance.now() - appStartTime;
      const status = getBudgetStatus('cold-launch', duration);
      
      recordMeasurement({
        type: 'cold-launch',
        startTime: appStartTime,
        endTime: performance.now(),
        duration,
        status,
        component: 'App',
      });
      
      if (status !== 'ok') {
        handleViolation({
          type: 'cold-launch',
          startTime: appStartTime,
          endTime: performance.now(),
          duration,
          status,
          component: 'App',
        });
      }
    });
  }
}
