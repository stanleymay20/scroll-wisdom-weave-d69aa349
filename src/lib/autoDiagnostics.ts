/**
 * Auto-Diagnostics System
 * Captures errors, network failures, and suggests fixes with auto-retry capabilities
 */

export interface DiagnosticEvent {
  id: string;
  timestamp: Date;
  type: 'error' | 'network' | 'generation' | 'export' | 'auth' | 'ui';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  details?: Record<string, unknown>;
  suggestedFix?: string;
  canAutoRetry: boolean;
  retryCount: number;
  maxRetries: number;
  retryFn?: () => Promise<void>;
  resolved: boolean;
}

interface DiagnosticsState {
  events: DiagnosticEvent[];
  isHealthy: boolean;
  lastCheck: Date;
}

const MAX_EVENTS = 50;
const AUTO_RETRY_DELAYS = [1000, 3000, 5000]; // Progressive backoff

class AutoDiagnosticsManager {
  private state: DiagnosticsState = {
    events: [],
    isHealthy: true,
    lastCheck: new Date(),
  };
  
  private listeners: Set<(state: DiagnosticsState) => void> = new Set();
  private retryQueue: Map<string, ReturnType<typeof setTimeout>> = new Map();

  subscribe(listener: (state: DiagnosticsState) => void): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.state.lastCheck = new Date();
    this.state.isHealthy = !this.state.events.some(
      e => !e.resolved && (e.severity === 'high' || e.severity === 'critical')
    );
    this.listeners.forEach(l => l({ ...this.state }));
  }

  private generateId(): string {
    return `diag_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  captureError(
    error: Error | string,
    options: {
      type?: DiagnosticEvent['type'];
      severity?: DiagnosticEvent['severity'];
      details?: Record<string, unknown>;
      canAutoRetry?: boolean;
      retryFn?: () => Promise<void>;
    } = {}
  ): string {
    const message = typeof error === 'string' ? error : error.message;
    const { type, severity, suggestedFix } = this.classifyError(message);
    
    const event: DiagnosticEvent = {
      id: this.generateId(),
      timestamp: new Date(),
      type: options.type || type,
      severity: options.severity || severity,
      message,
      details: options.details,
      suggestedFix,
      canAutoRetry: options.canAutoRetry ?? this.canAutoRetry(type, message),
      retryCount: 0,
      maxRetries: 3,
      retryFn: options.retryFn,
      resolved: false,
    };

    this.state.events = [event, ...this.state.events.slice(0, MAX_EVENTS - 1)];
    this.notify();

    // Auto-retry if possible
    if (event.canAutoRetry && event.retryFn) {
      this.scheduleRetry(event);
    }

    console.log(`[DIAGNOSTICS] Captured: ${type} - ${message}`);
    return event.id;
  }

  captureNetworkError(
    url: string,
    status: number,
    retryFn?: () => Promise<void>
  ): string {
    const isRetryable = status === 429 || status === 502 || status === 503 || status === 504;
    
    return this.captureError(`Network error: ${status} for ${url}`, {
      type: 'network',
      severity: status === 401 ? 'high' : status >= 500 ? 'medium' : 'low',
      details: { url, status },
      canAutoRetry: isRetryable,
      retryFn,
    });
  }

  private classifyError(message: string): {
    type: DiagnosticEvent['type'];
    severity: DiagnosticEvent['severity'];
    suggestedFix?: string;
  } {
    const lowerMsg = message.toLowerCase();

    // Auth errors
    if (lowerMsg.includes('auth') || lowerMsg.includes('unauthorized') || lowerMsg.includes('401')) {
      return {
        type: 'auth',
        severity: 'high',
        suggestedFix: 'Please sign in again to continue.',
      };
    }

    // Network/rate limit errors
    if (lowerMsg.includes('429') || lowerMsg.includes('rate limit')) {
      return {
        type: 'network',
        severity: 'medium',
        suggestedFix: 'Rate limit reached. Auto-retrying in a moment...',
      };
    }

    // Generation errors
    if (lowerMsg.includes('generat') || lowerMsg.includes('chapter') || lowerMsg.includes('comic')) {
      return {
        type: 'generation',
        severity: 'medium',
        suggestedFix: 'Generation failed. Try again or simplify your request.',
      };
    }

    // Export errors
    if (lowerMsg.includes('export') || lowerMsg.includes('pdf') || lowerMsg.includes('epub')) {
      return {
        type: 'export',
        severity: 'medium',
        suggestedFix: 'Export failed. Ensure all chapters are generated and try again.',
      };
    }

    // UI errors
    if (lowerMsg.includes('render') || lowerMsg.includes('component') || lowerMsg.includes('undefined')) {
      return {
        type: 'ui',
        severity: 'low',
        suggestedFix: 'UI issue detected. Try refreshing the page.',
      };
    }

    return {
      type: 'error',
      severity: 'medium',
    };
  }

  private canAutoRetry(type: DiagnosticEvent['type'], message: string): boolean {
    const lowerMsg = message.toLowerCase();
    
    // Don't auto-retry auth errors
    if (type === 'auth') return false;
    
    // Retry rate limits and server errors
    if (lowerMsg.includes('429') || lowerMsg.includes('rate limit')) return true;
    if (lowerMsg.includes('502') || lowerMsg.includes('503') || lowerMsg.includes('504')) return true;
    if (lowerMsg.includes('timeout') || lowerMsg.includes('timed out')) return true;
    
    // Retry generation failures (sometimes transient)
    if (type === 'generation' && !lowerMsg.includes('validation')) return true;
    
    return false;
  }

  private async scheduleRetry(event: DiagnosticEvent) {
    if (event.retryCount >= event.maxRetries || !event.retryFn) {
      return;
    }

    const delay = AUTO_RETRY_DELAYS[Math.min(event.retryCount, AUTO_RETRY_DELAYS.length - 1)];
    
    console.log(`[DIAGNOSTICS] Scheduling retry ${event.retryCount + 1}/${event.maxRetries} in ${delay}ms`);

    const timeout = setTimeout(async () => {
      try {
        await event.retryFn!();
        this.resolveEvent(event.id);
        console.log(`[DIAGNOSTICS] Auto-retry succeeded for ${event.id}`);
      } catch (retryError) {
        event.retryCount++;
        if (event.retryCount < event.maxRetries) {
          this.scheduleRetry(event);
        } else {
          event.suggestedFix = 'Auto-retry exhausted. Please try manually.';
          this.notify();
        }
      }
      this.retryQueue.delete(event.id);
    }, delay);

    this.retryQueue.set(event.id, timeout);
  }

  resolveEvent(eventId: string) {
    const event = this.state.events.find(e => e.id === eventId);
    if (event) {
      event.resolved = true;
      const timeout = this.retryQueue.get(eventId);
      if (timeout) {
        clearTimeout(timeout);
        this.retryQueue.delete(eventId);
      }
      this.notify();
    }
  }

  clearResolved() {
    this.state.events = this.state.events.filter(e => !e.resolved);
    this.notify();
  }

  getUnresolvedEvents(): DiagnosticEvent[] {
    return this.state.events.filter(e => !e.resolved);
  }

  getState(): DiagnosticsState {
    return { ...this.state };
  }
}

// Singleton instance
export const diagnostics = new AutoDiagnosticsManager();

// Global error handler integration
if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    diagnostics.captureError(event.error || event.message, {
      type: 'error',
      details: {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
      },
    });
  });

  window.addEventListener('unhandledrejection', (event) => {
    diagnostics.captureError(
      event.reason?.message || String(event.reason),
      { type: 'error', severity: 'high' }
    );
  });
}
