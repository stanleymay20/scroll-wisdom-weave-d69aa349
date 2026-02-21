/**
 * Instant Mastery Check — hardened, timed, spam-protected
 * Timer countdown, real gate checklist, analytics, edge-case safe
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Brain, CheckCircle2, XCircle, Zap, ArrowRight, Shield, Lock, Clock } from "lucide-react";
import { MiniRadarChart } from "./MiniRadarChart";
import { useNavigate } from "react-router-dom";
import {
  trackDemoEvent,
  resetDemoEvents,
  getDemoAttemptCount,
  incrementDemoAttempt,
  safePersistResult,
} from "@/lib/demoAnalytics";

const TIMER_SECONDS = 20;
const MAX_ATTEMPTS = 3;

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

const GATE_LABELS = [
  "Bloom Level Assessed",
  "Overall ≥ 80%",
  "Apply + Analyze ≥ 70%",
  "Evaluate success",
  "No declining trend",
  "≥ 2 attempts",
  "≥ 3 Bloom levels",
  "Stable volatility",
  "Coding pass ≥ 60%",
];

type Phase = "question" | "result" | "transitioning" | "locked";

interface InstantMasteryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function InstantMasteryModal({ open, onOpenChange }: InstantMasteryModalProps) {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>("question");
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [question] = useState(() => DEMO_QUESTIONS[Math.floor(Math.random() * DEMO_QUESTIONS.length)]);
  const [timeLeft, setTimeLeft] = useState(TIMER_SECONDS);
  const [timedOut, setTimedOut] = useState(false);
  const [hoveredOption, setHoveredOption] = useState<number | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(Date.now());
  const attemptCount = useRef(getDemoAttemptCount());

  const isCorrect = selectedAnswer === question.correct;

  // Check spam lock on open
  useEffect(() => {
    if (open) {
      attemptCount.current = getDemoAttemptCount();
      if (attemptCount.current >= MAX_ATTEMPTS) {
        setPhase("locked");
        trackDemoEvent("demo_attempt_limit");
      } else {
        setPhase("question");
        setSelectedAnswer(null);
        setTimeLeft(TIMER_SECONDS);
        setTimedOut(false);
        startTimeRef.current = Date.now();
        resetDemoEvents();
        trackDemoEvent("demo_opened");
      }
    }
  }, [open]);

  // Countdown timer
  useEffect(() => {
    if (!open || phase !== "question" || selectedAnswer !== null) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    trackDemoEvent("demo_started_timer");

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          timerRef.current = null;
          setTimedOut(true);
          trackDemoEvent("demo_timeout");
          setTimeout(() => setPhase("result"), 400);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [open, phase, selectedAnswer]);

  const handleAnswer = useCallback((index: number) => {
    if (selectedAnswer !== null || timedOut) return;
    setSelectedAnswer(index);
    if (timerRef.current) clearInterval(timerRef.current);

    const correct = index === question.correct;
    const count = incrementDemoAttempt();
    attemptCount.current = count;

    trackDemoEvent("demo_completed", { correct, bloomLevel: question.bloomLevel });
    trackDemoEvent(correct ? "demo_correct" : "demo_incorrect");

    safePersistResult({
      bloomLevel: question.bloomLevel,
      correct,
      timestamp: Date.now(),
      timeSpent: Date.now() - startTimeRef.current,
    });

    setTimeout(() => setPhase("result"), 600);
  }, [question, selectedAnswer, timedOut]);

  const handleRetry = () => {
    if (attemptCount.current >= MAX_ATTEMPTS) {
      setPhase("locked");
      trackDemoEvent("demo_attempt_limit");
      return;
    }
    trackDemoEvent("demo_retry");
    onOpenChange(false);
    setTimeout(() => onOpenChange(true), 100);
  };

  const handleUnlock = () => {
    trackDemoEvent("demo_signup_click");
    setPhase("transitioning");
    setTimeout(() => {
      trackDemoEvent("demo_signup_conversion");
      navigate("/auth");
      onOpenChange(false);
    }, 1500);
  };

  // Radar values
  const bloomIndex = ["Remember", "Understand", "Apply", "Analyze", "Evaluate", "Create"].indexOf(question.bloomLevel);
  const radarValues = Array(6).fill(0).map((_, i) =>
    i === bloomIndex ? (timedOut ? 10 : isCorrect ? 90 : 25) : 0
  );

  const timerColor = timeLeft <= 5 ? "text-destructive" : timeLeft <= 10 ? "text-yellow-500" : "text-muted-foreground";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden max-h-[90vh] overflow-y-auto">
        <DialogTitle className="sr-only">Quick Mastery Check</DialogTitle>

        <AnimatePresence mode="wait">
          {/* LOCKED PHASE */}
          {phase === "locked" && (
            <motion.div key="locked" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 text-center">
              <Lock className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-semibold text-foreground mb-2">Demo limit reached</p>
              <p className="text-xs text-muted-foreground mb-5">Full profile required to continue cognitive evaluation.</p>
              <Button onClick={handleUnlock} className="w-full gap-2">
                Unlock Full Mastery Profile
                <ArrowRight className="h-4 w-4" />
              </Button>
            </motion.div>
          )}

          {/* QUESTION PHASE */}
          {phase === "question" && (
            <motion.div key="question" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-6">
              {/* Header + Timer */}
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <Brain className="h-5 w-5 text-primary" />
                  <h2 className="text-lg font-bold text-foreground">Quick Mastery Check</h2>
                </div>
                <div className={`flex items-center gap-1 text-xs font-mono ${timerColor} transition-colors`}>
                  <Clock className="h-3.5 w-3.5" />
                  <span>{timeLeft}s</span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground mb-4">20 seconds. No signup required.</p>

              {/* Timer bar */}
              <div className="w-full h-1 bg-muted rounded-full mb-4 overflow-hidden">
                <motion.div
                  className="h-full bg-primary rounded-full"
                  initial={{ width: "100%" }}
                  animate={{ width: `${(timeLeft / TIMER_SECONDS) * 100}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>

              <Badge variant="outline" className="mb-4 text-xs">
                <Zap className="h-3 w-3 mr-1" />
                Bloom Level: {question.bloomLevel}
              </Badge>

              <p className="text-sm font-medium text-foreground mb-4 leading-relaxed">{question.question}</p>

              <div className="space-y-2">
                {question.options.map((opt, i) => (
                  <button
                    key={i}
                    onClick={() => handleAnswer(i)}
                    onMouseEnter={() => setHoveredOption(i)}
                    onMouseLeave={() => setHoveredOption(null)}
                    disabled={selectedAnswer !== null || timedOut}
                    className={`w-full text-left px-4 py-3 rounded-lg border text-sm transition-all duration-120 ${
                      selectedAnswer === null && !timedOut
                        ? hoveredOption === i
                          ? "border-primary/70 bg-primary/5 scale-[1.01] shadow-sm cursor-pointer"
                          : "border-border hover:border-primary/50 cursor-pointer"
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

              {timedOut && (
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-xs text-destructive mt-3 text-center font-medium">
                  Cognitive response window expired.
                </motion.p>
              )}
            </motion.div>
          )}

          {/* RESULT PHASE */}
          {phase === "result" && (
            <motion.div key="result" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="p-6">
              <div className="text-center mb-3">
                {timedOut ? (
                  <Clock className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
                ) : isCorrect ? (
                  <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto mb-2" />
                ) : (
                  <XCircle className="h-10 w-10 text-destructive mx-auto mb-2" />
                )}
                <p className="text-sm font-semibold text-foreground">
                  {timedOut
                    ? "Cognitive response window expired."
                    : isCorrect
                      ? "Strong analytical reasoning detected."
                      : "Analytical gap detected. Let's strengthen it."}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {timedOut
                    ? "No response recorded."
                    : isCorrect
                      ? "Your cognitive baseline is above average."
                      : "Most users miss this question."}
                </p>
              </div>

              {/* Mini Radar */}
              <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.2, duration: 0.6 }}>
                <MiniRadarChart values={radarValues} size={160} />
              </motion.div>

              {/* Real 9-Gate Checklist */}
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} className="mt-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-foreground mb-2">
                  <Shield className="h-3.5 w-3.5 text-primary" />
                  Certification Gates
                  <span className="ml-auto text-muted-foreground font-normal">1/9 assessed</span>
                </div>
                <div className="space-y-1 max-h-[140px] overflow-y-auto">
                  {GATE_LABELS.map((label, i) => {
                    const passed = i === 0 && !timedOut;
                    return (
                      <div key={i} className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs ${
                        passed ? "bg-green-500/5 text-green-600 dark:text-green-400" : "bg-muted/30 text-muted-foreground"
                      }`}>
                        {passed ? (
                          <CheckCircle2 className="h-3 w-3 flex-shrink-0" />
                        ) : (
                          <Lock className="h-3 w-3 flex-shrink-0 opacity-50" />
                        )}
                        <span>{label}</span>
                      </div>
                    );
                  })}
                </div>
              </motion.div>

              {/* CTAs */}
              <div className="mt-4 space-y-2">
                <Button onClick={handleUnlock} className="w-full gap-2" size="lg">
                  Unlock Full Mastery Profile
                  <ArrowRight className="h-4 w-4" />
                </Button>
                {attemptCount.current < MAX_ATTEMPTS ? (
                  <Button onClick={handleRetry} variant="ghost" size="sm" className="w-full text-muted-foreground">
                    Try a Harder Question ({MAX_ATTEMPTS - attemptCount.current} left)
                  </Button>
                ) : (
                  <p className="text-xs text-muted-foreground text-center">Demo limit reached — unlock full profile to continue.</p>
                )}
              </div>
            </motion.div>
          )}

          {/* TRANSITION PHASE */}
          {phase === "transitioning" && (
            <motion.div key="transitioning" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-8 text-center">
              <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }}>
                <Brain className="h-10 w-10 text-primary mx-auto" />
              </motion.div>
              <p className="text-sm font-semibold text-foreground mt-4">Initializing Full Cognitive Profile…</p>
              <p className="text-xs text-muted-foreground mt-1">Preparing your mastery assessment engine.</p>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
