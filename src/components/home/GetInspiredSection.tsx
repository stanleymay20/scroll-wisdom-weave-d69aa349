import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Lightbulb, BookOpen, GraduationCap, FileText } from "lucide-react";

const resources = [
  {
    title: "How to Study Effectively",
    description:
      "Evidence-based study techniques including spaced repetition, active recall, and interleaving to maximise retention and understanding.",
    icon: GraduationCap,
    to: "/help",
  },
  {
    title: "Taking Better Notes",
    description:
      "Master the Cornell method, mind mapping, and structured annotation to transform passive reading into active learning.",
    icon: FileText,
    to: "/help",
  },
  {
    title: "Preparing for Exams",
    description:
      "Build a structured revision plan using ScrollLibrary's quiz and competency system to track what you know and what needs more work.",
    icon: BookOpen,
    to: "/help",
  },
];

export function GetInspiredSection() {
  return (
    <section className="py-16 bg-background">
      <div className="container mx-auto px-4 max-w-6xl">
        <div className="flex items-baseline gap-4 mb-8">
          <h2 className="text-2xl font-display font-bold text-foreground flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-primary" />
            Get Inspired!
          </h2>
          <p className="text-sm text-muted-foreground">
            Research &amp; study support
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-5">
          {resources.map((res, i) => (
            <motion.div
              key={res.title}
              initial={{ opacity: 0, y: 15 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.1 }}
            >
              <Link
                to={res.to}
                className="group block bg-card border border-border rounded-xl p-6 h-full hover:shadow-md hover:border-primary/20 transition-all"
              >
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <res.icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="font-semibold text-foreground mb-2 group-hover:text-primary transition-colors">
                  {res.title}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {res.description}
                </p>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
