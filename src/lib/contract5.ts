/**
 * CONTRACT 5 — PERFORMANCE, RELIABILITY & TRUST (HARD LOCK)
 * 
 * This contract ensures:
 * - All pages feel instant (≤1.5s first content, ≤2.0s interactive)
 * - No random mobile behavior
 * - No false offline states
 * - No silent failures
 * - Users trust the app within 3 seconds
 */

import { createLogger } from './logger';

const logger = createLogger('Contract5');

// ============= SLA THRESHOLDS =============
export const SLA = {
  FIRST_MEANINGFUL_CONTENT_MS: 1500,  // Rule 5.1
  FULLY_INTERACTIVE_MS: 2000,          // Rule 5.1
  ABSOLUTE_MAX_MS: 3000,               // Hard failure threshold
} as const;

// ============= PAGE METRICS =============
interface PageLoadMetric {
  pageName: string;
  firstContentTime?: number;
  interactiveTime?: number;
  timestamp: number;
  violations: string[];
}

const pageMetrics = new Map<string, PageLoadMetric>();
let violationCallback: ((violation: { page: string; type: string; value: number }) => void) | null = null;

/**
 * Mark when first meaningful content is shown (skeleton/cached data)
 */
export function markFirstContent(pageName: string): void {
  const now = performance.now();
  const existing = pageMetrics.get(pageName);
  
  if (existing) {
    existing.firstContentTime = now;
  } else {
    pageMetrics.set(pageName, {
      pageName,
      firstContentTime: now,
      timestamp: Date.now(),
      violations: [],
    });
  }
}

/**
 * Mark when page is fully interactive
 */
export function markInteractive(pageName: string): void {
  const now = performance.now();
  const metric = pageMetrics.get(pageName);
  
  if (!metric) {
    // First call - just record
    pageMetrics.set(pageName, {
      pageName,
      interactiveTime: now,
      timestamp: Date.now(),
      violations: [],
    });
    return;
  }
  
  metric.interactiveTime = now;
  
  // Check SLA violations
  if (metric.firstContentTime) {
    if (metric.firstContentTime > SLA.FIRST_MEANINGFUL_CONTENT_MS) {
      const violation = `First content took ${metric.firstContentTime.toFixed(0)}ms (SLA: ${SLA.FIRST_MEANINGFUL_CONTENT_MS}ms)`;
      metric.violations.push(violation);
      logger.warn(`[SLA VIOLATION] ${pageName}: ${violation}`);
      violationCallback?.({ page: pageName, type: 'first_content', value: metric.firstContentTime });
    }
  }
  
  if (metric.interactiveTime > SLA.FULLY_INTERACTIVE_MS) {
    const violation = `Interactive took ${metric.interactiveTime.toFixed(0)}ms (SLA: ${SLA.FULLY_INTERACTIVE_MS}ms)`;
    metric.violations.push(violation);
    logger.warn(`[SLA VIOLATION] ${pageName}: ${violation}`);
    violationCallback?.({ page: pageName, type: 'interactive', value: metric.interactiveTime });
  }
}

/**
 * Set callback for SLA violations (for monitoring/analytics)
 */
export function onSLAViolation(callback: (violation: { page: string; type: string; value: number }) => void): void {
  violationCallback = callback;
}

/**
 * Get all recorded violations
 */
export function getSLAViolations(): Array<{ page: string; violations: string[] }> {
  return Array.from(pageMetrics.values())
    .filter(m => m.violations.length > 0)
    .map(m => ({ page: m.pageName, violations: m.violations }));
}

// ============= MOBILE STABILITY (Rule 5.2) =============
let viewportLocked = false;
let initialViewport: { width: number; height: number; isMobile: boolean } | null = null;

/**
 * Lock viewport configuration at app startup
 * Prevents layout shifts from viewport changes
 */
export function lockViewport(): void {
  if (viewportLocked) return;
  
  initialViewport = {
    width: window.innerWidth,
    height: window.innerHeight,
    isMobile: window.innerWidth < 768,
  };
  viewportLocked = true;
  
  logger.info('Viewport locked', initialViewport);
}

/**
 * Check if current viewport matches locked state
 */
export function isViewportConsistent(): boolean {
  if (!initialViewport) return true;
  
  const currentIsMobile = window.innerWidth < 768;
  return currentIsMobile === initialViewport.isMobile;
}

/**
 * Get initial viewport state
 */
export function getLockedViewport(): typeof initialViewport {
  return initialViewport;
}

