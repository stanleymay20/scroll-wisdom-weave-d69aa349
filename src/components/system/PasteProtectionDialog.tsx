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
import { Lock, RefreshCw, PenLine } from "lucide-react";

export interface PasteProtectionResult {
  action: 'lock' | 'allow_regen' | 'cancel';
}

interface PasteProtectionDialogProps {
  open: boolean;
  onResult: (result: PasteProtectionResult) => void;
  contentPreview?: string;
}

export function PasteProtectionDialog({
  open,
  onResult,
  contentPreview,
}: PasteProtectionDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAction = (action: PasteProtectionResult['action']) => {
    setIsSubmitting(true);
    onResult({ action });
    setIsSubmitting(false);
  };

  return (
    <AlertDialog open={open}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <PenLine className="h-5 w-5 text-primary" />
            Content Change Detected
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-3">
            <p>
              You've pasted or edited content in this chapter. How should we treat this content?
            </p>
            
            {contentPreview && (
              <div className="bg-muted/50 p-3 rounded-lg text-xs max-h-24 overflow-hidden">
                <p className="text-muted-foreground italic line-clamp-3">
                  "{contentPreview.slice(0, 200)}..."
                </p>
              </div>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2 py-4">
          <Button
            variant="outline"
            className="w-full justify-start gap-3 h-auto p-4"
            onClick={() => handleAction('lock')}
            disabled={isSubmitting}
          >
            <Lock className="h-5 w-5 text-amber-500 flex-shrink-0" />
            <div className="text-left">
              <p className="font-medium">This is my writing</p>
              <p className="text-xs text-muted-foreground">
                Lock chapter to prevent regeneration. Only targeted edits allowed.
              </p>
            </div>
          </Button>

          <Button
            variant="outline"
            className="w-full justify-start gap-3 h-auto p-4"
            onClick={() => handleAction('allow_regen')}
            disabled={isSubmitting}
          >
            <RefreshCw className="h-5 w-5 text-blue-500 flex-shrink-0" />
            <div className="text-left">
              <p className="font-medium">Allow full regeneration</p>
              <p className="text-xs text-muted-foreground">
                This content can be regenerated or replaced by AI.
              </p>
            </div>
          </Button>
        </div>

        <AlertDialogFooter>
          <Button
            variant="ghost"
            onClick={() => handleAction('cancel')}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
