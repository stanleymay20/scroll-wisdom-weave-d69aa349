import { ReactNode, useEffect, useRef } from "react";
import { usePagePerformance } from "@/lib/performance";

interface PageShellProps {
  children: ReactNode;
  pageName: string;
  className?: string;
}

/**
 * PageShell - Instant rendering wrapper for all pages
 * 
 * PERFORMANCE RULE: This component renders IMMEDIATELY with no blocking.
 * All async operations must happen AFTER the shell is visible.
 * 
 * Usage:
 * ```tsx
 * <PageShell pageName="Library">
 *   <Navbar />
 *   {isLoading ? <Skeleton /> : <Content />}
 * </PageShell>
 * ```
 */
export function PageShell({ children, pageName, className = "" }: PageShellProps) {
  const rendered = useRef(false);
  
  // Track performance on mount
  useEffect(() => {
    if (!rendered.current) {
      rendered.current = true;
      // Performance tracking is handled by usePagePerformance
    }
  }, []);
  
  // Track TTI
  usePagePerformance(pageName);
  
  return (
    <div className={`min-h-screen bg-background ${className}`}>
      {children}
    </div>
  );
}

/**
 * SkeletonPage - Full page skeleton for lazy-loaded routes
 * Shown during Suspense fallback - must be instant
 */
export function SkeletonPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Navbar skeleton */}
      <div className="h-16 border-b border-border/50 bg-background/95 backdrop-blur-lg" />
      
      {/* Content skeleton */}
      <div className="flex-1 container mx-auto px-4 py-8">
        <div className="animate-pulse space-y-6">
          {/* Header skeleton */}
          <div className="space-y-3">
            <div className="h-8 w-48 bg-muted rounded" />
            <div className="h-4 w-96 bg-muted/60 rounded" />
          </div>
          
          {/* Content grid skeleton */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mt-8">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="space-y-3">
                <div className="aspect-[3/4] bg-muted rounded-xl" />
                <div className="h-4 w-3/4 bg-muted/60 rounded" />
                <div className="h-3 w-1/2 bg-muted/40 rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
