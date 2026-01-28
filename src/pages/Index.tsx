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
import { TrustSignals } from "@/components/home/TrustSignals";
import { WhatYouCanCreate } from "@/components/home/WhatYouCanCreate";
import { HowItWorks } from "@/components/home/HowItWorks";
import { WhyDifferent } from "@/components/home/WhyDifferent";
import { WhoItsFor } from "@/components/home/WhoItsFor";
import { UseCases } from "@/components/home/UseCases";
import { FinalCTA } from "@/components/home/FinalCTA";
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
        <TrustSignals />
        <WhatYouCanCreate />
        <HowItWorks />
        <WhyDifferent />
        <WhoItsFor />
        <UseCases />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  );
};

export default Index;
