import { motion } from "framer-motion";
import { Check, X } from "lucide-react";

const comparisons = [
  { feature: "Chapter-by-chapter structured reading", generic: false, scroll: true },
  { feature: "Bloom's-taxonomy quiz assessment", generic: false, scroll: true },
  { feature: "Competency tracking per chapter", generic: false, scroll: true },
  { feature: "Cryptographically signed learning records", generic: false, scroll: true },
  { feature: "Upload & parse your own PDF/EPUB", generic: false, scroll: true },
  { feature: "Reading progress & streak tracking", generic: false, scroll: true },
  { feature: "AI-generated academic study guides", generic: false, scroll: true },
];

export function WhyDifferent() {
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
            More than a reading app
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            ScrollLibrary is built for structured learning and mastery tracking — not just passive reading.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-2xl mx-auto overflow-x-auto"
        >
          <table className="w-full text-sm" role="table">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Feature</th>
                <th className="text-center py-3 px-4 font-medium text-muted-foreground">Generic Tools</th>
                <th className="text-center py-3 px-4 font-medium text-primary">ScrollLibrary</th>
              </tr>
            </thead>
            <tbody>
              {comparisons.map((row) => (
                <tr key={row.feature} className="border-b border-border/50">
                  <td className="py-3 px-4 text-foreground">{row.feature}</td>
                  <td className="py-3 px-4 text-center">
                    {row.generic ? (
                      <Check className="h-4 w-4 text-primary mx-auto" />
                    ) : (
                      <X className="h-4 w-4 text-muted-foreground/40 mx-auto" />
                    )}
                  </td>
                  <td className="py-3 px-4 text-center">
                    {row.scroll ? (
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
