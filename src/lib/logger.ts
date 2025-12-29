/**
 * Enterprise-grade logging system
 * Provides structured logging with levels, context, and performance tracking
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: string;
  data?: Record<string, unknown>;
  duration?: number;
  traceId?: string;
}

interface LoggerConfig {
  minLevel: LogLevel;
  enableConsole: boolean;
  enableRemote: boolean;
  sensitiveFields: string[];
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// Default configuration
const config: LoggerConfig = {
  minLevel: import.meta.env.DEV ? 'debug' : 'info',
  enableConsole: true,
  enableRemote: false, // Enable when remote logging service is configured
  sensitiveFields: ['password', 'token', 'secret', 'apiKey', 'authorization', 'cookie', 'email'],
};

// Generate trace ID for request correlation
function generateTraceId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 9)}`;
}

// Current trace ID for the session
let currentTraceId = generateTraceId();

/**
 * Mask sensitive data in objects
 */
function maskSensitiveData(data: Record<string, unknown>): Record<string, unknown> {
  const masked: Record<string, unknown> = {};
  
  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();
    
    if (config.sensitiveFields.some(field => lowerKey.includes(field.toLowerCase()))) {
      masked[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      masked[key] = maskSensitiveData(value as Record<string, unknown>);
    } else if (typeof value === 'string' && value.length > 100) {
      // Truncate long strings
      masked[key] = `${value.substring(0, 100)}...[truncated]`;
    } else {
      masked[key] = value;
    }
  }
  
  return masked;
}

/**
 * Format log entry for console output
 */
function formatConsoleOutput(entry: LogEntry): string {
  const parts = [
    `[${entry.timestamp}]`,
    `[${entry.level.toUpperCase()}]`,
    entry.context ? `[${entry.context}]` : '',
    entry.message,
    entry.duration !== undefined ? `(${entry.duration}ms)` : '',
  ];
  
  return parts.filter(Boolean).join(' ');
}

/**
 * Write log entry to console
 */
function writeToConsole(entry: LogEntry): void {
  if (!config.enableConsole) return;
  
  const output = formatConsoleOutput(entry);
  const data = entry.data ? maskSensitiveData(entry.data) : undefined;
  
  switch (entry.level) {
    case 'debug':
      console.debug(output, data ?? '');
      break;
    case 'info':
      console.info(output, data ?? '');
      break;
    case 'warn':
      console.warn(output, data ?? '');
      break;
    case 'error':
      console.error(output, data ?? '');
      break;
  }
}

/**
 * Core logging function
 */
function log(
  level: LogLevel,
  message: string,
  context?: string,
  data?: Record<string, unknown>,
  duration?: number
): void {
  // Check if level meets minimum threshold
  if (LOG_LEVELS[level] < LOG_LEVELS[config.minLevel]) {
    return;
  }
  
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    context,
    data,
    duration,
    traceId: currentTraceId,
  };
  
  writeToConsole(entry);
}

/**
 * Create a logger instance with context
 */
export function createLogger(context: string) {
  return {
    debug: (message: string, data?: Record<string, unknown>) => log('debug', message, context, data),
    info: (message: string, data?: Record<string, unknown>) => log('info', message, context, data),
    warn: (message: string, data?: Record<string, unknown>) => log('warn', message, context, data),
    error: (message: string, data?: Record<string, unknown>) => log('error', message, context, data),
    
    /**
     * Time an async operation
     */
    async time<T>(label: string, operation: () => Promise<T>): Promise<T> {
      const start = performance.now();
      try {
        const result = await operation();
        const duration = Math.round(performance.now() - start);
        log('debug', `${label} completed`, context, undefined, duration);
        return result;
      } catch (error) {
        const duration = Math.round(performance.now() - start);
        log('error', `${label} failed`, context, { error: String(error) }, duration);
        throw error;
      }
    },
    
    /**
     * Time a sync operation
     */
    timeSync<T>(label: string, operation: () => T): T {
      const start = performance.now();
      try {
        const result = operation();
        const duration = Math.round(performance.now() - start);
        log('debug', `${label} completed`, context, undefined, duration);
        return result;
      } catch (error) {
        const duration = Math.round(performance.now() - start);
        log('error', `${label} failed`, context, { error: String(error) }, duration);
        throw error;
      }
    },
  };
}

/**
 * Global logger instance
 */
export const logger = createLogger('App');

/**
 * Set new trace ID (call at start of user session or request)
 */
export function setTraceId(id?: string): string {
  currentTraceId = id ?? generateTraceId();
  return currentTraceId;
}

/**
 * Get current trace ID
 */
export function getTraceId(): string {
  return currentTraceId;
}

/**
 * Update logger configuration
 */
export function configureLogger(updates: Partial<LoggerConfig>): void {
  Object.assign(config, updates);
}

/**
 * Performance monitoring helper
 */
export const performanceMonitor = {
  mark: (name: string) => {
    if (typeof window !== 'undefined' && window.performance?.mark) {
      window.performance.mark(name);
    }
  },
  
  measure: (name: string, startMark: string, endMark?: string): number | null => {
    if (typeof window !== 'undefined' && window.performance?.measure) {
      try {
        const measure = window.performance.measure(name, startMark, endMark);
        logger.debug(`Performance: ${name}`, { duration: Math.round(measure.duration) });
        return measure.duration;
      } catch {
        return null;
      }
    }
    return null;
  },
  
  now: (): number => {
    if (typeof window !== 'undefined' && window.performance?.now) {
      return window.performance.now();
    }
    return Date.now();
  },
};
