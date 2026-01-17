/**
 * CONTRACT 5D-4: User-Facing Resolution Feedback
 * 
 * Components for showing action status with clear lifecycle states.
 * 
 * RULES:
 * - Every action must end with: ✅ Success, ⚠️ Partial, ❌ Failed, ⏸️ Paused
 * - No silent completion. No silent failure.
 */

import * as React from 'react';
import { Loader2, CheckCircle, AlertCircle, XCircle, PauseCircle, RefreshCw, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';
import { Progress } from './progress';
import type { ActionLifecycle, StallStatus } from '@/lib/actionLifecycle';

// ============= ACTION STATUS INDICATOR =============

interface ActionStatusIndicatorProps {
  state: ActionLifecycle['state'];
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export function ActionStatusIndicator({ state, size = 'md', className }: ActionStatusIndicatorProps) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
    lg: 'h-6 w-6',
  };
  
  const iconClass = cn(sizeClasses[size], className);
  
  switch (state) {
    case 'idle':
      return null;
    case 'intent':
    case 'acknowledged':
    case 'in_progress':
      return <Loader2 className={cn(iconClass, 'animate-spin text-primary')} />;
    case 'resolved':
      return <CheckCircle className={cn(iconClass, 'text-green-500')} />;
    case 'partial':
      return <AlertCircle className={cn(iconClass, 'text-yellow-500')} />;
    case 'failed':
    case 'timeout':
      return <XCircle className={cn(iconClass, 'text-destructive')} />;
    case 'paused':
      return <PauseCircle className={cn(iconClass, 'text-muted-foreground')} />;
    case 'cancelled':
      return <X className={cn(iconClass, 'text-muted-foreground')} />;
  }
}

// ============= ACTION PROGRESS CARD =============

interface ActionProgressCardProps {
  action: ActionLifecycle;
  stallStatus: StallStatus;
  onRetry?: () => void;
  onCancel?: () => void;
  onResume?: () => void;
  className?: string;
}

export function ActionProgressCard({
  action,
  stallStatus,
  onRetry,
  onCancel,
  onResume,
  className,
}: ActionProgressCardProps) {
  const showProgress = action.progress !== undefined && action.progress > 0;
  const showControls = stallStatus.shouldOfferRetry || action.canCancel || action.state === 'paused';
  
  return (
    <div className={cn(
      'rounded-lg border bg-card p-4 shadow-sm',
      className
    )}>
      <div className="flex items-start gap-3">
        <ActionStatusIndicator state={action.state} size="lg" />
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <p className="font-medium text-sm">
              {getStateLabel(action.state)}
            </p>
            {stallStatus.shouldShowStatus && (
              <span className="text-xs text-muted-foreground">
                {Math.round(stallStatus.duration / 1000)}s
              </span>
            )}
          </div>
          
          {action.message && (
            <p className="text-sm text-muted-foreground mt-1 truncate">
              {action.message}
            </p>
          )}
          
          {action.error && (
            <p className="text-sm text-destructive mt-1">
              {action.error}
            </p>
          )}
          
          {showProgress && (
            <div className="mt-2">
              <Progress value={action.progress} className="h-2" />
              <p className="text-xs text-muted-foreground mt-1">
                {action.progress}% complete
              </p>
            </div>
          )}
        </div>
      </div>
      
      {showControls && (
        <div className="flex gap-2 mt-3 pt-3 border-t">
          {stallStatus.shouldOfferRetry && action.canRetry && onRetry && (
            <Button
              variant="outline"
              size="sm"
              onClick={onRetry}
              className="gap-1"
            >
              <RefreshCw className="h-3 w-3" />
              Retry ({action.retryCount}/{action.maxRetries})
            </Button>
          )}
          
          {action.state === 'paused' && onResume && (
            <Button
              variant="outline"
              size="sm"
              onClick={onResume}
            >
              Resume
            </Button>
          )}
          
          {action.canCancel && onCancel && ['in_progress', 'acknowledged'].includes(action.state) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onCancel}
            >
              Cancel
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// ============= INLINE ACTION STATUS =============

interface InlineActionStatusProps {
  action: ActionLifecycle;
  className?: string;
}

export function InlineActionStatus({ action, className }: InlineActionStatusProps) {
  if (action.state === 'idle') return null;
  
  return (
    <div className={cn('flex items-center gap-2 text-sm', className)}>
      <ActionStatusIndicator state={action.state} size="sm" />
      <span className={cn(
        action.state === 'failed' && 'text-destructive',
        action.state === 'resolved' && 'text-green-600',
      )}>
        {action.message || getStateLabel(action.state)}
      </span>
    </div>
  );
}

// ============= HELPERS =============

function getStateLabel(state: ActionLifecycle['state']): string {
  const labels: Record<typeof state, string> = {
    idle: 'Ready',
    intent: 'Starting...',
    acknowledged: 'Processing...',
    in_progress: 'Working...',
    resolved: 'Complete',
    partial: 'Partially complete',
    failed: 'Failed',
    timeout: 'Timed out',
    paused: 'Paused',
    cancelled: 'Cancelled',
  };
  return labels[state];
}
