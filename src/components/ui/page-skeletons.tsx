/**
 * CONTRACT 5 & 5B-1 — Skeleton-First Loading Components
 * 
 * These components render INSTANTLY to ensure first meaningful content ≤ 100ms
 * per Contract 5B-1 SLA requirements.
 * 
 * RULES:
 * - 5B-1.1: Skeleton-First Render - renders before ANY fetch
 * - Fixed dimensions matching final layout exactly
 * - No layout shift when data loads
 */

import { memo } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

// Book card skeleton - used across multiple pages
export const BookCardSkeleton = memo(function BookCardSkeleton({ 
  mobile = false,
  className
}: { mobile?: boolean; className?: string }) {
  if (mobile) {
    return (
      <div className={cn(
        "rounded-lg overflow-hidden bg-card border border-border/50 animate-in fade-in-50 duration-100",
        className
      )}>
        {/* Cover - 3:4 aspect ratio */}
        <Skeleton className="aspect-[3/4] w-full rounded-none" />
        {/* Content - tighter spacing for mobile */}
        <div className="p-3 space-y-2">
          <Skeleton className="h-3.5 w-3/4" />
          <Skeleton className="h-4 w-16 rounded-full" />
          <Skeleton className="h-1.5 w-full rounded-full" />
        </div>
      </div>
    );
  }
  return (
    <div className={cn(
      "rounded-xl overflow-hidden bg-card border border-border/50 animate-in fade-in-50 duration-150",
      className
    )}>
      {/* Cover - 3:4 aspect ratio */}
      <Skeleton className="aspect-[3/4] w-full rounded-none" />
      {/* Content */}
      <div className="p-4 space-y-3">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-5 w-20 rounded-full" />
        <Skeleton className="h-2 w-full rounded-full" />
        <Skeleton className="h-9 w-full rounded-md" />
      </div>
    </div>
  );
});

// Book grid skeleton
export const BookGridSkeleton = memo(function BookGridSkeleton({ 
  count = 8, 
  mobile = false,
  columns = mobile ? 2 : 4
}: { 
  count?: number; 
  mobile?: boolean;
  columns?: number;
}) {
  const gridClass = mobile 
    ? "grid grid-cols-2 gap-4"
    : `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-${columns} gap-6`;
  
  return (
    <div className={gridClass}>
      {Array.from({ length: count }).map((_, i) => (
        <BookCardSkeleton key={i} mobile={mobile} />
      ))}
    </div>
  );
});

// Featured books section skeleton for home page
export const FeaturedBooksSkeleton = memo(function FeaturedBooksSkeleton() {
  return (
    <section className="py-24 relative">
      <div className="container mx-auto px-4">
        {/* Section Header Skeleton */}
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-12">
          <div>
            <Skeleton className="h-10 w-64 mb-3" />
            <Skeleton className="h-5 w-96 max-w-full" />
          </div>
          <Skeleton className="h-10 w-32 mt-4 md:mt-0" />
        </div>

        {/* Books Grid Skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <BookCardSkeleton key={i} />
          ))}
        </div>
      </div>
    </section>
  );
});

// Categories section skeleton
export const CategoriesSkeleton = memo(function CategoriesSkeleton() {
  return (
    <section className="py-24 relative">
      <div className="container mx-auto px-4">
        {/* Header Skeleton */}
        <div className="text-center mb-12">
          <Skeleton className="h-10 w-64 mx-auto mb-4" />
          <Skeleton className="h-5 w-96 max-w-full mx-auto" />
        </div>

        {/* Categories Grid Skeleton */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 max-w-4xl mx-auto">
          {Array.from({ length: 12 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square rounded-xl" />
          ))}
        </div>
      </div>
    </section>
  );
});

// Book detail page skeleton
export const BookDetailSkeleton = memo(function BookDetailSkeleton() {
  return (
    <div className="min-h-screen">
      {/* Navbar placeholder */}
      <div className="h-16 border-b border-border/50 bg-background/95 backdrop-blur-lg" />
      
      <main className="pt-8 pb-16">
        <div className="container mx-auto px-4">
          {/* Book Header */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-12 mb-12">
            {/* Cover */}
            <div className="lg:col-span-1">
              <Skeleton className="aspect-[3/4] rounded-2xl w-full max-w-sm mx-auto" />
            </div>
            
            {/* Details */}
            <div className="lg:col-span-2 space-y-6">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-12 w-3/4" />
              <Skeleton className="h-6 w-full max-w-xl" />
              <Skeleton className="h-6 w-2/3 max-w-lg" />
              
              {/* Meta */}
              <div className="flex flex-wrap gap-4 pt-4">
                <Skeleton className="h-10 w-32" />
                <Skeleton className="h-10 w-28" />
                <Skeleton className="h-10 w-36" />
              </div>
              
              {/* Action buttons */}
              <div className="flex gap-4 pt-6">
                <Skeleton className="h-12 w-40" />
                <Skeleton className="h-12 w-32" />
              </div>
            </div>
          </div>
          
          {/* Chapters List */}
          <div className="space-y-4">
            <Skeleton className="h-8 w-48 mb-6" />
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-xl" />
            ))}
          </div>
        </div>
      </main>
    </div>
  );
});

