import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { Lightbulb, BookOpen, GraduationCap, FileText, Brain, Clock } from "lucide-react";

const resources = [
  {
    title: "How to Study Effectively",
    description:
      "Use active recall, spaced repetition, and interleaving techniques. ScrollLibrary's quiz system supports these methods by testing your understanding after each chapter.",
    icon: GraduationCap,
    to: "/help",
    tips: ["Use the quiz after every chapter", "Re-read chapters you scored below 70%", "Space your reading sessions over multiple days"],
  },
  {
    title: "Taking Better Notes",
    description:
      "Use the built-in highlights and notes feature while reading. Annotate key passages and revisit them before quizzes to reinforce understanding.",
    icon: FileText,
    to: "/help",
    tips: ["Highlight key definitions and concepts", "Write margin notes in your own words", "Review highlights before taking the quiz"],
  },
  {
    title: "Preparing for Assessments",
    description:
      "Use ScrollLibrary's multi-tier quiz system to test recall, application, and critical thinking. Aim for 80%+ reading progress before attempting the quiz.",
    icon: BookOpen,
    to: "/help",
    tips: ["Complete all chapters before the final quiz", "Use 'Ask AI' to clarify difficult concepts", "Track your competency score over time"],
  },
  {
    title: "Managing Study Time",
    description:
      "Use the reading session timer to track how long you spend on each book. Set realistic goals and build a consistent reading habit.",
    icon: Clock,
    to: "/help",
    tips: ["Aim for 25-minute focused reading sessions", "Take short breaks between chapters", "Use the progress tracker to stay motivated"],
  },
  {
    title: "Critical Thinking Skills",
    description:
      "Go beyond memorisation. Use the application and reflection phases in the competency system to develop deeper understanding of the material.",
    icon: Brain,
    to: "/help",
    tips: ["Answer application questions in your own words", "Connect concepts across different chapters", "Write reflections after completing each section"],
  },
];

export function GetInspiredSection() {
  return (
    <section className="py-16 bg-background" aria-labelledby="study-support-heading">
      <div className="container mx-auto px-4 max-w-6xl">
        <div className="flex items-baseline gap-4 mb-8">
          <h2 id="study-support-heading" className="text-2xl font-display font-bold text-foreground flex items-center gap-2">
            <Lightbulb className="h-5 w-5 text-primary" />
            Research &amp; Study Support
          </h2>
          <p className="text-sm text-muted-foreground">
            Practical tips to get the most from your learning
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {resources.map((res, i) => (
            <motion.div
              key={res.title}
              initial={{ opacity: 0, y: 15 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.08 }}
            >
              <div className="group block bg-card border border-border rounded-xl p-6 h-full hover:shadow-md hover:border-primary/20 transition-all">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <res.icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="font-semibold text-foreground mb-2">
                  {res.title}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                  {res.description}
                </p>
                {/* Actionable tips */}
                <ul className="space-y-1.5">
                  {res.tips.map((tip, j) => (
                    <li key={j} className="flex items-start gap-2 text-xs text-muted-foreground">
                      <span className="text-primary mt-0.5">•</span>
                      <span>{tip}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>
          ))}
        </div>

        <div className="text-center mt-8">
          <Link
            to="/help"
            className="text-sm text-primary hover:underline"
          >
            Visit Help Centre for more guidance →
          </Link>
        </div>
      </div>
    </section>
  );
}
