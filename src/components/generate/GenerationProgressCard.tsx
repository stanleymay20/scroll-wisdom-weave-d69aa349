/**
 * GENERATION PROGRESS INDICATOR
 * 
 * Shows real-time progress of book generation with status, 
 * progress bar, and error recovery options.
 */

import { useGenerationProgress } from '@/hooks/useGenerationProgress';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, CheckCircle2, AlertTriangle, RefreshCw, BookOpen } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface GenerationProgressProps {
  bookId: string;
  onRetry?: () => void;
  className?: string;
}

export function GenerationProgressCard({ bookId, onRetry, className }: GenerationProgressProps) {
  const { job, isGenerating, isComplete, isFailed, progress } = useGenerationProgress(bookId);
  const navigate = useNavigate();

  if (!job) return null;

  return (
    <Card className={cn('border-primary/20', className)}>
      <CardContent className="pt-4 pb-4 space-y-3">
        {/* Status header */}
        <div className="flex items-center gap-2">
          {isGenerating && (
            <>
              <Loader2 className="h-4 w-4 animate-spin text-primary" />
              <span className="text-sm font-medium text-foreground">
                Generating chapter {job.currentChapter}/{job.totalChapters}...
              </span>
            </>
          )}
          {isComplete && (
            <>
              <CheckCircle2 className="h-4 w-4 text-green-500" />
              <span className="text-sm font-medium text-foreground">
                Book generated successfully!
              </span>
            </>
          )}
          {isFailed && (
            <>
              <AlertTriangle className="h-4 w-4 text-destructive" />
              <span className="text-sm font-medium text-foreground">
                Generation {job.status === 'partial' ? 'partially completed' : 'failed'}
              </span>
            </>
          )}
        </div>

        {/* Progress bar */}
        <Progress value={progress} className="h-2" />

        {/* Actions */}
        <div className="flex items-center gap-2">
          {isComplete && (
            <Button
              size="sm"
              variant="default"
              onClick={() => navigate(`/book/${bookId}`)}
              className="gap-1"
            >
              <BookOpen className="h-3 w-3" />
              Read Book
            </Button>
          )}
          {isFailed && onRetry && (
            <Button
              size="sm"
              variant="outline"
              onClick={onRetry}
              className="gap-1"
            >
              <RefreshCw className="h-3 w-3" />
              {job.status === 'partial' ? 'Resume' : 'Retry'}
            </Button>
          )}
          {isFailed && job.errorMessage && (
            <span className="text-xs text-muted-foreground truncate max-w-[200px]">
              {job.errorMessage}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