// Mobile book detail skeleton
export const MobileBookDetailSkeleton = memo(function MobileBookDetailSkeleton() {
  return (
    <div className="px-4 py-4 pb-24">
      {/* Cover */}
      <div className="flex justify-center mb-6">
        <Skeleton className="w-48 h-64 rounded-xl" />
      </div>
      
      {/* Title and meta */}
      <div className="text-center space-y-3 mb-6">
        <Skeleton className="h-8 w-3/4 mx-auto" />
        <Skeleton className="h-4 w-24 mx-auto" />
        <Skeleton className="h-5 w-full max-w-xs mx-auto" />
      </div>
      
      {/* Actions */}
      <div className="flex justify-center gap-3 mb-8">
        <Skeleton className="h-12 w-32" />
        <Skeleton className="h-12 w-12" />
      </div>
      
      {/* Chapters */}
      <div className="space-y-3">
        <Skeleton className="h-6 w-32 mb-4" />
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
});

// Academic credibility section skeleton
export const AcademicCredibilitySkeleton = memo(function AcademicCredibilitySkeleton() {
  return (
    <section className="py-16">
      <div className="container mx-auto px-4">
        <div className="text-center mb-10">
          <Skeleton className="h-8 w-48 mx-auto mb-4" />
          <Skeleton className="h-10 w-96 max-w-full mx-auto mb-4" />
          <Skeleton className="h-5 w-80 max-w-full mx-auto" />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 max-w-4xl mx-auto">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      </div>
    </section>
  );
});

// Platform clarification skeleton
export const PlatformClarificationSkeleton = memo(function PlatformClarificationSkeleton() {
  return (
    <section className="py-16 border-y border-border/30">
      <div className="container mx-auto px-4">
        <div className="text-center mb-12">
          <Skeleton className="h-10 w-64 mx-auto mb-4" />
          <Skeleton className="h-5 w-96 max-w-full mx-auto" />
        </div>

        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {/* IS column */}
          <div className="p-6 rounded-2xl border border-border/50">
            <Skeleton className="h-8 w-48 mb-6" />
            <div className="space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="h-6 w-6 flex-shrink-0" />
                  <Skeleton className="h-5 w-full" />
                </div>
              ))}
            </div>
          </div>
          
          {/* IS NOT column */}
          <div className="p-6 rounded-2xl border border-border/50">
            <Skeleton className="h-8 w-48 mb-6" />
            <div className="space-y-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex gap-3">
                  <Skeleton className="h-6 w-6 flex-shrink-0" />
                  <Skeleton className="h-5 w-full" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
});

// Hero section - renders instant static content, no skeleton needed
// But provide a skeleton fallback just in case
export const HeroSkeleton = memo(function HeroSkeleton() {
  return (
    <section className="relative min-h-screen flex items-center justify-center pt-16">
      <div className="container mx-auto px-4">
        <div className="max-w-4xl mx-auto text-center">
          <Skeleton className="h-8 w-48 mx-auto mb-8 rounded-full" />
          <Skeleton className="h-16 w-3/4 mx-auto mb-4" />
          <Skeleton className="h-8 w-2/3 mx-auto mb-8" />
          
          <div className="flex justify-center gap-4 mb-20">
            <Skeleton className="h-14 w-40" />
            <Skeleton className="h-14 w-36" />
          </div>
          
          <div className="grid grid-cols-3 gap-8 max-w-lg mx-auto">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="text-center">
                <Skeleton className="h-12 w-16 mx-auto mb-2" />
                <Skeleton className="h-4 w-20 mx-auto" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
});

// ============= CONTRACT 5B-1: LIBRARY SKELETONS =============

/**
 * Library stats skeleton - matches StatCard exactly
 */
export const LibraryStatsSkeleton = memo(function LibraryStatsSkeleton({ 
  isMobile = false 
}: { isMobile?: boolean }) {
  if (isMobile) {
    return (
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="bg-card rounded-lg p-3 text-center border border-border/50">
            <Skeleton className="h-5 w-8 mx-auto mb-1" />
            <Skeleton className="h-3 w-12 mx-auto" />
          </div>
        ))}
      </div>
    );
  }
  
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
      {[1, 2, 3].map((i) => (
        <div key={i} className="bg-card rounded-xl border border-border/50 p-4 flex items-center gap-4">
          <Skeleton className="h-12 w-12 rounded-lg flex-shrink-0" />
          <div className="space-y-2 flex-1">
            <Skeleton className="h-6 w-12" />
            <Skeleton className="h-4 w-20" />
          </div>
        </div>
      ))}
    </div>
  );
});

