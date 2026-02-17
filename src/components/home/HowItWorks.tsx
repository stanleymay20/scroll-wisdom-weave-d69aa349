import { motion } from "framer-motion";
import { Upload, BookOpen, HelpCircle, Award } from "lucide-react";

const steps = [
  {
    number: "1",
    title: "Upload or Generate",
    description:
      "Upload your PDF textbook or generate a structured study guide on any topic.",
    icon: Upload,
    mockup: (
      <div className="bg-card border border-border rounded-lg p-3 text-xs space-y-2">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-primary/10 flex items-center justify-center">
            <Upload className="h-3 w-3 text-primary" />
          </div>
          <span className="font-medium text-foreground text-[11px]">About Books</span>
        </div>
        <div className="flex items-center gap-2 bg-muted/50 rounded p-2">
          <BookOpen className="h-4 w-4 text-primary flex-shrink-0" />
          <span className="text-foreground font-medium">AI Fundamentals.pdf</span>
        </div>
        <p className="text-muted-foreground text-[10px]">Drag textbook or Directory to upload book.</p>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-[10px]">Enter Topic</span>
          </div>
          <div className="bg-muted/30 rounded p-1.5 text-muted-foreground text-[10px]">Digital Marketing</div>
        </div>
        <div className="bg-primary text-primary-foreground rounded px-2 py-1 text-center text-[10px] font-medium">
          Generate Study Guide →
        </div>
      </div>
    ),
  },
  {
    number: "2",
    title: "Structured Reading",
    description:
      "Read through organized chapters with highlights, notes, and progress tracking.",
    icon: BookOpen,
    mockup: (
      <div className="bg-card border border-border rounded-lg p-3 text-xs space-y-2">
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-primary font-medium">Physics</span>
          <span className="text-muted-foreground">19%</span>
        </div>
        <p className="font-semibold text-foreground text-[11px]">Classical Mechanics</p>
        <div className="text-muted-foreground text-[9px] leading-relaxed line-clamp-4">
          Studying stellar dynamics can be approached from the perspective of classical mechanics where bodies interact under gravitational forces...
        </div>
        <div className="flex items-center gap-1 mt-1">
          <div className="h-1 flex-1 bg-primary/20 rounded-full">
            <div className="h-full w-1/5 bg-primary rounded-full" />
          </div>
          <span className="text-[9px] text-muted-foreground">20%</span>
        </div>
      </div>
    ),
  },
  {
    number: "3",
    title: "Adaptive Quiz",
    description:
      "Test your understanding with multi-tier quizzes that unlock at 80% reading progress.",
    icon: HelpCircle,
    mockup: (
      <div className="bg-card border border-border rounded-lg p-3 text-xs space-y-2">
        <p className="font-medium text-foreground text-[11px]">
          Which of the following statements best describes Merton's third law of motion?
        </p>
        <div className="space-y-1.5 text-[10px] text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full border border-border flex-shrink-0" />
            <span>Absolute pressure, trend, and marginal...</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full border border-border flex-shrink-0" />
            <span>Li's catalyst employed a certificate to...</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full border border-border flex-shrink-0" />
            <span>Forces to conducting parameters change</span>
          </div>
        </div>
        <div className="text-[9px] text-muted-foreground">Study progression: 71%</div>
        <div className="bg-primary text-primary-foreground rounded px-2 py-1 text-center text-[10px] font-medium">
          Generate Quiz
        </div>
      </div>
    ),
  },
  {
    number: "4",
    title: "Mastery Certificate",
    description:
      "Earn a verifiable certificate proving your competency and mastery level.",
    icon: Award,
    mockup: (
      <div className="bg-card border border-border rounded-lg p-3 text-xs space-y-2 text-center">
        <div className="w-10 h-10 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
          <Award className="h-5 w-5 text-primary" />
        </div>
        <p className="font-bold text-foreground text-[11px]">Certificate of Completion</p>
        <p className="text-muted-foreground text-[9px]">Competency Score: 96%</p>
        <p className="font-semibold text-foreground text-sm">Jane Doe</p>
        <p className="text-muted-foreground text-[10px]">AI Fundamentals</p>
        <p className="text-primary font-bold text-lg">88%</p>
        <p className="text-muted-foreground text-[9px]">April 23, 2030</p>
        <div className="bg-primary text-primary-foreground rounded px-2 py-1 text-center text-[10px] font-medium">
          Verify
        </div>
      </div>
    ),
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

        {/* Step cards with mockups */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
          {steps.map((step, index) => (
            <motion.div
              key={step.number}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className="space-y-3"
            >
              {/* Screenshot mockup card */}
              <div className="bg-muted/20 rounded-xl border border-border p-2 shadow-sm hover:shadow-md transition-shadow">
                {step.mockup}
              </div>
              {/* Label */}
              <div className="text-center">
                <h3 className="text-sm font-semibold text-foreground">
                  {step.title}
                </h3>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Bottom step labels */}
        <div className="flex flex-wrap justify-center gap-4 mt-10 max-w-4xl mx-auto">
          {steps.map((step, index) => (
            <div
              key={step.number}
              className="flex items-center gap-2 text-sm font-medium"
            >
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
