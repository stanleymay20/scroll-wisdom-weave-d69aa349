/**
 * PERFORMANCE HARD-LOCK: TTI Logger
 * 
 * Measures Time to Interactive and warns if > 2 seconds.
 * This is the FIRST invariant of ScrollLibrary - all pages MUST be interactive within 2 seconds.
 * 
 * IMPORTANT: TTI is measured from component mount, not page load.
 */

import { useEffect, useRef } from 'react';

interface PerformanceMetrics {
  mountTime: number;
  interactive: number;
  tti: number; // Time to Interactive (from mount)
  tracked: boolean; // Prevent duplicate tracking
}

const metrics: Map<string, PerformanceMetrics> = new Map();
const TTI_THRESHOLD_MS = 2000;

// Mark when a page starts rendering (called at mount)
export function markFirstRender(pageName: string): number {
  const now = performance.now();
  
  // Only set if not already tracked
  if (!metrics.has(pageName)) {
    metrics.set(pageName, {
      mountTime: now,
      interactive: 0,
      tti: 0,
      tracked: false,
    });
  }
  
  return now;
}

// Mark when a page becomes interactive (UI shell visible, buttons clickable)
export function markInteractive(pageName: string): void {
  const now = performance.now();
  const existing = metrics.get(pageName);
  
  // Skip if already tracked
  if (!existing || existing.tracked) return;
  
  const tti = now - existing.mountTime;
  existing.interactive = now;
  existing.tti = tti;
  existing.tracked = true;
  
  // Log warning if TTI exceeds threshold
  if (tti > TTI_THRESHOLD_MS) {
    console.warn(
      `⚠️ PERFORMANCE VIOLATION: ${pageName} took ${tti.toFixed(0)}ms to become interactive (threshold: ${TTI_THRESHOLD_MS}ms)`
    );
  } else if (import.meta.env.DEV) {
    console.debug(`✅ ${pageName} TTI: ${tti.toFixed(0)}ms`);
  }
}

// Get metrics for a page
export function getMetrics(pageName: string): PerformanceMetrics | undefined {
  return metrics.get(pageName);
}

// Reset metrics for a page (useful for navigation)
export function resetPageMetrics(pageName: string): void {
  metrics.delete(pageName);
}

// Helper hook for components - automatically tracks TTI
export function usePagePerformance(pageName: string): void {
  const mountTimeRef = useRef<number | null>(null);
  const trackedRef = useRef(false);
  
  // Mark mount time synchronously on first render
  if (mountTimeRef.current === null) {
    // Reset any stale metrics from previous visits
    metrics.delete(pageName);
    mountTimeRef.current = markFirstRender(pageName);
  }
  
  useEffect(() => {
    // Only track once per component lifecycle
    if (trackedRef.current) return;
    trackedRef.current = true;
    
    // Use double RAF to ensure we're after first paint
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        markInteractive(pageName);
      });
    });
    
    // Cleanup on unmount - reset for next visit
    return () => {
      metrics.delete(pageName);
    };
  }, [pageName]);
}

// Check if any page exceeded TTI threshold (for diagnostics)
export function getViolations(): Array<{ page: string; tti: number }> {
  const violations: Array<{ page: string; tti: number }> = [];
  
  metrics.forEach((metric, page) => {
    if (metric.tti > TTI_THRESHOLD_MS && metric.tracked) {
      violations.push({ page, tti: metric.tti });
    }
  });
  
  return violations;
}
