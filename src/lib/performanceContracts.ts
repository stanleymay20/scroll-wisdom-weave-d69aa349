/**
 * CONTRACT 4 & 4A — PERFORMANCE GUARANTEES
 *
 * Performance is measured as elapsed time from an explicit page-operation
 * baseline. Raw `performance.now()` values are never compared directly to SLAs.
 */

export const TTI_THRESHOLD_MS = 2000;
export const MOBILE_TTI_THRESHOLD_MS = 2500;
export const NETWORK_TIMEOUT_MS = 3000;

interface PageMetrics {
  pageName: string;
  startedAt: number;
  firstPaint: number | null;
  interactive: number;
  tti: number;
  isMobile: boolean;
  violations: string[];
}

const pageMetrics = new Map<string, PageMetrics>();
const pageBaselines = new Map<string, number>();
let performanceViolationCallback: ((violation: string) => void) | null = null;

export function setPerformanceViolationCallback(cb: (violation: string) => void): void {
  performanceViolationCallback = cb;
}

/** Start/restart the SLA clock for a route or page operation. */
export function startPagePerformance(pageName: string): number {
  const startedAt = performance.now();
  pageBaselines.set(pageName, startedAt);
  return startedAt;
}

export function recordPageMetric(
  pageName: string,
  ttiOrInteractiveAt: number,
  isMobile: boolean = false,
  startedAt?: number
): void {
  const baseline = startedAt ?? pageBaselines.get(pageName) ?? 0;
  // Backwards compatibility: callers that already pass an elapsed duration keep working.
  const tti = ttiOrInteractiveAt >= baseline && baseline > 0
    ? ttiOrInteractiveAt - baseline
    : ttiOrInteractiveAt;
  const threshold = isMobile ? MOBILE_TTI_THRESHOLD_MS : TTI_THRESHOLD_MS;
  const violations: string[] = [];

  if (tti > threshold) {
    const violation = `⚠️ CONTRACT 4 VIOLATION: ${pageName} TTI ${tti.toFixed(0)}ms exceeds ${threshold}ms threshold`;
    violations.push(violation);
    console.warn(violation);
    performanceViolationCallback?.(violation);
  }

  pageMetrics.set(pageName, {
    pageName,
    startedAt: baseline,
    firstPaint: null,
    interactive: baseline + tti,
    tti,
    isMobile,
    violations,
  });
}

export function getPageMetrics(): Map<string, PageMetrics> { return new Map(pageMetrics); }
export function clearPageMetrics(): void { pageMetrics.clear(); pageBaselines.clear(); }

export interface BlockingCheckResult {
  isBlocking: boolean;
  blockingCalls: string[];
  recommendation: string;
}

const blockingCallStack: string[] = [];
let isTrackingRender = false;

export function startRenderTracking(): void { isTrackingRender = true; blockingCallStack.length = 0; }

export function stopRenderTracking(): BlockingCheckResult {
  isTrackingRender = false;
  const calls = [...blockingCallStack];
  blockingCallStack.length = 0;
  return {
    isBlocking: calls.length > 0,
    blockingCalls: calls,
    recommendation: calls.length > 0 ? 'Move these calls to useEffect or defer with startTransition' : 'No blocking calls detected',
  };
}

export function reportBlockingCall(callName: string): void {
  if (isTrackingRender) {
    blockingCallStack.push(callName);
    console.warn(`⚠️ BLOCKING CALL DURING RENDER: ${callName}`);
  }
}

export interface SkeletonConfig { showAfterMs: number; minDurationMs: number; }
export const DEFAULT_SKELETON_CONFIG: SkeletonConfig = { showAfterMs: 100, minDurationMs: 300 };

export function createSkeletonState(config = DEFAULT_SKELETON_CONFIG) {
  let showSkeletonTimeout: ReturnType<typeof setTimeout> | null = null;
  let minDurationTimeout: ReturnType<typeof setTimeout> | null = null;
  let loadStartTime = 0;
  return {
    startLoading: () => {
      loadStartTime = Date.now();
      return new Promise<boolean>((resolve) => {
        showSkeletonTimeout = setTimeout(() => resolve(true), config.showAfterMs);
      });
    },
    finishLoading: (): Promise<void> => {
      if (showSkeletonTimeout) clearTimeout(showSkeletonTimeout);
      const remaining = config.minDurationMs - (Date.now() - loadStartTime);
      if (remaining > 0) return new Promise(resolve => { minDurationTimeout = setTimeout(resolve, remaining); });
      return Promise.resolve();
    },
    cleanup: () => {
      if (showSkeletonTimeout) clearTimeout(showSkeletonTimeout);
      if (minDurationTimeout) clearTimeout(minDurationTimeout);
    },
  };
}

let cachedAuthState: { user: unknown | null; checked: boolean } = { user: null, checked: false };
export function getCachedAuthState() { return cachedAuthState; }
export function setCachedAuthState(user: unknown | null) { cachedAuthState = { user, checked: true }; }
export function clearCachedAuthState() { cachedAuthState = { user: null, checked: false }; }

export interface MobileOptimizationFlags {
  reduceDataFetch: boolean;
  limitImageQuality: boolean;
  deferHeavyComponents: boolean;
  useVirtualization: boolean;
}

export function getMobileOptimizationFlags(isMobile: boolean): MobileOptimizationFlags {
  return isMobile
    ? { reduceDataFetch: true, limitImageQuality: true, deferHeavyComponents: true, useVirtualization: true }
    : { reduceDataFetch: false, limitImageQuality: false, deferHeavyComponents: false, useVirtualization: false };
}

export const MOBILE_DATA_LIMITS = { libraryItemsPerPage: 8, exploreBooksPerPage: 12, recentBooksCount: 4, continueReadingCount: 3 };
export const DESKTOP_DATA_LIMITS = { libraryItemsPerPage: 12, exploreBooksPerPage: 20, recentBooksCount: 6, continueReadingCount: 5 };
export function getDataLimits(isMobile: boolean) { return isMobile ? MOBILE_DATA_LIMITS : DESKTOP_DATA_LIMITS; }

export const PWA_CACHE_STRATEGY = {
  reading: 'CacheFirst',
  userLibrary: 'NetworkFirst',
  auth: 'NetworkOnly',
  generation: 'NetworkOnly',
  export: 'NetworkOnly',
  fonts: 'StaleWhileRevalidate',
  images: 'CacheFirst',
};

export function verifyContract4Compliance(): {
  compliant: boolean;
  violations: string[];
  metrics: Array<{ page: string; tti: number; threshold: number }>;
} {
  const violations: string[] = [];
  const metrics: Array<{ page: string; tti: number; threshold: number }> = [];
  pageMetrics.forEach((metric, page) => {
    const threshold = metric.isMobile ? MOBILE_TTI_THRESHOLD_MS : TTI_THRESHOLD_MS;
    metrics.push({ page, tti: metric.tti, threshold });
    if (metric.tti > threshold) violations.push(`${page}: TTI ${metric.tti.toFixed(0)}ms > ${threshold}ms`);
  });
  return { compliant: violations.length === 0, violations, metrics };
}
