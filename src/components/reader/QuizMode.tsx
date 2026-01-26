import { useState, useCallback, forwardRef } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  GraduationCap, 
  CheckCircle2, 
  XCircle, 
  Loader2, 
  RefreshCw,
  Trophy,
  X,
  ChevronRight
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";

interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  tier?: number;
  type?: 'knowledge' | 'reasoning' | 'scenario' | 'integrity';
  pointValue?: number;
  timeLimit?: number;
  context?: string;
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
}

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
}: QuizModeProps) {
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [score, setScore] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const { toast } = useToast();
  const { t } = useLanguage();

  const generateQuiz = useCallback(async () => {
    setIsLoading(true);
    setQuestions([]);
    setCurrentIndex(0);
    setScore(0);
    setIsComplete(false);
    setSelectedAnswer(null);
    setShowResult(false);

    try {
      const { data, error } = await supabase.functions.invoke("interactive-qa", {
        body: {
          question: "QUIZ_MODE: Generate multi-tier assessment questions for certification.",
          chapterContent: chapterContent.slice(0, 8000),
          chapterTitle,
          bookTitle,
          isQuizMode: true,
          isMasteryMode,
          bookType,
        },
      });

      if (error) throw error;

      if (data?.questions && Array.isArray(data.questions)) {
        setQuestions(data.questions);
      } else if (data?.answer) {
        try {
          const parsed = JSON.parse(data.answer);
          if (Array.isArray(parsed)) {
            setQuestions(parsed);
          }
        } catch {
          throw new Error("Failed to generate quiz questions");
        }
      } else {
        throw new Error("No quiz questions generated");
      }
    } catch (err) {
      console.error("[QuizMode] Error:", err);
      toast({
        title: t('quiz.generationFailed'),
        description: t('quiz.generationFailedDesc'),
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [chapterContent, chapterTitle, bookTitle, toast, t]);

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
      // Save quiz result
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await supabase.from("study_notes").insert({
            user_id: user.id,
            book_id: bookId,
            chapter_id: chapterId,
            note_type: "quiz_result",
            title: `Quiz: ${chapterTitle}`,
            content: {
              score,
              total: questions.length,
              percentage: Math.round((score / questions.length) * 100),
              questions: questions.map((q, i) => ({ question: q.question, correct: i < score })),
            },
          });
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
        className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex items-center justify-center p-4"
      >
        <Card className="w-full max-w-2xl max-h-[90vh] overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-primary/10">
                <GraduationCap className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold">{t('quiz.title')}</h3>
                <p className="text-xs text-muted-foreground">
                  {questions.length > 0 
                    ? t('quiz.questionOf').replace('{current}', String(currentIndex + 1)).replace('{total}', String(questions.length))
                    : t('quiz.ready')}
                </p>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          <ScrollArea className="p-4 max-h-[calc(90vh-140px)]">
            {/* Initial State */}
            {questions.length === 0 && !isLoading && (
              <div className="text-center py-12">
                <GraduationCap className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                <h4 className="text-lg font-semibold mb-2">{t('quiz.readyTitle')}</h4>
                <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                  {t('quiz.readyDesc').replace('{chapter}', chapterTitle)}
                </p>
                <Button onClick={generateQuiz} size="lg" className="gap-2">
                  <GraduationCap className="h-4 w-4" />
                  {t('quiz.startQuiz')}
                </Button>
              </div>
            )}

            {/* Loading */}
            {isLoading && (
              <div className="text-center py-12">
                <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary mb-4" />
                <p className="text-muted-foreground">{t('quiz.generating')}</p>
              </div>
            )}

            {/* Quiz Complete */}
            {isComplete && (
              <div className="text-center py-8">
                <Trophy className="h-16 w-16 mx-auto text-scroll-gold mb-4" />
                <h4 className="text-2xl font-bold mb-2">{t('quiz.complete')}</h4>
                <p className="text-lg text-muted-foreground mb-4">
                  {t('quiz.score').replace('{score}', String(score)).replace('{total}', String(questions.length))}
                </p>
                <div className="text-4xl font-bold text-primary mb-6">
                  {Math.round((score / questions.length) * 100)}%
                </div>
                <div className="flex gap-2 justify-center">
                  <Button variant="outline" onClick={generateQuiz} className="gap-2">
                    <RefreshCw className="h-4 w-4" />
                    {t('quiz.tryAgain')}
                  </Button>
                  <Button onClick={onClose}>{t('quiz.continueReading')}</Button>
                </div>
              </div>
            )}

            {/* Question */}
            {currentQuestion && !isComplete && (
              <div className="space-y-6">
                <div>
                  <p className="text-lg font-medium mb-4">{currentQuestion.question}</p>
                  
                  <div className="space-y-2">
                    {currentQuestion.options.map((option, index) => {
                      const isSelected = selectedAnswer === index;
                      const isCorrect = index === currentQuestion.correctIndex;
                      
                      let optionClass = "border-border hover:border-primary/50 hover:bg-muted/50";
                      if (showResult) {
                        if (isCorrect) {
                          optionClass = "border-green-500 bg-green-500/10";
                        } else if (isSelected && !isCorrect) {
                          optionClass = "border-red-500 bg-red-500/10";
                        }
                      } else if (isSelected) {
                        optionClass = "border-primary bg-primary/10";
                      }

                      return (
                        <button
                          key={index}
                          onClick={() => handleSelectAnswer(index)}
                          disabled={showResult}
                          className={cn(
                            "w-full text-left p-4 rounded-lg border-2 transition-all",
                            optionClass
                          )}
                        >
                          <div className="flex items-center gap-3">
                            <span className="flex-shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-medium">
                              {String.fromCharCode(65 + index)}
                            </span>
                            <span className="flex-1">{option}</span>
                            {showResult && isCorrect && (
                              <CheckCircle2 className="h-5 w-5 text-green-500" />
                            )}
                            {showResult && isSelected && !isCorrect && (
                              <XCircle className="h-5 w-5 text-red-500" />
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Explanation */}
                {showResult && currentQuestion.explanation && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 bg-muted rounded-lg"
                  >
                    <p className="text-sm font-medium mb-1">{t('quiz.explanation')}</p>
                    <p className="text-sm text-muted-foreground">{currentQuestion.explanation}</p>
                  </motion.div>
                )}
              </div>
            )}
          </ScrollArea>

          {/* Footer */}
          {currentQuestion && !isComplete && (
            <div className="p-4 border-t border-border flex justify-between items-center">
              <div className="text-sm text-muted-foreground">
                {t('quiz.currentScore')} {score}/{currentIndex + (showResult ? 1 : 0)}
              </div>
              {!showResult ? (
                <Button 
                  onClick={handleSubmitAnswer} 
                  disabled={selectedAnswer === null}
                >
                  {t('quiz.submitAnswer')}
                </Button>
              ) : (
                <Button onClick={handleNextQuestion} className="gap-2">
                  {currentIndex < questions.length - 1 ? (
                    <>{t('quiz.nextQuestion')} <ChevronRight className="h-4 w-4" /></>
                  ) : (
                    t('quiz.seeResults')
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
