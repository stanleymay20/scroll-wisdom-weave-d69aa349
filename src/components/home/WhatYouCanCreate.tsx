import { motion } from "framer-motion";
import { Upload, BookOpen, HelpCircle, Award } from "lucide-react";

const features = [
  {
    icon: Upload,
    title: "Upload or Generate",
    description: "Upload PDF textbooks or generate structured study guides on any topic with AI.",
  },
  {
    icon: BookOpen,
    title: "Structured Reading",
    description: "Read through organized chapters with highlights, notes, bookmarks, and progress tracking.",
  },
  {
    icon: HelpCircle,
    title: "Adaptive Assessment",
    description: "Multi-tier quizzes test recall, reasoning, and application — unlocking at 80% reading.",
  },
  {
    icon: Award,
    title: "Mastery Certificates",
    description: "Earn verifiable credentials that prove your competency level and learning journey.",
  },
];

export function WhatYouCanCreate() {
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
            Your complete learning engine
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Two paths, one mastery engine. Upload your own books or let AI generate study guides.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
          {features.map((item, index) => {
            const Icon = item.icon;
            return (
              <motion.div
                key={item.title}
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
                  {item.title}
                </h3>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {item.description}
                </p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
