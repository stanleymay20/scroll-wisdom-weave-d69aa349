/**
 * Remediation Panel — Shows when certification is blocked
 * Displays weakest Bloom level, required actions, and lock status.
 */

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, Lock, Target, BookOpen } from "lucide-react";
import { type RemediationPlan } from "@/lib/masteryEngine";

interface RemediationPanelProps {
  remediation: RemediationPlan;
  className?: string;
}

const BLOOM_LABELS: Record<string, string> = {
  remember: 'Remember',
  understand: 'Understand',
  apply: 'Apply',
  analyze: 'Analyze',
  evaluate: 'Evaluate',
  create: 'Create',
};

export function RemediationPanel({ remediation, className }: RemediationPanelProps) {
  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-destructive">
          <Lock className="h-5 w-5" />
          Certification Locked — Remediation Required
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Weakest Level */}
        <div className="flex items-center gap-3 p-3 rounded-lg bg-destructive/10 border border-destructive/30">
          <Target className="h-5 w-5 text-destructive flex-shrink-0" />
          <div>
            <p className="font-medium text-sm">
              Weakest Cognitive Level: {BLOOM_LABELS[remediation.weakestLevel] || remediation.weakestLevel}
            </p>
            <p className="text-xs text-muted-foreground">
              Focus exercises at this level to improve certification eligibility
            </p>
          </div>
        </div>

        {/* Required Actions */}
        <div className="space-y-2">
          <p className="text-sm font-medium flex items-center gap-2">
            <BookOpen className="h-4 w-4" />
            Recommended Actions
          </p>
          {remediation.recommendedActions.map((action, i) => (
            <div key={i} className="flex items-start gap-2 text-sm text-muted-foreground pl-6">
              <span className="text-xs mt-1">•</span>
              <span>{action}</span>
            </div>
          ))}
        </div>

        {/* Focus Levels */}
        <div className="flex flex-wrap gap-2">
          {remediation.focusLevels.map(level => (
            <Badge key={level} variant="outline" className="border-destructive/50 text-destructive">
              {BLOOM_LABELS[level] || level}
            </Badge>
          ))}
        </div>

        {/* Lock Reasons */}
        {remediation.lockReasons.length > 0 && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <ul className="space-y-1 text-xs">
                {remediation.lockReasons.map((reason, i) => (
                  <li key={i}>• {reason}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        <p className="text-xs text-muted-foreground">
          Complete {remediation.targetQuestionCount} targeted exercises to unlock certification.
        </p>
      </CardContent>
    </Card>
  );
}
