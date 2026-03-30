import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Lock, Wand2, Shield } from "lucide-react";
import { 
  RegenerationIntent, 
  RegenerationRequest, 
  ContentOwnership,
  validateRegenerationRequest 
} from "@/lib/systemDiagnostics";

interface RegenerationIntentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (request: RegenerationRequest) => void;
  contentOwnership: ContentOwnership;
  chapterTitle: string;
}

const INTENT_OPTIONS: { value: RegenerationIntent; label: string; description: string }[] = [
  { value: 'improve_academic_tone', label: 'Improve Academic Tone', description: 'Make content more scholarly and formal' },
  { value: 'fix_formatting', label: 'Fix Formatting', description: 'Correct code blocks, tables, and structure' },
  { value: 'expand_section', label: 'Expand Section', description: 'Add more depth to specific sections' },
  { value: 'add_examples', label: 'Add Examples', description: 'Include practical examples and use cases' },
  { value: 'add_code_blocks', label: 'Add Code Blocks', description: 'Include more executable code samples' },
  { value: 'simplify_language', label: 'Simplify Language', description: 'Make content easier to understand' },
  { value: 'fix_errors', label: 'Fix Errors', description: 'Correct factual or technical errors' },
  { value: 'custom', label: 'Custom Change', description: 'Describe exactly what you want changed' },
];

export function RegenerationIntentDialog({
  open,
  onOpenChange,
  onConfirm,
  contentOwnership,
  chapterTitle,
}: RegenerationIntentDialogProps) {
  const [intent, setIntent] = useState<RegenerationIntent>('fix_formatting');
  const [customDescription, setCustomDescription] = useState('');
  const [targetSection, setTargetSection] = useState('');

  const isSurgicalEdit = contentOwnership.userLocked || contentOwnership.differencePercentage >= 70;

  const request: RegenerationRequest = {
    intent,
    customDescription: intent === 'custom' ? customDescription : undefined,
    targetSection: targetSection || undefined,
    preserveUserContent: contentOwnership.userLocked,
    isSurgicalEdit,
  };

  const validation = validateRegenerationRequest(request, contentOwnership);

  const handleConfirm = () => {
    if (validation.allowed) {
      onConfirm(request);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-primary" />
            Regenerate Chapter
          </DialogTitle>
          <DialogDescription>
            Specify what changes you want for "{chapterTitle}"
          </DialogDescription>
        </DialogHeader>

        {/* Content Ownership Status */}
        <div className="flex items-center gap-2 flex-wrap">
          {contentOwnership.userLocked && (
            <Badge variant="outline" className="border-amber-500/50 text-amber-500">
              <Lock className="h-3 w-3 mr-1" />
              User Content Protected
            </Badge>
          )}
          {contentOwnership.isHybrid && (
            <Badge variant="outline" className="border-blue-500/50 text-blue-500">
              Hybrid Content
            </Badge>
          )}
          {contentOwnership.isAIGenerated && (
            <Badge variant="outline" className="border-green-500/50 text-green-500">
              AI Generated
            </Badge>
          )}
          {isSurgicalEdit && (
            <Badge variant="outline" className="border-purple-500/50 text-purple-500">
              <Shield className="h-3 w-3 mr-1" />
              Surgical Edit Only
            </Badge>
          )}
        </div>

        {/* Warning for user-authored content */}
        {contentOwnership.userLocked && (
          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-amber-500">User Content Protected</p>
                <p className="text-muted-foreground mt-1">
                  This chapter contains your original content ({contentOwnership.differencePercentage}% different from AI).
                  Only targeted changes are allowed to preserve your work.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Intent Selection */}
        <div className="space-y-3">
          <Label>What do you want to change?</Label>
          <RadioGroup
            value={intent}
            onValueChange={(v) => setIntent(v as RegenerationIntent)}
            className="grid gap-2"
          >
            {INTENT_OPTIONS.map((option) => (
              <div key={option.value} className="flex items-center space-x-3">
                <RadioGroupItem value={option.value} id={option.value} />
                <Label 
                  htmlFor={option.value} 
                  className="flex-1 cursor-pointer"
                >
                  <span className="font-medium">{option.label}</span>
                  <span className="text-xs text-muted-foreground ml-2">
                    — {option.description}
                  </span>
                </Label>
              </div>
            ))}
          </RadioGroup>
        </div>

        {/* Custom Description */}
        {intent === 'custom' && (
          <div className="space-y-2">
            <Label htmlFor="custom-desc">Describe the changes you want</Label>
            <Textarea
              id="custom-desc"
              value={customDescription}
              onChange={(e) => setCustomDescription(e.target.value)}
              placeholder="Be specific about what should be changed..."
              className="min-h-[100px]"
            />
          </div>
        )}

        {/* Target Section (optional) */}
        {isSurgicalEdit && (
          <div className="space-y-2">
            <Label htmlFor="target-section">Target Section (optional)</Label>
            <Textarea
              id="target-section"
              value={targetSection}
              onChange={(e) => setTargetSection(e.target.value)}
              placeholder="Paste the specific text you want changed..."
              className="min-h-[80px]"
            />
            <p className="text-xs text-muted-foreground">
              Paste the exact text you want to modify. This helps preserve the rest of your content.
            </p>
          </div>
        )}

        {/* Validation Error */}
        {!validation.allowed && (
          <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30">
            <p className="text-sm text-destructive">{validation.reason}</p>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleConfirm}
            disabled={!validation.allowed}
            className="bg-scroll-gold hover:bg-scroll-gold/90 text-background"
          >
            <Wand2 className="h-4 w-4 mr-2" />
            {isSurgicalEdit ? 'Apply Targeted Edit' : 'Regenerate'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
