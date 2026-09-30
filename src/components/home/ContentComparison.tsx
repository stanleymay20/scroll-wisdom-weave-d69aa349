import { motion } from "framer-motion";
import { BookOpen, CheckCircle2, Layers3, ShieldCheck } from "lucide-react";

const WORKFLOW = [
  {
    icon: Layers3,
    title: "Structured from the start",
    description:
      "Create a book as a real multi-chapter project instead of managing a long chain of disconnected prompts.",
  },
  {
    icon: BookOpen,
    title: "Built to be read",
    description:
      "Generated books live in a library with chapter navigation, reading progress, and text-to-speech support.",
  },
  {
    icon: CheckCircle2,
    title: "Learning stays connected",
    description:
      "Assess understanding and keep mastery evidence attached to the book rather than moving into another tool.",
  },
  {
    icon: ShieldCheck,
    title: "Advanced features fail closed",
    description:
      "Canonical and external publishing, exports, paid checkout, and specialized authoring capabilities stay closed until their GA validation gates pass.",
  },
];

export function ContentComparison() {
  return (
    <section className="py-20 bg-muted/30">
      <div className="container mx-auto px-4 max-w-6xl">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-12"
        >
          <p className="text-sm font-medium text-primary mb-3">More than a prompt box</p>
          <h2 className="text-3xl md:text-4xl font-display font-bold text-foreground mb-4">
            One workspace for the life of a book
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            ScrollLibrary keeps creation, reading, and learning around the same book project while advanced publishing
            capabilities remain deliberately gated until they are validated.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
          {WORKFLOW.map((item, index) => (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.05 }}
              className="bg-card border border-border rounded-xl p-6"
            >
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                <item.icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="font-semibold text-foreground mb-2">{item.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{item.description}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
