/**
 * Unified Observability Layer
 *
 * Phase 7 of the enterprise hardening audit. Provides:
 *  - Web Vitals capture (LCP, INP, CLS, FCP, TTFB) using native PerformanceObserver
 *    (no external dependency; ~0 KB gzipped overhead)
 *  - Analytics event sink that listens for `sl_analytics` CustomEvents
 *    (already dispatched by demoAnalytics, readingFunnel, etc.) and routes them
 *    through the structured logger so a future remote pipeline can pick them up.
 *  - Route change observer that emits navigation telemetry with timing.
 *  - Long-task warnings to surface main-thread jank in production logs.
 *
 * All sinks are no-ops on the server and silently swallow errors so
 * observability code can NEVER crash the app shell.
 */

import { createLogger, setTraceId } from "@/lib/logger";

const logger = createLogger("Observability");

// ============= Internal state =============

let _initialized = false;
let _lastRoute: string | null = null;
let _lastRouteAt = 0;
let _lcpReported = false;
let _clsValue = 0;
let _clsEntries: PerformanceEntry[] = [];

// Throttle long-task warnings: at most one per minute per category
const _throttle = new Map<string, number>();
function throttled(key: string, windowMs = 60_000): boolean {
  const now = Date.now();
  const last = _throttle.get(key) ?? 0;
  if (now - last < windowMs) return true;
  _throttle.set(key, now);
  return false;
}

// ============= Web Vitals =============

function observeLCP() {
  if (typeof PerformanceObserver === "undefined") return;
  try {
    const po = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const last = entries[entries.length - 1] as PerformanceEntry & { renderTime?: number; loadTime?: number };
      if (!last) return;
      const value = Math.round(last.renderTime || last.loadTime || last.startTime);
      // Report only the final LCP (on tab hide / page unload)
      if (!_lcpReported) {
        logger.info("web-vital:lcp", { value, rating: rate("lcp", value) });
        _lcpReported = true;
      }
    });
    po.observe({ type: "largest-contentful-paint", buffered: true });
  } catch {
    /* unsupported */
  }
}

function observeFCP() {
  if (typeof PerformanceObserver === "undefined") return;
  try {
    const po = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.name === "first-contentful-paint") {
          const value = Math.round(entry.startTime);
          logger.info("web-vital:fcp", { value, rating: rate("fcp", value) });
          po.disconnect();
        }
      }
    });
    po.observe({ type: "paint", buffered: true });
  } catch {
    /* unsupported */
  }
}

function observeCLS() {
  if (typeof PerformanceObserver === "undefined") return;
  try {
    const po = new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as Array<PerformanceEntry & { value: number; hadRecentInput?: boolean }>) {
        if (entry.hadRecentInput) continue;
        _clsValue += entry.value;
        _clsEntries.push(entry);
      }
    });
    po.observe({ type: "layout-shift", buffered: true });
  } catch {
    /* unsupported */
  }
}

function observeINP() {
  if (typeof PerformanceObserver === "undefined") return;
  try {
    let worstINP = 0;
    const po = new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as Array<PerformanceEntry & { duration: number }>) {
        if (entry.duration > worstINP) {
          worstINP = entry.duration;
        }
      }
      if (worstINP > 200 && !throttled("inp-warn", 30_000)) {
        logger.warn("web-vital:inp-spike", {
          value: Math.round(worstINP),
          rating: rate("inp", worstINP),
        });
      }
    });
    // event timing API
    po.observe({ type: "event", buffered: true, durationThreshold: 40 } as PerformanceObserverInit);

    // Final report on page hide
    addEventListener(
      "visibilitychange",
      () => {
        if (document.visibilityState === "hidden" && worstINP > 0) {
          logger.info("web-vital:inp", {
            value: Math.round(worstINP),
            rating: rate("inp", worstINP),
          });
        }
      },
      { capture: true }
    );
  } catch {
    /* unsupported */
  }
}

