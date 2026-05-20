const TRANSIENT_AUTH_PATTERNS = [
  'load failed',
  'failed to fetch',
  'failed to send a request',
  'functionsfetcherror',
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

const AUTH_BASE_URL = `${import.meta.env.VITE_SUPABASE_URL}/auth/v1`;
const AUTH_HEADERS = {
  apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
  'Content-Type': 'application/json;charset=UTF-8',
  'x-client-info': 'scrolllibrary-auth-fallback',
  'x-supabase-api-version': '2024-01-01',
};

type AuthFallbackSession = {
  access_token: string;
  refresh_token: string;
};

type PasswordAuthResponse = {
  access_token: string;
  refresh_token: string;
  user?: {
    id?: string;
  };
};

async function parseAuthResponse(response: Response) {
  const text = await response.text();
  const data = text ? JSON.parse(text) : {};

  if (!response.ok) {
    const message =
      data?.msg ||
      data?.error_description ||
      data?.error ||
      `Auth request failed with status ${response.status}`;
    throw new Error(message);
  }

  return data;
}

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

export async function signInWithPasswordFallback(email: string, password: string): Promise<AuthFallbackSession> {
  const response = await fetch(`${AUTH_BASE_URL}/token?grant_type=password`, {
    method: 'POST',
    headers: AUTH_HEADERS,
    body: JSON.stringify({ email, password, gotrue_meta_security: {} }),
  });

  const data = await parseAuthResponse(response) as PasswordAuthResponse;
  if (!data.access_token || !data.refresh_token) {
    throw new Error('Authentication succeeded but no session was returned.');
  }

  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
  };
}

export async function signUpFallback(email: string, password: string, metadata: Record<string, unknown>) {
  const response = await fetch(`${AUTH_BASE_URL}/signup`, {
    method: 'POST',
    headers: AUTH_HEADERS,
    body: JSON.stringify({
      email,
      password,
      data: metadata,
    }),
  });

  return parseAuthResponse(response) as Promise<PasswordAuthResponse>;
}
