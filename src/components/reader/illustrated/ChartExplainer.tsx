/**
 * CHART EXPLAINER COMPONENT
 * 
 * AI-powered explanation panel for charts and diagrams
 */

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Lightbulb, Loader2, BookOpen, TrendingUp, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import type { ChartExplainerProps } from './types';

interface ExplanationData {
  summary: string;
  keyInsights: string[];
  dataPoints?: { label: string; value: string; significance?: string }[];
  relatedConcepts?: string[];
  questions?: string[];
}

export function ChartExplainer({
  illustration,
  isOpen,
  onClose,
  chapterContent,
}: ChartExplainerProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [explanation, setExplanation] = useState<ExplanationData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && !explanation) {
      generateExplanation();
    }
  }, [isOpen]);

  const generateExplanation = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Simulate AI explanation generation
      // In production, this would call an edge function
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Mock explanation based on illustration type
      const mockExplanation = generateMockExplanation();
      setExplanation(mockExplanation);
    } catch (err) {
      setError('Failed to generate explanation. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const generateMockExplanation = (): ExplanationData => {
    if (illustration.type === 'chart') {
      return {
        summary: `This ${illustration.subType} chart visualizes the key data points related to ${illustration.caption || 'the topic'}. It helps you understand trends and patterns at a glance.`,
        keyInsights: [
          'The data shows a clear trend that supports the main concept',
          'Notice the relationship between variables highlighted here',
          'This visualization makes the abstract concept concrete',
        ],
        dataPoints: [
          { label: 'Primary Trend', value: 'Upward', significance: 'Indicates growth or improvement' },
          { label: 'Key Relationship', value: 'Positive correlation', significance: 'Variables move together' },
        ],
        relatedConcepts: ['Data analysis', 'Trend identification', 'Statistical significance'],
        questions: [
          'What does this trend suggest about future outcomes?',
          'How does this data support the main argument?',
        ],
      };
    }

    if (illustration.type === 'diagram') {
      return {
        summary: `This ${illustration.subType} diagram illustrates the structure and relationships within ${illustration.caption || 'the system'}. Follow the flow to understand how components interact.`,
        keyInsights: [
          'Each component plays a specific role in the overall system',
          'The connections show how information or processes flow',
          'Understanding this structure is key to mastering the concept',
        ],
        relatedConcepts: ['System design', 'Process flow', 'Component interaction'],
        questions: [
          'What would happen if one component failed?',
          'How could this system be optimized?',
        ],
      };
    }

    // Default for technical/illustration
    return {
      summary: `This visual supports your understanding of ${illustration.caption || 'the concept'}. It provides a concrete representation of abstract ideas.`,
      keyInsights: [
        'Visual learning helps reinforce textual concepts',
        'Pay attention to the details highlighted in this image',
        'Use this as a reference when reviewing the material',
      ],
      relatedConcepts: ['Visual learning', 'Concept reinforcement'],
      questions: [
        'How does this image relate to what you just read?',
        'Can you identify all the key elements?',
      ],
    };
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-background border-l border-border shadow-xl"
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border">
            <div className="flex items-center gap-2">
              <Lightbulb className="h-5 w-5 text-primary" />
              <h3 className="font-semibold">Explain This Visual</h3>
            </div>
            <Button
              size="icon"
              variant="ghost"
              onClick={onClose}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          <ScrollArea className="h-[calc(100vh-65px)]">
            <div className="p-4 space-y-6">
              {/* Visual Preview */}
              <div className="rounded-lg overflow-hidden bg-muted/30">
                <img
                  src={illustration.imageUrl}
                  alt={illustration.altText}
                  className="w-full h-auto object-contain max-h-48"
                />
              </div>

              {/* Caption & Type */}
              <div className="space-y-2">
                <Badge variant="outline" className="capitalize">
                  {illustration.type} • {illustration.subType}
                </Badge>
                {illustration.caption && (
                  <p className="text-sm text-muted-foreground">
                    {illustration.caption}
                  </p>
                )}
              </div>

              {/* Loading State */}
              {isLoading && (
                <div className="flex items-center justify-center py-12">
                  <div className="text-center space-y-3">
                    <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
                    <p className="text-sm text-muted-foreground">
                      Analyzing visual...
                    </p>
                  </div>
                </div>
              )}

              {/* Error State */}
              {error && (
                <div className="rounded-lg bg-destructive/10 p-4 text-center">
                  <AlertCircle className="h-6 w-6 mx-auto mb-2 text-destructive" />
                  <p className="text-sm text-destructive">{error}</p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={generateExplanation}
                    className="mt-3"
                  >
                    Try Again
                  </Button>
                </div>
              )}

              {/* Explanation Content */}
              {explanation && !isLoading && (
                <motion.div
                  className="space-y-6"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  {/* Summary */}
                  <div className="space-y-2">
                    <h4 className="font-medium flex items-center gap-2">
                      <BookOpen className="h-4 w-4" />
                      Summary
                    </h4>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                      {explanation.summary}
                    </p>
                  </div>

                  {/* Key Insights */}
                  <div className="space-y-2">
                    <h4 className="font-medium flex items-center gap-2">
                      <TrendingUp className="h-4 w-4" />
                      Key Insights
                    </h4>
                    <ul className="space-y-2">
                      {explanation.keyInsights.map((insight, i) => (
                        <li
                          key={i}
                          className="flex items-start gap-2 text-sm text-muted-foreground"
                        >
                          <span className="text-primary font-bold">•</span>
                          {insight}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Data Points (for charts) */}
                  {explanation.dataPoints && explanation.dataPoints.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="font-medium">📊 Data Points</h4>
                      <div className="space-y-2">
                        {explanation.dataPoints.map((point, i) => (
                          <div
                            key={i}
                            className="rounded-lg bg-muted/30 p-3"
                          >
                            <div className="flex items-center justify-between">
                              <span className="text-sm font-medium">{point.label}</span>
                              <Badge variant="secondary">{point.value}</Badge>
                            </div>
                            {point.significance && (
                              <p className="text-xs text-muted-foreground mt-1">
                                {point.significance}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Related Concepts */}
                  {explanation.relatedConcepts && (
                    <div className="space-y-2">
                      <h4 className="font-medium">🔗 Related Concepts</h4>
                      <div className="flex flex-wrap gap-2">
                        {explanation.relatedConcepts.map((concept, i) => (
                          <Badge key={i} variant="outline">
                            {concept}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Reflection Questions */}
                  {explanation.questions && (
                    <div className="space-y-2">
                      <h4 className="font-medium">🤔 Reflection Questions</h4>
                      <ul className="space-y-2">
                        {explanation.questions.map((question, i) => (
                          <li
                            key={i}
                            className="text-sm text-muted-foreground italic"
                          >
                            "{question}"
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </motion.div>
              )}

              {/* Learning Objective Link */}
              {illustration.learningObjective && (
                <div className="rounded-lg bg-primary/5 border border-primary/20 p-4">
                  <h4 className="font-medium text-primary text-sm mb-1">
                    🎯 Learning Objective
                  </h4>
                  <p className="text-sm text-muted-foreground">
                    {illustration.learningObjective}
                  </p>
                </div>
              )}
            </div>
          </ScrollArea>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default ChartExplainer;
