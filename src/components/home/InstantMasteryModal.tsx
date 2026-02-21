/**
 * Instant Mastery Check — auto-launches on homepage idle
 * 1 Bloom-level question, immediate radar result, conversion CTAs
 */

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Brain, CheckCircle2, XCircle, Zap, ArrowRight, Shield } from "lucide-react";
import { MiniRadarChart } from "./MiniRadarChart";
import { useNavigate } from "react-router-dom";

const DEMO_QUESTIONS = [
  {
    question: "A company's revenue doubled while profit margins fell by 30%. Which conclusion requires the LEAST additional information to validate?",
    options: [
      "The company became more efficient",
      "Operating costs grew faster than revenue",
      "The company should reduce staff",
      "Market conditions worsened",
    ],
    correct: 1,
    bloomLevel: "Analyze" as const,
  },
  {
    question: "An algorithm runs in O(n log n) on average but O(n²) worst-case. When designing a real-time system, which factor most critically determines the appropriate algorithm choice?",
    options: [
      "Average-case performance benchmarks",
      "Worst-case latency tolerance of the system",
      "Memory availability on the server",
      "Programming language used",
    ],
    correct: 1,
    bloomLevel: "Evaluate" as const,
  },
  {
    question: "A study finds correlation (r=0.85) between ice cream sales and drowning incidents. Which analytical flaw is MOST important to identify before drawing conclusions?",
    options: [
      "The sample size might be too small",
      "Confounding variable (temperature) drives both metrics independently",
      "The correlation coefficient is not high enough",
      "Drowning data may be unreliable",
    ],
    correct: 1,
    bloomLevel: "Analyze" as const,
  },
];

type Phase = "question" | "result";

interface InstantMasteryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InstantMasteryModal({ open, onOpenChange }: InstantMasteryModalProps) {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>("question");
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [question] = useState(() => DEMO_QUESTIONS[Math.floor(Math.random() * DEMO_QUESTIONS.length)]);
  const [startTime] = useState(Date.now());

  const isCorrect = selectedAnswer === question.correct;

  const handleAnswer = useCallback((index: number) => {
    setSelectedAnswer(index);
    
    // Brief delay then show result
    setTimeout(() => setPhase("result"), 600);

    // Store result
    const result = {
      bloomLevel: question.bloomLevel,
      correct: index === question.correct,
      timestamp: Date.now(),
      timeSpent: Date.now() - startTime,
    };
    
    try {
      const prev = JSON.parse(localStorage.getItem("sl_demo_results") || "[]");
      prev.push(result);
      localStorage.setItem("sl_demo_results", JSON.stringify(prev));
    } catch { /* ignore */ }

    // Track analytics
    window.dispatchEvent(new CustomEvent("sl_analytics", { detail: { event: "demo_completed", correct: index === question.correct, bloomLevel: question.bloomLevel } }));
  }, [question, startTime]);

  const handleRetry = () => {
    window.dispatchEvent(new CustomEvent("sl_analytics", { detail: { event: "demo_retry" } }));
    onOpenChange(false);
    setTimeout(() => onOpenChange(true), 100);
  };

  const handleUnlock = () => {
    window.dispatchEvent(new CustomEvent("sl_analytics", { detail: { event: "demo_signup_conversion" } }));
    navigate("/auth");
  };

  useEffect(() => {
    if (open) {
      window.dispatchEvent(new CustomEvent("sl_analytics", { detail: { event: "demo_opened" } }));
    }
  }, [open]);

  // Radar values — highlight only the assessed level
  const bloomIndex = ["Remember", "Understand", "Apply", "Analyze", "Evaluate", "Create"].indexOf(question.bloomLevel);
  const radarValues = Array(6).fill(0).map((_, i) => (i === bloomIndex ? (isCorrect ? 90 : 25) : 0));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden">
        <DialogTitle className="sr-only">Quick Mastery Check</DialogTitle>
        
        <AnimatePresence mode="wait">
          {phase === "question" && (
            <motion.div
              key="question"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="p-6"
            >
              {/* Header */}
              <div className="flex items-center gap-2 mb-1">
                <Brain className="h-5 w-5 text-primary" />
                <h2 className="text-lg font-bold text-foreground">Quick Mastery Check</h2>
              </div>
              <p className="text-xs text-muted-foreground mb-5">20 seconds. No signup required.</p>

              <Badge variant="outline" className="mb-4 text-xs">
                <Zap className="h-3 w-3 mr-1" />
                Bloom Level: {question.bloomLevel}
              </Badge>

              <p className="text-sm font-medium text-foreground mb-4 leading-relaxed">{question.question}</p>

              <div className="space-y-2">
                {question.options.map((opt, i) => (
                  <button
                    key={i}
                    onClick={() => selectedAnswer === null && handleAnswer(i)}
                    disabled={selectedAnswer !== null}
                    className={`w-full text-left px-4 py-3 rounded-lg border text-sm transition-all ${
                      selectedAnswer === null
                        ? "border-border hover:border-primary/50 hover:bg-primary/5 cursor-pointer"
                        : selectedAnswer === i
                          ? i === question.correct
                            ? "border-green-500 bg-green-500/10 text-green-700 dark:text-green-400"
                            : "border-destructive bg-destructive/10 text-destructive"
                          : i === question.correct && selectedAnswer !== null
                            ? "border-green-500/50 bg-green-500/5"
                            : "border-border opacity-50"
                    }`}
                  >
                    <span className="font-medium mr-2 text-muted-foreground">{String.fromCharCode(65 + i)}.</span>
                    {opt}
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {phase === "result" && (
            <motion.div
              key="result"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-6"
            >
              {/* Result header */}
              <div className="text-center mb-4">
                {isCorrect ? (
                  <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto mb-2" />
                ) : (
                  <XCircle className="h-10 w-10 text-destructive mx-auto mb-2" />
                )}
                <p className="text-sm font-semibold text-foreground">
                  {isCorrect ? "Strong analytical reasoning detected." : "Analytical gap detected. Let's strengthen it."}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Bloom Level: {question.bloomLevel} — Score: {isCorrect ? "100" : "0"}%
                </p>
              </div>

              {/* Mini Radar */}
              <motion.div
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.2, duration: 0.6 }}
              >
                <MiniRadarChart values={radarValues} size={180} />
              </motion.div>

              {/* Gate preview */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
                className="mt-4 p-3 rounded-lg border border-border bg-card/50"
              >
                <div className="flex items-center gap-2 text-xs font-semibold text-foreground mb-2">
                  <Shield className="h-3.5 w-3.5 text-primary" />
                  Certification Gates Preview
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="text-primary font-bold">1</span>/9 assessed
                  <span className="ml-auto text-muted-foreground/60">8 gates locked</span>
                </div>
                <div className="flex gap-1 mt-2">
                  <div className={`h-1.5 flex-1 rounded-full ${isCorrect ? 'bg-primary' : 'bg-destructive/60'}`} />
                  {Array(8).fill(0).map((_, i) => (
                    <div key={i} className="h-1.5 flex-1 rounded-full bg-muted" />
                  ))}
                </div>
              </motion.div>

              {/* CTAs */}
              <div className="mt-5 space-y-2">
                <Button onClick={handleUnlock} className="w-full gap-2" size="lg">
                  Unlock Full Mastery Profile
                  <ArrowRight className="h-4 w-4" />
                </Button>
                <Button onClick={handleRetry} variant="ghost" size="sm" className="w-full text-muted-foreground">
                  Try a Harder Question
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
