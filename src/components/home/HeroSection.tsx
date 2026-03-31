import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Shield, Brain, Keyboard, Lock, ArrowRight, Users, BookOpen, Award } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import heroCinematicBook from "@/assets/hero-cinematic-book.png";

const FEATURES = [
  { icon: Brain, title: "Bloom-Weighted Scoring", desc: "Higher-order thinking weighs more." },
  { icon: Shield, title: "9 Certification Gates", desc: "All cognitive thresholds enforced." },
  { icon: Keyboard, title: "Typed-Only Coding", desc: "No paste. Real input required." },
  { icon: Lock, title: "SHA-256 Mastery Record", desc: "Cryptographically verifiable." },
];

// Social proof removed — will be restored when real analytics are available

interface HeroSectionProps {
  onStartDemo: () => void;
}

export function HeroSection({ onStartDemo }: HeroSectionProps) {
  const { t } = useLanguage();

  return (
    <section className="relative pt-20 pb-20 overflow-hidden min-h-[700px]">
      {/* Cinematic Background */}
      <div className="absolute inset-0 z-0">
        <img
          src={heroCinematicBook}
          alt=""
          className="w-full h-full object-cover"
          loading="eager"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/95 via-background/80 to-background" />
        <div className="absolute inset-0 bg-gradient-to-r from-background/90 via-transparent to-background/90" />
      </div>

      <div className="container mx-auto px-4 relative z-10">
        <div className="grid lg:grid-cols-2 gap-12 items-center pt-8">
          {/* Left: Copy */}
          <div className="max-w-xl">
            {/* Badge */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-sm text-primary mb-6"
            >
              <Shield className="h-3.5 w-3.5" />
              Cognitive Mastery Platform
            </motion.div>

            {/* Headline */}
            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="font-display text-4xl md:text-5xl lg:text-6xl font-bold text-foreground mb-5 leading-[1.1]"
            >
              Generate. Read.{" "}
              <span className="text-primary">Prove Mastery.</span>
            </motion.h1>

            {/* Subheadline */}
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="text-base md:text-lg text-muted-foreground mb-8 leading-relaxed"
            >
              The only platform that generates books, tests your understanding with 
              Bloom's taxonomy, and issues cryptographically verifiable mastery certificates.
            </motion.p>

            {/* CTAs */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.15 }}
              className="flex flex-col sm:flex-row items-start gap-3 mb-10"
            >
              <Button onClick={onStartDemo} size="lg" className="gap-2 min-w-[220px]">
                <Brain className="h-4 w-4" />
                Try 20-Second Demo
              </Button>
              <Button onClick={() => window.location.href = "/generate"} variant="outline" size="lg" className="gap-2">
                Generate Your First Book
                <ArrowRight className="h-4 w-4" />
              </Button>
            </motion.div>

            {/* Social Proof Badges */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="flex flex-wrap gap-6"
            >
              {SOCIAL_PROOF.map((stat) => (
                <div key={stat.label} className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                    <stat.icon className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-foreground">{stat.value}</p>
                    <p className="text-[11px] text-muted-foreground">{stat.label}</p>
                  </div>
                </div>
              ))}
            </motion.div>
          </div>

          {/* Right: Feature Cards */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="hidden lg:grid grid-cols-2 gap-3"
          >
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.3 + i * 0.1 }}
                className="bg-card/90 backdrop-blur-md border border-border rounded-xl p-5 hover:border-primary/40 hover:shadow-lg transition-all duration-300"
              >
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-3">
                  <f.icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="font-semibold text-foreground text-sm mb-1">{f.title}</h3>
                <p className="text-xs text-muted-foreground">{f.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>

        {/* Mobile feature cards */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.25 }}
          className="grid grid-cols-2 gap-3 mt-10 lg:hidden"
        >
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="bg-card/90 backdrop-blur-sm border border-border rounded-xl p-4 text-center"
            >
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center mx-auto mb-2">
                <f.icon className="h-4 w-4 text-primary" />
              </div>
              <h3 className="font-semibold text-foreground text-xs mb-0.5">{f.title}</h3>
              <p className="text-[10px] text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
