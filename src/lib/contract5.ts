/**
 * CONTRACT 5 (ENHANCED) — PERFORMANCE, MEDIA, & UX RELIABILITY (UX-FIRST)
 *
 * Runtime compliance is evidence-based. Checks that are not observed are
 * reported as `unknown` rather than hard-coded passing.
 */

import { createLogger } from './logger';
const logger = createLogger('Contract5');

export const SLA = {
  LIBRARY_CACHE_RENDER_MS: 300,
  FIRST_MEANINGFUL_CONTENT_MS: 1500,
  FULLY_INTERACTIVE_MS: 2000,
  ABSOLUTE_MAX_MS: 3000,
  USER_ACTION_ACK_MS: 100,
  ITEMS_PER_FETCH: 20,
} as const;

interface PageLoadMetric {
  pageName: string;
  startedAt: number;
  firstContentTime?: number;
  interactiveTime?: number;
  cacheRenderTime?: number;
  timestamp: number;
  violations: string[];
}

const pageMetrics = new Map<string, PageLoadMetric>();
let violationCallback: ((violation: { page: string; type: string; value: number }) => void) | null = null;

export function startPageMetric(pageName: string): void {
  pageMetrics.set(pageName, {
    pageName,
    startedAt: performance.now(),
    timestamp: Date.now(),
    violations: [],
  });
}

function ensureMetric(pageName: string): PageLoadMetric {
  const existing = pageMetrics.get(pageName);
  if (existing) return existing;
  const created: PageLoadMetric = {
    pageName,
    startedAt: performance.now(),
    timestamp: Date.now(),
    violations: [],
  };
  pageMetrics.set(pageName, created);
  return created;
}

function elapsed(metric: PageLoadMetric): number {
  return Math.max(0, performance.now() - metric.startedAt);
}

export function markFirstContent(pageName: string): void {
  const metric = ensureMetric(pageName);
  metric.firstContentTime = elapsed(metric);
}

export function markCacheRender(pageName: string): void {
  const metric = ensureMetric(pageName);
  metric.cacheRenderTime = elapsed(metric);
  if (pageName === 'Library' && metric.cacheRenderTime > SLA.LIBRARY_CACHE_RENDER_MS) {
    const violation = `Cache render took ${metric.cacheRenderTime.toFixed(0)}ms (SLA: ${SLA.LIBRARY_CACHE_RENDER_MS}ms)`;
    metric.violations.push(violation);
    logger.warn(`[CACHE SLA VIOLATION] ${pageName}: ${violation}`);
    violationCallback?.({ page: pageName, type: 'cache_render', value: metric.cacheRenderTime });
  }
}

export function markInteractive(pageName: string): void {
  const metric = ensureMetric(pageName);
  metric.interactiveTime = elapsed(metric);

  if (metric.firstContentTime !== undefined && metric.firstContentTime > SLA.FIRST_MEANINGFUL_CONTENT_MS) {
    const violation = `First content took ${metric.firstContentTime.toFixed(0)}ms (SLA: ${SLA.FIRST_MEANINGFUL_CONTENT_MS}ms)`;
    metric.violations.push(violation);
    logger.warn(`[SLA VIOLATION] ${pageName}: ${violation}`);
    violationCallback?.({ page: pageName, type: 'first_content', value: metric.firstContentTime });
  }

  if (metric.interactiveTime > SLA.FULLY_INTERACTIVE_MS) {
    const violation = `Interactive took ${metric.interactiveTime.toFixed(0)}ms (SLA: ${SLA.FULLY_INTERACTIVE_MS}ms)`;
    metric.violations.push(violation);
    logger.warn(`[SLA VIOLATION] ${pageName}: ${violation}`);
    violationCallback?.({ page: pageName, type: 'interactive', value: metric.interactiveTime });
  }
}

export function onSLAViolation(callback: (violation: { page: string; type: string; value: number }) => void): void {
  violationCallback = callback;
}

export function getSLAViolations(): Array<{ page: string; violations: string[] }> {
  return Array.from(pageMetrics.values()).filter(m => m.violations.length > 0).map(m => ({ page: m.pageName, violations: m.violations }));
}
export function getPageMetrics(): Map<string, PageLoadMetric> { return new Map(pageMetrics); }

let viewportLocked = false;
let initialViewport: { width: number; height: number; isMobile: boolean } | null = null;
export function lockViewport(): void {
  if (viewportLocked) return;
  initialViewport = { width: window.innerWidth, height: window.innerHeight, isMobile: window.innerWidth < 768 };
  viewportLocked = true;
  logger.info('Viewport locked', initialViewport);
}
export function isViewportConsistent(): boolean {
  if (!initialViewport) return true;
  return (window.innerWidth < 768) === initialViewport.isMobile;
}
export function getLockedViewport(): typeof initialViewport { return initialViewport; }

export type ConnectionState = 'online' | 'offline' | 'unstable';
interface ConnectionCheck { timestamp: number; success: boolean; endpoint: string; latency?: number; }
const connectionHistory: ConnectionCheck[] = [];
const MAX_HISTORY = 10;

export const OFFLINE_MESSAGES = {
  offline: "You're offline — reading still works",
  unstable: 'Connection unstable — some features may be slow',
  actionNeedsInternet: 'This action needs internet',
  showingCached: 'Showing last saved library',
} as const;

export function recordConnectionCheck(success: boolean, endpoint: string, latency?: number): void {
  connectionHistory.push({ timestamp: Date.now(), success, endpoint, latency });
  if (connectionHistory.length > MAX_HISTORY) connectionHistory.shift();
}

