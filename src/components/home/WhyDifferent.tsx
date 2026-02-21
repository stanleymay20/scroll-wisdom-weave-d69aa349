import { motion } from "framer-motion";
import { Check, X } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

const featureKeys = [
  'whyDifferent.f1',
  'whyDifferent.f2',
  'whyDifferent.f3',
  'whyDifferent.f4',
  'whyDifferent.f5',
  'whyDifferent.f6',
  'whyDifferent.f7',
  'whyDifferent.f8',
];

// [scrollLibrary, chatgpt, coursera]
const featureSupport: [boolean, boolean, boolean][] = [
  [true, false, false],   // Bloom-weighted scoring
  [true, false, false],   // Anti-gaming detection
  [true, false, false],   // Typed-only coding
  [true, false, false],   // Cryptographic mastery record
  [true, false, false],   // Adaptive remediation
  [true, false, false],   // 9 certification gates
  [true, false, false],   // Score volatility detection
  [true, false, false],   // Integrity-audited artifacts
];

export function WhyDifferent() {
  const { t } = useLanguage();

  return (
    <section className="py-20 bg-background" aria-labelledby="why-different-heading">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-14"
        >
          <h2 id="why-different-heading" className="text-3xl md:text-4xl font-display font-bold text-foreground mb-4">
            {t('whyDifferent.title')}
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            {t('whyDifferent.subtitle')}
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-3xl mx-auto overflow-x-auto"
        >
          <table className="w-full text-sm" role="table">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">{t('whyDifferent.headerFeature')}</th>
                <th className="text-center py-3 px-4 font-medium text-primary">{t('whyDifferent.headerScroll')}</th>
                <th className="text-center py-3 px-4 font-medium text-muted-foreground">{t('whyDifferent.headerGeneric')}</th>
                <th className="text-center py-3 px-4 font-medium text-muted-foreground">{t('whyDifferent.headerCoursera')}</th>
              </tr>
            </thead>
            <tbody>
              {featureKeys.map((key, i) => (
                <tr key={key} className="border-b border-border/50">
                  <td className="py-3 px-4 text-foreground">{t(key)}</td>
                  <td className="py-3 px-4 text-center">
                    {featureSupport[i][0] ? (
                      <Check className="h-4 w-4 text-primary mx-auto" />
                    ) : (
                      <X className="h-4 w-4 text-muted-foreground/40 mx-auto" />
                    )}
                  </td>
                  <td className="py-3 px-4 text-center">
                    {featureSupport[i][1] ? (
                      <Check className="h-4 w-4 text-primary mx-auto" />
                    ) : (
                      <X className="h-4 w-4 text-muted-foreground/40 mx-auto" />
                    )}
                  </td>
                  <td className="py-3 px-4 text-center">
                    {featureSupport[i][2] ? (
                      <Check className="h-4 w-4 text-primary mx-auto" />
                    ) : (
                      <X className="h-4 w-4 text-muted-foreground/40 mx-auto" />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </motion.div>
      </div>
    </section>
  );
}
