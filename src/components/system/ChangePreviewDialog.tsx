/**
 * CONTRACT 2 — Change Preview Dialog
 * 
 * Rule 7: Before applying edits, the system MUST:
 * - Show a diff or preview
 * - Clearly indicate what will change
 * - Require user confirmation
 */

import { useState } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { 
  Eye, 
  Check, 
  X, 
  Plus, 
  Minus, 
  AlertTriangle,
  FileText,
  ArrowRight
} from "lucide-react";
import { generateContentDiff, type ContentDiff } from "@/lib/contentDeterminism";

export interface ChangePreviewResult {
  confirmed: boolean;
}

interface ChangePreviewDialogProps {
  open: boolean;
  onResult: (result: ChangePreviewResult) => void;
  originalContent: string;
  proposedContent: string;
  editDescription: string;
  chapterTitle?: string;
}

export function ChangePreviewDialog({
  open,
  onResult,
  originalContent,
  proposedContent,
  editDescription,
  chapterTitle = "Chapter",
}: ChangePreviewDialogProps) {
  const [view, setView] = useState<'diff' | 'before' | 'after'>('diff');
  
  const diff = generateContentDiff(originalContent, proposedContent);
  
  const handleConfirm = () => {
    onResult({ confirmed: true });
  };
  
  const handleCancel = () => {
    onResult({ confirmed: false });
  };

  return (
    <AlertDialog open={open}>
      <AlertDialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5 text-primary" />
            Review Changes Before Applying
          </AlertDialogTitle>
          <AlertDialogDescription>
            <span className="font-medium">{chapterTitle}</span> — {editDescription}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/* Change Summary */}
        <div className="flex items-center gap-3 py-2 border-b border-border/50">
          <Badge variant="outline" className="text-green-600 border-green-600/30">
            <Plus className="h-3 w-3 mr-1" />
            {diff.additions.length} additions
          </Badge>
          <Badge variant="outline" className="text-red-600 border-red-600/30">
            <Minus className="h-3 w-3 mr-1" />
            {diff.removals.length} removals
          </Badge>
          <Badge variant="outline">
            <FileText className="h-3 w-3 mr-1" />
            {diff.changeCount} lines affected
          </Badge>
        </div>

        {/* View Toggle */}
        <div className="flex gap-1 bg-muted/30 p-1 rounded-lg w-fit">
          <Button
            variant={view === 'diff' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setView('diff')}
          >
            Diff View
          </Button>
          <Button
            variant={view === 'before' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setView('before')}
          >
            Before
          </Button>
          <Button
            variant={view === 'after' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setView('after')}
          >
            After
          </Button>
        </div>

        {/* Content Preview */}
        <ScrollArea className="flex-1 min-h-[300px] max-h-[400px] border rounded-lg bg-muted/20">
          <div className="p-4 font-mono text-sm">
            {view === 'diff' && (
              <DiffView diff={diff} />
            )}
            {view === 'before' && (
              <pre className="whitespace-pre-wrap text-muted-foreground">
                {originalContent.slice(0, 3000)}
                {originalContent.length > 3000 && '\n\n... (truncated)'}
              </pre>
            )}
            {view === 'after' && (
              <pre className="whitespace-pre-wrap">
                {proposedContent.slice(0, 3000)}
                {proposedContent.length > 3000 && '\n\n... (truncated)'}
              </pre>
            )}
          </div>
        </ScrollArea>

        {/* Warning */}
        {diff.isSignificant && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
            <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-muted-foreground">
              This is a significant change. Please review carefully before confirming.
            </p>
          </div>
        )}

        <AlertDialogFooter className="gap-2">
          <Button variant="outline" onClick={handleCancel}>
            <X className="h-4 w-4 mr-1" />
            Cancel
          </Button>
          <Button onClick={handleConfirm}>
            <Check className="h-4 w-4 mr-1" />
            Apply Changes
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function DiffView({ diff }: { diff: ContentDiff }) {
  if (diff.additions.length === 0 && diff.removals.length === 0) {
    return (
      <p className="text-muted-foreground italic">
        No significant line-by-line changes detected. 
        Content may have been reformatted or had minor edits.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {diff.removals.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-red-600 mb-2">Removed:</p>
          {diff.removals.slice(0, 15).map((line, i) => (
            <div key={`rem-${i}`} className="bg-red-500/10 border-l-2 border-red-500 pl-2 py-0.5">
              <span className="text-red-600">- </span>
              <span className="text-muted-foreground line-through">{line}</span>
            </div>
          ))}
          {diff.removals.length > 15 && (
            <p className="text-xs text-muted-foreground italic">
              ... and {diff.removals.length - 15} more removals
            </p>
          )}
        </div>
      )}

      {diff.additions.length > 0 && (
        <div className="space-y-1">
          <p className="text-xs font-medium text-green-600 mb-2">Added:</p>
          {diff.additions.slice(0, 15).map((line, i) => (
            <div key={`add-${i}`} className="bg-green-500/10 border-l-2 border-green-500 pl-2 py-0.5">
              <span className="text-green-600">+ </span>
              <span>{line}</span>
            </div>
          ))}
          {diff.additions.length > 15 && (
            <p className="text-xs text-muted-foreground italic">
              ... and {diff.additions.length - 15} more additions
            </p>
          )}
        </div>
      )}
    </div>
  );
}
