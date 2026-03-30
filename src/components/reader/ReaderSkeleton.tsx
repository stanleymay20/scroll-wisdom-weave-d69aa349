/**
 * CONTRACT 5B-3: Reader Entry Speed
 * 
 * Skeleton component for instant Reader shell rendering.
 * 
 * RULES:
 * - 5B-3.1: Visible instantly on navigation
 * - 5B-3.4: Zero Layout Shift - dimensions match final layout
 */

import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { 
  ChevronLeft, 
  Settings, 
  Bookmark,
  Home,
  Volume2,
  Brain,
  BookMarked,
  Flag
} from "lucide-react";

interface ReaderSkeletonProps {
  /** Show cached chapter title if available */
  chapterTitle?: string;
  /** Show cached chapter number if available */
  chapterNumber?: number;
  /** Show cached total chapters if available */
  totalChapters?: number;
  /** Show cached book title if available */
  bookTitle?: string;
  /** Cached content preview to show immediately */
  contentPreview?: string;
  /** Is this for offline mode */
  isOffline?: boolean;
}

export function ReaderSkeleton({
  chapterTitle,
  chapterNumber,
  totalChapters,
  bookTitle,
  contentPreview,
  isOffline = false,
}: ReaderSkeletonProps) {
  const hasMetadata = chapterTitle || bookTitle;
  
  return (
    <div className="min-h-screen bg-secondary overflow-x-hidden">
      {/* Header - respects safe area, fixed dimensions */}
      <header 
        className="fixed top-0 left-0 right-0 z-50 bg-background/90 backdrop-blur-xl border-b border-border/50"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="container mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" disabled>
              <ChevronLeft className="h-5 w-5" />
            </Button>
            <div>
              {bookTitle ? (
                <h1 className="text-sm font-medium line-clamp-1">{bookTitle}</h1>
              ) : (
                <Skeleton className="h-4 w-32 mb-1" />
              )}
              {chapterNumber ? (
                <p className="text-xs text-muted-foreground">
                  Chapter {chapterNumber} {totalChapters ? `of ${totalChapters}` : ''}
                </p>
              ) : (
                <Skeleton className="h-3 w-20" />
              )}
            </div>
          </div>
          
          {/* Header controls - always visible for zero layout shift */}
          <div className="flex items-center gap-1 sm:gap-2">
            <Button variant="ghost" size="icon" disabled className="opacity-50">
              <Brain className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" disabled className="opacity-50">
              <Volume2 className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" disabled className="opacity-50">
              <BookMarked className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" disabled className="opacity-50">
              <Bookmark className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" disabled className="opacity-50">
              <Settings className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" disabled className="opacity-50">
              <Flag className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" disabled className="opacity-50">
              <Home className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>
      
      {/* Progress bar placeholder */}
      <div 
        className="fixed left-0 right-0 z-40 h-1 bg-muted"
        style={{ top: "calc(env(safe-area-inset-top) + 3.5rem)" }}
      />
      
      {/* Content area - proper padding for safe areas */}
      <main 
        className="pb-24 max-w-3xl mx-auto px-4 sm:px-8 overflow-x-hidden"
        style={{ 
          paddingTop: "calc(env(safe-area-inset-top) + 5rem)",
        }}
      >
        {/* Chapter title */}
        {chapterTitle ? (
          <h2 className="text-2xl sm:text-3xl font-display font-bold text-foreground mb-6">
            {chapterTitle}
          </h2>
        ) : (
          <Skeleton className="h-8 w-3/4 mb-6" />
        )}
        
        {/* Content preview or skeleton */}
        {contentPreview ? (
          <div className="prose prose-invert max-w-none text-foreground/90 leading-relaxed">
            <p className="mb-4">{contentPreview}</p>
            {/* Show loading indicator for remaining content */}
            <div className="animate-pulse space-y-3 mt-6 border-t border-border/30 pt-6">
              <div className="flex items-center gap-2 text-muted-foreground text-sm">
                <div className="w-4 h-4 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                <span>Loading full content...</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="animate-pulse space-y-4">
            {/* Paragraph skeletons - varied widths for natural look */}
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton 
                key={i} 
                className="h-4" 
                style={{ width: `${85 + Math.random() * 15}%` }} 
              />
            ))}
            
            {/* Section break */}
            <div className="h-4" />
            
            {/* More paragraph skeletons */}
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton 
                key={`b-${i}`} 
                className="h-4" 
                style={{ width: `${80 + Math.random() * 20}%` }} 
              />
            ))}
          </div>
        )}
        
        {/* Offline indicator */}
        {isOffline && (
          <div className="mt-8 p-4 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-200 text-sm">
            <p className="font-medium">You're offline</p>
            <p className="text-amber-200/70 mt-1">
              Showing cached content. Some features may be limited.
            </p>
          </div>
        )}
      </main>
      
      {/* Navigation footer placeholder - respects safe area */}
      <footer 
        className="fixed bottom-0 left-0 right-0 z-40 bg-background/90 backdrop-blur-xl border-t border-border/50"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Button variant="ghost" size="sm" disabled className="opacity-50">
            <ChevronLeft className="h-4 w-4 mr-1" />
            Previous
          </Button>
          
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {chapterNumber ? (
              <span>Chapter {chapterNumber}</span>
            ) : (
              <Skeleton className="h-4 w-16" />
            )}
          </div>
          
          <Button variant="ghost" size="sm" disabled className="opacity-50">
            Next
            <ChevronLeft className="h-4 w-4 ml-1 rotate-180" />
          </Button>
        </div>
      </footer>
    </div>
  );
}
