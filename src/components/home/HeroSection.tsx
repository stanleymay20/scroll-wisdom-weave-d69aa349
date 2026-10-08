import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { ArrowRight, BookOpen, CheckCircle2, PenLine, Rocket, ShieldCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import heroCinematicBook from "@/assets/hero-cinematic-book.png";

interface HeroSectionProps {
  onStartDemo: () => void;
}

export function HeroSection({ onStartDemo: _onStartDemo }: HeroSectionProps) {
  const navigate = useNavigate();
  const { t } = useLanguage();

  const features = [
    {
      id: "create",
      icon: PenLine,
      title: t("home.current.featureCreateTitle"),
      desc: t("home.current.featureCreateDesc"),
    },
    {
      id: "learn",
      icon: CheckCircle2,
      title: t("home.current.featureLearnTitle"),
      desc: t("home.current.featureLearnDesc"),
    },
    {
      id: "refine",
      icon: BookOpen,
      title: t("home.current.featureRefineTitle"),
      desc: t("home.current.featureRefineDesc"),
    },
    {
      id: "publish",
      icon: Rocket,
      title: t("home.current.featurePublishTitle"),
      desc: t("home.current.featurePublishDesc"),
    },
  ];

  return (
    <section className="relative pt-20 pb-20 overflow-hidden min-h-[700px]">
      <div className="absolute inset-0 z-0">
        <img src={heroCinematicBook} alt="" className="w-full h-full object-cover" loading="eager" />
        <div className="absolute inset-0 bg-gradient-to-b from-background/95 via-background/80 to-background" />
        <div className="absolute inset-0 bg-gradient-to-r from-background/90 via-transparent to-background/90" />
      </div>

      <div className="container mx-auto px-4 relative z-10">
        <div className="grid lg:grid-cols-2 gap-12 items-center pt-8">
          <div className="max-w-xl">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-sm text-primary mb-6"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              {t("home.current.badge")}
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="font-display text-4xl md:text-5xl lg:text-6xl font-bold text-foreground mb-5 leading-[1.1]"
            >
              {t("home.current.titleLead")}{" "}
              <span className="text-primary">{t("home.current.titleHighlight")}</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="text-base md:text-lg text-muted-foreground mb-8 leading-relaxed"
            >
              {t("home.current.subtitle")}
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.15 }}
              className="flex flex-col sm:flex-row items-start gap-3 mb-10"
            >
              <Button onClick={() => navigate("/generate")} size="lg" className="gap-2 min-w-[190px]">
                {t("home.current.ctaCreate")}
                <ArrowRight className="h-4 w-4" />
              </Button>
              <Button onClick={() => navigate("/explore")} variant="outline" size="lg" className="gap-2">
                {t("home.current.ctaExplore")}
                <BookOpen className="h-4 w-4" />
              </Button>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground"
            >
              <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> {t("home.current.signalStructured")}</span>
              <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> {t("home.current.signalMastery")}</span>
              <span className="inline-flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> {t("home.current.signalGates")}</span>
            </motion.div>
          </div>

          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="hidden lg:grid grid-cols-2 gap-3"
          >
            {features.map((feature, index) => (
              <motion.div
                key={feature.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.3 + index * 0.1 }}
                className="bg-card/90 backdrop-blur-md border border-border rounded-xl p-5 hover:border-primary/40 hover:shadow-lg transition-all duration-300"
              >
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-3">
                  <feature.icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="font-semibold text-foreground text-sm mb-1">{feature.title}</h3>
                <p className="text-xs text-muted-foreground">{feature.desc}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.25 }}
          className="grid grid-cols-2 gap-3 mt-10 lg:hidden"
        >
          {features.map((feature) => (
            <div key={feature.id} className="bg-card/90 backdrop-blur-sm border border-border rounded-xl p-4 text-center">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center mx-auto mb-2">
                <feature.icon className="h-4 w-4 text-primary" />
              </div>
              <h3 className="font-semibold text-foreground text-xs mb-0.5">{feature.title}</h3>
              <p className="text-[10px] text-muted-foreground">{feature.desc}</p>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
