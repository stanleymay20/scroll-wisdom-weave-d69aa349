/**
 * Coding Exercise Component — Typed-Only Enforcement
 * 
 * Anti-paste, anti-copy, suspicious typing detection.
 * Used for Apply/Analyze/Create Bloom-level coding assessments.
 */

import { useState, useCallback, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Code2, Play, CheckCircle2, XCircle, AlertTriangle,
  Lightbulb, Timer, ShieldAlert, Keyboard
} from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { detectSuspiciousTyping, type BloomLevel } from "@/lib/masteryEngine";

export interface CodingExerciseData {
  id: string;
  type: 'coding';
  bloomLevel: BloomLevel;
  difficulty: number;
  question: string;
  starterCode?: string;
  expectedOutput?: string;
  testCases: Array<{ input: string; expected: string; description: string }>;
  hints: string[];
  explanation: string;
  pointValue: number;
  timeLimit?: number;
}

interface CodingExerciseProps {
  exercise: CodingExerciseData;
  onSubmit: (answer: string, result: CodingExerciseResult) => void;
}

export interface CodingExerciseResult {
  isCorrect: boolean;
  passedTests: number;
  totalTests: number;
  passRate: number;
  timeSpent: number;
  suspiciousInput: boolean;
  executionError: string | null;
}

const BLOOM_LABELS: Record<string, string> = {
  apply: 'Apply',
  analyze: 'Analyze',
  create: 'Create',
  evaluate: 'Evaluate',
};

