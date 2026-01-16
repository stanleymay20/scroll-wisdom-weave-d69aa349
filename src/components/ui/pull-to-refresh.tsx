/**
 * CONTRACT 5 - Rule 5.1: Pull-to-Refresh Visual Component
 * 
 * Native-feeling pull-to-refresh indicator for mobile.
 */

import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface PullToRefreshIndicatorProps {
  pullDistance: number;
  progress: number;
  isRefreshing: boolean;
  isPulling: boolean;
  threshold?: number;
}

export function PullToRefreshIndicator({
  pullDistance,
  progress,
  isRefreshing,
  isPulling,
  threshold = 80,
}: PullToRefreshIndicatorProps) {
  if (!isPulling && !isRefreshing && pullDistance === 0) {
    return null;
  }

  const isReady = progress >= 100;
  
  return (
    <div
      className="flex items-center justify-center overflow-hidden transition-all duration-200"
      style={{
        height: pullDistance,
        opacity: Math.min(pullDistance / 30, 1),
      }}
    >
      <div
        className={cn(
          "flex items-center justify-center rounded-full p-2 transition-all",
          isRefreshing && "bg-primary/10",
          isReady && !isRefreshing && "bg-primary/20"
        )}
      >
        <RefreshCw
          className={cn(
            "h-5 w-5 text-primary transition-all",
            isRefreshing && "animate-spin",
            isReady && !isRefreshing && "text-primary"
          )}
          style={{
            transform: isRefreshing
              ? undefined
              : `rotate(${(progress / 100) * 360}deg)`,
          }}
        />
      </div>
      {isRefreshing && (
        <span className="ml-2 text-sm text-muted-foreground">
          Refreshing...
        </span>
      )}
      {isReady && !isRefreshing && (
        <span className="ml-2 text-sm text-primary font-medium">
          Release to refresh
        </span>
      )}
    </div>
  );
}
