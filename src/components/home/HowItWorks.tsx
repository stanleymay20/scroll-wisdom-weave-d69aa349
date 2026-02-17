import { motion } from "framer-motion";
import { Upload, BookOpen, HelpCircle, Award } from "lucide-react";

const steps = [
  {
    number: "1",
    title: "Upload or Generate",
    description: "Upload your PDF textbook or generate a structured study guide on any topic.",
    icon: Upload,
  },
  {
    number: "2",
    title: "Structured Reading",
    description: "Read through organized chapters with highlights, notes, and progress tracking.",
    icon: BookOpen,
  },
  {
    number: "3",
    title: "Adaptive Quiz",
    description: "Test your understanding with multi-tier quizzes that unlock at 80% reading progress.",
    icon: HelpCircle,
  },
  {
    number: "4",
    title: "Mastery Certificate",
    description: "Earn a verifiable certificate proving your competency and mastery level.",
    icon: Award,
  },
];

export function HowItWorks() {
  return (
    <section className="py-20 bg-muted/30">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-14"
        >
          <h2 className="text-3xl md:text-4xl font-display font-bold text-foreground">
            Turn books into structured mastery
          </h2>
        </motion.div>

        {/* Step tabs header */}
        <div className="flex flex-wrap justify-center gap-4 mb-10 max-w-4xl mx-auto">
          {steps.map((step, index) => (
            <motion.div
              key={step.number}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className="flex items-center gap-2 text-sm font-medium"
            >
              <span className="text-primary font-bold">{step.number}</span>
              <span className="text-foreground">{step.title}</span>
              {index < steps.length - 1 && (
                <span className="text-border ml-2 hidden sm:inline">—</span>
              )}
            </motion.div>
          ))}
        </div>

        {/* Step cards */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <motion.div
                key={step.number}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="bg-card rounded-xl border border-border p-6 hover:border-primary/30 transition-colors"
              >
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <Icon className="h-6 w-6 text-primary" strokeWidth={1.5} />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  {step.title}
                </h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {step.description}
                </p>
              </motion.div>
            );
          })}
        </div>

        {/* Bottom step labels */}
        <div className="flex flex-wrap justify-center gap-4 mt-10 max-w-4xl mx-auto">
          {steps.map((step, index) => (
            <div key={step.number} className="flex items-center gap-2 text-sm font-medium">
              <span className="text-primary font-bold">{step.number}</span>
              <span className="text-foreground">{step.title}</span>
              {index < steps.length - 1 && (
                <span className="text-border ml-2 hidden sm:inline">—</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
