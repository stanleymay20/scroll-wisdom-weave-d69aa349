import { motion } from "framer-motion";
import { Upload, BookOpen, HelpCircle, Award } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";

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
          <span className="font-medium text-foreground text-[11px]">Add a Book</span>
        </div>
        <div className="flex items-center gap-2 bg-muted/50 rounded p-2">
          <BookOpen className="h-4 w-4 text-primary flex-shrink-0" />
          <span className="text-foreground font-medium">AI Fundamentals.pdf</span>
        </div>
        <p className="text-muted-foreground text-[10px]">Drag a file to upload or enter a topic to generate</p>
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
          <span className="text-primary font-medium">Chapter 3</span>
          <span className="text-muted-foreground">45%</span>
        </div>
        <p className="font-semibold text-foreground text-[11px]">Core Concepts</p>
        <div className="text-muted-foreground text-[9px] leading-relaxed line-clamp-4">
          Understanding the fundamental principles allows you to build a strong foundation for more advanced topics covered in later chapters...
        </div>
        <div className="flex items-center gap-1 mt-1">
          <div className="h-1 flex-1 bg-primary/20 rounded-full">
            <div className="h-full w-[45%] bg-primary rounded-full" />
          </div>
          <span className="text-[9px] text-muted-foreground">45%</span>
        </div>
      </div>
    ),
  },
  {
    number: "3",
    title: "Adaptive Quiz",
    description:
      "Test your understanding with multi-tier quizzes after reaching 80% reading progress.",
    icon: HelpCircle,
    mockup: (
      <div className="bg-card border border-border rounded-lg p-3 text-xs space-y-2">
        <p className="font-medium text-foreground text-[11px]">
          Which principle best describes the relationship between input and output?
        </p>
        <div className="space-y-1.5 text-[10px] text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full border border-border flex-shrink-0" />
            <span>The proportional response model</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full border border-primary bg-primary/20 flex-shrink-0" />
            <span className="text-foreground">The feedback loop principle</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full border border-border flex-shrink-0" />
            <span>The linear progression theory</span>
          </div>
        </div>
        <div className="bg-primary text-primary-foreground rounded px-2 py-1 text-center text-[10px] font-medium">
          Submit Answer
        </div>
      </div>
    ),
  },
  {
    number: "4",
    title: "Learning Certificate",
    description:
      "Earn a verifiable learning record showing your competency level. These are learning records, not academic diplomas.",
    icon: Award,
    mockup: (
      <div className="bg-card border border-border rounded-lg p-3 text-xs space-y-2 text-center">
        <div className="w-10 h-10 mx-auto rounded-full bg-primary/10 flex items-center justify-center">
          <Award className="h-5 w-5 text-primary" />
        </div>
        <p className="font-bold text-foreground text-[11px]">Learning Record</p>
        <p className="text-muted-foreground text-[9px]">Competency Score: 85%</p>
        <p className="font-semibold text-foreground text-sm">Jane Doe</p>
        <p className="text-muted-foreground text-[10px]">AI Fundamentals</p>
        <p className="text-primary font-bold text-lg">85%</p>
        <p className="text-muted-foreground text-[8px] italic">Learning record · Not an academic diploma</p>
        <div className="bg-primary text-primary-foreground rounded px-2 py-1 text-center text-[10px] font-medium">
          Verify
        </div>
      </div>
    ),
  },
];

export function HowItWorks() {
  const navigate = useNavigate();

  return (
    <section className="py-20 bg-muted/30" aria-labelledby="how-it-works-heading">
      <div className="container mx-auto px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-14"
        >
          <h2 id="how-it-works-heading" className="text-3xl md:text-4xl font-display font-bold text-foreground">
            How it works
          </h2>
          <p className="text-muted-foreground mt-2">
            Four steps from content to verified competency
          </p>
        </motion.div>

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
                <div className="flex items-center justify-center gap-2 mb-1">
                  <span className="text-primary font-bold text-sm">{step.number}</span>
                  <h3 className="text-sm font-semibold text-foreground">
                    {step.title}
                  </h3>
                </div>
                <p className="text-xs text-muted-foreground">{step.description}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
