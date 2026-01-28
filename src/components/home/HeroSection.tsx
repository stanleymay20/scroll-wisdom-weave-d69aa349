import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ChevronRight, CheckCircle, Star } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";

// Import hero assets
import heroLaptopMockup from "@/assets/hero-laptop-mockup.png";
import featureProductivity from "@/assets/icons/feature-productivity.png";
import featureScholarly from "@/assets/icons/feature-scholarly.png";
import featureAI from "@/assets/icons/feature-ai.png";
import featureControl from "@/assets/icons/feature-control.png";

const features = [
  {
    icon: featureProductivity,
    title: "Boost Productivity",
    description: "Produce comprehensive textbooks faster",
  },
  {
    icon: featureScholarly,
    title: "Scholarly Quality",
    description: "Ensure accuracy, citations, and academic tone",
  },
  {
    icon: featureAI,
    title: "Advanced AI",
    description: "Keep up to date with the latest in AI content generation",
  },
  {
    icon: featureControl,
    title: "Full Control",
    description: "Maintain oversight of content creation",
  },
];

export function HeroSection() {
  const navigate = useNavigate();
  const { t } = useLanguage();

  return (
    <section className="relative min-h-screen bg-gradient-to-b from-background via-muted/30 to-background overflow-hidden pt-20 pb-12">
      {/* Subtle background gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-scroll-gold/5 via-transparent to-primary/5 pointer-events-none" />
      
      <div className="container mx-auto px-4 relative z-10">
        {/* Main Hero Content - Two Column Layout */}
        <div className="grid lg:grid-cols-2 gap-12 items-center min-h-[70vh]">
          {/* Left Column - Text Content */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
            className="space-y-6"
          >
            <h1 className="font-display text-4xl md:text-5xl lg:text-[3.5rem] font-bold leading-tight">
              <span className="text-foreground">Generate High-Quality</span>
              <br />
              <span className="text-foreground">Academic Books with</span>
              <br />
              <span className="text-gradient-gold">Advanced AI</span>
            </h1>

            <p className="text-lg text-muted-foreground max-w-xl leading-relaxed">
              ScrollLibrary empowers educators, researchers, and institutions to create
              scholarly textbooks and course materials with unprecedented ease and precision.
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-wrap items-center gap-4 pt-4">
              <Button 
                onClick={() => navigate('/generate')}
                size="lg"
                className="bg-scroll-gold hover:bg-scroll-gold/90 text-white font-semibold px-8 py-6 text-base rounded-full shadow-lg hover:shadow-xl transition-all"
              >
                Get Started
                <ChevronRight className="h-5 w-5 ml-1" />
              </Button>
              
              <div className="flex items-center gap-2 text-muted-foreground">
                <CheckCircle className="h-5 w-5 text-green-500" />
                <span className="text-sm font-medium">
                  Try for free,<br className="hidden sm:block" /> no credit card required
                </span>
              </div>
            </div>

            {/* Social Proof - Rating */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.4 }}
              className="flex items-center gap-3 pt-4"
            >
              <div className="flex">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="h-5 w-5 fill-scroll-gold text-scroll-gold" />
                ))}
              </div>
              <span className="font-semibold text-foreground">4.8</span>
              <span className="text-muted-foreground text-sm">
                Over 10,000 books generated
              </span>
            </motion.div>
          </motion.div>

          {/* Right Column - Laptop Mockup */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="relative flex items-center justify-center lg:justify-end"
          >
            <img
              src={heroLaptopMockup}
              alt="ScrollLibrary Platform Preview"
              className="w-full max-w-lg lg:max-w-xl object-contain drop-shadow-2xl"
            />
          </motion.div>
        </div>

        {/* Features Section */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.5 }}
          className="mt-16 lg:mt-24"
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-5xl mx-auto">
            {features.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.6 + index * 0.1 }}
                className="bg-card/80 backdrop-blur-sm border border-border/50 rounded-2xl p-6 text-center hover:shadow-lg hover:border-border transition-all duration-300"
              >
                <div className="flex justify-center mb-4">
                  <img
                    src={feature.icon}
                    alt={feature.title}
                    className="w-16 h-16 md:w-20 md:h-20 object-contain"
                  />
                </div>
                <h3 className="font-semibold text-foreground mb-2 text-sm md:text-base">
                  {feature.title}
                </h3>
                <p className="text-xs md:text-sm text-muted-foreground leading-relaxed">
                  {feature.description}
                </p>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
