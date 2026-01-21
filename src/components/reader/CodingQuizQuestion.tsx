/**
 * Coding Quiz Question Component
 * Enables code-based assessment questions for Tier 2 and Tier 3 assessments
 */

import { useState, useCallback } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { 
  Code2, 
  Play, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle,
  Lightbulb,
  Timer
} from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import hljs from "highlight.js";

export interface CodingQuestion {
  id: string;
  tier: 2 | 3;
  type: 'output_prediction' | 'debug' | 'fill_blank' | 'write_function';
  question: string;
  codeSnippet: string;
  language: string;
  expectedOutput?: string;
  expectedCode?: string;
  hints: string[];
  explanation: string;
  pointValue: number;
  timeLimit?: number; // seconds
}

interface CodingQuizQuestionProps {
  question: CodingQuestion;
  onSubmit: (answer: string, isCorrect: boolean, timeSpent: number) => void;
  showResult?: boolean;
}

// Simple code comparison that normalizes whitespace
function normalizeCode(code: string): string {
  return code
    .trim()
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .join('\n')
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function checkAnswer(
  question: CodingQuestion, 
  userAnswer: string
): { isCorrect: boolean; feedback: string } {
  const normalizedAnswer = normalizeCode(userAnswer);
  
  switch (question.type) {
    case 'output_prediction':
      if (question.expectedOutput) {
        const normalizedExpected = normalizeCode(question.expectedOutput);
        const isCorrect = normalizedAnswer === normalizedExpected;
        return {
          isCorrect,
          feedback: isCorrect 
            ? 'Correct! You predicted the output accurately.'
            : `The expected output was: ${question.expectedOutput}`
        };
      }
      break;
      
    case 'debug':
    case 'fill_blank':
    case 'write_function':
      if (question.expectedCode) {
        const normalizedExpected = normalizeCode(question.expectedCode);
        // More lenient matching for code - check if key parts are present
        const keyParts = normalizedExpected.split(' ').filter(p => p.length > 2);
        const matchedParts = keyParts.filter(part => normalizedAnswer.includes(part));
        const matchRatio = matchedParts.length / keyParts.length;
        const isCorrect = matchRatio >= 0.7; // 70% match threshold
        return {
          isCorrect,
          feedback: isCorrect
            ? 'Correct! Your solution is valid.'
            : `Your solution differs from the expected answer. Review the explanation for guidance.`
        };
      }
      break;
  }
  
  return { isCorrect: false, feedback: 'Unable to validate answer.' };
}

export function CodingQuizQuestion({ 
  question, 
  onSubmit,
  showResult = false 
}: CodingQuizQuestionProps) {
  const [userAnswer, setUserAnswer] = useState('');
  const [result, setResult] = useState<{ isCorrect: boolean; feedback: string } | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [hintIndex, setHintIndex] = useState(0);
  const [startTime] = useState(Date.now());
  const [timeRemaining, setTimeRemaining] = useState(question.timeLimit || 180);

  // Timer effect
  useState(() => {
    if (!question.timeLimit) return;
    const interval = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          handleSubmit();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  });

  const handleSubmit = useCallback(() => {
    const timeSpent = Math.floor((Date.now() - startTime) / 1000);
    const checkResult = checkAnswer(question, userAnswer);
    setResult(checkResult);
    onSubmit(userAnswer, checkResult.isCorrect, timeSpent);
  }, [question, userAnswer, startTime, onSubmit]);

  const handleShowHint = useCallback(() => {
    if (hintIndex < question.hints.length) {
      setShowHint(true);
      setHintIndex(prev => Math.min(prev + 1, question.hints.length));
    }
  }, [hintIndex, question.hints.length]);

  const highlightedCode = question.codeSnippet ?
    hljs.getLanguage(question.language) ?
      hljs.highlight(question.codeSnippet, { language: question.language }).value :
      hljs.highlightAuto(question.codeSnippet).value
    : '';

  const getTierBadge = () => {
    if (question.tier === 2) {
      return <Badge variant="secondary" className="gap-1"><Code2 className="h-3 w-3" />Tier 2: Applied Reasoning</Badge>;
    }
    return <Badge variant="default" className="gap-1"><AlertTriangle className="h-3 w-3" />Tier 3: Debug & Fix</Badge>;
  };

  const getTypeLabel = () => {
    switch (question.type) {
      case 'output_prediction': return 'Predict the Output';
      case 'debug': return 'Debug This Code';
      case 'fill_blank': return 'Fill in the Blank';
      case 'write_function': return 'Write the Code';
      default: return 'Coding Challenge';
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <Card className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          {getTierBadge()}
          <Badge variant="outline">{getTypeLabel()}</Badge>
          <Badge variant="outline">{question.pointValue} pts</Badge>
        </div>
        {question.timeLimit && (
          <div className={cn(
            "flex items-center gap-1 text-sm",
            timeRemaining < 30 && "text-destructive"
          )}>
            <Timer className="h-4 w-4" />
            {formatTime(timeRemaining)}
          </div>
        )}
      </div>

      {/* Question */}
      <div>
        <p className="text-lg font-medium mb-4">{question.question}</p>
        
        {/* Code Snippet */}
        <div className="relative rounded-lg overflow-hidden border border-border">
          <div className="flex items-center justify-between px-3 py-2 bg-muted/50 border-b border-border">
            <span className="text-xs font-medium text-muted-foreground uppercase">
              {question.language}
            </span>
          </div>
          <pre className="p-4 overflow-x-auto bg-muted/30">
            <code 
              className="text-sm font-mono"
              dangerouslySetInnerHTML={{ __html: highlightedCode }}
            />
          </pre>
        </div>
      </div>

      {/* Answer Input */}
      {!result && (
        <div className="space-y-2">
          <label className="text-sm font-medium">
            {question.type === 'output_prediction' ? 'Enter the expected output:' : 'Enter your code solution:'}
          </label>
          <Textarea
            value={userAnswer}
            onChange={(e) => setUserAnswer(e.target.value)}
            placeholder={question.type === 'output_prediction' 
              ? 'What will this code print/return?' 
              : '// Write your solution here...'}
            className="font-mono text-sm min-h-[100px]"
            spellCheck={false}
          />
        </div>
      )}

      {/* Hints */}
      {!result && question.hints.length > 0 && (
        <div>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleShowHint}
            disabled={hintIndex >= question.hints.length}
            className="gap-2 text-muted-foreground"
          >
            <Lightbulb className="h-4 w-4" />
            {hintIndex === 0 ? 'Show Hint' : `Show Another Hint (${question.hints.length - hintIndex} left)`}
          </Button>
          {showHint && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="mt-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-sm"
            >
              {question.hints.slice(0, hintIndex).map((hint, i) => (
                <p key={i} className="mb-1">💡 Hint {i + 1}: {hint}</p>
              ))}
            </motion.div>
          )}
        </div>
      )}

      {/* Result */}
      {result && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn(
            "p-4 rounded-lg",
            result.isCorrect ? "bg-green-500/10 border border-green-500/30" : "bg-red-500/10 border border-red-500/30"
          )}
        >
          <div className="flex items-center gap-2 mb-2">
            {result.isCorrect ? (
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            ) : (
              <XCircle className="h-5 w-5 text-red-500" />
            )}
            <span className="font-semibold">
              {result.isCorrect ? 'Correct!' : 'Not Quite'}
            </span>
          </div>
          <p className="text-sm text-muted-foreground mb-3">{result.feedback}</p>
          
          {/* Explanation */}
          <div className="mt-3 pt-3 border-t border-border">
            <p className="text-sm font-medium mb-1">Explanation:</p>
            <p className="text-sm text-muted-foreground">{question.explanation}</p>
          </div>
        </motion.div>
      )}

      {/* Actions */}
      {!result && (
        <div className="flex justify-end">
          <Button 
            onClick={handleSubmit} 
            disabled={!userAnswer.trim()}
            className="gap-2"
          >
            <Play className="h-4 w-4" />
            Submit Answer
          </Button>
        </div>
      )}
    </Card>
  );
}
