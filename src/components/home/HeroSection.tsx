import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Shield, Brain, Keyboard, Lock } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import heroLibraryBg from "@/assets/hero-library-bg.png";

const FEATURES = [
  { icon: Brain, title: "Bloom-Weighted Scoring", desc: "Higher-order thinking (Analyze, Evaluate) weighs more." },
  { icon: Shield, title: "9 Certification Gates", desc: "No mastery issued unless all cognitive thresholds are met." },
  { icon: Keyboard, title: "Typed-Only Coding", desc: "No paste. No shortcuts. Real input required." },
  { icon: Lock, title: "SHA-256 Mastery Record", desc: "Cryptographically verifiable learning artifact." },
];

interface HeroSectionProps {
  onStartDemo: () => void;
}

export function HeroSection({ onStartDemo }: HeroSectionProps) {
  const { t } = useLanguage();

  return (
    <section className="relative pt-24 pb-16 overflow-hidden min-h-[600px]">
      {/* Background */}
      <div className="absolute inset-0 z-0">
        <img src={heroLibraryBg} alt="" className="w-full h-full object-cover opacity-30" />
        <div className="absolute inset-0 bg-gradient-to-b from-background/90 via-background/70 to-background" />
      </div>

      <div className="container mx-auto px-4 relative z-10">
        <div className="max-w-4xl mx-auto text-center pt-8">
          {/* Badge */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-sm text-primary mb-6"
          >
            <Shield className="h-3.5 w-3.5" />
            Cognitive Mastery Certification Platform
          </motion.div>

          {/* Headline — direct, challenging */}
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="font-display text-4xl md:text-5xl lg:text-6xl font-bold text-foreground mb-5 leading-tight"
          >
            Test What You Actually{" "}
            <span className="text-primary">Understand.</span>
          </motion.h1>

          {/* Subheadline — one line, no fluff */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="text-base md:text-lg text-muted-foreground mb-8 leading-relaxed max-w-2xl mx-auto"
          >
            Structured Bloom-weighted evaluation. Integrity enforced. No shortcuts.
          </motion.p>

          {/* Positioning line */}
          <p className="text-[11px] text-muted-foreground mb-6 -mt-4">
            Designed as a cognitive validation layer — not content generation.
          </p>

          {/* Dual CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.15 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-10"
          >
            <Button onClick={onStartDemo} size="lg" className="gap-2 min-w-[220px]">
              <Brain className="h-4 w-4" />
              Start 20-Second Check
            </Button>
            <Button onClick={() => window.location.href = "/docs/mastery-model"} variant="outline" size="lg" className="gap-2 min-w-[250px]">
              See How Certification Works
            </Button>
          </motion.div>
        </div>

        {/* 4-column Feature Block */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.25 }}
          className="grid grid-cols-2 lg:grid-cols-4 gap-4 max-w-5xl mx-auto"
        >
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="bg-card/80 backdrop-blur-sm border border-border rounded-xl p-5 text-center hover:border-primary/30 transition-colors"
            >
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mx-auto mb-3">
                <f.icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="font-semibold text-foreground text-sm mb-1">{f.title}</h3>
              <p className="text-xs text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