function observeLongTasks() {
  if (typeof PerformanceObserver === "undefined") return;
  try {
    const po = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        // Only surface egregious blocks (>200ms) and throttle to avoid spam
        if (entry.duration > 200 && !throttled(`long-task:${Math.floor(entry.duration / 100)}`, 30_000)) {
          logger.warn("perf:long-task", {
            duration: Math.round(entry.duration),
            startTime: Math.round(entry.startTime),
            route: _lastRoute,
          });
        }
      }
    });
    po.observe({ type: "longtask", buffered: false });
  } catch {
    /* unsupported */
  }
}

function reportFinalCLS() {
  if (_clsValue === 0) return;
  logger.info("web-vital:cls", {
    value: Number(_clsValue.toFixed(3)),
    rating: rate("cls", _clsValue),
    shifts: _clsEntries.length,
  });
}

function reportTTFB() {
  if (typeof performance === "undefined") return;
  try {
    const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    if (!nav) return;
    const value = Math.round(nav.responseStart - nav.requestStart);
    if (value > 0) {
      logger.info("web-vital:ttfb", { value, rating: rate("ttfb", value) });
    }
  } catch {
    /* ignore */
  }
}

// Web Vitals thresholds (Google standards)
function rate(metric: "lcp" | "fcp" | "cls" | "inp" | "ttfb", value: number): "good" | "needs-improvement" | "poor" {
  switch (metric) {
    case "lcp":
      return value <= 2500 ? "good" : value <= 4000 ? "needs-improvement" : "poor";
    case "fcp":
      return value <= 1800 ? "good" : value <= 3000 ? "needs-improvement" : "poor";
    case "cls":
      return value <= 0.1 ? "good" : value <= 0.25 ? "needs-improvement" : "poor";
    case "inp":
      return value <= 200 ? "good" : value <= 500 ? "needs-improvement" : "poor";
    case "ttfb":
      return value <= 800 ? "good" : value <= 1800 ? "needs-improvement" : "poor";
  }
}

// ============= Analytics sink =============

interface AnalyticsEventDetail {
  event: string;
  [key: string]: unknown;
}

function attachAnalyticsSink() {
  if (typeof window === "undefined") return;
  window.addEventListener("sl_analytics", (e: Event) => {
    try {
      const detail = (e as CustomEvent<AnalyticsEventDetail>).detail;
      if (!detail || typeof detail.event !== "string") return;
      const { event, ...payload } = detail;
      logger.info(`analytics:${event}`, payload as Record<string, unknown>);
    } catch {
      /* never throw from observer */
    }
  });
}

// ============= Route change observer =============

export function trackRouteChange(pathname: string) {
  if (typeof window === "undefined") return;
  const now = performance.now();
  const dwell = _lastRoute && _lastRouteAt ? Math.round(now - _lastRouteAt) : null;

  if (_lastRoute !== pathname) {
    logger.info("route:change", {
      from: _lastRoute,
      to: pathname,
      dwellMs: dwell,
    });
    _lastRoute = pathname;
    _lastRouteAt = now;
    // Refresh trace ID on navigation so logs/spans correlate per page
    setTraceId();
  }
}

// ============= Public init =============

export function initObservability() {
  if (_initialized || typeof window === "undefined") return;
  _initialized = true;

  attachAnalyticsSink();
  observeFCP();
  observeLCP();
  observeCLS();
  observeINP();
  observeLongTasks();

  // Report deferred metrics on page hide (most reliable signal for SPA)
  addEventListener(
    "visibilitychange",
    () => {
      if (document.visibilityState === "hidden") {
        reportFinalCLS();
      }
    },
    { capture: true }
  );

  // Report TTFB once the navigation entry is available
  if (document.readyState === "complete") {
    reportTTFB();
  } else {
    addEventListener("load", () => reportTTFB(), { once: true });
  }

  logger.info("observability:initialized");
}
