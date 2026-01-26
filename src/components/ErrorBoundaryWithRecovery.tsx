/**
 * Enhanced Error Boundary with Module Loading Recovery
 * 
 * Handles:
 * - React rendering errors
 * - Dynamic import/module loading failures
 * - Network-related crashes
 * - Graceful recovery with retry mechanisms
 */

import React, { Component, ErrorInfo, ReactNode, Suspense } from 'react';
import { AlertTriangle, RefreshCw, Home, WifiOff, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { createLogger } from '@/lib/logger';

const logger = createLogger('ErrorBoundaryWithRecovery');

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  context?: string;
  /** Number of automatic retry attempts for module loading errors */
  maxRetries?: number;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorId: string | null;
  errorType: 'render' | 'module' | 'network' | 'unknown';
  retryCount: number;
  isRetrying: boolean;
}

/**
 * Detect the type of error for appropriate handling
 */
function classifyError(error: Error): State['errorType'] {
  const message = error.message.toLowerCase();
  const stack = error.stack?.toLowerCase() || '';
  
  // Module loading errors
  if (
    message.includes('failed to fetch dynamically imported module') ||
    message.includes('importing a module script failed') ||
    message.includes('loading chunk') ||
    message.includes('loading module') ||
    message.includes('dynamic import')
  ) {
    return 'module';
  }
  
  // Network errors
  if (
    message.includes('network') ||
    message.includes('fetch') ||
    message.includes('timeout') ||
    message.includes('connection') ||
    message.includes('offline')
  ) {
    return 'network';
  }
  
  return 'render';
}

/**
 * Enterprise-grade Error Boundary with Recovery
 */
export class ErrorBoundaryWithRecovery extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorId: null,
    errorType: 'unknown',
    retryCount: 0,
    isRetrying: false,
  };

  public static getDerivedStateFromError(error: Error): Partial<State> {
    const errorId = `err-${Date.now().toString(36)}`;
    const errorType = classifyError(error);
    return { hasError: true, error, errorId, errorType };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    const { onError, context, maxRetries = 2 } = this.props;
    const { errorId, errorType, retryCount } = this.state;

    logger.error('Error Boundary caught error', {
      errorId,
      context: context ?? 'Unknown',
      errorType,
      message: error.message,
      stack: error.stack?.substring(0, 500),
      componentStack: errorInfo.componentStack?.substring(0, 500),
      retryCount,
    });

    // Auto-retry for module loading errors
    if (errorType === 'module' && retryCount < maxRetries) {
      this.handleAutoRetry();
    }

    onError?.(error, errorInfo);
  }

  private handleAutoRetry = () => {
    this.setState({ isRetrying: true });
    
    // Wait a moment for network to stabilize
    setTimeout(() => {
      this.setState(prev => ({
        hasError: false,
        error: null,
        errorId: null,
        retryCount: prev.retryCount + 1,
        isRetrying: false,
      }));
    }, 1500);
  };

  private handleManualRetry = () => {
    this.setState({
      hasError: false,
      error: null,
      errorId: null,
      retryCount: 0,
      isRetrying: false,
    });
  };

  private handleHardReload = () => {
    // Clear module cache and reload
    if ('caches' in window) {
      caches.keys().then(names => {
        names.forEach(name => caches.delete(name));
      });
    }
    window.location.reload();
  };

  private handleGoHome = () => {
    window.location.href = '/';
  };

  public render() {
    const { hasError, error, errorId, errorType, isRetrying } = this.state;
    const { children, fallback } = this.props;

    if (isRetrying) {
      return (
        <div className="min-h-[400px] flex items-center justify-center p-8">
          <div className="text-center space-y-4">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto text-primary" />
            <p className="text-muted-foreground">Reconnecting...</p>
          </div>
        </div>
      );
    }

    if (hasError) {
      if (fallback) {
        return fallback;
      }

      return (
        <div className="min-h-[400px] flex items-center justify-center p-8">
          <div className="max-w-md w-full text-center space-y-6">
            <div className={`p-4 rounded-full w-fit mx-auto ${
              errorType === 'network' ? 'bg-amber-500/10' : 'bg-destructive/10'
            }`}>
              {errorType === 'network' ? (
                <WifiOff className="h-12 w-12 text-amber-500" />
              ) : errorType === 'module' ? (
                <Download className="h-12 w-12 text-destructive" />
              ) : (
                <AlertTriangle className="h-12 w-12 text-destructive" />
              )}
            </div>
            
            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-foreground">
                {errorType === 'network' 
                  ? 'Connection Problem'
                  : errorType === 'module'
                  ? 'Failed to Load Page'
                  : 'Something went wrong'
                }
              </h2>
              <p className="text-muted-foreground text-sm">
                {errorType === 'network' 
                  ? 'Please check your internet connection and try again.'
                  : errorType === 'module'
                  ? 'Some page resources failed to load. This can happen with unstable connections.'
                  : 'We encountered an unexpected error. Our team has been notified.'
                }
              </p>
              {errorId && (
                <p className="text-xs text-muted-foreground/60 font-mono">
                  Error ID: {errorId}
                </p>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              {errorType === 'module' ? (
                <>
                  <Button onClick={this.handleHardReload} variant="default">
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Reload App
                  </Button>
                  <Button onClick={this.handleGoHome} variant="outline">
                    <Home className="h-4 w-4 mr-2" />
                    Go Home
                  </Button>
                </>
              ) : (
                <>
                  <Button onClick={this.handleManualRetry} variant="default">
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Try Again
                  </Button>
                  <Button onClick={this.handleGoHome} variant="outline">
                    <Home className="h-4 w-4 mr-2" />
                    Go Home
                  </Button>
                </>
              )}
            </div>

            {import.meta.env.DEV && error && (
              <details className="mt-6 text-left">
                <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                  Developer Details
                </summary>
                <pre className="mt-2 p-4 bg-muted rounded-lg text-xs overflow-auto max-h-48 text-destructive">
                  {error.message}
                  {'\n\n'}
                  {error.stack}
                </pre>
              </details>
            )}
          </div>
        </div>
      );
    }

    return children;
  }
}

/**
 * HOC to wrap lazy-loaded routes with recovery-enabled error boundary
 */
export function withRouteErrorBoundary(
  LazyComponent: React.LazyExoticComponent<React.ComponentType<unknown>>,
  routeName: string
) {
  const WithRouteErrorBoundary = () => (
    <ErrorBoundaryWithRecovery context={`Route:${routeName}`} maxRetries={2}>
      <Suspense fallback={<PageLoadingFallback />}>
        <LazyComponent />
      </Suspense>
    </ErrorBoundaryWithRecovery>
  );

  WithRouteErrorBoundary.displayName = `WithRouteErrorBoundary(${routeName})`;
  return WithRouteErrorBoundary;
}

/**
 * Loading fallback for lazy-loaded routes
 */
function PageLoadingFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center space-y-4">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}

export default ErrorBoundaryWithRecovery;
