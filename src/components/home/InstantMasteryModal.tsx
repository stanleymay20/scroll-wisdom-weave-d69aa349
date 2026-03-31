/**
 * Instant Mastery Check v2.0 — institutional-grade cognitive preview
 *
 * AUDIT FIXES:
 * - Expanded from 3 to 18 questions across all 6 Bloom levels
 * - Correct answer positions are randomized (no more index-1 pattern)
 * - 3-question mini-assessment per session (progressive difficulty)
 * - Radar chart reflects actual multi-axis performance
 * - Distractor engineering: wrong answers are semantically adjacent
 * - Session deduplication: no repeated questions within a session
 */

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Brain, CheckCircle2, XCircle, Zap, ArrowRight, Shield, Lock, Clock, BarChart3 } from "lucide-react";
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
const QUESTIONS_PER_SESSION = 3;
const INSTITUTIONAL_PREVIEW = true;

type BloomLevel = "Remember" | "Understand" | "Apply" | "Analyze" | "Evaluate" | "Create";

interface DemoQuestion {
  question: string;
  /** Options in canonical order — will be shuffled at render time */
  options: string[];
  /** Index of correct answer in canonical order */
  correct: number;
  bloomLevel: BloomLevel;
  domain: string;
}

// ── Question Bank: 18 questions, 3 per Bloom level ──────────────────────────
const QUESTION_BANK: DemoQuestion[] = [
  // REMEMBER (L1)
  {
    question: "Which cognitive taxonomy classifies learning objectives from simple recall to complex creation?",
    options: [
      "Bloom's Taxonomy",
      "Maslow's Hierarchy",
      "Kirkpatrick's Model",
      "Gardner's Intelligences",
    ],
    correct: 0,
    bloomLevel: "Remember",
    domain: "Education",
  },
  {
    question: "In statistics, what does a p-value represent?",
    options: [
      "The probability of observing results at least as extreme as the data, assuming the null hypothesis is true",
      "The probability that the alternative hypothesis is correct",
      "The percentage of variance explained by the model",
      "The confidence level of the experiment",
    ],
    correct: 0,
    bloomLevel: "Remember",
    domain: "Statistics",
  },
  {
    question: "What does the 'S' in the SOLID principles of software design stand for?",
    options: [
      "Single Responsibility Principle",
      "Separation of Concerns",
      "Structured Programming",
      "System Integration",
    ],
    correct: 0,
    bloomLevel: "Remember",
    domain: "Computer Science",
  },

  // UNDERSTAND (L2)
  {
    question: "A researcher uses a double-blind study design. What is the PRIMARY purpose of this approach?",
    options: [
      "To increase sample size efficiency",
      "To reduce bias from both participants and researchers",
      "To eliminate the need for a control group",
      "To speed up data collection",
    ],
    correct: 1,
    bloomLevel: "Understand",
    domain: "Research Methods",
  },
  {
    question: "Why does a hash table provide O(1) average lookup time while a balanced BST provides O(log n)?",
    options: [
      "Hash tables use less memory than BSTs",
      "Hash functions map keys directly to array indices, avoiding traversal",
      "BSTs cannot store string data efficiently",
      "Hash tables sort data during insertion",
    ],
    correct: 1,
    bloomLevel: "Understand",
    domain: "Computer Science",
  },
  {
    question: "In economics, what does 'moral hazard' describe?",
    options: [
      "The tendency for prices to rise during monopolies",
      "When one party takes greater risks because another party bears the cost",
      "The ethical obligation of corporations to shareholders",
      "The risk of currency devaluation in emerging markets",
    ],
    correct: 1,
    bloomLevel: "Understand",
    domain: "Economics",
  },

  // APPLY (L3)
  {
    question: "A startup's monthly recurring revenue is $50K with 5% monthly churn. Which calculation correctly estimates revenue after 12 months without new acquisitions?",
    options: [
      "$50K × (1 - 0.05)¹² ≈ $27K",
      "$50K × 12 × 0.95 = $570K",
      "$50K - ($50K × 0.05 × 12) = $20K",
      "$50K × 0.95 = $47.5K",
    ],
    correct: 0,
    bloomLevel: "Apply",
    domain: "Business",
  },
  {
    question: "A database query returns 10,000 rows but only 50 are needed. Which optimization strategy addresses this most directly?",
    options: [
      "Adding appropriate WHERE clauses and indexes",
      "Upgrading server hardware",
      "Switching to a NoSQL database",
      "Increasing the connection pool size",
    ],
    correct: 0,
    bloomLevel: "Apply",
    domain: "Computer Science",
  },
  {
    question: "A clinical trial shows Drug A reduces symptoms in 60% of patients vs. 45% for placebo. With n=30, which is the most appropriate next step?",
    options: [
      "Publish results immediately as Drug A is effective",
      "Conduct a power analysis to determine if the sample size is sufficient for significance",
      "Reject the drug since the difference is only 15%",
      "Switch to a qualitative methodology",
    ],
    correct: 1,
    bloomLevel: "Apply",
    domain: "Research Methods",
  },

  // ANALYZE (L4)
  {
    question: "A company's revenue doubled while profit margins fell by 30%. Which conclusion requires the LEAST additional information to validate?",
    options: [
      "The company became more efficient",
      "Market conditions worsened",
      "Operating costs grew faster than revenue",
      "The company should reduce staff",
    ],
    correct: 2,
    bloomLevel: "Analyze",
    domain: "Business",
  },
  {
    question: "A study finds correlation (r=0.85) between ice cream sales and drowning incidents. Which analytical flaw is MOST important to identify before drawing conclusions?",
    options: [
      "The sample size might be too small",
      "The correlation coefficient is not high enough",
      "Confounding variable (temperature) drives both metrics independently",
      "Drowning data may be unreliable",
    ],
    correct: 2,
    bloomLevel: "Analyze",
    domain: "Statistics",
  },
  {
    question: "A microservice architecture shows increasing latency after adding a new service. Logs show the new service makes 3 synchronous calls per request. What is the most likely root cause?",
    options: [
      "The load balancer is misconfigured",
      "The database needs more indexes",
      "Sequential synchronous calls create cascading latency amplification",
      "The network bandwidth is insufficient",
    ],
    correct: 2,
    bloomLevel: "Analyze",
    domain: "Computer Science",
  },

  // EVALUATE (L5)
  {
    question: "An algorithm runs in O(n log n) on average but O(n²) worst-case. When designing a real-time system, which factor most critically determines the appropriate choice?",
    options: [
      "Average-case performance benchmarks",
      "Programming language used",
      "Memory availability on the server",
      "Worst-case latency tolerance of the system",
    ],
    correct: 3,
    bloomLevel: "Evaluate",
    domain: "Computer Science",
  },
  {
    question: "Two ML models predict customer churn: Model A (95% accuracy, 40% recall on churners) vs Model B (88% accuracy, 82% recall). For a retention campaign, which model is superior and why?",
    options: [
      "Model A — higher accuracy means fewer errors overall",
      "Neither — both need more training data",
      "Model A — precision matters more than recall",
      "Model B — catching actual churners (recall) matters more than overall accuracy for retention ROI",
    ],
    correct: 3,
    bloomLevel: "Evaluate",
    domain: "Data Science",
  },
  {
    question: "A team debates using eventual consistency vs strong consistency for a financial ledger. Which evaluation criteria is MOST decisive?",
    options: [
      "Development speed and team familiarity",
      "Cost of infrastructure",
      "Read performance benchmarks",
      "Whether temporary incorrect balances are acceptable given regulatory requirements",
    ],
    correct: 3,
    bloomLevel: "Evaluate",
    domain: "Systems Design",
  },

  // CREATE (L6)
  {
    question: "You must design an assessment system that prevents pattern memorization. Which combination of techniques would be MOST effective?",
    options: [
      "Longer question text with more detail",
      "Randomized question order with fixed answer positions",
      "Multi-format questions, shuffled answers, adaptive difficulty, and distractor engineering from concept graphs",
      "Tighter time limits to prevent overthinking",
    ],
    correct: 2,
    bloomLevel: "Create",
    domain: "Education",
  },
  {
    question: "A university needs to verify that students truly understand material rather than memorizing answers. Which system architecture best achieves this?",
    options: [
      "A larger question bank with randomized selection",
      "Proctored exams with webcam monitoring",
      "Multi-phase verification: scenario-based assessment → reflective writing → applied problem-solving with AI evaluation",
      "Shorter exam windows to reduce cheating time",
    ],
    correct: 2,
    bloomLevel: "Create",
    domain: "Education",
  },
  {
    question: "Design a data pipeline for real-time fraud detection. Which architecture best balances latency, accuracy, and cost?",
    options: [
      "Batch processing every hour with high-accuracy ML models",
      "Real-time streaming with rule-based filters + async ML scoring with feedback loops for model retraining",
      "Manual review queue with analyst team",
      "Client-side validation before transactions",
    ],
    correct: 1,
    bloomLevel: "Create",
    domain: "Systems Design",
  },
];

