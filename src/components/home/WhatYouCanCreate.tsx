import { motion } from "framer-motion";
import { BookOpen, Brain, GraduationCap, Award } from "lucide-react";

const creations = [
  {
    icon: BookOpen,
    title: "Generate Study Guides",
    description: "Enter any topic and get a structured, multi-chapter study guide in minutes."
  },
  {
    icon: Brain,
    title: "Read & Learn",
    description: "Guided reading with text-to-speech, highlights, and AI Q&A built in."
  },
  {
    icon: GraduationCap,
    title: "Test Your Knowledge",
    description: "Adaptive quizzes unlock after reading — from recall to applied reasoning."
  },
  {
    icon: Award,
    title: "Earn Certificates",
    description: "Prove your competency with verifiable, SHA-256 signed credentials."
  }
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
            How It Works
          </h2>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
          {creations.map((item, index) => {
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
