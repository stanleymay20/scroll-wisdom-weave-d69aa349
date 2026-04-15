/**
 * ROUTE ERROR STATE
 * 
 * Reusable error state component for critical pages.
 * Shows clear message with retry button instead of blank screens.
 */

import { AlertTriangle, RefreshCw, Home, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { classifyError, ErrorCode, type StructuredError } from '@/lib/errorCodes';

interface RouteErrorStateProps {
  error: unknown;
  onRetry?: () => void;
  context?: string;
}

export function RouteErrorState({ error, onRetry, context }: RouteErrorStateProps) {
  const structured: StructuredError = error && typeof error === 'object' && 'code' in error
    ? error as StructuredError
    : classifyError(error);

  const isNetwork = structured.code === ErrorCode.NETWORK_ERROR || structured.code === ErrorCode.TIMEOUT;
  const isAuth = structured.code === ErrorCode.AUTH_REQUIRED || structured.code === ErrorCode.AUTH_EXPIRED;

  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] p-8 text-center">
      <div className={`p-4 rounded-full mb-6 ${isNetwork ? 'bg-amber-500/10' : 'bg-destructive/10'}`}>
        {isNetwork ? (
          <WifiOff className="h-12 w-12 text-amber-500" />
        ) : (
          <AlertTriangle className="h-12 w-12 text-destructive" />
        )}
      </div>

      <h2 className="text-xl font-semibold text-foreground mb-2">
        {isAuth ? 'Sign In Required' : isNetwork ? 'Connection Problem' : 'Something Went Wrong'}
      </h2>

      <p className="text-sm text-muted-foreground mb-6 max-w-md">
        {structured.userMessage}
      </p>

      <div className="flex gap-3">
        {structured.retryable && onRetry && (
          <Button onClick={onRetry} variant="default" className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Try Again
          </Button>
        )}
        {isAuth ? (
          <Button onClick={() => window.location.href = '/auth'} variant="default" className="gap-2">
            Sign In
          </Button>
        ) : (
          <Button onClick={() => window.location.href = '/'} variant="outline" className="gap-2">
            <Home className="h-4 w-4" />
            Go Home
          </Button>
        )}
      </div>

      {import.meta.env.DEV && (
        <p className="mt-4 text-xs text-muted-foreground/50 font-mono">
          [{structured.code}] {context ? `Context: ${context}` : ''}
        </p>
      )}
    </div>
  );
}
