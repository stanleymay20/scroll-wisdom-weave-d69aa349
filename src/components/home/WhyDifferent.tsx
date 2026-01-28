import { motion } from "framer-motion";
import { GraduationCap, FileText, Layers, Zap, ShieldCheck } from "lucide-react";

const differentiators = [
  {
    icon: GraduationCap,
    title: "Academic-First AI",
    description: "Unlike generic AI writers, ScrollLibrary enforces formal tone, structure, and logic required for academic use."
  },
  {
    icon: FileText,
    title: "Citation-Aware Generation",
    description: "Designed to support references, academic integrity, and scholarly workflows."
  },
  {
    icon: Layers,
    title: "Structured by Design",
    description: "Every book follows a clear chapter hierarchy — no rambling, no incoherence."
  },
  {
    icon: Zap,
    title: "Speed Without Compromise",
    description: "What takes months manually can be drafted in hours — without sacrificing rigor."
  },
  {
    icon: ShieldCheck,
    title: "Authorship & Integrity Focused",
    description: "Built to support transparent authorship, revision tracking, and institutional trust."
  }
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
            Why ScrollLibrary Is Different
          </h2>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {differentiators.map((item, index) => {
            const Icon = item.icon;
            return (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.08 }}
                className="flex gap-4"
              >
                <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Icon className="h-5 w-5 text-primary" strokeWidth={1.5} />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-foreground mb-1">
                    {item.title}
                  </h3>
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    {item.description}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
