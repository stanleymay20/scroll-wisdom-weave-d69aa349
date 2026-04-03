/**
 * Socratic AI Tutor
 * 
 * Detects when learners are stuck and switches from direct answers 
 * to guided Socratic questioning with misconception repair.
 */

import { useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Brain,
  MessageCircle,
  Send,
  Loader2,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Lightbulb,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface SocraticMessage {
  role: 'tutor' | 'learner';
  content: string;
  type?: 'question' | 'guidance' | 'correction' | 'encouragement';
}

interface StudyPlanItem {
  area: string;
  action: string;
  priority: 'high' | 'medium' | 'low';
}

interface SocraticTutorProps {
  chapterContent: string;
  chapterTitle: string;
  bookTitle: string;
  bookId: string;
  /** Whether learner is detected as stuck by adaptive engine */
  isSocraticCandidate: boolean;
  /** Weak concepts from knowledge graph */
  weakConcepts?: string[];
  /** Recent quiz score for context */
  recentScore?: number;
  /** Misconception flags from learner concept states */
  misconceptions?: string[];
  onStudyPlanGenerated?: (plan: StudyPlanItem[]) => void;
}

export function SocraticTutor({
  chapterContent,
  chapterTitle,
  bookTitle,
  bookId,
  isSocraticCandidate,
  weakConcepts = [],
  recentScore,
  misconceptions = [],
  onStudyPlanGenerated,
}: SocraticTutorProps) {
  const { toast } = useToast();
  const [messages, setMessages] = useState<SocraticMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [studyPlan, setStudyPlan] = useState<StudyPlanItem[] | null>(null);
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);

  const startSocraticDialogue = useCallback(async () => {
    setIsLoading(true);
    try {
      const misconceptionContext = misconceptions.length > 0
        ? `Known misconceptions: ${misconceptions.join(', ')}. Address these gently.`
        : '';
      const weakContext = weakConcepts.length > 0
        ? `Weak areas: ${weakConcepts.join(', ')}. Focus questioning here.`
        : '';

      const { data, error } = await supabase.functions.invoke('interactive-qa', {
        body: {
          question: `You are a Socratic tutor. The student is studying "${chapterTitle}" from "${bookTitle}".
${recentScore !== undefined ? `Their recent quiz score was ${recentScore}%.` : ''}
${misconceptionContext}
${weakContext}

Start a Socratic dialogue. Ask ONE thought-provoking question that:
1. Targets their weakest area
2. Requires them to think deeply, not just recall
3. Builds toward understanding step by step

Do NOT give the answer. Guide them to discover it.
Keep your question under 3 sentences.`,
          chapterContent: chapterContent.slice(0, 4000),
          bookTitle,
          mode: 'evaluate',
        },
      });

      if (error) throw error;
      const responseText = data?.answer || data?.response || '';
      setMessages([{ role: 'tutor', content: responseText, type: 'question' }]);
    } catch (e) {
      console.error('[SocraticTutor] Error:', e);
      toast({ title: 'Could not start tutoring session', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [chapterContent, chapterTitle, bookTitle, recentScore, misconceptions, weakConcepts, toast]);

  const sendResponse = useCallback(async () => {
    if (!input.trim() || isLoading) return;

    const learnerMsg: SocraticMessage = { role: 'learner', content: input.trim() };
    const newMessages = [...messages, learnerMsg];
    setMessages(newMessages);
    setInput('');
    setIsLoading(true);

    try {
      const conversationHistory = newMessages.map(m => `${m.role === 'tutor' ? 'Tutor' : 'Student'}: ${m.content}`).join('\n');

      const { data, error } = await supabase.functions.invoke('interactive-qa', {
        body: {
          question: `You are a Socratic tutor. Continue this dialogue about "${chapterTitle}".

Previous conversation:
${conversationHistory}

Rules:
1. If the student's answer shows a MISCONCEPTION, gently correct it and explain why
2. If partially correct, acknowledge what's right and ask a follow-up to deepen understanding
3. If correct, praise briefly and escalate to a harder question
4. Never give long lectures — keep responses under 4 sentences
5. Always end with a question unless the student has fully mastered the concept

Tag your response type: [QUESTION], [CORRECTION], [GUIDANCE], or [ENCOURAGEMENT]`,
          chapterContent: chapterContent.slice(0, 3000),
          bookTitle,
          mode: 'evaluate',
        },
      });

      if (error) throw error;
      const responseText = data?.answer || data?.response || '';
      
      // Detect response type
      let type: SocraticMessage['type'] = 'question';
      if (responseText.includes('[CORRECTION]')) type = 'correction';
      else if (responseText.includes('[GUIDANCE]')) type = 'guidance';
      else if (responseText.includes('[ENCOURAGEMENT]')) type = 'encouragement';

      const cleanedText = responseText
        .replace(/\[(QUESTION|CORRECTION|GUIDANCE|ENCOURAGEMENT)\]/g, '')
        .trim();

      setMessages(prev => [...prev, { role: 'tutor', content: cleanedText, type }]);
    } catch (e) {
      console.error('[SocraticTutor] Error:', e);
    } finally {
      setIsLoading(false);
    }
  }, [input, messages, chapterContent, chapterTitle, bookTitle, isLoading]);

  const generateStudyPlan = useCallback(async () => {
    setIsGeneratingPlan(true);
    try {
      const conversationContext = messages.map(m => `${m.role}: ${m.content}`).join('\n');
      
      const { data, error } = await supabase.functions.invoke('interactive-qa', {
        body: {
          question: `Based on this tutoring session about "${chapterTitle}", create a personalized 3-point study plan.

Conversation:
${conversationContext}

${weakConcepts.length > 0 ? `Known weak areas: ${weakConcepts.join(', ')}` : ''}
${misconceptions.length > 0 ? `Misconceptions identified: ${misconceptions.join(', ')}` : ''}

Return JSON array: [
  { "area": "topic", "action": "specific actionable task", "priority": "high/medium/low" }
]`,
          chapterContent: chapterContent.slice(0, 2000),
          bookTitle,
          mode: 'evaluate',
        },
      });

      if (error) throw error;
      const responseText = data?.answer || data?.response || '';
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const plan = JSON.parse(jsonMatch[0]);
        setStudyPlan(plan);
        onStudyPlanGenerated?.(plan);
      }
    } catch (e) {
      console.error('[SocraticTutor] Plan generation failed:', e);
      toast({ title: 'Could not generate study plan', variant: 'destructive' });
    } finally {
      setIsGeneratingPlan(false);
    }
  }, [messages, chapterTitle, chapterContent, bookTitle, weakConcepts, misconceptions, toast, onStudyPlanGenerated]);

  const getTypeIcon = (type?: string) => {
    switch (type) {
      case 'correction': return <AlertTriangle className="h-3 w-3 text-amber-500" />;
      case 'encouragement': return <CheckCircle2 className="h-3 w-3 text-emerald-500" />;
      case 'guidance': return <Lightbulb className="h-3 w-3 text-blue-500" />;
      default: return <MessageCircle className="h-3 w-3 text-primary" />;
    }
  };

  if (messages.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border border-border/50 bg-card/80 backdrop-blur-sm p-5 space-y-4"
      >
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-violet-500/10">
            <Brain className="h-5 w-5 text-violet-500" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">AI Socratic Tutor</h3>
            <p className="text-xs text-muted-foreground">
              {isSocraticCandidate
                ? 'Looks like you need some guidance. Let me help you think through this.'
                : 'Practice critical thinking through guided dialogue.'}
            </p>
          </div>
        </div>

        {misconceptions.length > 0 && (
          <div className="bg-amber-500/5 border border-amber-500/20 rounded-lg p-2.5">
            <p className="text-xs font-medium text-amber-600 mb-1">⚠️ Misconceptions detected</p>
            <p className="text-xs text-muted-foreground">{misconceptions.slice(0, 2).join('; ')}</p>
          </div>
        )}

        <Button onClick={startSocraticDialogue} disabled={isLoading} className="w-full gap-2">
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
          Start Socratic Dialogue
        </Button>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-border/50 bg-card/80 backdrop-blur-sm overflow-hidden"
    >
      <div className="p-3 border-b border-border/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-violet-500" />
          <span className="font-semibold text-sm">Socratic Tutor</span>
        </div>
        <Badge variant="outline" className="text-xs">
          {messages.filter(m => m.role === 'learner').length} exchanges
        </Badge>
      </div>

      <ScrollArea className="max-h-80 p-3 space-y-3">
        {messages.map((msg, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className={cn(
              "flex gap-2 mb-3",
              msg.role === 'learner' && "justify-end"
            )}
          >
            {msg.role === 'tutor' && (
              <div className="flex-shrink-0 pt-1">{getTypeIcon(msg.type)}</div>
            )}
            <div className={cn(
              "max-w-[85%] rounded-lg px-3 py-2 text-sm",
              msg.role === 'tutor' ? "bg-muted/50" : "bg-primary/10 text-foreground"
            )}>
              {msg.content}
            </div>
          </motion.div>
        ))}
        {isLoading && (
          <div className="flex gap-2">
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Thinking...</span>
          </div>
        )}
      </ScrollArea>

      <div className="p-3 border-t border-border/50 space-y-2">
        <div className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Your response..."
            rows={2}
            className="resize-none text-sm"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendResponse();
              }
            }}
          />
          <Button size="icon" onClick={sendResponse} disabled={isLoading || !input.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </div>

        {messages.length >= 4 && !studyPlan && (
          <Button
            variant="outline"
            size="sm"
            onClick={generateStudyPlan}
            disabled={isGeneratingPlan}
            className="w-full gap-2 text-xs"
          >
            {isGeneratingPlan ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
            Generate Study Plan from This Session
          </Button>
        )}

        {studyPlan && (
          <div className="bg-primary/5 rounded-lg p-3 space-y-2">
            <p className="text-xs font-medium">📋 Your Study Plan</p>
            {studyPlan.map((item, i) => (
              <div key={i} className="flex items-start gap-2">
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[9px] mt-0.5 shrink-0",
                    item.priority === 'high' && "border-red-300 text-red-600",
                    item.priority === 'medium' && "border-amber-300 text-amber-600",
                    item.priority === 'low' && "border-emerald-300 text-emerald-600",
                  )}
                >
                  {item.priority}
                </Badge>
                <div>
                  <p className="text-xs font-medium">{item.area}</p>
                  <p className="text-[10px] text-muted-foreground">{item.action}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
