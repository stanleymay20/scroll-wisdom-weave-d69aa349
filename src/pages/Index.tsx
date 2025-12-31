import { useIsMobile } from "@/hooks/use-mobile";
import { Navbar } from "@/components/layout/Navbar";
import { HeroSection } from "@/components/home/HeroSection";
import { PlatformClarification } from "@/components/home/PlatformClarification";
import { AcademicCredibility } from "@/components/home/AcademicCredibility";
import { FeaturedBooks } from "@/components/home/FeaturedBooks";
import { CategoriesSection } from "@/components/home/CategoriesSection";
import { Footer } from "@/components/layout/Footer";
import { TrialBanner } from "@/components/subscription/TrialBanner";
import { MobileLayout, MobileHome } from "@/components/mobile";

const Index = () => {
  const isMobile = useIsMobile();

  // Mobile-first: Use persistent mobile layout
  if (isMobile) {
    return (
      <MobileLayout>
        <MobileHome />
      </MobileLayout>
    );
  }

  // Desktop experience
  return (
    <div className="min-h-screen">
      <Navbar />
      <TrialBanner />
      <main>
        <HeroSection />
        <PlatformClarification />
        <AcademicCredibility />
        <FeaturedBooks />
        <CategoriesSection />
      </main>
      <Footer />
    </div>
  );
};

export default Index;