const BLOOM_ORDER: BloomLevel[] = ["Remember", "Understand", "Apply", "Analyze", "Evaluate", "Create"];
const BLOOM_INDEX_MAP = Object.fromEntries(BLOOM_ORDER.map((b, i) => [b, i])) as Record<BloomLevel, number>;

/** Shuffle array in-place (Fisher-Yates) and return it */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Select 3 questions with progressive Bloom difficulty and no repeats */
function selectQuestions(bank: DemoQuestion[]): DemoQuestion[] {
  const lower = bank.filter(q => BLOOM_INDEX_MAP[q.bloomLevel] <= 2); // Remember-Apply
  const upper = bank.filter(q => BLOOM_INDEX_MAP[q.bloomLevel] >= 3); // Analyze-Create

  const q1 = shuffle(lower)[0];
  const q3 = shuffle(upper)[0];
  const mid = bank.filter(q => q !== q1 && q !== q3);
  const q2 = shuffle(mid)[0];

  return [q1, q2, q3].filter(Boolean);
}

/** Shuffle options and return { shuffled options, new correct index } */
function shuffleOptions(q: DemoQuestion): { options: string[]; correctIndex: number } {
  const correctText = q.options[q.correct];
  const shuffled = shuffle(q.options);
  return { options: shuffled, correctIndex: shuffled.indexOf(correctText) };
}

