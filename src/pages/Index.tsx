/**
 * CONTRACT 5 — Home Page Performance
 * OPTIMIZED: Lazy-load below-fold sections to cut TTI from 18s to <3s
 */

import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Navbar } from "@/components/layout/Navbar";
import { HeroSection } from "@/components/home/HeroSection";
import { TrustSignals } from "@/components/home/TrustSignals";
import { Footer } from "@/components/layout/Footer";
import { TrialBanner } from "@/components/subscription/TrialBanner";
import { MobileLayout, MobileHome } from "@/components/mobile";
import { usePagePerformance } from "@/lib/performance";
import { Skeleton } from "@/components/ui/skeleton";

// Lazy-load below-fold sections to dramatically reduce initial bundle
const ContentComparison = lazy(() => import("@/components/home/ContentComparison").then(m => ({ default: m.ContentComparison })));
const CategoryCards = lazy(() => import("@/components/home/CategoryCards").then(m => ({ default: m.CategoryCards })));
const ForYouSection = lazy(() => import("@/components/home/ForYouSection").then(m => ({ default: m.ForYouSection })));
const GetInspiredSection = lazy(() => import("@/components/home/GetInspiredSection").then(m => ({ default: m.GetInspiredSection })));
const HowItWorks = lazy(() => import("@/components/home/HowItWorks").then(m => ({ default: m.HowItWorks })));
const WhyDifferent = lazy(() => import("@/components/home/WhyDifferent").then(m => ({ default: m.WhyDifferent })));
const PlatformClarification = lazy(() => import("@/components/home/PlatformClarification").then(m => ({ default: m.PlatformClarification })));
const FAQSection = lazy(() => import("@/components/home/FAQSection").then(m => ({ default: m.FAQSection })));
const FinalCTA = lazy(() => import("@/components/home/FinalCTA").then(m => ({ default: m.FinalCTA })));
const InstantMasteryModal = lazy(() => import("@/components/home/InstantMasteryModal").then(m => ({ default: m.InstantMasteryModal })));
const ScrollTriggerBanner = lazy(() => import("@/components/home/ScrollTriggerBanner").then(m => ({ default: m.ScrollTriggerBanner })));

const SectionSkeleton = () => (
  <div className="py-16 px-4">
    <div className="container mx-auto max-w-6xl space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-4 w-96" />
      <div className="grid grid-cols-3 gap-4 mt-8">
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    </div>
  </div>
);

const Index = () => {
  const isMobile = useIsMobile();
  const [demoOpen, setDemoOpen] = useState(false);
  const [demoCompleted, setDemoCompleted] = useState(() => {
    try {
      const results = JSON.parse(localStorage.getItem("sl_demo_results") || "[]");
      return results.length > 0;
    } catch { return false; }
  });
  
  usePagePerformance('Home');

  // Demo modal is user-triggered only — no auto-popup
  // Users can start it from the ScrollTriggerBanner or HeroSection CTA

  const handleStartDemo = useCallback(() => {
    setDemoOpen(true);
    sessionStorage.setItem("sl_demo_shown", "1");
  }, []);

  const handleDemoClose = useCallback((open: boolean) => {
    setDemoOpen(open);
    if (!open) {
      try {
        const results = JSON.parse(localStorage.getItem("sl_demo_results") || "[]");
        if (results.length > 0) setDemoCompleted(true);
      } catch { /* ignore */ }
    }
  }, []);

  if (isMobile) {
    return (
      <MobileLayout>
        <MobileHome />
        <Suspense fallback={null}>
          <InstantMasteryModal open={demoOpen} onOpenChange={handleDemoClose} />
          <ScrollTriggerBanner onStartDemo={handleStartDemo} demoCompleted={demoCompleted} />
        </Suspense>
      </MobileLayout>
    );
  }

  return (
    <div className="min-h-screen">
      <Navbar />
      <TrialBanner />
      <main>
        {/* Above-fold: eagerly loaded */}
        <HeroSection onStartDemo={handleStartDemo} />
        <TrustSignals />
        
        {/* Below-fold: lazy loaded for performance */}
        <Suspense fallback={<SectionSkeleton />}>
          <ContentComparison />
        </Suspense>
        <Suspense fallback={<SectionSkeleton />}>
          <CategoryCards />
        </Suspense>
        <Suspense fallback={<SectionSkeleton />}>
          <ForYouSection />
        </Suspense>
        <Suspense fallback={<SectionSkeleton />}>
          <GetInspiredSection />
        </Suspense>
        <Suspense fallback={<SectionSkeleton />}>
          <HowItWorks />
        </Suspense>
        <Suspense fallback={<SectionSkeleton />}>
          <WhyDifferent />
        </Suspense>
        <Suspense fallback={<SectionSkeleton />}>
          <PlatformClarification />
        </Suspense>
        <Suspense fallback={<SectionSkeleton />}>
          <FAQSection />
        </Suspense>
        <Suspense fallback={<SectionSkeleton />}>
          <FinalCTA />
        </Suspense>
      </main>
      <Footer />
      <Suspense fallback={null}>
        <InstantMasteryModal open={demoOpen} onOpenChange={handleDemoClose} />
        <ScrollTriggerBanner onStartDemo={handleStartDemo} demoCompleted={demoCompleted} />
      </Suspense>
    </div>
  );
};

export default Index;