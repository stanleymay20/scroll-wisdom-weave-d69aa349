/**
 * ChapterOneSummary — Summary-first orientation for Chapter 1
 * Shows a concise overview before the full chapter to reduce intimidation.
 * Experiment-controlled.
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BookOpen, Lightbulb, ArrowRight, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trackFunnelEvent } from "@/lib/readingFunnel";

interface ChapterOneSummaryProps {
  chapterTitle: string;
  chapterContent: string;
  bookTitle?: string;
  wordCount: number;
  onDismiss: () => void;
}

function extractKeyPoints(content: string): string[] {
  const points: string[] = [];
  const lines = content.split('\n');
  
  for (const line of lines) {
    const trimmed = line.trim();
    // Extract bold key points or blockquotes
    if (trimmed.startsWith('> ')) {
      const clean = trimmed.replace(/^>\s*/, '').replace(/\*\*/g, '').trim();
      if (clean.length > 20 && clean.length < 150) points.push(clean);
    }
    if (trimmed.startsWith('**') && trimmed.endsWith('**') && trimmed.length < 150) {
      points.push(trimmed.replace(/\*\*/g, '').trim());
    }
    if (points.length >= 3) break;
  }

  // Fallback: first meaningful paragraph
  if (points.length === 0) {
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length >= 50 && trimmed.length <= 200 && !trimmed.startsWith('#') && !trimmed.startsWith('-')) {
        points.push(trimmed.replace(/\*\*/g, ''));
        if (points.length >= 2) break;
      }
    }
  }

  return points;
}

function extractFirstHeadings(content: string): string[] {
  const headings: string[] = [];
  const lines = content.split('\n');
  for (const line of lines) {
    const match = line.match(/^#{2,3}\s+(.+)/);
    if (match) {
      headings.push(match[1].replace(/\*\*/g, '').trim());
      if (headings.length >= 4) break;
    }
  }
  return headings;
}

export function ChapterOneSummary({
  chapterTitle,
  chapterContent,
  bookTitle,
  wordCount,
  onDismiss,
}: ChapterOneSummaryProps) {
  const [dismissed, setDismissed] = useState(false);
  const readingMinutes = Math.max(1, Math.round(wordCount / 250));
  const keyPoints = extractKeyPoints(chapterContent);
  const headings = extractFirstHeadings(chapterContent);

  const handleStart = () => {
    setDismissed(true);
    trackFunnelEvent('chapter_started', { variant: 'summary_first', chapterNumber: 1 });
    setTimeout(onDismiss, 300);
  };

  if (dismissed) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className="mb-8 rounded-xl border border-border/50 bg-card/80 backdrop-blur-sm p-6 space-y-5"
      >
        {/* Header */}
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Lightbulb className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h4 className="font-semibold text-foreground">Before you start</h4>
            <p className="text-sm text-muted-foreground mt-0.5">
              Here's what Chapter 1 covers in ~{readingMinutes} minutes
            </p>
          </div>
        </div>

        {/* Key takeaway */}
        {keyPoints.length > 0 && (
          <div className="bg-primary/5 rounded-lg p-4 border-l-2 border-primary/30">
            <p className="text-sm font-medium text-foreground/90 mb-1">Key insight</p>
            <p className="text-sm text-foreground/80">{keyPoints[0]}</p>
          </div>
        )}

        {/* Chapter structure */}
        {headings.length > 0 && (
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              What you'll learn
            </p>
            <div className="space-y-1.5">
              {headings.map((h, i) => (
                <div key={i} className="flex items-center gap-2 text-sm text-foreground/80">
                  <span className="w-5 h-5 rounded-full bg-muted flex items-center justify-center text-[10px] font-semibold text-muted-foreground shrink-0">
                    {i + 1}
                  </span>
                  <span className="line-clamp-1">{h}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Reading time */}
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            ~{readingMinutes} min read
          </span>
          <span>{wordCount.toLocaleString()} words</span>
        </div>

        {/* CTA */}
        <Button
          onClick={handleStart}
          className="w-full gap-2"
          size="sm"
        >
          <BookOpen className="h-4 w-4" />
          Start reading
          <ArrowRight className="h-3 w-3" />
        </Button>
      </motion.div>
    </AnimatePresence>
  );
}
