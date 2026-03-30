/**
 * CONTRACT 3 — BOOK TYPE CONTRACT STATUS PANEL
 * 
 * User-visible indicator showing book type governance status.
 * Displays violations as blocking errors.
 */

import { useState, useEffect } from "react";
import { 
  Shield, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle,
  Lock,
  RefreshCw,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  Collapsible, 
  CollapsibleContent, 
  CollapsibleTrigger 
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import { 
  validateContentAgainstBookType, 
  getBookTypeContract,
  detectCrossTypeViolation,
  type BookType,
  type ContentValidationResult 
} from "@/lib/bookTypeGovernance";

interface BookTypeContractStatusProps {
  bookType: BookType;
  content: string;
  title?: string;
  isLocked?: boolean;
  onRegenerate?: () => void;
  compact?: boolean;
}

export function BookTypeContractStatus({
  bookType,
  content,
  title,
  isLocked = false,
  onRegenerate,
  compact = false
}: BookTypeContractStatusProps) {
  const [validation, setValidation] = useState<ContentValidationResult | null>(null);
  const [crossTypeCheck, setCrossTypeCheck] = useState<{ hasCrossType: boolean; message?: string } | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  
  const contract = getBookTypeContract(bookType);
  
  useEffect(() => {
    if (content && bookType) {
      const result = validateContentAgainstBookType(content, bookType, {
        checkTitle: !!title,
        title,
        checkWordCount: true
      });
      setValidation(result);
      
      const crossType = detectCrossTypeViolation(content, bookType);
      setCrossTypeCheck(crossType);
    }
  }, [content, bookType, title]);
  
  if (!contract) return null;
  
  const hasCriticalViolations = validation?.violations.some(v => v.severity === 'critical') || false;
  const hasHighViolations = validation?.violations.some(v => v.severity === 'high') || false;
  const hasCrossType = crossTypeCheck?.hasCrossType || false;
  
  const isValid = !hasCriticalViolations && !hasCrossType;
  const hasWarnings = hasHighViolations || (validation?.warnings.length || 0) > 0;
  
  // Compact badge view
  if (compact) {
    return (
      <Badge 
        variant="outline" 
        className={cn(
          "gap-1.5 text-xs",
          isValid 
            ? "bg-green-500/10 text-green-600 border-green-500/30" 
            : hasCriticalViolations
              ? "bg-destructive/10 text-destructive border-destructive/30"
              : "bg-amber-500/10 text-amber-600 border-amber-500/30"
        )}
      >
        {isLocked && <Lock className="h-3 w-3" />}
        {isValid ? (
          <>
            <CheckCircle2 className="h-3 w-3" />
            {contract.displayName}
          </>
        ) : (
          <>
            <AlertTriangle className="h-3 w-3" />
            Contract Violation
          </>
        )}
      </Badge>
    );
  }
  
  return (
    <div className={cn(
      "rounded-lg border p-3",
      isValid 
        ? "bg-green-500/5 border-green-500/20" 
        : hasCriticalViolations
          ? "bg-destructive/5 border-destructive/20"
          : "bg-amber-500/5 border-amber-500/20"
    )}>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isLocked && <Lock className="h-4 w-4 text-primary" />}
            <Shield className={cn(
              "h-4 w-4",
              isValid ? "text-green-500" : hasCriticalViolations ? "text-destructive" : "text-amber-500"
            )} />
            <span className="text-sm font-medium">
              Contract 3: {contract.displayName}
            </span>
            <Badge 
              variant="outline" 
              className={cn(
                "text-xs",
                isValid 
                  ? "bg-green-500/10 text-green-600 border-green-500/30" 
                  : "bg-destructive/10 text-destructive border-destructive/30"
              )}
            >
              {isValid ? "COMPLIANT" : "VIOLATION"}
            </Badge>
          </div>
          
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
              {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </CollapsibleTrigger>
        </div>
        
        <CollapsibleContent className="mt-3 space-y-3">
          {/* Violations */}
          {validation && validation.violations.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-destructive uppercase tracking-wide">
                Violations ({validation.violations.length})
              </p>
              {validation.violations.map((v, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  <XCircle className={cn(
                    "h-3.5 w-3.5 mt-0.5 flex-shrink-0",
                    v.severity === 'critical' ? "text-destructive" : "text-amber-500"
                  )} />
                  <div>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      [{v.code}]
                    </span>
                    <p className="text-foreground">{v.message}</p>
                    {v.suggestedFix && (
                      <p className="text-muted-foreground mt-0.5">
                        Fix: {v.suggestedFix}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          
          {/* Cross-Type Warning */}
          {hasCrossType && crossTypeCheck?.message && (
            <div className="p-2 rounded bg-destructive/10 text-xs text-destructive">
              <strong>⚠️ CROSS-TYPE CONTAMINATION:</strong> {crossTypeCheck.message}
            </div>
          )}
          
          {/* Warnings */}
          {validation && validation.warnings.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-amber-600 uppercase tracking-wide">
                Warnings
              </p>
              {validation.warnings.map((w, i) => (
                <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
                  <AlertTriangle className="h-3 w-3 text-amber-500" />
                  {w}
                </div>
              ))}
            </div>
          )}
          
          {/* Contract Rules */}
          <div className="pt-2 border-t border-border/50">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
              Contract Rules
            </p>
            <div className="grid grid-cols-2 gap-2 text-[10px]">
              <div>
                <p className="font-medium text-green-600">MANDATORY:</p>
                <ul className="mt-1 space-y-0.5 text-muted-foreground">
                  {contract.mandatory.slice(0, 3).map((m, i) => (
                    <li key={i} className="truncate">• {m}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="font-medium text-destructive">FORBIDDEN:</p>
                <ul className="mt-1 space-y-0.5 text-muted-foreground">
                  {contract.forbidden.slice(0, 3).map((f, i) => (
                    <li key={i} className="truncate">• {f}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
          
          {/* Regenerate Action */}
          {!isValid && onRegenerate && (
            <div className="pt-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={onRegenerate}
                className="w-full gap-2"
              >
                <RefreshCw className="h-3.5 w-3.5" />
                Auto-Regenerate to Fix Violations
              </Button>
            </div>
          )}
          
          {/* Valid State */}
          {isValid && (
            <div className="flex items-center gap-2 text-xs text-green-600">
              <CheckCircle2 className="h-4 w-4" />
              Content complies with {contract.displayName} contract
            </div>
          )}
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

export default BookTypeContractStatus;