export function getConnectionState(): ConnectionState {
  if (connectionHistory.length < 2) return navigator.onLine ? 'online' : 'offline';
  const recent = connectionHistory.slice(-3);
  const successes = recent.filter(c => c.success).length;
  if (successes >= 2) return 'online';
  if (successes === 0) return 'offline';
  return 'unstable';
}

export function getConnectionMessage(): string | null {
  const state = getConnectionState();
  return state === 'online' ? null : state === 'offline' ? OFFLINE_MESSAGES.offline : OFFLINE_MESSAGES.unstable;
}
export function canPerformOnlineAction(): { allowed: boolean; message?: string } {
  const state = getConnectionState();
  return state === 'offline' ? { allowed: false, message: OFFLINE_MESSAGES.actionNeedsInternet } : { allowed: true };
}
export function getConnectionDiagnostics() {
  const successfulChecks = connectionHistory.filter(c => c.success && c.latency !== undefined);
  const averageLatency = successfulChecks.length
    ? successfulChecks.reduce((sum, c) => sum + (c.latency || 0), 0) / successfulChecks.length
    : null;
  return { state: getConnectionState(), recentChecks: connectionHistory.slice(-5), averageLatency, userMessage: getConnectionMessage() };
}

export type LoadingState = 'idle' | 'loading' | 'saving' | 'generating' | 'buffering' | 'error';
export type AudioState = 'idle' | 'playing' | 'paused' | 'buffering' | 'error';
const trustSignals = new Map<string, LoadingState>();
const audioStates = new Map<string, AudioState>();
let audioReliabilityObserved = false;
let readerConstraintsObserved = false;

export function setLoadingState(id: string, state: LoadingState): void { trustSignals.set(id, state); }
export function setAudioState(id: string, state: AudioState): void { audioReliabilityObserved = true; audioStates.set(id, state); }
export function markReaderConstraintsObserved(): void { readerConstraintsObserved = true; }
export function getLoadingStates(): Map<string, LoadingState> { return new Map(trustSignals); }
export function getAudioStates(): Map<string, AudioState> { return new Map(audioStates); }
export function isAnyOperationInProgress(): boolean {
  return Array.from(trustSignals.values()).some(state => ['loading', 'saving', 'generating', 'buffering'].includes(state));
}

export const READER_CONSTRAINTS = {
  maxContentWidth: '65ch', minFontSize: 14, maxFontSize: 24, lineHeightRatio: 1.75, safeAreaBottom: 80, scrollHideThreshold: 50,
} as const;
export const AUDIO_CONSTRAINTS = { maxChunkSize: 800, firstChunkSize: 260, resumeDebounceMs: 500 } as const;

type CheckState = 'pass' | 'fail' | 'unknown';
export interface Contract5Report {
  passed: boolean;
  complete: boolean;
  timestamp: number;
  results: {
    slaCompliance: { state: CheckState; violations: string[] };
    mobileStability: { state: CheckState; details: string };
    connectionTruth: { state: CheckState; connectionState: ConnectionState; message: string | null };
    trustSignals: { state: CheckState; activeStates: number };
    audioReliability: { state: CheckState; activeAudioPlayers: number };
    readerImmersion: { state: CheckState; details: string };
  };
}

export function verifyContract5(): Contract5Report {
  const violations = getSLAViolations();
  const viewportConsistent = isViewportConsistent();
  const connectionState = getConnectionState();
  const activeStates = Array.from(trustSignals.values()).filter(s => s !== 'idle').length;
  const activeAudioPlayers = Array.from(audioStates.values()).filter(s => s !== 'idle').length;
  const hasMetrics = pageMetrics.size > 0;

  const results: Contract5Report['results'] = {
    slaCompliance: { state: hasMetrics ? (violations.length === 0 ? 'pass' : 'fail') : 'unknown', violations: violations.flatMap(v => v.violations) },
    mobileStability: { state: viewportLocked ? (viewportConsistent ? 'pass' : 'fail') : 'unknown', details: viewportLocked ? (viewportConsistent ? 'Viewport consistent' : 'Viewport changed during session') : 'Viewport not observed' },
    connectionTruth: { state: connectionHistory.length > 0 ? (connectionState === 'unstable' ? 'fail' : 'pass') : 'unknown', connectionState, message: getConnectionMessage() },
    trustSignals: { state: trustSignals.size > 0 ? 'pass' : 'unknown', activeStates },
    audioReliability: { state: audioReliabilityObserved ? 'pass' : 'unknown', activeAudioPlayers },
    readerImmersion: { state: readerConstraintsObserved ? 'pass' : 'unknown', details: readerConstraintsObserved ? `Max width: ${READER_CONSTRAINTS.maxContentWidth}, Safe area: ${READER_CONSTRAINTS.safeAreaBottom}px` : 'Reader constraints not observed' },
  };

  const states = Object.values(results).map(result => result.state);
  return {
    passed: states.every(state => state !== 'fail'),
    complete: states.every(state => state !== 'unknown'),
    timestamp: Date.now(),
    results,
  };
}

export function acknowledgeAction(actionId: string): () => void {
  const startTime = performance.now();
  setLoadingState(actionId, 'loading');
  return () => {
    const duration = performance.now() - startTime;
    setLoadingState(actionId, 'idle');
    if (duration > SLA.USER_ACTION_ACK_MS) logger.debug(`Action ${actionId} acknowledgment took ${duration.toFixed(0)}ms`);
  };
}

export function initContract5(): void {
  lockViewport();
  window.addEventListener('resize', () => {
    if (!isViewportConsistent()) logger.warn('Viewport inconsistency detected - mobile/desktop switch mid-session');
  });
  logger.info('Contract 5 (Enhanced) initialized');
}
