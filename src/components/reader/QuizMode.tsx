import { forwardRef, useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  Brain,
  CheckCircle2,
  ChevronRight,
  GraduationCap,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Trophy,
  X,
  XCircle,
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { useLanguage } from '@/contexts/LanguageContext';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { type BloomLevel } from '@/lib/masteryEngine';
import { getDifficultyLabel } from '@/lib/adaptiveDifficulty';

interface MasteryQuestion {
  id?: string;
  tier?: 1 | 2 | 3 | 4;
  bloomLevel: BloomLevel;
  question: string;
  options: string[];
  bloomJustification?: string;
  conceptsUsed?: string[];
  questionType?: string;
  difficulty?: number;
  pointValue?: number;
  timeLimit?: number;
  stressTestPass?: boolean;
  serverCorrectIndex?: number;
  reasoningExplanation?: string;
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
  adaptiveBloomLevel?: string;
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

interface CompletionResult {
  success: boolean;
  score: number;
  correctAnswers: number;
  totalQuestions: number;
  integrityScore: number;
  integrityClassification: string;
  assessmentContractPassed: boolean;
  assessmentContractVersion: string;
}

const BLOOM_COLORS: Record<string, string> = {
  remember: 'bg-slate-500/10 text-slate-600 border-slate-300',
  understand: 'bg-blue-500/10 text-blue-600 border-blue-300',
  apply: 'bg-green-500/10 text-green-600 border-green-300',
  analyze: 'bg-amber-500/10 text-amber-600 border-amber-300',
  evaluate: 'bg-purple-500/10 text-purple-600 border-purple-300',
  create: 'bg-rose-500/10 text-rose-600 border-rose-300',
};

/**
 * Contract 8 / 6B / 6C assessment UI.
 *
 * Important trust boundary: the browser never receives the answer key when the
 * assessment starts and never computes credential evidence. Each answer is
 * locked and scored by `assessment-session`; final score/integrity are returned
 * only after the server persists the authoritative attempt.
 */
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
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<MasteryQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [answerWasCorrect, setAnswerWasCorrect] = useState<boolean | null>(null);
  const [score, setScore] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isComplete, setIsComplete] = useState(false);
  const [completion, setCompletion] = useState<CompletionResult | null>(null);
  const [masteryDepthScore, setMasteryDepthScore] = useState(0);
  const [wrongAnswers, setWrongAnswers] = useState<MasteryQuestion[]>([]);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const quizStartTime = useRef(Date.now());
  const { toast } = useToast();
  const { t } = useLanguage();

  // Props retained for API compatibility. Generation content/title/type are read
  // from the server database rather than trusted from the browser.
  void chapterContent;
  void bookTitle;
  void bookType;
  void adaptiveBloomLevel;

  const difficulty = adaptiveDifficultyOverride ?? 3;

  const invokeSession = useCallback(async (payload: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke('assessment-session', { body: payload });
    if (error) throw error;
    return data;
  }, []);

  const sendTelemetry = useCallback((event: 'paste' | 'focus_loss' | 'suspicious_timing') => {
    if (!sessionId || isComplete) return;
    void invokeSession({ action: 'telemetry', sessionId, event }).catch(() => {
      // Telemetry failure is intentionally not hidden from the server: missing
      // heartbeats/events cause the final integrity result to fail closed.
    });
  }, [invokeSession, isComplete, sessionId]);

  useEffect(() => {
    if (!isOpen || !sessionId || isComplete) return;
    const onBlur = () => sendTelemetry('focus_loss');
    const onPaste = () => sendTelemetry('paste');
    window.addEventListener('blur', onBlur);
    document.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('paste', onPaste);
    };
  }, [isOpen, sessionId, isComplete, sendTelemetry]);

  const resetLocalState = () => {
    setSessionId(null);
    setQuestions([]);
    setCurrentIndex(0);
    setSelectedAnswer(null);
    setShowResult(false);
    setAnswerWasCorrect(null);
    setScore(0);
    setIsComplete(false);
    setCompletion(null);
    setMasteryDepthScore(0);
    setWrongAnswers([]);
    setFatalError(null);
    quizStartTime.current = Date.now();
  };

  const generateQuiz = useCallback(async () => {
    resetLocalState();
    setIsLoading(true);
    try {
      const data = await invokeSession({
        action: 'start',
        bookId,
        chapterId,
        mode: isMasteryMode ? 'mastery' : 'completion',
        difficulty,
      });

      if (!data?.sessionId || !Array.isArray(data?.questions) || data.questions.length === 0) {
        throw new Error('The server did not return a valid assessment session.');
      }

      setSessionId(String(data.sessionId));
      setQuestions(data.questions as MasteryQuestion[]);
      setMasteryDepthScore(Number(data.masteryDepthScore || 0));
      quizStartTime.current = Date.now();
    } catch (error) {
      console.error('[QuizMode] assessment start failed', error);
      const message = error instanceof Error ? error.message : 'Assessment generation failed.';
      setFatalError(message);
      toast({ title: 'Assessment unavailable', description: message, variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [bookId, chapterId, difficulty, invokeSession, isMasteryMode, toast]);

  const handleSelectAnswer = (index: number) => {
    if (showResult || isSubmitting) return;
    setSelectedAnswer(index);
  };

  const handleSubmitAnswer = async () => {
    if (selectedAnswer === null || !sessionId || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const result = await invokeSession({
        action: 'answer',
        sessionId,
        questionIndex: currentIndex,
        selectedIndex: selectedAnswer,
      });

      const correct = Boolean(result?.correct);
      const correctIndex = Number(result?.correctIndex);
      const explanation = String(result?.reasoningExplanation || '');
      setAnswerWasCorrect(correct);
      setScore(previous => previous + (correct ? 1 : 0));
      setQuestions(previous => previous.map((question, index) => index === currentIndex
        ? { ...question, serverCorrectIndex: correctIndex, reasoningExplanation: explanation }
        : question));

      if (!correct) {
        const current = questions[currentIndex];
        setWrongAnswers(previous => [...previous, {
          ...current,
          serverCorrectIndex: correctIndex,
          reasoningExplanation: explanation,
        }]);
      }
      setShowResult(true);
    } catch (error) {
      console.error('[QuizMode] answer submission failed', error);
      toast({
        title: 'Answer not recorded',
        description: 'The server could not lock this answer. Nothing was scored; please retry.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const finalizeAssessment = async () => {
    if (!sessionId) return;
    setIsSubmitting(true);
    try {
      const result = await invokeSession({ action: 'complete', sessionId }) as CompletionResult;
      setCompletion(result);
      setScore(Number(result.correctAnswers || 0));
      setIsComplete(true);

      const timeSpent = Math.floor((Date.now() - quizStartTime.current) / 1000);
      const percentage = Math.round(Number(result.score || 0));
      const { data: { user } } = await supabase.auth.getUser();

      // Learning-progress/UI data may be client-managed, but it is not consumed
      // as credential evidence by Contract 6C.
      if (onRecordAttempt) {
        const bloomLevel: BloomLevel = isMasteryMode ? 'evaluate' : percentage >= 85 ? 'evaluate' : percentage >= 60 ? 'apply' : 'understand';
        await onRecordAttempt(chapterId, bloomLevel, percentage, difficulty, timeSpent, questions.length);
      }

      if (user) {
        await supabase.from('study_notes').insert({
          user_id: user.id,
          book_id: bookId,
          chapter_id: chapterId,
          note_type: 'quiz_result',
          content: JSON.stringify({
            title: `${isMasteryMode ? 'Mastery' : 'Structured'} Assessment: ${chapterTitle}`,
            score: result.correctAnswers,
            total: result.totalQuestions,
            percentage,
            masteryDepthScore,
            integrityScore: result.integrityScore,
            integrityClassification: result.integrityClassification,
            assessmentContract: result.assessmentContractVersion,
            serverAuthoritative: true,
          }),
        });

        if (wrongAnswers.length > 0) {
          const records = wrongAnswers
            .filter(question => question.serverCorrectIndex !== undefined)
            .map(question => ({
              user_id: user.id,
              book_id: bookId,
              chapter_id: chapterId,
              question: question.question,
              answer: `${question.options[question.serverCorrectIndex!]}${question.reasoningExplanation ? ` — ${question.reasoningExplanation}` : ''}`,
              bloom_level: question.bloomLevel,
            }));
          if (records.length) await supabase.from('spaced_repetition_cards').insert(records as any);
        }
      }
    } catch (error) {
      console.error('[QuizMode] assessment completion failed', error);
      toast({
        title: 'Assessment not finalized',
        description: 'The server did not persist final evidence. No completion record has been created.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNextQuestion = async () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(index => index + 1);
      setSelectedAnswer(null);
      setShowResult(false);
      setAnswerWasCorrect(null);
      return;
    }
    await finalizeAssessment();
  };

  if (!isOpen) return null;
  const currentQuestion = questions[currentIndex];
  const displayedCorrect = currentQuestion?.serverCorrectIndex;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[70] bg-background/95 backdrop-blur-sm flex items-center justify-center p-4"
      >
        <Card className="w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
          <div className="flex-none flex items-center justify-between p-4 border-b border-border">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-primary/10"><Brain className="h-5 w-5 text-primary" /></div>
              <div>
                <h3 className="font-semibold">{isMasteryMode ? 'Mastery Assessment' : 'Structured Assessment'}</h3>
                <p className="text-xs text-muted-foreground">
                  {questions.length ? `Question ${currentIndex + 1} of ${questions.length}` : 'Server-scored · ARC-1.0 governed'}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {sessionId ? <Badge variant="outline" className="gap-1 text-xs"><ShieldCheck className="h-3 w-3" />Server session</Badge> : null}
              <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
            </div>
          </div>

          <ScrollArea className="flex-1 min-h-0 p-4">
            {!questions.length && !isLoading && !fatalError ? (
              <div className="text-center py-12">
                <Brain className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
                <h4 className="text-lg font-semibold mb-2">Server-Authoritative Assessment</h4>
                <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                  Answer keys stay on the server. The final score, integrity evidence, and ARC contract result are persisted server-side.
                </p>
                <Button onClick={generateQuiz} size="lg" className="gap-2"><ShieldCheck className="h-4 w-4" />Start Assessment</Button>
              </div>
            ) : null}

            {fatalError && !isLoading ? (
              <div className="text-center py-12">
                <AlertTriangle className="h-14 w-14 mx-auto text-destructive mb-4" />
                <h4 className="font-semibold mb-2">Assessment could not start</h4>
                <p className="text-sm text-muted-foreground mb-5">{fatalError}</p>
                <Button variant="outline" onClick={generateQuiz} className="gap-2"><RefreshCw className="h-4 w-4" />Retry</Button>
              </div>
            ) : null}

            {isLoading ? (
              <div className="text-center py-12 space-y-3">
                <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                <p className="font-medium">Building governed assessment…</p>
                <p className="text-xs text-muted-foreground">The server validates the question mix before the assessment can start.</p>
              </div>
            ) : null}

            {isComplete && completion ? (
              <div className="text-center py-8 space-y-6">
                <Trophy className="h-16 w-16 mx-auto text-primary" />
                <div>
                  <h4 className="text-2xl font-bold mb-2">Assessment Complete</h4>
                  <div className="text-4xl font-bold text-primary">{Math.round(completion.score)}%</div>
                  <p className="text-muted-foreground mt-1">{completion.correctAnswers} of {completion.totalQuestions} correct</p>
                </div>
                <div className="grid grid-cols-3 gap-3 max-w-lg mx-auto text-left">
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground">Integrity</p>
                    <p className="font-bold">{Math.round(completion.integrityScore * 100)}%</p>
                    <p className="text-xs capitalize">{completion.integrityClassification}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground">Contract</p>
                    <p className="font-bold">{completion.assessmentContractVersion}</p>
                    <p className="text-xs">{completion.assessmentContractPassed ? 'Passed' : 'Failed'}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground">Difficulty</p>
                    <p className="font-bold">{getDifficultyLabel(difficulty)}</p>
                    <p className="text-xs">Server scored</p>
                  </div>
                </div>
                <div className="flex gap-2 justify-center">
                  <Button variant="outline" onClick={generateQuiz} className="gap-2"><RefreshCw className="h-4 w-4" />Retry</Button>
                  <Button onClick={onClose}>Continue Reading</Button>
                </div>
              </div>
            ) : null}

            {currentQuestion && !isComplete ? (
              <div className="space-y-4">
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="outline" className={cn('text-xs', BLOOM_COLORS[currentQuestion.bloomLevel])}>{currentQuestion.bloomLevel}</Badge>
                  {currentQuestion.questionType ? <Badge variant="outline" className="text-xs">{currentQuestion.questionType}</Badge> : null}
                  {currentQuestion.tier ? <Badge variant="outline" className="text-xs">Tier {currentQuestion.tier}</Badge> : null}
                </div>

                <p className="text-lg font-medium leading-relaxed">{currentQuestion.question}</p>

                <div className="space-y-2">
                  {currentQuestion.options.map((option, index) => {
                    const selected = selectedAnswer === index;
                    const correct = displayedCorrect === index;
                    let classes = 'border-border hover:border-primary/50 hover:bg-muted/50';
                    if (showResult && correct) classes = 'border-green-500 bg-green-500/10';
                    else if (showResult && selected && !correct) classes = 'border-red-500 bg-red-500/10';
                    else if (selected) classes = 'border-primary bg-primary/10';
                    return (
                      <button
                        key={index}
                        type="button"
                        onClick={() => handleSelectAnswer(index)}
                        disabled={showResult || isSubmitting}
                        className={cn('w-full text-left p-4 rounded-lg border-2 transition-all', classes)}
                      >
                        <div className="flex items-center gap-3">
                          <span className="shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-medium">{String.fromCharCode(65 + index)}</span>
                          <span className="flex-1">{option}</span>
                          {showResult && correct ? <CheckCircle2 className="h-5 w-5 text-green-500" /> : null}
                          {showResult && selected && !correct ? <XCircle className="h-5 w-5 text-red-500" /> : null}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {showResult ? (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="p-4 rounded-lg bg-muted">
                    <p className={cn('font-medium mb-2', answerWasCorrect ? 'text-green-600' : 'text-destructive')}>
                      {answerWasCorrect ? 'Correct' : 'Not correct'}
                    </p>
                    <p className="text-sm text-muted-foreground">{currentQuestion.reasoningExplanation || 'The server recorded this answer.'}</p>
                    {currentQuestion.bloomJustification ? <p className="text-xs text-muted-foreground mt-3 pt-3 border-t">{currentQuestion.bloomJustification}</p> : null}
                  </motion.div>
                ) : null}
              </div>
            ) : null}
          </ScrollArea>

          {currentQuestion && !isComplete ? (
            <div className="flex-none p-4 border-t border-border flex justify-between items-center">
              <div className="text-sm text-muted-foreground">Score: {score}/{currentIndex + (showResult ? 1 : 0)}</div>
              {!showResult ? (
                <Button onClick={handleSubmitAnswer} disabled={selectedAnswer === null || isSubmitting}>
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}Submit Answer
                </Button>
              ) : (
                <Button onClick={handleNextQuestion} disabled={isSubmitting} className="gap-2">
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : currentIndex < questions.length - 1 ? <>Next <ChevronRight className="h-4 w-4" /></> : 'Finalize Results'}
                </Button>
              )}
            </div>
          ) : null}
        </Card>
      </motion.div>
    </AnimatePresence>
  );
}

export const QuizModeButton = forwardRef<HTMLButtonElement, { onClick: () => void }>(
  function QuizModeButton({ onClick }, ref) {
    const { t } = useLanguage();
    return (
      <Button ref={ref} onClick={onClick} variant="outline" size="sm" className="gap-2">
        <GraduationCap className="h-4 w-4" />
        {t('quiz.title').replace('Chapter ', '')}
      </Button>
    );
  },
);
