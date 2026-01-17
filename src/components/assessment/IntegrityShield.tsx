/**
 * CONTRACT 6B — INTEGRITY SHIELD COMPONENT
 * Visual indicator for assessment integrity status
 */

import { Shield, ShieldAlert, ShieldCheck, Eye, EyeOff, Clipboard, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface IntegrityShieldProps {
  integrityScore: number;
  focusLostCount: number;
  pasteDetected: boolean;
  isTracking: boolean;
  showDetails?: boolean;
  className?: string;
}

export function IntegrityShield({
  integrityScore,
  focusLostCount,
  pasteDetected,
  isTracking,
  showDetails = true,
  className,
}: IntegrityShieldProps) {
  const getStatus = () => {
    if (integrityScore >= 0.9) return 'excellent';
    if (integrityScore >= 0.7) return 'good';
    if (integrityScore >= 0.5) return 'warning';
    return 'critical';
  };

  const status = getStatus();

  const statusConfig = {
    excellent: {
      icon: ShieldCheck,
      color: 'text-green-500',
      bgColor: 'bg-green-500/10',
      borderColor: 'border-green-500/20',
      label: 'Excellent Integrity',
    },
    good: {
      icon: Shield,
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10',
      borderColor: 'border-blue-500/20',
      label: 'Good Integrity',
    },
    warning: {
      icon: ShieldAlert,
      color: 'text-amber-500',
      bgColor: 'bg-amber-500/10',
      borderColor: 'border-amber-500/20',
      label: 'Review Required',
    },
    critical: {
      icon: ShieldAlert,
      color: 'text-red-500',
      bgColor: 'bg-red-500/10',
      borderColor: 'border-red-500/20',
      label: 'Integrity Concern',
    },
  };

  const config = statusConfig[status];
  const Icon = config.icon;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn(
            'inline-flex items-center gap-2 px-3 py-1.5 rounded-full border',
            config.bgColor,
            config.borderColor,
            className
          )}>
            <Icon className={cn('h-4 w-4', config.color)} />
            {showDetails && (
              <>
                <span className={cn('text-sm font-medium', config.color)}>
                  {(integrityScore * 100).toFixed(0)}%
                </span>
                {isTracking && (
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                  </span>
                )}
              </>
            )}
          </div>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <div className="space-y-2">
            <p className="font-medium">{config.label}</p>
            <div className="text-xs text-muted-foreground space-y-1">
              <div className="flex items-center gap-2">
                {focusLostCount > 0 ? (
                  <EyeOff className="h-3 w-3 text-amber-500" />
                ) : (
                  <Eye className="h-3 w-3 text-green-500" />
                )}
                <span>Focus lost: {focusLostCount} times</span>
              </div>
              <div className="flex items-center gap-2">
                {pasteDetected ? (
                  <Clipboard className="h-3 w-3 text-amber-500" />
                ) : (
                  <Clipboard className="h-3 w-3 text-green-500" />
                )}
                <span>Paste: {pasteDetected ? 'Detected' : 'None'}</span>
              </div>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface IntegrityWarningProps {
  signals: { type: string; description: string; severity: 'low' | 'medium' | 'high' }[];
  onDismiss?: () => void;
}

export function IntegrityWarning({ signals, onDismiss }: IntegrityWarningProps) {
  if (signals.length === 0) return null;

  const highSeverity = signals.filter(s => s.severity === 'high');
  const mediumSeverity = signals.filter(s => s.severity === 'medium');

  return (
    <div className="p-4 rounded-lg border border-amber-500/30 bg-amber-500/10">
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
        <div className="flex-1 space-y-2">
          <p className="font-medium text-amber-700 dark:text-amber-400">
            Assessment Integrity Warning
          </p>
          <ul className="text-sm text-muted-foreground space-y-1">
            {highSeverity.map((signal, i) => (
              <li key={i} className="flex items-center gap-2">
                <Badge variant="destructive" className="text-xs">High</Badge>
                {signal.description}
              </li>
            ))}
            {mediumSeverity.map((signal, i) => (
              <li key={i} className="flex items-center gap-2">
                <Badge variant="secondary" className="text-xs">Medium</Badge>
                {signal.description}
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            Your response may require manual review before certificate issuance.
          </p>
        </div>
      </div>
    </div>
  );
}