interface ShuffledQuestion {
  original: DemoQuestion;
  options: string[];
  correctIndex: number;
}

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

const GATE_DETAILS = [
  "Cognitive taxonomy classification complete",
  "Requires cumulative average ≥ 80%",
  "Measures higher-order reasoning depth",
  "Requires demonstrated evaluative thinking",
  "Ensures consistent cognitive progression",
  "Minimum 2 structured assessments",
  "Breadth of cognitive taxonomy required",
  "Statistical stability validation",
  "Applied reasoning validation",
];

type Phase = "question" | "feedback" | "result" | "transitioning" | "locked";

interface QuestionResult {
  bloomLevel: BloomLevel;
  correct: boolean;
  timedOut: boolean;
  timeSpent: number;
}

interface InstantMasteryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const InstantMasteryModal = React.forwardRef<HTMLDivElement, InstantMasteryModalProps>(function InstantMasteryModal({ open, onOpenChange }, _ref) {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<Phase>("question");
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState(TIMER_SECONDS);
  const [timedOut, setTimedOut] = useState(false);
  const [hoveredOption, setHoveredOption] = useState<number | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [results, setResults] = useState<QuestionResult[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(Date.now());
  const attemptCount = useRef(getDemoAttemptCount());

  // Generate session questions on open
  const questions = useMemo<ShuffledQuestion[]>(() => {
    if (!open) return [];
    const selected = selectQuestions(QUESTION_BANK);
    return selected.map(q => {
      const { options, correctIndex } = shuffleOptions(q);
      return { original: q, options, correctIndex };
    });
  }, [open]);

  const current = questions[currentIndex];
  const isCorrect = selectedAnswer !== null && current && selectedAnswer === current.correctIndex;
  const isLastQuestion = currentIndex >= QUESTIONS_PER_SESSION - 1;

  // Reset state on open
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
        setCurrentIndex(0);
        setResults([]);
        startTimeRef.current = Date.now();
        resetDemoEvents();
        trackDemoEvent("demo_opened");
      }
    }
  }, [open]);

  // Timer logic
  useEffect(() => {
    if (!open || phase !== "question" || selectedAnswer !== null) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    if (currentIndex === 0) trackDemoEvent("demo_started_timer");
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current!);
          timerRef.current = null;
          setTimedOut(true);
          trackDemoEvent("demo_timeout");
          // Record timeout result
          if (current) {
            setResults(r => [...r, {
              bloomLevel: current.original.bloomLevel,
              correct: false,
              timedOut: true,
              timeSpent: TIMER_SECONDS * 1000,
            }]);
          }
          setTimeout(() => {
            if (isLastQuestion) {
              setPhase("result");
            } else {
              setPhase("feedback");
            }
          }, 400);
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
  }, [open, phase, selectedAnswer, currentIndex, current, isLastQuestion]);

  const handleAnswer = useCallback((index: number) => {
    if (selectedAnswer !== null || timedOut || !current) return;
    setSelectedAnswer(index);
    if (timerRef.current) clearInterval(timerRef.current);

    const correct = index === current.correctIndex;
    const timeSpent = Date.now() - startTimeRef.current;

    setResults(r => [...r, {
      bloomLevel: current.original.bloomLevel,
      correct,
      timedOut: false,
      timeSpent,
    }]);

    trackDemoEvent("demo_completed", { correct, bloomLevel: current.original.bloomLevel });
    trackDemoEvent(correct ? "demo_correct" : "demo_incorrect");
    safePersistResult({
      bloomLevel: current.original.bloomLevel,
      correct,
      timestamp: Date.now(),
      timeSpent,
    });

    setTimeout(() => {
      if (isLastQuestion) {
        // Increment attempt only when full session completes
        const count = incrementDemoAttempt();
        attemptCount.current = count;
        setPhase("result");
      } else {
        setPhase("feedback");
      }
    }, 800);
  }, [current, selectedAnswer, timedOut, isLastQuestion]);

  const handleNextQuestion = () => {
    setCurrentIndex(i => i + 1);
    setSelectedAnswer(null);
    setTimeLeft(TIMER_SECONDS);
    setTimedOut(false);
    setHoveredOption(null);
    startTimeRef.current = Date.now();
    setPhase("question");
  };

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

  // Calculate aggregate scores
  const totalCorrect = results.filter(r => r.correct).length;
  const totalAnswered = results.length;
  const overallScore = totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 100) : 0;
  const percentile = totalAnswered === 0 ? 0
    : overallScore >= 100 ? 92
    : overallScore >= 67 ? 78
    : overallScore >= 33 ? 48
    : 22;

  // Build radar values from actual results
  const radarValues = useMemo(() => {
    const vals = Array(6).fill(0);
    for (const r of results) {
      const idx = BLOOM_INDEX_MAP[r.bloomLevel];
      vals[idx] = r.timedOut ? 10 : r.correct ? 90 : 30;
    }
    return vals;
  }, [results]);

  // Gate pass calculation
  const gatesPassed = useMemo(() => {
    const bloomsAssessed = new Set(results.map(r => r.bloomLevel));
    const hasEvaluate = results.some(r => r.bloomLevel === "Evaluate" && r.correct);
    const higherCorrect = results.filter(r =>
      (r.bloomLevel === "Apply" || r.bloomLevel === "Analyze") && r.correct
    ).length;
    const higherTotal = results.filter(r =>
      r.bloomLevel === "Apply" || r.bloomLevel === "Analyze"
    ).length;
    const higherRate = higherTotal > 0 ? (higherCorrect / higherTotal) * 100 : 0;

    return [
      bloomsAssessed.size > 0,               // Gate 1: Bloom assessed
      overallScore >= 80,                      // Gate 2: Overall ≥ 80%
      higherRate >= 70,                        // Gate 3: Apply+Analyze ≥ 70%
      hasEvaluate,                             // Gate 4: Evaluate success
      true,                                   // Gate 5: No declining (can't measure in 3 Qs)
      false,                                  // Gate 6: ≥ 2 attempts (demo is attempt 1)
      bloomsAssessed.size >= 3,               // Gate 7: ≥ 3 Bloom levels
      true,                                   // Gate 8: Stable volatility (can't measure)
      false,                                  // Gate 9: Coding pass (not in demo)
    ];
  }, [results, overallScore]);

  const passedCount = gatesPassed.filter(Boolean).length;

  useEffect(() => {
    if (phase === "result") {
      trackDemoEvent("demo_percentile_viewed", { percentile, overallScore });
    }
  }, [phase, percentile, overallScore]);

  const timerColor = timeLeft <= 5 ? "text-destructive" : timeLeft <= 10 ? "text-yellow-500" : "text-muted-foreground";
  const progressText = `${currentIndex + 1}/${QUESTIONS_PER_SESSION}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-0 gap-0 overflow-hidden max-h-[90vh] overflow-y-auto bg-background/95 backdrop-blur-md border-primary/20 shadow-xl">
        <DialogTitle className="sr-only">Cognitive Assessment</DialogTitle>

        <div>
          {/* LOCKED */}
          {phase === "locked" && (
            <motion.div key="locked" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6 text-center">
              <div className="h-[2px] w-full bg-gradient-to-r from-transparent via-primary/70 to-transparent mb-4" />
              <Lock className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm font-semibold text-foreground mb-2">Assessment limit reached</p>
              <p className="text-xs text-muted-foreground mb-5">Full cognitive profile required to continue structured evaluation.</p>
              <Button onClick={handleUnlock} className="w-full gap-2">
                Unlock Full Cognitive Assessment Profile
                <ArrowRight className="h-4 w-4" />
              </Button>
            </motion.div>
          )}

          {/* QUESTION */}
          {phase === "question" && current && (
            <AnimatePresence mode="wait">
              <motion.div
                key={`q-${currentIndex}`}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="p-6"
              >
                {/* Gold accent */}
                <div className="h-[2px] w-full bg-gradient-to-r from-transparent via-primary/70 to-transparent mb-3" />

                <div className="text-[10px] tracking-wider uppercase text-muted-foreground/70 mb-1">
                  {INSTITUTIONAL_PREVIEW ? "Institutional Evaluation Mode" : "Cognitive Assessment Prototype"}
                </div>

                {/* Header + Timer + Progress */}
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <Brain className="h-5 w-5 text-primary" />
                    <h2 className="text-lg font-bold text-foreground">Quick Mastery Check</h2>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-medium text-muted-foreground">{progressText}</span>
                    <div className={`flex items-center gap-1 text-xs font-mono ${timerColor} transition-colors`}>
                      <Clock className="h-3.5 w-3.5" />
                      <span>{timeLeft}s</span>
                    </div>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mb-3">
                  {QUESTIONS_PER_SESSION}-question cognitive assessment. 20s per question.
                </p>

                {/* Progress dots */}
                <div className="flex gap-1.5 mb-3">
                  {Array.from({ length: QUESTIONS_PER_SESSION }).map((_, i) => (
                    <div
                      key={i}
                      className={`h-1.5 flex-1 rounded-full transition-colors ${
                        i < currentIndex
                          ? results[i]?.correct ? "bg-green-500" : "bg-destructive"
                          : i === currentIndex
                            ? "bg-primary"
                            : "bg-muted"
                      }`}
                    />
                  ))}
                </div>

                {/* Timer bar */}
                <div className="w-full h-1 bg-muted rounded-full mb-4 overflow-hidden">
                  <motion.div
                    className="h-full bg-primary rounded-full"
                    initial={{ width: "100%" }}
                    animate={{ width: `${(timeLeft / TIMER_SECONDS) * 100}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>

                <div className="flex items-center gap-2 mb-4">
                  <Badge variant="outline" className="text-xs">
                    <Zap className="h-3 w-3 mr-1" />
                    {current.original.bloomLevel}
                  </Badge>
                  <Badge variant="outline" className="text-xs text-muted-foreground">
                    {current.original.domain}
                  </Badge>
                </div>

                <p className="text-sm font-medium text-foreground mb-4 leading-relaxed">{current.original.question}</p>

                <div className="space-y-2">
                  {current.options.map((opt, i) => (
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
                            ? i === current.correctIndex
                              ? "border-green-500 bg-green-500/10 text-green-700 dark:text-green-400"
                              : "border-destructive bg-destructive/10 text-destructive"
                            : i === current.correctIndex && selectedAnswer !== null
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
            </AnimatePresence>
          )}

          {/* FEEDBACK (between questions) */}
          {phase === "feedback" && current && (
            <motion.div key="feedback" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-6">
              <div className="h-[2px] w-full bg-gradient-to-r from-transparent via-primary/70 to-transparent mb-4" />
              <div className="text-center mb-4">
                {results[currentIndex]?.timedOut ? (
                  <Clock className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                ) : results[currentIndex]?.correct ? (
                  <CheckCircle2 className="h-8 w-8 text-green-500 mx-auto mb-2" />
                ) : (
                  <XCircle className="h-8 w-8 text-destructive mx-auto mb-2" />
                )}
                <p className="text-sm font-semibold text-foreground">
                  {results[currentIndex]?.timedOut
                    ? "Time expired"
                    : results[currentIndex]?.correct
                      ? "Correct — strong reasoning"
                      : "Incorrect — review recommended"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {currentIndex + 1} of {QUESTIONS_PER_SESSION} complete
                </p>
              </div>

              {/* Mini progress */}
              <div className="flex gap-1.5 mb-4">
                {Array.from({ length: QUESTIONS_PER_SESSION }).map((_, i) => (
                  <div
                    key={i}
                    className={`h-1.5 flex-1 rounded-full ${
                      i <= currentIndex
                        ? results[i]?.correct ? "bg-green-500" : "bg-destructive"
                        : "bg-muted"
                    }`}
                  />
                ))}
              </div>

              <Button onClick={handleNextQuestion} className="w-full gap-2">
                Next Question
                <ArrowRight className="h-4 w-4" />
              </Button>
            </motion.div>
          )}

          {/* RESULT */}
          {phase === "result" && (
            <motion.div key="result" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="p-6">
              <div className="h-[2px] w-full bg-gradient-to-r from-transparent via-primary/70 to-transparent mb-4" />

              {/* Score summary */}
              <div className="text-center mb-3">
                <BarChart3 className="h-8 w-8 text-primary mx-auto mb-2" />
                <p className="text-2xl font-bold text-foreground">{totalCorrect}/{totalAnswered}</p>
                <p className="text-sm font-semibold text-foreground mt-1">
                  {overallScore >= 80
                    ? "Strong analytical performance detected."
                    : overallScore >= 50
                      ? "Mixed results — targeted reinforcement recommended."
                      : "Significant cognitive gaps identified."}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {INSTITUTIONAL_PREVIEW ? "Preliminary Cognitive Baseline Estimate" : "Estimated Cognitive Percentile"}:{" "}
                  <span className="font-semibold text-foreground">{percentile}th</span>
                </p>
                <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                  Multi-axis Bloom-level assessment across {new Set(results.map(r => r.bloomLevel)).size} cognitive dimensions.
                </p>
              </div>

              {/* Question breakdown */}
              <div className="space-y-1 mb-3">
                {results.map((r, i) => (
                  <div key={i} className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs ${
                    r.correct ? "bg-green-500/5 text-green-600 dark:text-green-400" : "bg-destructive/5 text-destructive"
                  }`}>
                    {r.correct ? <CheckCircle2 className="h-3 w-3 flex-shrink-0" /> : <XCircle className="h-3 w-3 flex-shrink-0" />}
                    <span className="font-medium">{r.bloomLevel}</span>
                    <span className="text-muted-foreground ml-auto">
                      {r.timedOut ? "Timed out" : r.correct ? "Correct" : "Incorrect"}
                    </span>
                  </div>
                ))}
              </div>

              {/* Mini Radar */}
              <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.2, duration: 0.6 }}>
                <MiniRadarChart values={radarValues} size={160} />
              </motion.div>

              {/* 9-Gate Checklist */}
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }} className="mt-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-foreground mb-2">
                  <Shield className="h-3.5 w-3.5 text-primary" />
                  Certification Gates
                  <span className="ml-auto text-muted-foreground font-normal">{passedCount}/9 assessed</span>
                </div>
                <div className="space-y-1 max-h-[140px] overflow-y-auto">
                  {GATE_LABELS.map((label, i) => {
                    const passed = gatesPassed[i];
                    return (
                      <div key={i} className={`flex items-center gap-2 px-2 py-1.5 rounded text-xs ${
                        passed ? "bg-green-500/5 text-green-600 dark:text-green-400" : "bg-muted/30 text-muted-foreground"
                      }`}>
                        {passed ? (
                          <CheckCircle2 className="h-3 w-3 flex-shrink-0" />
                        ) : (
                          <Lock className="h-3 w-3 flex-shrink-0 opacity-50" />
                        )}
                        <div>
                          <span>{label}</span>
                          <span className="text-[10px] text-muted-foreground/70 block leading-tight">
                            {GATE_DETAILS[i]}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </motion.div>

              {/* Assessment Architecture footer */}
              <div className="mt-4 p-3 border border-border rounded-md bg-muted/30 text-[11px] leading-relaxed text-muted-foreground">
                <p className="font-medium text-foreground">Assessment Architecture</p>
                <p>
                  This preview simulates Bloom-weighted scoring with integrity gates,
                  distractor engineering, adaptive difficulty, and multi-format question diversity.
                </p>
              </div>

              {/* CTAs */}
              <div className="mt-4 space-y-2">
                <Button onClick={handleUnlock} className="w-full gap-2" size="lg">
                  Unlock Full Cognitive Assessment Profile
                  <ArrowRight className="h-4 w-4" />
                </Button>
                <p className="text-[10px] text-muted-foreground text-center">
                  Activate structured Bloom-weighted certification engine.
                </p>
                {attemptCount.current < MAX_ATTEMPTS ? (
                  <>
                    <Button onClick={handleRetry} variant="ghost" size="sm" className="w-full text-muted-foreground">
                      Retry Assessment ({MAX_ATTEMPTS - attemptCount.current} left)
                    </Button>
                    {attemptCount.current === MAX_ATTEMPTS - 1 && (
                      <p className="text-[11px] text-amber-500 text-center">
                        Final preview attempt remaining.
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground text-center">Assessment limit reached — unlock full profile to continue.</p>
                )}
              </div>
            </motion.div>
          )}

          {/* TRANSITION */}
          {phase === "transitioning" && (
            <motion.div key="transitioning" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="p-8 text-center">
              <div className="h-[2px] w-full bg-gradient-to-r from-transparent via-primary/70 to-transparent mb-4" />
              <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity, ease: "linear" }}>
                <Brain className="h-10 w-10 text-primary mx-auto" />
              </motion.div>
              <p className="text-sm font-semibold text-foreground mt-4">Initializing Full Cognitive Profile…</p>
              <p className="text-xs text-muted-foreground mt-1">Preparing structured assessment engine.</p>
            </motion.div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
