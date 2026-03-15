/**
 * useGraphDrivenQuestions — Client hook for graph-driven cross-chapter questions.
 * Fetches concept graph data, invokes the graph-driven-questions edge function,
 * and returns enriched questions with metadata.
 */

import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface GraphQuestionMeta {
  sourceConceptIds: string[];
  sourceChapters: number[];
  questionType: 'prerequisite_check' | 'comparison' | 'cross_chapter_synthesis' | 'dependency_reasoning' | 'misconception_repair';
  graphReason: string;
  isGraphDriven: true;
}

export interface GraphDrivenQuestion {
  bloomLevel: string;
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
  // Graph metadata
  sourceConceptIds: string[];
  sourceChapters: number[];
  graphReason: string;
  isGraphDriven: true;
}

export interface GraphQuestionResult {
  questions: GraphDrivenQuestion[];
  graphStats: {
    nodes: number;
    edges: number;
    weakConcepts: number;
  };
}

export function useGraphDrivenQuestions() {
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<GraphQuestionResult | null>(null);
  const { toast } = useToast();

  const generateGraphQuestions = useCallback(async (opts: {
    bookId: string;
    bookTitle?: string;
    bookType?: string;
    currentChapter?: number;
    questionCount?: number;
    chapterContent?: string;
  }): Promise<GraphQuestionResult | null> => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('graph-driven-questions', {
        body: {
          bookId: opts.bookId,
          bookTitle: opts.bookTitle || '',
          bookType: opts.bookType || 'text',
          currentChapter: opts.currentChapter,
          questionCount: opts.questionCount || 5,
          chapterContent: opts.chapterContent?.slice(0, 5000) || '',
        },
      });

      if (error) throw error;

      if (data?.error === 'insufficient_graph') {
        // Not enough graph data — caller should fall back to standard mastery-assessment
        return null;
      }

      const result: GraphQuestionResult = {
        questions: data?.questions || [],
        graphStats: data?.graphStats || { nodes: 0, edges: 0, weakConcepts: 0 },
      };

      setResult(result);
      return result;
    } catch (err: any) {
      console.error('[GraphQuestions] Failed:', err);
      // Silent fail — caller falls back to standard questions
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    generateGraphQuestions,
    isLoading,
    result,
  };
}
