import { motion } from "framer-motion";
import { Check, X, Shield, Sparkles } from "lucide-react";

const COMPARISON_ROWS = [
  { feature: "Structured chapter architecture", standard: false, scroll: true },
  { feature: "Bloom's taxonomy assessment", standard: false, scroll: true },
  { feature: "Citation & reference verification", standard: false, scroll: true },
  { feature: "SHA-256 integrity hashing", standard: false, scroll: true },
  { feature: "Adaptive difficulty quizzes", standard: false, scroll: true },
  { feature: "Mastery certification", standard: false, scroll: true },
  { feature: "Anti-cheat integrity controls", standard: false, scroll: true },
  { feature: "Basic text generation", standard: true, scroll: true },
  { feature: "Multiple export formats", standard: true, scroll: true },
];

const PROSE_COMPARISON = {
  standard: {
    title: "Machine Learning Basics",
    text: "Machine learning is a type of artificial intelligence. It uses algorithms to learn from data. There are three main types: supervised, unsupervised, and reinforcement learning. Machine learning is used in many applications today.",
    issues: ["No learning objectives", "Surface-level content", "No assessment", "No citations"],
  },
  scroll: {
    title: "Chapter 3: Supervised Learning Paradigms",
    text: "**Learning Objectives:** By the end of this chapter, you will be able to (1) distinguish between classification and regression tasks, (2) evaluate model performance using appropriate metrics, and (3) apply regularization techniques to prevent overfitting.\n\n> \"The goal of supervised learning is to learn a mapping from inputs to outputs, given a training set of input-output pairs.\" — Mitchell, T. (1997). *Machine Learning*, p.2\n\nSupervised learning operates on labeled datasets where each training example...",
    strengths: ["Bloom-aligned objectives", "Academic citations", "Structured pedagogy", "Assessment-ready"],
  },
};

export function ContentComparison() {
  return (
    <section className="py-20 bg-muted/30">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-14"
        >
          <h2 className="text-3xl md:text-4xl font-display font-bold text-foreground mb-4">
            Not just another AI book generator
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            See the difference between generic AI content and ScrollLibrary's mastery-verified output.
          </p>
        </motion.div>

        {/* Prose Comparison */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="grid md:grid-cols-2 gap-6 max-w-5xl mx-auto mb-16"
        >
          {/* Standard AI */}
          <div className="bg-card border border-border rounded-xl p-6 relative">
            <div className="absolute -top-3 left-4">
              <span className="px-3 py-1 bg-muted text-muted-foreground text-xs font-medium rounded-full border border-border">
                Standard AI Output
              </span>
            </div>
            <h4 className="font-semibold text-foreground mt-3 mb-3">{PROSE_COMPARISON.standard.title}</h4>
            <p className="text-sm text-muted-foreground leading-relaxed mb-4 font-mono bg-muted/50 p-3 rounded-lg">
              {PROSE_COMPARISON.standard.text}
            </p>
            <div className="flex flex-wrap gap-2">
              {PROSE_COMPARISON.standard.issues.map((issue) => (
                <span key={issue} className="inline-flex items-center gap-1 text-xs text-destructive bg-destructive/10 px-2 py-1 rounded-full">
                  <X className="h-3 w-3" />
                  {issue}
                </span>
              ))}
            </div>
          </div>

          {/* ScrollLibrary */}
          <div className="bg-card border-2 border-primary/30 rounded-xl p-6 relative shadow-lg">
            <div className="absolute -top-3 left-4">
              <span className="px-3 py-1 bg-primary text-primary-foreground text-xs font-medium rounded-full flex items-center gap-1">
                <Shield className="h-3 w-3" />
                ScrollLibrary Output
              </span>
            </div>
            <h4 className="font-semibold text-foreground mt-3 mb-3">{PROSE_COMPARISON.scroll.title}</h4>
            <div className="text-sm text-muted-foreground leading-relaxed mb-4 font-mono bg-primary/5 p-3 rounded-lg whitespace-pre-line">
              {PROSE_COMPARISON.scroll.text}
            </div>
            <div className="flex flex-wrap gap-2">
              {PROSE_COMPARISON.scroll.strengths.map((s) => (
                <span key={s} className="inline-flex items-center gap-1 text-xs text-primary bg-primary/10 px-2 py-1 rounded-full">
                  <Check className="h-3 w-3" />
                  {s}
                </span>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Feature Comparison Table */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="max-w-3xl mx-auto"
        >
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="grid grid-cols-3 gap-0 border-b border-border bg-muted/50 p-4">
              <div className="text-sm font-semibold text-foreground">Feature</div>
              <div className="text-sm font-semibold text-muted-foreground text-center">Other AI Tools</div>
              <div className="text-sm font-semibold text-primary text-center flex items-center justify-center gap-1">
                <Sparkles className="h-3.5 w-3.5" />
                ScrollLibrary
              </div>
            </div>
            {COMPARISON_ROWS.map((row, i) => (
              <div
                key={row.feature}
                className={`grid grid-cols-3 gap-0 p-4 ${i < COMPARISON_ROWS.length - 1 ? "border-b border-border" : ""}`}
              >
                <div className="text-sm text-foreground">{row.feature}</div>
                <div className="flex justify-center">
                  {row.standard ? (
                    <Check className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <X className="h-4 w-4 text-muted-foreground/40" />
                  )}
                </div>
                <div className="flex justify-center">
                  <Check className="h-4 w-4 text-primary" />
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
