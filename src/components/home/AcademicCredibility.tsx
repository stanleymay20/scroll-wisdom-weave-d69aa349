import { motion } from "framer-motion";
import { GraduationCap, BookMarked, Code, Table, Search, FileText } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

export function AcademicCredibility() {
  const { t } = useLanguage();

  const features = [
    { icon: BookMarked, labelKey: 'academic.citations' },
    { icon: GraduationCap, labelKey: 'academic.objectives' },
    { icon: Code, labelKey: 'academic.codeBlocks' },
    { icon: Table, labelKey: 'academic.tables' },
    { icon: Search, labelKey: 'academic.deepResearch' },
    { icon: FileText, labelKey: 'academic.export' },
  ];

  return (
    <section className="py-16">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-10"
        >
          <span className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/30 text-primary text-sm font-medium mb-4">
            <GraduationCap className="h-4 w-4" />
            {t('academic.badge')}
          </span>
          <h2 className="text-3xl font-display font-bold text-foreground mb-4">
            {t('academic.title')}
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            {t('academic.subtitle')}
          </p>
        </motion.div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 max-w-4xl mx-auto">
          {features.map((feature, index) => (
            <motion.div
              key={feature.labelKey}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.05 }}
              className="bg-gradient-card rounded-xl border border-border/50 p-4 text-center hover:border-primary/30 transition-colors"
            >
              <feature.icon className="h-6 w-6 mx-auto mb-2 text-primary" />
              <p className="text-sm text-muted-foreground">{t(feature.labelKey)}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
