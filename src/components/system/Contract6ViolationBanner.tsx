/**
 * CONTRACT 6 — VIOLATION DISPLAY BANNER
 * 
 * RULE 6.5 — TRANSPARENCY
 * When content violates Contract 6, users see clear reasons
 */

import { motion } from "framer-motion";
import { AlertTriangle, RefreshCw, XCircle, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GovernedBookType, getBookTypeDisplayName, getContract6Rules } from "@/lib/contract6-governance";

interface Contract6ViolationBannerProps {
  bookType: GovernedBookType;
  violations: string[];
  isRegenerating?: boolean;
  onRegenerate?: () => void;
  onDismiss?: () => void;
}

export function Contract6ViolationBanner({
  bookType,
  violations,
  isRegenerating = false,
  onRegenerate,
  onDismiss,
}: Contract6ViolationBannerProps) {
  if (violations.length === 0) return null;

  const rules = getContract6Rules(bookType);
  const typeName = getBookTypeDisplayName(bookType);

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="mb-6 p-4 rounded-xl bg-destructive/10 border border-destructive/30"
    >
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-destructive/20">
          <Shield className="h-5 w-5 text-destructive" />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold text-destructive">
              Contract 6 Violation
            </span>
            <span className="px-2 py-0.5 text-xs rounded-full bg-destructive/20 text-destructive">
              {typeName}
            </span>
          </div>
          
          <p className="text-sm text-destructive/80 mb-3">
            {violations[0]}
          </p>
          
          {/* Show forbidden elements for this book type */}
          {rules && rules.forbidden.length > 0 && (
            <div className="mb-3 p-2 rounded bg-muted/50">
              <p className="text-xs font-medium text-muted-foreground mb-1">
                Forbidden in {typeName}:
              </p>
              <div className="flex flex-wrap gap-1">
                {rules.forbidden.slice(0, 4).map((item, i) => (
                  <span
                    key={i}
                    className="px-2 py-0.5 text-xs rounded bg-destructive/10 text-destructive/80"
                  >
                    ❌ {item}
                  </span>
                ))}
              </div>
            </div>
          )}
          
          {/* Actions */}
          <div className="flex items-center gap-2">
            {onRegenerate && (
              <Button
                size="sm"
                variant="outline"
                onClick={onRegenerate}
                disabled={isRegenerating}
                className="text-destructive border-destructive/30 hover:bg-destructive/10"
              >
                {isRegenerating ? (
                  <>
                    <RefreshCw className="h-3 w-3 mr-1 animate-spin" />
                    Regenerating...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-3 w-3 mr-1" />
                    Regenerate with Correct Rules
                  </>
                )}
              </Button>
            )}
            
            {onDismiss && (
              <Button
                size="sm"
                variant="ghost"
                onClick={onDismiss}
                className="text-muted-foreground"
              >
                <XCircle className="h-3 w-3 mr-1" />
                Dismiss
              </Button>
            )}
          </div>
        </div>
      </div>
      
      {/* Additional violations */}
      {violations.length > 1 && (
        <div className="mt-3 pt-3 border-t border-destructive/20">
          <p className="text-xs font-medium text-destructive/70 mb-2">
            Additional violations ({violations.length - 1}):
          </p>
          <ul className="space-y-1">
            {violations.slice(1, 4).map((v, i) => (
              <li key={i} className="text-xs text-destructive/60 flex items-start gap-1">
                <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" />
                {v}
              </li>
            ))}
          </ul>
        </div>
      )}
    </motion.div>
  );
}

/**
 * Compact violation indicator for inline use
 */
interface Contract6StatusIndicatorProps {
  isValid: boolean;
  bookType: GovernedBookType;
  violationCount?: number;
}

export function Contract6StatusIndicator({
  isValid,
  bookType,
  violationCount = 0,
}: Contract6StatusIndicatorProps) {
  const typeName = getBookTypeDisplayName(bookType);

  if (isValid) {
    return (
      <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-green-500/10 text-green-600 text-xs">
        <Shield className="h-3 w-3" />
        <span>Contract 6 Valid</span>
      </div>
    );
  }

  return (
    <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-destructive/10 text-destructive text-xs">
      <AlertTriangle className="h-3 w-3" />
      <span>{violationCount} Violation{violationCount !== 1 ? 's' : ''}</span>
    </div>
  );
}