/**
 * Library header skeleton
 */
export const LibraryHeaderSkeleton = memo(function LibraryHeaderSkeleton({ 
  isMobile = false 
}: { isMobile?: boolean }) {
  if (isMobile) {
    return (
      <div className="mb-6">
        <Skeleton className="h-7 w-32 mb-2" />
        <Skeleton className="h-4 w-48" />
      </div>
    );
  }
  
  return (
    <div className="text-center mb-8">
      <Skeleton className="h-14 w-14 rounded-xl mx-auto mb-4" />
      <Skeleton className="h-10 w-64 mx-auto mb-4" />
      <Skeleton className="h-5 w-96 mx-auto max-w-full" />
    </div>
  );
});

/**
 * Library filters skeleton (search + tabs + sort)
 */
export const LibraryFiltersSkeleton = memo(function LibraryFiltersSkeleton({ 
  isMobile = false 
}: { isMobile?: boolean }) {
  if (isMobile) {
    return (
      <>
        <Skeleton className="h-10 w-full rounded-md mb-4" />
        <Skeleton className="h-10 w-full rounded-lg mb-6" />
      </>
    );
  }
  
  return (
    <div className="flex flex-col sm:flex-row gap-4 mb-8">
      <Skeleton className="h-10 flex-1 rounded-md" />
      <Skeleton className="h-10 w-64 rounded-lg" />
      <Skeleton className="h-10 w-40 rounded-md" />
    </div>
  );
});

/**
 * Full Library Page Skeleton - INSTANT RENDER (Rule 5B-1.1)
 * This is what users see in <100ms
 */
export const LibraryPageSkeleton = memo(function LibraryPageSkeleton({ 
  isMobile = false 
}: { isMobile?: boolean }) {
  const cardCount = isMobile ? 4 : 8;
  const gridClass = isMobile 
    ? "grid grid-cols-2 gap-3" 
    : "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6";
  
  return (
    <div className={cn(
      "animate-in fade-in-50 duration-100",
      isMobile ? "px-4 py-4" : "container mx-auto px-4 py-24"
    )}>
      <LibraryHeaderSkeleton isMobile={isMobile} />
      <LibraryStatsSkeleton isMobile={isMobile} />
      <LibraryFiltersSkeleton isMobile={isMobile} />
      <div className={gridClass}>
        {Array.from({ length: cardCount }).map((_, i) => (
          <BookCardSkeleton key={i} mobile={isMobile} />
        ))}
      </div>
    </div>
  );
});

/**
 * Dashboard skeleton
 */
export const DashboardSkeleton = memo(function DashboardSkeleton({ 
  isMobile = false 
}: { isMobile?: boolean }) {
  return (
    <div className={cn(
      "animate-in fade-in-50 duration-100",
      isMobile ? "px-4 py-4" : "container mx-auto px-4 py-24"
    )}>
      {/* Header */}
      <div className="mb-8">
        <Skeleton className={cn("mb-2", isMobile ? "h-6 w-32" : "h-9 w-48")} />
        <Skeleton className={cn(isMobile ? "h-4 w-48" : "h-5 w-64")} />
      </div>
      
      {/* Stats grid */}
      <div className={cn(
        "grid gap-4 mb-8",
        isMobile ? "grid-cols-2" : "grid-cols-4"
      )}>
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-card rounded-xl border border-border/50 p-4">
            <Skeleton className="h-8 w-8 rounded-lg mb-2" />
            <Skeleton className="h-6 w-12 mb-1" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
      
      {/* Recent activity */}
      <Skeleton className="h-7 w-40 mb-4" />
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
});
