import { Navbar } from "@/components/layout/Navbar";
import { HeroSection } from "@/components/home/HeroSection";
import { FeaturedBooks } from "@/components/home/FeaturedBooks";
import { CategoriesSection } from "@/components/home/CategoriesSection";
import { Footer } from "@/components/layout/Footer";

const Index = () => {
  return (
    <div className="min-h-screen">
      <Navbar />
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
