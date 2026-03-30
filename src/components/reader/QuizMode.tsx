import { useState, useCallback, forwardRef, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { 
  GraduationCap, 
  CheckCircle2, 
  XCircle, 
  Loader2, 
  RefreshCw,
  Trophy,
  X,
  ChevronRight,
  Brain,
  Target,
  Lightbulb,
  ShieldCheck
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";
import { type BloomLevel } from "@/lib/masteryEngine";
import { computeAdaptiveRecommendation, getDifficultyLabel, type PerformanceSnapshot } from "@/lib/adaptiveDifficulty";
import { scoreToQuality } from "@/lib/spacedRepetition";
import { useGraphDrivenQuestions } from "@/hooks/useGraphDrivenQuestions";
import { runEntropyPipeline, computeEntropyScore, type EntropyScore } from "@/lib/quizEntropy";

interface MasteryQuestion {
  bloomLevel: BloomLevel;
  question: string;
  options: string[];
  correctIndex: number;
  reasoningExplanation: string;
  bloomJustification: string;
  conceptsUsed: string[];
  questionType: string;
  difficulty: number;
  pointValue: number;
  timeLimit: number;
  stressTestPass?: boolean;
  strengthScore?: number;
}

interface QuizModeProps {
  chapterContent: string;
  chapterTitle: string;
  bookTitle: string;
  bookId: string;
  chapterId: string;
  isOpen: boolean;
  onClose: () => void;
  isMasteryMode?: boolean;
  bookType?: string;
  /** Adaptive engine override for Bloom level */
  adaptiveBloomLevel?: string;
  /** Adaptive engine override for difficulty (1-5) */
  adaptiveDifficultyOverride?: number;
  onRecordAttempt?: (
    chapterId: string,
    bloomLevel: BloomLevel,
    score: number,
    questionDifficulty: number,
    timeSpentSeconds: number,
    questionsAnswered: number,
  ) => Promise<{ blocked: boolean; reason?: string } | null>;
}

const BLOOM_COLORS: Record<string, string> = {
  remember: "bg-slate-500/10 text-slate-600 border-slate-300",
  understand: "bg-blue-500/10 text-blue-600 border-blue-300",
  apply: "bg-green-500/10 text-green-600 border-green-300",
  analyze: "bg-amber-500/10 text-amber-600 border-amber-300",
  evaluate: "bg-purple-500/10 text-purple-600 border-purple-300",
  create: "bg-rose-500/10 text-rose-600 border-rose-300",
};

const QUESTION_TYPE_LABELS: Record<string, string> = {
  "trade-off": "Trade-off Analysis",
  "boundary-case": "Boundary Condition",
  "constraint": "Constraint Reasoning",
  "counterfactual": "Counterfactual",
  "mechanism-breakdown": "Mechanism Analysis",
  "assumption-challenge": "Assumption Challenge",
  "prerequisite_check": "Prerequisite Check",
  "comparison": "Comparison",
  "cross_chapter_synthesis": "Cross-Chapter Synthesis",
  "dependency_reasoning": "Dependency Reasoning",
  "misconception_repair": "Misconception Repair",
};

export function QuizMode({
  chapterContent,
  chapterTitle,
  bookTitle,
  bookId,
  chapterId,
  isOpen,
  onClose,
  isMasteryMode = false,
  bookType = 'text',
  adaptiveBloomLevel,
  adaptiveDifficultyOverride,
  onRecordAttempt,
}: QuizModeProps) {
  const [questions, setQuestions] = useState<MasteryQuestion[]>([]);
  const [concepts, setConcepts] = useState<any>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [score, setScore] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [masteryDepthScore, setMasteryDepthScore] = useState(0);
  const [stressTestSummary, setStressTestSummary] = useState<any>(null);
  const [adaptiveDifficulty, setAdaptiveDifficulty] = useState(adaptiveDifficultyOverride ?? 3);
  const [wrongAnswers, setWrongAnswers] = useState<MasteryQuestion[]>([]);
  const [graphQuestionCount, setGraphQuestionCount] = useState(0);
  const [entropyScore, setEntropyScore] = useState<EntropyScore | null>(null);
  const { toast } = useToast();
  const quizStartTime = useRef(Date.now());
  const { t } = useLanguage();
  const { generateGraphQuestions } = useGraphDrivenQuestions();

  // Fetch adaptive difficulty on mount
  useEffect(() => {
    if (!isOpen) return;
    const fetchAdaptive = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data } = await supabase
          .from('learning_progress')
          .select('score, bloom_level, question_difficulty, time_spent_seconds, questions_answered, created_at')
          .eq('user_id', user.id)
          .eq('book_id', bookId)
          .order('created_at', { ascending: true })
          .limit(20);
        if (data && data.length > 0) {
          const snapshots: PerformanceSnapshot[] = data.map((d: any) => ({
            score: Number(d.score), bloomLevel: d.bloom_level, difficulty: d.question_difficulty || 3,
            timeSpentSeconds: d.time_spent_seconds || 0, questionsAnswered: d.questions_answered || 0,
            createdAt: d.created_at,
          }));
          const rec = computeAdaptiveRecommendation(snapshots, snapshots[snapshots.length - 1].difficulty);
          setAdaptiveDifficulty(adaptiveDifficultyOverride ?? rec.recommendedDifficulty);
        }
      } catch { /* silent */ }
    };
    fetchAdaptive();
  }, [isOpen, bookId]);

  const generateQuiz = useCallback(async () => {
    setIsLoading(true);
    setQuestions([]);
    setCurrentIndex(0);
    setScore(0);
    setIsComplete(false);
    setSelectedAnswer(null);
    setShowResult(false);
    setWrongAnswers([]);
    setGraphQuestionCount(0);
    quizStartTime.current = Date.now();

    try {
      const totalCount = isMasteryMode ? 7 : 5;

      // ── Try graph-driven questions first ────────
      let graphQuestions: MasteryQuestion[] = [];
      try {
        const graphResult = await generateGraphQuestions({
          bookId,
          bookTitle,
          bookType,
          currentChapter: undefined,
          questionCount: Math.ceil(totalCount * 0.5), // up to 50% from graph
          chapterContent: chapterContent.slice(0, 5000),
        });

        if (graphResult?.questions?.length) {
          graphQuestions = graphResult.questions.map((gq) => ({
            bloomLevel: gq.bloomLevel as BloomLevel,
            question: gq.question,
            options: gq.options,
            correctIndex: gq.correctIndex,
            reasoningExplanation: gq.reasoningExplanation,
            bloomJustification: gq.bloomJustification,
            conceptsUsed: gq.conceptsUsed,
            questionType: gq.questionType,
            difficulty: gq.difficulty,
            pointValue: gq.pointValue,
            timeLimit: gq.timeLimit,
            // Preserve graph metadata
            sourceConceptIds: (gq as any).sourceConceptIds,
            sourceChapters: (gq as any).sourceChapters,
            graphReason: (gq as any).graphReason,
            isGraphDriven: true,
          } as any));
          setGraphQuestionCount(graphQuestions.length);
        }
      } catch {
        // Silent — fall back to standard questions only
      }

      // ── Fill remaining with standard mastery-assessment ──
      const remainingCount = totalCount - graphQuestions.length;

      let standardQuestions: MasteryQuestion[] = [];
      if (remainingCount > 0) {
        // Pass graph question texts for cross-source dedup
        const previousTexts = graphQuestions.map((q: any) => q.question).filter(Boolean);
        const { data, error } = await supabase.functions.invoke("mastery-assessment", {
          body: {
            chapterContent: chapterContent.slice(0, 10000),
            chapterTitle,
            bookTitle,
            bookType,
            bloomLevel: isMasteryMode ? "evaluate" : "analyze",
            questionCount: remainingCount,
            difficulty: adaptiveDifficulty,
            previousQuestionTexts: previousTexts,
          },
        });

        if (error) {
          if (error.message?.includes('429') || error.message?.includes('Rate limit')) {
            throw new Error('Too many requests. Please wait 30 seconds and try again.');
          }
          if (error.message?.includes('402')) {
            throw new Error('AI credits exhausted. Please check your subscription.');
          }
          throw error;
        }

        if (data?.questions && Array.isArray(data.questions)) {
          standardQuestions = data.questions;
          setConcepts(data.concepts || null);
          setMasteryDepthScore(data.masteryDepthScore || 0);
          setStressTestSummary(data.stressTestSummary || null);
        }
      }

      // ── Merge, dedup, entropy check, shuffle ───
      const allQuestions = [...graphQuestions, ...standardQuestions];

      // Run entropy pipeline (dedup + scoring + history recording)
      let finalQuestions = allQuestions;
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const pipelineResult = await runEntropyPipeline(
            user.id,
            bookId,
            allQuestions,
            undefined // weakConceptIds — could pass from graph hook
          );
          finalQuestions = pipelineResult.questions;
          setEntropyScore(pipelineResult.entropy);

          if (pipelineResult.dedupStats.rejected > 0) {
            console.log(`[QuizMode] Entropy: rejected ${pipelineResult.dedupStats.rejected} repetitive questions, entropy=${pipelineResult.entropy.overall}`);
          }

          // If entropy is below threshold and we have enough questions, try one more
          // round of graph questions to fill gaps (but only once to avoid loops)
          if (pipelineResult.entropy.belowThreshold && pipelineResult.questions.length < totalCount) {
            try {
              const supplementResult = await generateGraphQuestions({
                bookId,
                bookTitle,
                bookType,
                questionCount: totalCount - pipelineResult.questions.length,
                chapterContent: chapterContent.slice(0, 3000),
              });
              if (supplementResult?.questions?.length) {
                const supplementMapped = supplementResult.questions.map((gq) => ({
                  bloomLevel: gq.bloomLevel,
                  question: gq.question,
                  options: gq.options,
                  correctIndex: gq.correctIndex,
                  reasoningExplanation: gq.reasoningExplanation,
                  bloomJustification: gq.bloomJustification,
                  conceptsUsed: gq.conceptsUsed,
                  questionType: gq.questionType,
                  difficulty: gq.difficulty,
                  pointValue: gq.pointValue,
                  timeLimit: gq.timeLimit,
                  sourceConceptIds: gq.sourceConceptIds,
                  sourceChapters: gq.sourceChapters,
                  graphReason: gq.graphReason,
                  isGraphDriven: true,
                }));
                finalQuestions = [...pipelineResult.questions, ...supplementMapped];
                setEntropyScore(computeEntropyScore(finalQuestions));
              }
            } catch { /* silent */ }
          }
        }
      } catch {
        // If entropy pipeline fails, just use raw merged questions
      }

      // Fisher-Yates shuffle
      for (let i = finalQuestions.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [finalQuestions[i], finalQuestions[j]] = [finalQuestions[j], finalQuestions[i]];
      }

      if (finalQuestions.length > 0) {
        setQuestions(finalQuestions as any);
      } else {
        throw new Error("No assessment questions generated");
      }
    } catch (err) {
      console.error("[QuizMode] Error:", err);
      const errorMessage = err instanceof Error ? err.message : t('quiz.generationFailedDesc');
      toast({
        title: t('quiz.generationFailed'),
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [chapterContent, chapterTitle, bookTitle, isMasteryMode, bookType, toast, t, adaptiveDifficulty, bookId, generateGraphQuestions]);

  const handleSelectAnswer = (index: number) => {
    if (showResult) return;
    setSelectedAnswer(index);
  };

  const handleSubmitAnswer = async () => {
    if (selectedAnswer === null) return;
    const currentQuestion = questions[currentIndex];
    const isCorrect = selectedAnswer === currentQuestion.correctIndex;
    if (isCorrect) {
      setScore(prev => prev + 1);
    } else {
      // Track wrong answers for SRS card creation
      setWrongAnswers(prev => [...prev, currentQuestion]);
    }
    setShowResult(true);
  };

  const handleNextQuestion = async () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setSelectedAnswer(null);
      setShowResult(false);
    } else {
      setIsComplete(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const percentage = Math.round((score / questions.length) * 100);
          const timeSpent = Math.floor((Date.now() - quizStartTime.current) / 1000);

          await supabase.from("study_notes").insert({
            user_id: user.id,
            book_id: bookId,
            chapter_id: chapterId,
            note_type: "quiz_result",
            content: JSON.stringify({
              title: `Mastery Assessment: ${chapterTitle}`,
              score, total: questions.length, percentage, masteryDepthScore,
              bloomDistribution: questions.reduce((acc, q) => {
                acc[q.bloomLevel] = (acc[q.bloomLevel] || 0) + 1;
                return acc;
              }, {} as Record<string, number>),
            }),
          });

          if (onRecordAttempt) {
            const bloomLevel: BloomLevel = isMasteryMode ? 'evaluate' :
              percentage >= 85 ? 'evaluate' :
              percentage >= 60 ? 'apply' : 'understand';

            const result = await onRecordAttempt(
              chapterId, bloomLevel, percentage,
              adaptiveDifficulty, timeSpent, questions.length,
            );

            if (result?.blocked) {
              toast({ title: 'Attempt Blocked', description: result.reason || 'Anti-gaming check failed', variant: 'destructive' });
            }
          }

          // Auto-create SRS cards from wrong answers
          if (wrongAnswers.length > 0) {
            const srsRecords = wrongAnswers.map(q => ({
              user_id: user.id,
              book_id: bookId,
              chapter_id: chapterId,
              question: q.question,
              answer: q.options[q.correctIndex] + (q.reasoningExplanation ? ` — ${q.reasoningExplanation}` : ''),
              bloom_level: q.bloomLevel,
            }));
            await supabase.from('spaced_repetition_cards').insert(srsRecords as any);
          }
        }
      } catch (err) {
        console.error("Failed to save quiz result:", err);
      }
    }
  };

  if (!isOpen) return null;

  const currentQuestion = questions[currentIndex];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[70] bg-background/95 backdrop-blur-sm flex items-center justify-center p-4"
      >
        <Card className="w-full max-w-2xl max-h-[90vh] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-primary/10">
                <Brain className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold">Mastery Assessment</h3>
                <p className="text-xs text-muted-foreground">
                  {questions.length > 0
                    ? `Question ${currentIndex + 1} of ${questions.length}`
                    : "Bloom-enforced, stress-tested"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {masteryDepthScore > 0 && (
                <Badge variant="outline" className="text-xs gap-1">
                  <Target className="h-3 w-3" />
                  Depth: {masteryDepthScore}%
                </Badge>
              )}
              <Button variant="ghost" size="icon" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <ScrollArea className="p-4 max-h-[calc(90vh-140px)]">
            {/* Initial State */}
            {questions.length === 0 && !isLoading && (
              <div className="text-center py-12">
                <Brain className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                <h4 className="text-lg font-semibold mb-2">Mastery Engine v2</h4>
                <p className="text-muted-foreground mb-2 max-w-md mx-auto">
                  AI-extracted concepts → Bloom-enforced questions → Stress-tested for depth
                </p>
                <div className="flex flex-wrap gap-2 justify-center mb-6">
                  {["Concept Extraction", "Bloom Enforcement", "Question Stress-Test"].map((step) => (
                    <Badge key={step} variant="secondary" className="text-xs">
                      {step}
                    </Badge>
                  ))}
                </div>
                <Button onClick={generateQuiz} size="lg" className="gap-2">
                  <Brain className="h-4 w-4" />
                  Start Mastery Assessment
                </Button>
              </div>
            )}

            {/* Loading */}
            {isLoading && (
              <div className="text-center py-12 space-y-4">
                <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                <div className="space-y-1">
                  <p className="text-sm font-medium">Building Assessment Pipeline...</p>
                  <p className="text-xs text-muted-foreground">Extracting concepts → Enforcing Bloom levels → Stress-testing questions</p>
                </div>
              </div>
            )}

            {/* Quiz Complete */}
            {isComplete && (
              <div className="text-center py-8 space-y-6">
                <Trophy className="h-16 w-16 mx-auto text-primary" />
                <div>
                  <h4 className="text-2xl font-bold mb-2">Assessment Complete</h4>
                  <p className="text-lg text-muted-foreground">
                    {score} of {questions.length} correct
                  </p>
                  <div className="text-4xl font-bold text-primary mt-2">
                    {Math.round((score / questions.length) * 100)}%
                  </div>
                </div>

                {/* Mastery Depth + Stress-Test Summary */}
                <div className="grid grid-cols-3 gap-3 max-w-md mx-auto text-left">
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground">Mastery Depth</p>
                    <p className="text-lg font-bold">{masteryDepthScore}%</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground">Difficulty</p>
                    <p className="text-lg font-bold">{getDifficultyLabel(adaptiveDifficulty)}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground">SRS Cards Added</p>
                    <p className="text-lg font-bold">{wrongAnswers.length}</p>
                  </div>
                </div>

                {/* Bloom Distribution */}
                <div className="max-w-sm mx-auto">
                  <p className="text-xs text-muted-foreground mb-2">Bloom Levels Assessed</p>
                  <div className="flex flex-wrap gap-1.5 justify-center">
                    {Object.entries(
                      questions.reduce((acc, q) => {
                        acc[q.bloomLevel] = (acc[q.bloomLevel] || 0) + 1;
                        return acc;
                      }, {} as Record<string, number>)
                    ).map(([level, count]) => (
                      <Badge key={level} variant="outline" className={cn("text-xs", BLOOM_COLORS[level])}>
                        {level}: {count as number}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Concepts Extracted */}
                {concepts?.namedConstructs?.length > 0 && (
                  <div className="max-w-sm mx-auto">
                    <p className="text-xs text-muted-foreground mb-2">
                      {concepts.namedConstructs.length} Concepts Extracted
                    </p>
                    <div className="flex flex-wrap gap-1 justify-center">
                      {concepts.namedConstructs.slice(0, 8).map((c: string, i: number) => (
                        <Badge key={i} variant="secondary" className="text-xs">
                          {c}
                        </Badge>
                      ))}
                      {concepts.namedConstructs.length > 8 && (
                        <Badge variant="secondary" className="text-xs">
                          +{concepts.namedConstructs.length - 8} more
                        </Badge>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex gap-2 justify-center">
                  <Button variant="outline" onClick={generateQuiz} className="gap-2">
                    <RefreshCw className="h-4 w-4" />
                    Retry Assessment
                  </Button>
                  <Button onClick={onClose}>Continue Reading</Button>
                </div>
              </div>
            )}

            {/* Question */}
            {currentQuestion && !isComplete && (
              <div className="space-y-4">
                {/* Question Metadata Badges */}
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="outline" className={cn("text-xs", BLOOM_COLORS[currentQuestion.bloomLevel])}>
                    {currentQuestion.bloomLevel.charAt(0).toUpperCase() + currentQuestion.bloomLevel.slice(1)}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {QUESTION_TYPE_LABELS[currentQuestion.questionType] || currentQuestion.questionType}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    {currentQuestion.pointValue} pts
                  </Badge>
                  {currentQuestion.stressTestPass && (
                    <Badge variant="outline" className="text-xs bg-green-500/10 text-green-600 border-green-300">
                      <ShieldCheck className="h-3 w-3 mr-1" />
                      Verified
                    </Badge>
                  )}
                </div>

                {/* Concepts Used (shown as subtle tags) */}
                {currentQuestion.conceptsUsed?.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {currentQuestion.conceptsUsed.map((c, i) => (
                      <span key={i} className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                        {c}
                      </span>
                    ))}
                  </div>
                )}

                {/* Question Text */}
                <p className="text-lg font-medium leading-relaxed">{currentQuestion.question}</p>

                {/* Options */}
                <div className="space-y-2">
                  {currentQuestion.options.map((option, index) => {
                    const isSelected = selectedAnswer === index;
                    const isCorrect = index === currentQuestion.correctIndex;

                    let optionClass = "border-border hover:border-primary/50 hover:bg-muted/50";
                    if (showResult) {
                      if (isCorrect) optionClass = "border-green-500 bg-green-500/10";
                      else if (isSelected && !isCorrect) optionClass = "border-red-500 bg-red-500/10";
                    } else if (isSelected) {
                      optionClass = "border-primary bg-primary/10";
                    }

                    return (
                      <button
                        key={index}
                        onClick={() => handleSelectAnswer(index)}
                        disabled={showResult}
                        className={cn("w-full text-left p-4 rounded-lg border-2 transition-all", optionClass)}
                      >
                        <div className="flex items-center gap-3">
                          <span className="flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-medium">
                            {String.fromCharCode(65 + index)}
                          </span>
                          <span className="flex-1">{option}</span>
                          {showResult && isCorrect && <CheckCircle2 className="h-5 w-5 text-green-500" />}
                          {showResult && isSelected && !isCorrect && <XCircle className="h-5 w-5 text-red-500" />}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Post-Answer: Reasoning + Bloom Justification */}
                {showResult && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-3"
                  >
                    {/* Reasoning Explanation */}
                    <div className="p-4 bg-muted rounded-lg">
                      <div className="flex items-center gap-2 mb-2">
                        <Lightbulb className="h-4 w-4 text-amber-500" />
                        <p className="text-sm font-medium">Reasoning Explanation</p>
                      </div>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {currentQuestion.reasoningExplanation}
                      </p>
                      {currentQuestion.conceptsUsed && currentQuestion.conceptsUsed.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-border/50">
                          <p className="text-xs text-muted-foreground mb-1.5 font-medium">Key Concepts Applied:</p>
                          <div className="flex flex-wrap gap-1">
                            {currentQuestion.conceptsUsed.map((concept, i) => (
                              <Badge key={i} variant="outline" className="text-[10px] h-5 bg-background/50">
                                {concept}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Bloom Justification */}
                    <div className="p-3 bg-muted/50 rounded-lg border border-border">
                      <div className="flex items-center gap-2 mb-1">
                        <Brain className="h-3.5 w-3.5 text-primary" />
                        <p className="text-xs font-medium">Bloom Level Justification</p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {currentQuestion.bloomJustification}
                      </p>
                    </div>
                  </motion.div>
                )}
              </div>
            )}
          </ScrollArea>

          {/* Footer */}
          {currentQuestion && !isComplete && (
            <div className="p-4 border-t border-border flex justify-between items-center">
              <div className="text-sm text-muted-foreground">
                Score: {score}/{currentIndex + (showResult ? 1 : 0)}
              </div>
              {!showResult ? (
                <Button onClick={handleSubmitAnswer} disabled={selectedAnswer === null}>
                  Submit Answer
                </Button>
              ) : (
                <Button onClick={handleNextQuestion} className="gap-2">
                  {currentIndex < questions.length - 1 ? (
                    <>Next <ChevronRight className="h-4 w-4" /></>
                  ) : (
                    "See Results"
                  )}
                </Button>
              )}
            </div>
          )}
        </Card>
      </motion.div>
    </AnimatePresence>
  );
}

// Button to open quiz mode
export const QuizModeButton = forwardRef<HTMLButtonElement, { onClick: () => void }>(
  function QuizModeButton({ onClick }, ref) {
    const { t } = useLanguage();
    return (
      <Button
        ref={ref}
        onClick={onClick}
        variant="outline"
        size="sm"
        className="gap-2"
      >
        <GraduationCap className="h-4 w-4" />
        {t('quiz.title').replace('Chapter ', '')}
      </Button>
    );
  }
);