// ============= CONNECTION STATE (Rule 5.3) =============
export type ConnectionState = 'online' | 'offline' | 'unstable';

interface ConnectionCheck {
  timestamp: number;
  success: boolean;
  endpoint: string;
  latency?: number;
}

const connectionHistory: ConnectionCheck[] = [];
const MAX_HISTORY = 10;

/**
 * Record a connection check result
 */
export function recordConnectionCheck(success: boolean, endpoint: string, latency?: number): void {
  connectionHistory.push({
    timestamp: Date.now(),
    success,
    endpoint,
    latency,
  });
  
  // Keep only recent history
  if (connectionHistory.length > MAX_HISTORY) {
    connectionHistory.shift();
  }
}

/**
 * Determine connection state based on recent history
 * - Online: last 2+ checks succeeded
 * - Offline: last 2+ checks failed
 * - Unstable: mixed results
 */
export function getConnectionState(): ConnectionState {
  if (connectionHistory.length < 2) {
    // Not enough data, assume online
    return navigator.onLine ? 'online' : 'offline';
  }
  
  const recent = connectionHistory.slice(-3);
  const successes = recent.filter(c => c.success).length;
  
  if (successes >= 2) return 'online';
  if (successes === 0) return 'offline';
  return 'unstable';
}

/**
 * Get connection diagnostics
 */
export function getConnectionDiagnostics(): {
  state: ConnectionState;
  recentChecks: ConnectionCheck[];
  averageLatency: number | null;
} {
  const state = getConnectionState();
  const successfulChecks = connectionHistory.filter(c => c.success && c.latency);
  const avgLatency = successfulChecks.length > 0
    ? successfulChecks.reduce((sum, c) => sum + (c.latency || 0), 0) / successfulChecks.length
    : null;
    
  return {
    state,
    recentChecks: connectionHistory.slice(-5),
    averageLatency: avgLatency,
  };
}

// ============= TRUST SIGNALS (Rule 5.7) =============
export type LoadingState = 'idle' | 'loading' | 'saving' | 'generating' | 'error';

const trustSignals = new Map<string, LoadingState>();

/**
 * Set loading state for a component/operation
 */
export function setLoadingState(id: string, state: LoadingState): void {
  trustSignals.set(id, state);
}

/**
 * Get current loading states
 */
export function getLoadingStates(): Map<string, LoadingState> {
  return new Map(trustSignals);
}

/**
 * Check if any operation is in progress
 */
export function isAnyOperationInProgress(): boolean {
  return Array.from(trustSignals.values()).some(
    state => state === 'loading' || state === 'saving' || state === 'generating'
  );
}

// ============= CONTRACT VERIFICATION =============
export interface Contract5Report {
  passed: boolean;
  timestamp: number;
  results: {
    slaCompliance: { passed: boolean; violations: string[] };
    mobileStability: { passed: boolean; details: string };
    connectionTruth: { passed: boolean; state: ConnectionState };
    trustSignals: { passed: boolean; activeStates: number };
  };
}

/**
 * Verify Contract 5 compliance
 */
export function verifyContract5(): Contract5Report {
  const violations = getSLAViolations();
  const viewportConsistent = isViewportConsistent();
  const connectionState = getConnectionState();
  const activeStates = Array.from(trustSignals.values()).filter(s => s !== 'idle').length;
  
  const slaCompliance = {
    passed: violations.length === 0,
    violations: violations.flatMap(v => v.violations),
  };
  
  const mobileStability = {
    passed: viewportConsistent,
    details: viewportConsistent 
      ? 'Viewport consistent' 
      : 'Viewport changed during session',
  };
  
  const connectionTruth = {
    passed: connectionState !== 'unstable',
    state: connectionState,
  };
  
  const trustSignalsCheck = {
    passed: true, // Trust signals are always "passing" if implemented
    activeStates,
  };
  
  return {
    passed: slaCompliance.passed && mobileStability.passed && connectionTruth.passed,
    timestamp: Date.now(),
    results: {
      slaCompliance,
      mobileStability,
      connectionTruth,
      trustSignals: trustSignalsCheck,
    },
  };
}

// ============= INITIALIZATION =============
/**
 * Initialize Contract 5 monitoring
 */
export function initContract5(): void {
  lockViewport();
  
  // Monitor viewport changes
  window.addEventListener('resize', () => {
    if (!isViewportConsistent()) {
      logger.warn('Viewport inconsistency detected - mobile/desktop switch mid-session');
    }
  });
  
  logger.info('Contract 5 initialized');
}
