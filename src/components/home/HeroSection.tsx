import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Sparkles, BookOpen, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";

export function HeroSection() {
  const navigate = useNavigate();
  const { t } = useLanguage();

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden pt-16">
      {/* Background effects */}
      <div className="absolute inset-0 bg-hero-pattern opacity-30" />
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-scroll-gold/10 rounded-full blur-3xl animate-pulse-glow" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-scroll-bronze/10 rounded-full blur-3xl animate-pulse-glow delay-1000" />

      <div className="container mx-auto px-4 relative z-10">
        <div className="max-w-4xl mx-auto text-center">
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-scroll-gold/10 border border-scroll-gold/30 text-scroll-gold text-sm font-medium mb-8">
              <Sparkles className="h-4 w-4" />
              {t('home.badge')}
            </span>
          </motion.div>

          {/* Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="font-display text-5xl md:text-7xl lg:text-8xl font-bold mb-6"
          >
            <span className="text-foreground">{t('home.title1')}</span>
            <br />
            <span className="text-gradient-gold">{t('home.title2')}</span>
          </motion.h1>

          {/* Subheadline */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="text-xl md:text-2xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed"
          >
            {t('home.subtitle')}
          </motion.p>

          {/* CTA Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <Button 
              variant="hero" 
              size="xl" 
              onClick={() => navigate('/generate')}
              className="group"
            >
              <Sparkles className="h-5 w-5 mr-2" />
              {t('home.cta.generate')}
              <ChevronRight className="h-5 w-5 ml-1 group-hover:translate-x-1 transition-transform" />
            </Button>
            <Button 
              variant="gold-outline" 
              size="xl"
              onClick={() => navigate('/explore')}
            >
              <BookOpen className="h-5 w-5 mr-2" />
              {t('home.cta.explore')}
            </Button>
          </motion.div>

          {/* Stats */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="grid grid-cols-3 gap-8 mt-20 max-w-lg mx-auto"
          >
            {[
              { value: "∞", labelKey: "home.stats.books" },
              { value: "8K+", labelKey: "home.stats.words" },
              { value: "18", labelKey: "home.stats.categories" },
            ].map((stat, i) => (
              <div key={i} className="text-center">
                <div className="font-display text-3xl md:text-4xl font-bold text-gradient-gold">
                  {stat.value}
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  {t(stat.labelKey)}
                </div>
              </div>
            ))}
          </motion.div>
        </div>
      </div>

      {/* Scroll indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1, duration: 0.6 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2"
      >
        <div className="w-6 h-10 rounded-full border-2 border-scroll-gold/50 flex items-start justify-center p-2">
          <motion.div
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 1.5, repeat: Infinity }}
            className="w-1.5 h-1.5 rounded-full bg-scroll-gold"
          />
        </div>
      </motion.div>
    </section>
  );
}
