import { motion } from "framer-motion";
import { Check, X, GraduationCap, BookOpen, Lightbulb } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

export function PlatformClarification() {
  const { t } = useLanguage();

  const isItems = [
    { icon: BookOpen, text: t('clarification.is1') },
    { icon: GraduationCap, text: t('clarification.is2') },
    { icon: Lightbulb, text: t('clarification.is3') },
  ];

  const isNotItems = [
    t('clarification.isNot1'),
    t('clarification.isNot2'),
    t('clarification.isNot3'),
  ];

  return (
    <section className="py-16 bg-muted/20">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-4xl mx-auto"
        >
          <div className="text-center mb-10">
            <h2 className="text-3xl font-display font-bold text-foreground mb-4">
              {t('clarification.title')}
            </h2>
            <p className="text-muted-foreground">
              {t('clarification.subtitle')}
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {/* What ScrollLibrary IS */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="bg-gradient-card rounded-xl border border-border/50 p-6"
            >
              <h3 className="text-xl font-semibold text-foreground mb-4 flex items-center gap-2">
                <span className="bg-primary/20 p-1.5 rounded-full">
                  <Check className="h-4 w-4 text-primary" />
                </span>
                {t('clarification.isTitle')}
              </h3>
              <ul className="space-y-3">
                {isItems.map((item, index) => (
                  <li key={index} className="flex items-start gap-3">
                    <item.icon className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                    <span className="text-muted-foreground">{item.text}</span>
                  </li>
                ))}
              </ul>
            </motion.div>

            {/* What ScrollLibrary IS NOT */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="bg-gradient-card rounded-xl border border-border/50 p-6"
            >
              <h3 className="text-xl font-semibold text-foreground mb-4 flex items-center gap-2">
                <span className="bg-destructive/20 p-1.5 rounded-full">
                  <X className="h-4 w-4 text-destructive" />
                </span>
                {t('clarification.isNotTitle')}
              </h3>
              <ul className="space-y-3">
                {isNotItems.map((item, index) => (
                  <li key={index} className="flex items-start gap-3">
                    <X className="h-5 w-5 text-muted-foreground/50 mt-0.5 flex-shrink-0" />
                    <span className="text-muted-foreground">{item}</span>
                  </li>
                ))}
              </ul>
            </motion.div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
