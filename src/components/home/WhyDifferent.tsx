import { motion } from "framer-motion";

const comparisons = [
  { feature: "Q&A over uploaded docs", notebooklm: true, scrolllibrary: false, scrollLabel: "Structured chapter reader" },
  { feature: "Conversational", notebooklm: true, scrolllibrary: false, scrollLabel: "Curriculum structured" },
  { feature: "No mastery tracking", notebooklm: true, scrolllibrary: false, scrollLabel: "Progress tracking" },
  { feature: "No certification", notebooklm: true, scrolllibrary: false, scrollLabel: "Mastery certificate" },
  { feature: "No competency scoring", notebooklm: true, scrolllibrary: false, scrollLabel: "Skill tracking" },
];

export function WhyDifferent() {
  return (
    <section className="py-20 bg-background">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-14"
        >
          <h2 className="text-3xl md:text-4xl font-display font-bold text-foreground mb-4">
            Not just another AI tool
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            ScrollLibrary competes on structure, persistence, mastery tracking, and academic UX — not chat.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-3xl mx-auto overflow-x-auto"
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-3 px-4 font-medium text-muted-foreground">Feature</th>
                <th className="text-center py-3 px-4 font-medium text-muted-foreground">Generic AI Tools</th>
                <th className="text-center py-3 px-4 font-medium text-primary">ScrollLibrary</th>
              </tr>
            </thead>
            <tbody>
              {comparisons.map((row) => (
                <tr key={row.feature} className="border-b border-border/50">
                  <td className="py-3 px-4 text-muted-foreground">{row.feature}</td>
                  <td className="py-3 px-4 text-center text-muted-foreground">✓</td>
                  <td className="py-3 px-4 text-center text-primary font-medium">{row.scrollLabel}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </motion.div>
      </div>
    </section>
  );
}
