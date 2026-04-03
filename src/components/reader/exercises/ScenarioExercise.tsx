/**
 * Scenario-Based Exercise Component
 * 
 * Presents real-world scenarios requiring multi-step analysis
 * targeting Bloom's Apply/Analyze levels.
 */

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Lightbulb,
  Send,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
  RotateCcw,
  Target,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface ScenarioStep {
  instruction: string;
  hint?: string;
}

interface Scenario {
  title: string;
  context: string;
  steps: ScenarioStep[];
  bloomLevel: string;
  difficulty: number;
}

interface EvaluationResult {
  score: number;
  feedback: string;
  strengths: string[];
  improvements: string[];
}

interface ScenarioExerciseProps {
  chapterContent: string;
  chapterTitle: string;
  bookTitle: string;
  bookId: string;
  chapterId?: string;
  onComplete?: (score: number) => void;
}

export function ScenarioExercise({
  chapterContent,
  chapterTitle,
  bookTitle,
  bookId,
  chapterId,
  onComplete,
}: ScenarioExerciseProps) {
  const { toast } = useToast();
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [responses, setResponses] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evaluation, setEvaluation] = useState<EvaluationResult | null>(null);
  const [showHint, setShowHint] = useState(false);

  const generateScenario = useCallback(async () => {
    setIsGenerating(true);
    setScenario(null);
    setCurrentStep(0);
    setResponses([]);
    setEvaluation(null);
    
    try {
      const { data, error } = await supabase.functions.invoke('interactive-qa', {
        body: {
          question: `Generate a real-world scenario exercise for the chapter "${chapterTitle}" from "${bookTitle}". 
The scenario must require multi-step analysis at Bloom's Apply/Analyze level.

Return JSON: {
  "title": "scenario title",
  "context": "2-3 sentence real-world context setting",
  "steps": [
    { "instruction": "step 1 instruction", "hint": "optional hint" },
    { "instruction": "step 2 instruction", "hint": "optional hint" },
    { "instruction": "step 3 instruction", "hint": "optional hint" }
  ],
  "bloomLevel": "apply" or "analyze",
  "difficulty": 3
}

Chapter content (first 3000 chars): ${chapterContent.slice(0, 3000)}`,
          chapterContent: chapterContent.slice(0, 3000),
          bookTitle,
          mode: 'evaluate',
        },
      });

      if (error) throw error;

      const responseText = data?.answer || data?.response || '';
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        setScenario(parsed);
        setResponses(new Array(parsed.steps?.length || 3).fill(''));
      } else {
        throw new Error('Failed to parse scenario');
      }
    } catch (e) {
      console.error('[ScenarioExercise] Generation failed:', e);
      toast({ title: 'Generation failed', description: 'Could not create scenario. Try again.', variant: 'destructive' });
    } finally {
      setIsGenerating(false);
    }
  }, [chapterContent, chapterTitle, bookTitle, toast]);

  const handleSubmitStep = useCallback(() => {
    if (responses[currentStep].trim().length < 30) {
      toast({ title: 'Too short', description: 'Please write at least 30 characters.' });
      return;
    }
    if (scenario && currentStep < scenario.steps.length - 1) {
      setCurrentStep(prev => prev + 1);
      setShowHint(false);
    }
  }, [currentStep, responses, scenario, toast]);

  const handleFinalSubmit = useCallback(async () => {
    if (!scenario) return;
    setIsEvaluating(true);

    try {
      const combined = responses.map((r, i) => `Step ${i + 1}: ${r}`).join('\n\n');
      const { data, error } = await supabase.functions.invoke('interactive-qa', {
        body: {
          question: `Evaluate this multi-step scenario response for "${chapterTitle}".

Scenario: ${scenario.context}
Steps: ${scenario.steps.map(s => s.instruction).join(' | ')}

Student responses:
${combined}

Rate 0-100. Return JSON: { "score": number, "feedback": "string", "strengths": ["..."], "improvements": ["..."] }`,
          chapterContent: chapterContent.slice(0, 2000),
          bookTitle,
          mode: 'evaluate',
        },
      });

      if (error) throw error;

      const responseText = data?.answer || data?.response || '';
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const result = JSON.parse(jsonMatch[0]);
        setEvaluation(result);
        onComplete?.(result.score);
      }
    } catch (e) {
      console.error('[ScenarioExercise] Evaluation failed:', e);
      toast({ title: 'Evaluation failed', variant: 'destructive' });
    } finally {
      setIsEvaluating(false);
    }
  }, [scenario, responses, chapterContent, chapterTitle, bookTitle, toast, onComplete]);

  if (!scenario && !isGenerating) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border border-border/50 bg-card/80 backdrop-blur-sm p-5 text-center space-y-4"
      >
        <div className="inline-flex p-3 rounded-full bg-amber-500/10">
          <Lightbulb className="h-8 w-8 text-amber-500" />
        </div>
        <h3 className="text-lg font-semibold">Scenario-Based Exercise</h3>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Apply chapter concepts to a real-world scenario with multi-step analysis. 
          Tests Apply & Analyze on Bloom's Taxonomy.
        </p>
        <Button onClick={generateScenario} className="gap-2">
          <Target className="h-4 w-4" />
          Generate Scenario
        </Button>
      </motion.div>
    );
  }

  if (isGenerating) {
    return (
      <div className="rounded-xl border border-border/50 bg-card/80 p-8 text-center">
        <Loader2 className="h-8 w-8 animate-spin mx-auto mb-3 text-primary" />
        <p className="text-sm text-muted-foreground">Crafting a real-world scenario...</p>
      </div>
    );
  }

  if (!scenario) return null;

  const stepProgress = ((currentStep + 1) / scenario.steps.length) * 100;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-border/50 bg-card/80 backdrop-blur-sm overflow-hidden"
    >
      {/* Header */}
      <div className="p-4 border-b border-border/50">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-amber-500" />
            <span className="font-semibold text-sm">{scenario.title}</span>
          </div>
          <Badge variant="outline" className="text-xs capitalize">
            {scenario.bloomLevel}
          </Badge>
        </div>
        <Progress value={evaluation ? 100 : stepProgress} className="h-1" />
      </div>

      <div className="p-4 space-y-4">
        {/* Context */}
        <div className="bg-muted/30 rounded-lg p-3 text-sm text-muted-foreground">
          <p className="font-medium text-foreground mb-1">📋 Scenario:</p>
          {scenario.context}
        </div>

        <AnimatePresence mode="wait">
          {!evaluation ? (
            <motion.div key={`step-${currentStep}`} initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Badge className="bg-primary/10 text-primary border-primary/20 text-xs">
                    Step {currentStep + 1} of {scenario.steps.length}
                  </Badge>
                </div>
                <p className="text-sm font-medium">{scenario.steps[currentStep].instruction}</p>
                
                {showHint && scenario.steps[currentStep].hint && (
                  <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-2 text-xs text-amber-600">
                    💡 {scenario.steps[currentStep].hint}
                  </div>
                )}

                <Textarea
                  value={responses[currentStep]}
                  onChange={(e) => {
                    const updated = [...responses];
                    updated[currentStep] = e.target.value;
                    setResponses(updated);
                  }}
                  placeholder="Describe your analysis..."
                  rows={4}
                  className="resize-none"
                />

                <div className="flex items-center justify-between">
                  <div className="flex gap-2">
                    {scenario.steps[currentStep].hint && !showHint && (
                      <Button variant="ghost" size="sm" onClick={() => setShowHint(true)} className="text-xs">
                        Need a hint?
                      </Button>
                    )}
                  </div>
                  {currentStep < scenario.steps.length - 1 ? (
                    <Button onClick={handleSubmitStep} disabled={responses[currentStep].length < 30} className="gap-1">
                      Next Step <ChevronRight className="h-4 w-4" />
                    </Button>
                  ) : (
                    <Button onClick={handleFinalSubmit} disabled={isEvaluating || responses[currentStep].length < 30} className="gap-1">
                      {isEvaluating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      Submit Analysis
                    </Button>
                  )}
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div key="result" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
              <div className="space-y-4">
                <div className="text-center">
                  <div className={cn(
                    "inline-flex p-3 rounded-full mb-2",
                    evaluation.score >= 70 ? "bg-emerald-500/10" : "bg-amber-500/10"
                  )}>
                    {evaluation.score >= 70 ? (
                      <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                    ) : (
                      <AlertTriangle className="h-8 w-8 text-amber-500" />
                    )}
                  </div>
                  <p className="text-2xl font-bold">{evaluation.score}/100</p>
                  <p className="text-sm text-muted-foreground">{evaluation.feedback}</p>
                </div>

                {evaluation.strengths?.length > 0 && (
                  <div className="bg-emerald-500/5 rounded-lg p-3">
                    <p className="text-xs font-medium text-emerald-600 mb-1">✅ Strengths</p>
                    <ul className="text-xs text-muted-foreground space-y-1">
                      {evaluation.strengths.map((s, i) => <li key={i}>• {s}</li>)}
                    </ul>
                  </div>
                )}

                {evaluation.improvements?.length > 0 && (
                  <div className="bg-amber-500/5 rounded-lg p-3">
                    <p className="text-xs font-medium text-amber-600 mb-1">📈 Improvements</p>
                    <ul className="text-xs text-muted-foreground space-y-1">
                      {evaluation.improvements.map((s, i) => <li key={i}>• {s}</li>)}
                    </ul>
                  </div>
                )}

                <Button onClick={generateScenario} variant="outline" className="w-full gap-2">
                  <RotateCcw className="h-4 w-4" />
                  Try Another Scenario
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
