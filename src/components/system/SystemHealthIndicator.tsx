import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { 
  Tooltip, 
  TooltipContent, 
  TooltipProvider, 
  TooltipTrigger 
} from "@/components/ui/tooltip";
import { 
  Activity, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle 
} from "lucide-react";
import { runDiagnostics, SystemHealth } from "@/lib/systemDiagnostics";
import { useIsMobile } from "@/hooks/use-mobile";

interface SystemHealthIndicatorProps {
  hasUser: boolean;
  hasSession: boolean;
  currentRoute: string;
  className?: string;
}

export function SystemHealthIndicator({
  hasUser,
  hasSession,
  currentRoute,
  className,
}: SystemHealthIndicatorProps) {
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const isMobile = useIsMobile();

  useEffect(() => {
    const result = runDiagnostics({
      isMobile,
      isDesktop: !isMobile,
      currentRoute,
      hasUser,
      hasSession,
    });
    setHealth(result);
  }, [isMobile, currentRoute, hasUser, hasSession]);

  if (!health) return null;

  const getIcon = () => {
    switch (health.overall) {
      case 'healthy':
        return <CheckCircle2 className="h-3 w-3" />;
      case 'degraded':
        return <AlertTriangle className="h-3 w-3" />;
      case 'critical':
        return <XCircle className="h-3 w-3" />;
    }
  };

  const getVariant = () => {
    switch (health.overall) {
      case 'healthy':
        return 'bg-green-500/20 text-green-500 border-green-500/50';
      case 'degraded':
        return 'bg-amber-500/20 text-amber-500 border-amber-500/50';
      case 'critical':
        return 'bg-destructive/20 text-destructive border-destructive/50';
    }
  };

  const failedDiagnostics = health.diagnostics.filter(d => !d.passed);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge 
            variant="outline" 
            className={`gap-1 cursor-help ${getVariant()} ${className}`}
          >
            <Activity className="h-3 w-3" />
            {getIcon()}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              {getIcon()}
              <span className="font-medium capitalize">
                System {health.overall}
              </span>
            </div>
            {failedDiagnostics.length > 0 && (
              <div className="text-xs space-y-1">
                {failedDiagnostics.map((d, i) => (
                  <div key={i} className="flex items-start gap-1">
                    <XCircle className="h-3 w-3 text-destructive mt-0.5 flex-shrink-0" />
                    <span>{d.message}</span>
                  </div>
                ))}
              </div>
            )}
            {health.overall === 'healthy' && (
              <p className="text-xs text-muted-foreground">
                All systems operating normally
              </p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
