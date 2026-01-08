/**
 * CONTRACT 4 & 4A — PERFORMANCE GUARANTEES
 * 
 * All pages must render within 1-2 seconds.
 * Enforces non-blocking rendering, skeleton-first UI, background auth resolution.
 */

// ===========================================
// CONSTANTS
// ===========================================

export const TTI_THRESHOLD_MS = 2000; // 2 seconds max
export const MOBILE_TTI_THRESHOLD_MS = 2500; // Slightly more lenient for mobile
export const NETWORK_TIMEOUT_MS = 3000; // Network calls timeout for initial render

// ===========================================
// PERFORMANCE TRACKING
// ===========================================

interface PageMetrics {
  pageName: string;
  firstPaint: number;
  interactive: number;
  tti: number;
  isMobile: boolean;
  violations: string[];
}

const pageMetrics = new Map<string, PageMetrics>();
let performanceViolationCallback: ((violation: string) => void) | null = null;

export function setPerformanceViolationCallback(cb: (violation: string) => void): void {
  performanceViolationCallback = cb;
}

export function recordPageMetric(
  pageName: string,
  tti: number,
  isMobile: boolean = false
): void {
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
    firstPaint: performance.now() - tti,
    interactive: performance.now(),
    tti,
    isMobile,
    violations
  });
}

export function getPageMetrics(): Map<string, PageMetrics> {
  return new Map(pageMetrics);
}

export function clearPageMetrics(): void {
  pageMetrics.clear();
}

// ===========================================
// BLOCKING DETECTION
// ===========================================

export interface BlockingCheckResult {
  isBlocking: boolean;
  blockingCalls: string[];
  recommendation: string;
}

// Track blocking calls during render
const blockingCallStack: string[] = [];
let isTrackingRender = false;

export function startRenderTracking(): void {
  isTrackingRender = true;
  blockingCallStack.length = 0;
}

export function stopRenderTracking(): BlockingCheckResult {
  isTrackingRender = false;
  const calls = [...blockingCallStack];
  blockingCallStack.length = 0;
  
  return {
    isBlocking: calls.length > 0,
    blockingCalls: calls,
    recommendation: calls.length > 0 
      ? 'Move these calls to useEffect or defer with startTransition'
      : 'No blocking calls detected'
  };
}

export function reportBlockingCall(callName: string): void {
  if (isTrackingRender) {
    blockingCallStack.push(callName);
    console.warn(`⚠️ BLOCKING CALL DURING RENDER: ${callName}`);
  }
}

// ===========================================
// SKELETON-FIRST PATTERNS
// ===========================================

export interface SkeletonConfig {
  showAfterMs: number; // Only show skeleton if loading takes longer
  minDurationMs: number; // Minimum skeleton display to prevent flash
}

export const DEFAULT_SKELETON_CONFIG: SkeletonConfig = {
  showAfterMs: 100, // Don't flash skeleton for instant loads
  minDurationMs: 300 // Prevent skeleton flash
};

/**
 * Hook helper for skeleton-first loading
 */
export function createSkeletonState(config = DEFAULT_SKELETON_CONFIG) {
  let showSkeletonTimeout: ReturnType<typeof setTimeout> | null = null;
  let minDurationTimeout: ReturnType<typeof setTimeout> | null = null;
  let loadStartTime = 0;
  
  return {
    startLoading: () => {
      loadStartTime = Date.now();
      return new Promise<boolean>((resolve) => {
        showSkeletonTimeout = setTimeout(() => {
          resolve(true); // Show skeleton
        }, config.showAfterMs);
      });
    },
    
    finishLoading: (): Promise<void> => {
      if (showSkeletonTimeout) {
        clearTimeout(showSkeletonTimeout);
      }
      
      const elapsed = Date.now() - loadStartTime;
      const remaining = config.minDurationMs - elapsed;
      
      if (remaining > 0) {
        return new Promise(resolve => {
          minDurationTimeout = setTimeout(resolve, remaining);
        });
      }
      
      return Promise.resolve();
    },
    
    cleanup: () => {
      if (showSkeletonTimeout) clearTimeout(showSkeletonTimeout);
      if (minDurationTimeout) clearTimeout(minDurationTimeout);
    }
  };
}

// ===========================================
// BACKGROUND AUTH RESOLUTION
// ===========================================

let cachedAuthState: { user: unknown | null; checked: boolean } = {
  user: null,
  checked: false
};

export function getCachedAuthState() {
  return cachedAuthState;
}

export function setCachedAuthState(user: unknown | null) {
  cachedAuthState = { user, checked: true };
}

export function clearCachedAuthState() {
  cachedAuthState = { user: null, checked: false };
}

// ===========================================
// MOBILE OPTIMIZATION
// ===========================================

export interface MobileOptimizationFlags {
  reduceDataFetch: boolean;
  limitImageQuality: boolean;
  deferHeavyComponents: boolean;
  useVirtualization: boolean;
}

export function getMobileOptimizationFlags(isMobile: boolean): MobileOptimizationFlags {
  if (!isMobile) {
    return {
      reduceDataFetch: false,
      limitImageQuality: false,
      deferHeavyComponents: false,
      useVirtualization: false
    };
  }
  
  return {
    reduceDataFetch: true, // Fetch fewer items initially
    limitImageQuality: true, // Use smaller images
    deferHeavyComponents: true, // Lazy load heavy components
    useVirtualization: true // Use virtual lists for long lists
  };
}

export const MOBILE_DATA_LIMITS = {
  libraryItemsPerPage: 8, // vs 12 on desktop
  exploreBooksPerPage: 12, // vs 20 on desktop
  recentBooksCount: 4, // vs 6 on desktop
  continueReadingCount: 3 // vs 5 on desktop
};

export const DESKTOP_DATA_LIMITS = {
  libraryItemsPerPage: 12,
  exploreBooksPerPage: 20,
  recentBooksCount: 6,
  continueReadingCount: 5
};

export function getDataLimits(isMobile: boolean) {
  return isMobile ? MOBILE_DATA_LIMITS : DESKTOP_DATA_LIMITS;
}

// ===========================================
// PWA CACHE STRATEGY
// ===========================================

export const PWA_CACHE_STRATEGY = {
  // Cache-first for reading content (already fetched)
  reading: 'CacheFirst',
  
  // Network-first for user-specific data
  userLibrary: 'NetworkFirst',
  
  // Network-only for mutations and auth
  auth: 'NetworkOnly',
  generation: 'NetworkOnly',
  export: 'NetworkOnly',
  
  // Stale-while-revalidate for static assets
  fonts: 'StaleWhileRevalidate',
  images: 'CacheFirst'
};

// ===========================================
// CONTRACT VERIFICATION
// ===========================================

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
    
    if (metric.tti > threshold) {
      violations.push(`${page}: TTI ${metric.tti.toFixed(0)}ms > ${threshold}ms`);
    }
  });
  
  return {
    compliant: violations.length === 0,
    violations,
    metrics
  };
}
