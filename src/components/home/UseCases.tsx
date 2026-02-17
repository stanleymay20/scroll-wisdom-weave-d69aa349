import { motion } from "framer-motion";
import { Check } from "lucide-react";

const useCases = [
  "Upload a textbook and track reading progress chapter by chapter",
  "Generate a structured study guide for exam preparation",
  "Test mastery with adaptive quizzes after reading",
  "Earn verifiable certificates to prove competency",
  "Build a personal academic library with all your learning materials",
];

export function UseCases() {
  return (
    <section className="py-16 bg-background">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-10"
        >
          <h2 className="text-2xl md:text-3xl font-display font-bold text-foreground mb-4">
            What you can do
          </h2>
        </motion.div>

        <div className="max-w-2xl mx-auto">
          <ul className="space-y-3">
            {useCases.map((useCase, index) => (
              <motion.li
                key={index}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.08 }}
                className="flex items-start gap-3 text-muted-foreground"
              >
                <Check className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" strokeWidth={1.5} />
                <span>{useCase}</span>
              </motion.li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
