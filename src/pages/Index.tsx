/**
 * CONTRACT 5 — Home Page Performance
 * 
 * All content renders INSTANTLY (static components).
 * No async data fetching blocking first paint.
 * TTI tracked for SLA compliance.
 */

import { useIsMobile } from "@/hooks/use-mobile";
import { Navbar } from "@/components/layout/Navbar";
import { HeroSection } from "@/components/home/HeroSection";
import { ContinueReadingWidget } from "@/components/home/ContinueReadingWidget";
import { PlatformClarification } from "@/components/home/PlatformClarification";
import { CertificationDisclaimer } from "@/components/home/CertificationDisclaimer";
import { AcademicCredibility } from "@/components/home/AcademicCredibility";
import { FeaturedBooks } from "@/components/home/FeaturedBooks";
import { CategoriesSection } from "@/components/home/CategoriesSection";
import { Footer } from "@/components/layout/Footer";
import { TrialBanner } from "@/components/subscription/TrialBanner";
import { MobileLayout, MobileHome } from "@/components/mobile";
import { usePagePerformance } from "@/lib/performance";

const Index = () => {
  const isMobile = useIsMobile();
  
  // CONTRACT 5: Track page load performance (handles all metrics)
  usePagePerformance('Home');

  // Mobile-first: Use persistent mobile layout
  if (isMobile) {
    return (
      <MobileLayout>
        <MobileHome />
      </MobileLayout>
    );
  }

  // Desktop experience - all static content, renders instantly
  return (
    <div className="min-h-screen">
      <Navbar />
      <TrialBanner />
      <main>
        <HeroSection />
        <div className="container mx-auto px-4 -mt-8 mb-8 relative z-20">
          <ContinueReadingWidget />
        </div>
        <PlatformClarification />
        <CertificationDisclaimer />
        <AcademicCredibility />
        <FeaturedBooks />
        <CategoriesSection />
      </main>
      <Footer />
    </div>
  );
};

export default Index;
