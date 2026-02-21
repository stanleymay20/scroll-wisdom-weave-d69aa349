/**
 * CONTRACT 5 — Home Page Performance
 */

import { useState, useEffect, useCallback } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { Navbar } from "@/components/layout/Navbar";
import { HeroSection } from "@/components/home/HeroSection";
import { TrustSignals } from "@/components/home/TrustSignals";
import { CategoryCards } from "@/components/home/CategoryCards";
import { ForYouSection } from "@/components/home/ForYouSection";
import { GetInspiredSection } from "@/components/home/GetInspiredSection";
import { HowItWorks } from "@/components/home/HowItWorks";
import { WhyDifferent } from "@/components/home/WhyDifferent";
import { PlatformClarification } from "@/components/home/PlatformClarification";
import { FAQSection } from "@/components/home/FAQSection";
import { FinalCTA } from "@/components/home/FinalCTA";
import { Footer } from "@/components/layout/Footer";
import { TrialBanner } from "@/components/subscription/TrialBanner";
import { MobileLayout, MobileHome } from "@/components/mobile";
import { usePagePerformance } from "@/lib/performance";
import { InstantMasteryModal } from "@/components/home/InstantMasteryModal";
import { ScrollTriggerBanner } from "@/components/home/ScrollTriggerBanner";

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

  // Auto-launch after 3 seconds idle (once per session)
  useEffect(() => {
    if (demoCompleted) return;
    const shown = sessionStorage.getItem("sl_demo_shown");
    if (shown) return;

    const timer = setTimeout(() => {
      setDemoOpen(true);
      sessionStorage.setItem("sl_demo_shown", "1");
    }, 3000);

    return () => clearTimeout(timer);
  }, [demoCompleted]);

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
        <InstantMasteryModal open={demoOpen} onOpenChange={handleDemoClose} />
        <ScrollTriggerBanner onStartDemo={handleStartDemo} demoCompleted={demoCompleted} />
      </MobileLayout>
    );
  }

  return (
    <div className="min-h-screen">
      <Navbar />
      <TrialBanner />
      <main>
        <HeroSection onStartDemo={handleStartDemo} />
        <TrustSignals />
        <CategoryCards />
        <ForYouSection />
        <GetInspiredSection />
        <HowItWorks />
        <WhyDifferent />
        <PlatformClarification />
        <FAQSection />
        <FinalCTA />
      </main>
      <Footer />
      <InstantMasteryModal open={demoOpen} onOpenChange={handleDemoClose} />
      <ScrollTriggerBanner onStartDemo={handleStartDemo} demoCompleted={demoCompleted} />
    </div>
  );
};

export default Index;
