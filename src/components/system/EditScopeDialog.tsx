/**
 * CONTRACT 2 — Edit Scope Dialog
 * 
 * Rule 3: Explicit edit instructions required before regeneration
 * Rule 4: Partial editing only - ONLY the explicitly targeted sections may be changed
 */

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
import { 
  Wand2, 
  Lock, 
  AlertTriangle, 
  Scissors, 
  FileEdit,
  MessageSquare,
  Palette,
  Layout
} from "lucide-react";
import { type EditScope, VALID_EDIT_SCOPES, validateEditScope } from "@/lib/contentDeterminism";

interface EditScopeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (scope: EditScope) => void;
  isUserLocked: boolean;
  differencePercentage: number;
  chapterTitle: string;
}

const SCOPE_ICONS: Record<EditScope['type'], React.ReactNode> = {
  section: <Scissors className="h-4 w-4" />,
  formatting: <Layout className="h-4 w-4" />,
  grammar: <FileEdit className="h-4 w-4" />,
  tone: <Palette className="h-4 w-4" />,
  structure: <MessageSquare className="h-4 w-4" />,
  full: <Wand2 className="h-4 w-4" />,
};

const QUICK_SUGGESTIONS = [
  { type: 'grammar' as const, text: 'Fix grammar only' },
  { type: 'formatting' as const, text: 'Only edit formatting' },
  { type: 'tone' as const, text: 'Make tone more academic' },
  { type: 'section' as const, text: 'Shorten this paragraph' },
  { type: 'structure' as const, text: 'Fix structure but preserve wording' },
];

export function EditScopeDialog({
  open,
  onOpenChange,
  onConfirm,
  isUserLocked,
  differencePercentage,
  chapterTitle,
}: EditScopeDialogProps) {
  const [scopeType, setScopeType] = useState<EditScope['type']>('grammar');
  const [description, setDescription] = useState('');
  const [targetText, setTargetText] = useState('');
  
  const scope: EditScope = {
    type: scopeType,
    description,
    targetText: scopeType === 'section' ? targetText : undefined,
  };
  
  const validation = validateEditScope(scope);
  const isFullBlocked = isUserLocked || differencePercentage >= 30;

  const handleConfirm = () => {
    if (validation.valid) {
      onConfirm(scope);
      onOpenChange(false);
      // Reset state
      setDescription('');
      setTargetText('');
      setScopeType('grammar');
    }
  };

  const handleQuickSuggestion = (suggestion: typeof QUICK_SUGGESTIONS[0]) => {
    setScopeType(suggestion.type);
    setDescription(suggestion.text);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5 text-primary" />
            Specify Edit Scope
          </DialogTitle>
          <DialogDescription>
            What changes do you want to make to "{chapterTitle}"?
          </DialogDescription>
        </DialogHeader>

        {/* Content Status */}
        <div className="flex items-center gap-2 flex-wrap">
          {isUserLocked && (
            <Badge variant="outline" className="border-amber-500/50 text-amber-500">
              <Lock className="h-3 w-3 mr-1" />
              User Content Protected
            </Badge>
          )}
          {differencePercentage > 0 && (
            <Badge variant="outline">
              {differencePercentage}% modified from AI
            </Badge>
          )}
        </div>

        {/* Warning for user content */}
        {isFullBlocked && (
          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
              <div className="text-sm">
                <p className="font-medium text-amber-500">Full regeneration blocked</p>
                <p className="text-muted-foreground mt-1">
                  This chapter contains your original content. Only targeted edits are allowed 
                  to preserve your work.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Quick Suggestions */}
        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">Quick options:</Label>
          <div className="flex flex-wrap gap-2">
            {QUICK_SUGGESTIONS.map((suggestion) => (
              <Button
                key={suggestion.text}
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => handleQuickSuggestion(suggestion)}
              >
                {SCOPE_ICONS[suggestion.type]}
                <span className="ml-1">{suggestion.text}</span>
              </Button>
            ))}
          </div>
        </div>

        {/* Scope Type Selection */}
        <div className="space-y-3">
          <Label>Edit Type</Label>
          <RadioGroup
            value={scopeType}
            onValueChange={(v) => setScopeType(v as EditScope['type'])}
            className="grid gap-2"
          >
            {VALID_EDIT_SCOPES
              .filter(s => !(isFullBlocked && s.type === 'full'))
              .map((scopeOption) => (
                <div 
                  key={scopeOption.type} 
                  className="flex items-center space-x-3 p-2 rounded-lg hover:bg-muted/50"
                >
                  <RadioGroupItem value={scopeOption.type} id={scopeOption.type} />
                  <Label 
                    htmlFor={scopeOption.type} 
                    className="flex-1 cursor-pointer flex items-center gap-2"
                  >
                    {SCOPE_ICONS[scopeOption.type]}
                    <span className="font-medium capitalize">{scopeOption.type}</span>
                    <span className="text-xs text-muted-foreground">
                      — {scopeOption.description}
                    </span>
                  </Label>
                </div>
              ))}
          </RadioGroup>
        </div>

        {/* Description Input */}
        <div className="space-y-2">
          <Label htmlFor="edit-description">
            Describe your changes <span className="text-destructive">*</span>
          </Label>
          <Textarea
            id="edit-description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Be specific about what should be changed..."
            className="min-h-[80px]"
          />
          <p className="text-xs text-muted-foreground">
            Minimum 5 characters. The more specific, the better the result.
          </p>
        </div>

        {/* Target Section (for section edits) */}
        {scopeType === 'section' && (
          <div className="space-y-2">
            <Label htmlFor="target-text">
              Target Text <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="target-text"
              value={targetText}
              onChange={(e) => setTargetText(e.target.value)}
              placeholder="Paste the exact text you want to modify..."
              className="min-h-[100px] font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              Paste the specific text that should be changed. This helps preserve the rest of your content.
            </p>
          </div>
        )}

        {/* Validation Error */}
        {description && !validation.valid && (
          <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30">
            <p className="text-sm text-destructive">{validation.error}</p>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleConfirm}
            disabled={!validation.valid}
          >
            <Wand2 className="h-4 w-4 mr-1" />
            Preview Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
