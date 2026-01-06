/**
 * PERFORMANCE HARD-LOCK: TTI Logger
 * 
 * Measures Time to Interactive and warns if > 2 seconds.
 * This is the FIRST invariant of ScrollLibrary - all pages MUST be interactive within 2 seconds.
 */

interface PerformanceMetrics {
  firstRender: number;
  interactive: number;
  tti: number; // Time to Interactive
}

const metrics: Map<string, PerformanceMetrics> = new Map();
const TTI_THRESHOLD_MS = 2000;

// Mark when a page starts rendering
export function markFirstRender(pageName: string): void {
  const now = performance.now();
  metrics.set(pageName, {
    firstRender: now,
    interactive: 0,
    tti: 0,
  });
}

// Mark when a page becomes interactive (UI shell visible, buttons clickable)
export function markInteractive(pageName: string): void {
  const now = performance.now();
  const existing = metrics.get(pageName);
  
  if (existing) {
    const tti = now - existing.firstRender;
    existing.interactive = now;
    existing.tti = tti;
    
    // Log warning if TTI exceeds threshold
    if (tti > TTI_THRESHOLD_MS) {
      console.warn(
        `⚠️ PERFORMANCE VIOLATION: ${pageName} took ${tti.toFixed(0)}ms to become interactive (threshold: ${TTI_THRESHOLD_MS}ms)`
      );
    } else if (process.env.NODE_ENV === 'development') {
      console.debug(`✅ ${pageName} TTI: ${tti.toFixed(0)}ms`);
    }
  }
}

// Get metrics for a page
export function getMetrics(pageName: string): PerformanceMetrics | undefined {
  return metrics.get(pageName);
}

// Helper hook for components - automatically tracks TTI
export function usePagePerformance(pageName: string): void {
  // Mark first render immediately (synchronously)
  if (!metrics.has(pageName)) {
    markFirstRender(pageName);
  }
  
  // Mark interactive after first paint (use requestAnimationFrame for accuracy)
  if (typeof window !== 'undefined') {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        markInteractive(pageName);
      });
    });
  }
}

// Check if any page exceeded TTI threshold (for diagnostics)
export function getViolations(): Array<{ page: string; tti: number }> {
  const violations: Array<{ page: string; tti: number }> = [];
  
  metrics.forEach((metric, page) => {
    if (metric.tti > TTI_THRESHOLD_MS) {
      violations.push({ page, tti: metric.tti });
    }
  });
  
  return violations;
}
