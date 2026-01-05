import { useState, useEffect, forwardRef } from "react";
import { X, AlertTriangle, CheckCircle, RefreshCw, ChevronDown, ChevronUp, Bug, Wifi, FileWarning, Shield, Layout } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { diagnostics, DiagnosticEvent } from "@/lib/autoDiagnostics";
import { cn } from "@/lib/utils";

const typeIcons: Record<DiagnosticEvent['type'], typeof Bug> = {
  error: Bug,
  network: Wifi,
  generation: FileWarning,
  export: FileWarning,
  auth: Shield,
  ui: Layout,
};

const severityColors: Record<DiagnosticEvent['severity'], string> = {
  low: "bg-blue-500/10 text-blue-500 border-blue-500/20",
  medium: "bg-yellow-500/10 text-yellow-500 border-yellow-500/20",
  high: "bg-orange-500/10 text-orange-500 border-orange-500/20",
  critical: "bg-red-500/10 text-red-500 border-red-500/20",
};

export const DiagnosticsPanel = forwardRef<HTMLDivElement>(function DiagnosticsPanel(_, ref) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(true);
  const [events, setEvents] = useState<DiagnosticEvent[]>([]);
  const [isHealthy, setIsHealthy] = useState(true);

  useEffect(() => {
    return diagnostics.subscribe((state) => {
      setEvents(state.events.filter(e => !e.resolved));
      setIsHealthy(state.isHealthy);
      
      // Auto-open when new critical/high error
      if (!state.isHealthy && state.events.some(e => 
        !e.resolved && 
        (e.severity === 'critical' || e.severity === 'high') &&
        Date.now() - e.timestamp.getTime() < 2000
      )) {
        setIsOpen(true);
        setIsMinimized(false);
      }
    });
  }, []);

  const unresolvedCount = events.length;

  if (!isOpen && unresolvedCount === 0) {
    return null;
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className={cn(
          "fixed bottom-4 right-4 z-50 flex items-center gap-2 px-3 py-2 rounded-full shadow-lg transition-all",
          isHealthy 
            ? "bg-green-500/10 text-green-500 border border-green-500/20 hover:bg-green-500/20"
            : "bg-red-500/10 text-red-500 border border-red-500/20 hover:bg-red-500/20 animate-pulse"
        )}
      >
        {isHealthy ? (
          <CheckCircle className="h-4 w-4" />
        ) : (
          <>
            <AlertTriangle className="h-4 w-4" />
            <span className="text-sm font-medium">{unresolvedCount} issue{unresolvedCount !== 1 ? 's' : ''}</span>
          </>
        )}
      </button>
    );
  }

  return (
    <div 
      ref={ref}
      className={cn(
        "fixed bottom-4 right-4 z-50 bg-background border rounded-lg shadow-xl transition-all",
        isMinimized ? "w-72" : "w-96"
      )}>
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b">
        <div className="flex items-center gap-2">
          {isHealthy ? (
            <CheckCircle className="h-4 w-4 text-green-500" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-red-500" />
          )}
          <span className="font-medium text-sm">
            System Diagnostics
          </span>
          {unresolvedCount > 0 && (
            <Badge variant="secondary" className="text-xs">
              {unresolvedCount}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setIsMinimized(!isMinimized)}
          >
            {isMinimized ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => setIsOpen(false)}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Content */}
      {!isMinimized && (
        <ScrollArea className="max-h-80">
          <div className="p-3 space-y-2">
            {events.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground text-sm">
                <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-500" />
                No issues detected
              </div>
            ) : (
              events.map((event) => {
                const Icon = typeIcons[event.type];
                return (
                  <div
                    key={event.id}
                    className={cn(
                      "p-3 rounded-lg border text-sm",
                      severityColors[event.severity]
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <Icon className="h-4 w-4 mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{event.message}</p>
                        {event.suggestedFix && (
                          <p className="text-xs opacity-80 mt-1">
                            💡 {event.suggestedFix}
                          </p>
                        )}
                        {event.canAutoRetry && event.retryCount > 0 && (
                          <p className="text-xs opacity-60 mt-1">
                            <RefreshCw className="inline h-3 w-3 mr-1 animate-spin" />
                            Retrying ({event.retryCount}/{event.maxRetries})...
                          </p>
                        )}
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 flex-shrink-0"
                        onClick={() => diagnostics.resolveEvent(event.id)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </ScrollArea>
      )}

      {/* Footer */}
      {!isMinimized && events.length > 0 && (
        <div className="p-2 border-t">
          <Button
            variant="ghost"
            size="sm"
            className="w-full text-xs"
            onClick={() => diagnostics.clearResolved()}
          >
            Clear All
          </Button>
        </div>
      )}
    </div>
  );
});

DiagnosticsPanel.displayName = "DiagnosticsPanel";
