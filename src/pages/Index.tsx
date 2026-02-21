/**
 * CONTRACT 5 — Home Page Performance
 */

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

const Index = () => {
  const isMobile = useIsMobile();
  
  usePagePerformance('Home');

  if (isMobile) {
    return (
      <MobileLayout>
        <MobileHome />
      </MobileLayout>
    );
  }

  return (
    <div className="min-h-screen">
      <Navbar />
      <TrialBanner />
      <main>
        <HeroSection />
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
    </div>
  );
};

export default Index;
