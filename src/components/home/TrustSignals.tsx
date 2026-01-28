import { motion } from "framer-motion";
import { Check } from "lucide-react";

const signals = [
  "Academic-grade structure",
  "Citation-aware generation",
  "Institution-ready outputs",
  "Built for universities & professionals"
];

export function TrustSignals() {
  return (
    <section className="py-12 border-y border-border bg-muted/20">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-6"
        >
          <p className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Trusted by Students, Researchers & Educators
          </p>
        </motion.div>

        <div className="flex flex-wrap justify-center gap-x-8 gap-y-3">
          {signals.map((signal, index) => (
            <motion.div
              key={signal}
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className="flex items-center gap-2 text-sm text-foreground"
            >
              <Check className="h-4 w-4 text-primary" strokeWidth={2} />
              <span>{signal}</span>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
