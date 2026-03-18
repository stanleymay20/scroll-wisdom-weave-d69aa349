const TRANSIENT_AUTH_PATTERNS = [
  'load failed',
  'failed to fetch',
  'networkerror',
  'network request failed',
  'fetch failed',
  'connection timeout',
  'timeout',
  'temporarily unavailable',
  '503',
  '504',
  '5xx',
  '544',
];

export function getErrorMessageText(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object' && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') return message;
  }
  return String(error ?? 'Unknown error');
}

export function isTransientAuthError(error: unknown): boolean {
  const message = getErrorMessageText(error).toLowerCase();
  return TRANSIENT_AUTH_PATTERNS.some((pattern) => message.includes(pattern));
}

export async function withTransientRetry<T>(
  operation: () => Promise<T>,
  retries = 2,
  delayMs = 700,
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isTransientAuthError(error) || attempt === retries) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, delayMs * (attempt + 1)));
    }
  }

  throw lastError instanceof Error ? lastError : new Error(getErrorMessageText(lastError));
}