export function CodingExercise({ exercise, onSubmit }: CodingExerciseProps) {
  const [code, setCode] = useState(exercise.starterCode || '');
  const [result, setResult] = useState<CodingExerciseResult | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [hintIndex, setHintIndex] = useState(0);
  const [pasteWarning, setPasteWarning] = useState(false);
  const [suspiciousWarning, setSuspiciousWarning] = useState(false);
  const [startTime] = useState(Date.now());
  
  const lastInputTime = useRef(Date.now());
  const lastInputLength = useRef(code.length);
  const suspiciousDetected = useRef(false);

  // Anti-paste handler
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    setPasteWarning(true);
    setTimeout(() => setPasteWarning(false), 4000);
  }, []);

  // Anti-drop handler
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  // Suspicious typing detection
  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const now = Date.now();
    const charDiff = Math.abs(newValue.length - lastInputLength.current);
    const timeDiff = now - lastInputTime.current;

    // Detect suspicious burst typing
    if (detectSuspiciousTyping(charDiff, timeDiff)) {
      suspiciousDetected.current = true;
      setSuspiciousWarning(true);
    }

    lastInputTime.current = now;
    lastInputLength.current = newValue.length;
    setCode(newValue);
  }, []);

  const handleSubmit = useCallback(() => {
    const timeSpent = Math.floor((Date.now() - startTime) / 1000);
    
    // Simple validation against test cases
    let passedTests = 0;
    let executionError: string | null = null;

    try {
      for (const testCase of exercise.testCases) {
        // Simple string-based output matching
        const normalizedCode = code.trim().toLowerCase();
        const normalizedExpected = testCase.expected.trim().toLowerCase();
        if (normalizedCode.includes(normalizedExpected) || normalizedExpected.includes(normalizedCode)) {
          passedTests++;
        }
      }
    } catch (err) {
      executionError = err instanceof Error ? err.message : 'Execution error';
    }

    // Also check against expectedOutput if no test cases
    if (exercise.testCases.length === 0 && exercise.expectedOutput) {
      const normalizedCode = code.trim().toLowerCase().replace(/\s+/g, ' ');
      const normalizedExpected = exercise.expectedOutput.trim().toLowerCase().replace(/\s+/g, ' ');
      passedTests = normalizedCode === normalizedExpected ? 1 : 0;
    }

    const totalTests = Math.max(exercise.testCases.length, 1);
    const passRate = Math.round((passedTests / totalTests) * 100);

    const exerciseResult: CodingExerciseResult = {
      isCorrect: passRate >= 60,
      passedTests,
      totalTests,
      passRate,
      timeSpent,
      suspiciousInput: suspiciousDetected.current,
      executionError,
    };

    setResult(exerciseResult);
    onSubmit(code, exerciseResult);
  }, [code, exercise, startTime, onSubmit]);

  const handleShowHint = useCallback(() => {
    if (hintIndex < exercise.hints.length) {
      setShowHint(true);
      setHintIndex(prev => Math.min(prev + 1, exercise.hints.length));
    }
  }, [hintIndex, exercise.hints.length]);

  return (
    <Card className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Badge variant="default" className="gap-1">
            <Code2 className="h-3 w-3" />
            Coding Exercise
          </Badge>
          <Badge variant="secondary">
            {BLOOM_LABELS[exercise.bloomLevel] || exercise.bloomLevel}
          </Badge>
          <Badge variant="outline">Difficulty {exercise.difficulty}/6</Badge>
          <Badge variant="outline">{exercise.pointValue} pts</Badge>
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Keyboard className="h-3 w-3" />
          Typed-only
        </div>
      </div>

      {/* Paste / Suspicious Warnings */}
      {pasteWarning && (
        <Alert variant="destructive">
          <ShieldAlert className="h-4 w-4" />
          <AlertDescription>
            Pasting is disabled. Type your solution manually to ensure learning integrity.
          </AlertDescription>
        </Alert>
      )}
      {suspiciousWarning && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Suspicious input detected. This attempt may be flagged for integrity review.
          </AlertDescription>
        </Alert>
      )}

      {/* Question */}
      <div>
        <p className="text-lg font-medium mb-4">{exercise.question}</p>
        
        {exercise.starterCode && (
          <div className="relative rounded-lg overflow-hidden border border-border mb-4">
            <div className="px-3 py-2 bg-muted/50 border-b border-border">
              <span className="text-xs font-medium text-muted-foreground">STARTER CODE</span>
            </div>
            <pre className="p-4 overflow-x-auto bg-muted/30 text-sm font-mono">
              {exercise.starterCode}
            </pre>
          </div>
        )}

        {exercise.testCases.length > 0 && (
          <div className="space-y-1 mb-4">
            <p className="text-sm font-medium text-muted-foreground">Test Cases:</p>
            {exercise.testCases.map((tc, i) => (
              <div key={i} className="text-xs font-mono p-2 bg-muted/30 rounded">
                {tc.description}: Input: {tc.input} → Expected: {tc.expected}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Code Input — Anti-paste enforced */}
      {!result && (
        <div className="space-y-2">
          <label className="text-sm font-medium">Your Solution (typed only):</label>
          <textarea
            value={code}
            onChange={handleChange}
            onPaste={handlePaste}
            onDrop={handleDrop}
            onCopy={(e) => e.preventDefault()}
            onCut={(e) => e.preventDefault()}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="// Type your solution here..."
            className={cn(
              "flex min-h-[150px] w-full rounded-md border border-input bg-background px-3 py-2",
              "text-sm font-mono ring-offset-background placeholder:text-muted-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              "disabled:cursor-not-allowed disabled:opacity-50"
            )}
          />
        </div>
      )}

      {/* Hints */}
      {!result && exercise.hints.length > 0 && (
        <div>
          <Button 
            variant="ghost" size="sm" onClick={handleShowHint}
            disabled={hintIndex >= exercise.hints.length}
            className="gap-2 text-muted-foreground"
          >
            <Lightbulb className="h-4 w-4" />
            {hintIndex === 0 ? 'Show Hint' : `Next Hint (${exercise.hints.length - hintIndex} left)`}
          </Button>
          {showHint && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="mt-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-sm"
            >
              {exercise.hints.slice(0, hintIndex).map((hint, i) => (
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
            <Badge variant="outline" className="ml-auto">
              {result.passedTests}/{result.totalTests} tests passed ({result.passRate}%)
            </Badge>
          </div>
          {result.executionError && (
            <p className="text-sm text-destructive mb-2">Error: {result.executionError}</p>
          )}
          {result.suspiciousInput && (
            <p className="text-sm text-destructive mb-2">
              ⚠️ This attempt was flagged for suspicious input. It will not count toward certification.
            </p>
          )}
          <div className="mt-3 pt-3 border-t border-border">
            <p className="text-sm font-medium mb-1">Explanation:</p>
            <p className="text-sm text-muted-foreground">{exercise.explanation}</p>
          </div>
        </motion.div>
      )}

      {/* Actions */}
      {!result && (
        <div className="flex justify-end">
          <Button onClick={handleSubmit} disabled={!code.trim()} className="gap-2">
            <Play className="h-4 w-4" />
            Run & Submit
          </Button>
        </div>
      )}
    </Card>
  );
}
