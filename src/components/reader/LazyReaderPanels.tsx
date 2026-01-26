/**
 * Lazy-loaded Reader Panels
 * 
 * These components are code-split to improve Reader TTI.
 * They're only loaded when the user actually opens them.
 */

import { lazy, Suspense, ComponentType } from 'react';
import { Loader2 } from 'lucide-react';

// Lazy load heavy panels that aren't needed on initial render
export const LazyLearningDeckGenerator = lazy(() => 
  import('@/components/decks/LearningDeckGenerator').then(m => ({ default: m.LearningDeckGenerator }))
);

export const LazyDeepResearchPanel = lazy(() => 
  import('@/components/academic/DeepResearchPanel').then(m => ({ default: m.DeepResearchPanel }))
);

export const LazyCodePlayground = lazy(() => 
  import('@/components/reader/CodePlayground').then(m => ({ default: m.CodePlayground }))
);

export const LazyComicReaderMode = lazy(() => 
  import('@/components/reader/ComicReaderMode').then(m => ({ default: m.ComicReaderMode }))
);

export const LazyVoiceConversation = lazy(() => 
  import('@/components/reader/VoiceConversation').then(m => ({ default: m.VoiceConversation }))
);

// Loading fallback component
function PanelLoading() {
  return (
    <div className="flex items-center justify-center p-8">
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
      <span className="ml-2 text-sm text-muted-foreground">Loading...</span>
    </div>
  );
}

// Wrapper for lazy components with suspense
export function withLazySuspense<T extends object>(
  LazyComponent: ComponentType<T>
): ComponentType<T> {
  return function LazyWrapper(props: T) {
    return (
      <Suspense fallback={<PanelLoading />}>
        <LazyComponent {...props} />
      </Suspense>
    );
  };
}
