import { Navbar } from "@/components/layout/Navbar";
import { HeroSection } from "@/components/home/HeroSection";
import { FeaturedBooks } from "@/components/home/FeaturedBooks";
import { CategoriesSection } from "@/components/home/CategoriesSection";
import { Footer } from "@/components/layout/Footer";
import { TrialBanner } from "@/components/subscription/TrialBanner";

const Index = () => {
  return (
    <div className="min-h-screen">
      <Navbar />
      <TrialBanner />
      <main>
        <HeroSection />
        <FeaturedBooks />
        <CategoriesSection />
      </main>
      <Footer />
    </div>
  );
};

export default Index;
