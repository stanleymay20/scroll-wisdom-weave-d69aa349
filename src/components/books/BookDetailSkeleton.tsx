/**
 * CONTRACT 5B-2: Book Detail Skeleton
 * 
 * RULES:
 * - 5B-2.4: Zero Layout Shift - Skeleton matches final layout exactly
 */

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface BookDetailSkeletonProps {
  isMobile?: boolean;
  /** If provided, shows cached data instead of pure skeleton */
  cachedBook?: {
    title: string;
    cover_image_url: string | null;
    category: string;
    description?: string | null;
    total_chapters?: number | null;
  };
}

export function BookDetailSkeleton({ isMobile, cachedBook }: BookDetailSkeletonProps) {
  return (
    <div className="container mx-auto px-4">
      <div className={cn(
        "grid gap-8 mb-12",
        isMobile ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-3"
      )}>
        {/* Cover - Left Column */}
        <div className={isMobile ? "" : "lg:col-span-1"}>
          {cachedBook?.cover_image_url ? (
            <div className="aspect-[3/4] rounded-xl overflow-hidden">
              <img
                src={cachedBook.cover_image_url}
                alt={cachedBook.title}
                className="w-full h-full object-cover"
              />
            </div>
          ) : (
            <Skeleton className="aspect-[3/4] rounded-xl" />
          )}
        </div>
        
        {/* Info - Right Column */}
        <div className={cn(
          "space-y-4",
          isMobile ? "" : "lg:col-span-2"
        )}>
          {/* Category */}
          {cachedBook?.category ? (
            <span className="inline-block px-3 py-1 text-xs font-medium rounded-full bg-muted text-muted-foreground">
              {cachedBook.category.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
            </span>
          ) : (
            <Skeleton className="h-6 w-24" />
          )}
          
          {/* Title */}
          {cachedBook?.title ? (
            <h1 className={cn(
              "font-display font-bold text-foreground",
              isMobile ? "text-2xl" : "text-4xl"
            )}>
              {cachedBook.title}
            </h1>
          ) : (
            <Skeleton className={isMobile ? "h-8 w-3/4" : "h-12 w-3/4"} />
          )}
          
          {/* Description */}
          {cachedBook?.description ? (
            <p className="text-muted-foreground">
              {cachedBook.description}
            </p>
          ) : (
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-4/6" />
            </div>
          )}
          
          {/* Metadata */}
          <div className="flex flex-wrap gap-4 pt-2">
            {cachedBook?.total_chapters ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>{cachedBook.total_chapters} Chapters</span>
              </div>
            ) : (
              <>
                <Skeleton className="h-6 w-28" />
                <Skeleton className="h-6 w-24" />
                <Skeleton className="h-6 w-32" />
              </>
            )}
          </div>
          
          {/* Action Buttons - Always skeleton as these depend on user state */}
          <div className="flex flex-wrap gap-3 pt-4">
            <Skeleton className={isMobile ? "h-10 w-full" : "h-12 w-36"} />
            <Skeleton className={isMobile ? "h-10 w-full" : "h-12 w-36"} />
            {!isMobile && <Skeleton className="h-12 w-12" />}
          </div>
        </div>
      </div>
      
      {/* Chapters Section - Always skeleton */}
      <div className="space-y-4">
        <Skeleton className="h-8 w-48 mb-6" />
        
        {/* Chapter list skeletons - fixed heights for zero layout shift */}
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <ChapterItemSkeleton key={i} isMobile={isMobile} />
          ))}
        </div>
      </div>
    </div>
  );
}

function ChapterItemSkeleton({ isMobile }: { isMobile?: boolean }) {
  return (
    <div className={cn(
      "flex items-center gap-4 p-4 rounded-lg border border-border/50 bg-card",
      isMobile ? "min-h-[72px]" : "min-h-[80px]"
    )}>
      {/* Chapter number */}
      <Skeleton className="h-10 w-10 rounded-lg flex-shrink-0" />
      
      {/* Title and meta */}
      <div className="flex-1 min-w-0">
        <Skeleton className="h-5 w-3/4 mb-2" />
        <Skeleton className="h-3 w-24" />
      </div>
      
      {/* Status/Action */}
      <Skeleton className="h-8 w-20 flex-shrink-0" />
    </div>
  );
}

export function ChapterListSkeleton({ count = 5, isMobile }: { count?: number; isMobile?: boolean }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <ChapterItemSkeleton key={i} isMobile={isMobile} />
      ))}
    </div>
  );
}
