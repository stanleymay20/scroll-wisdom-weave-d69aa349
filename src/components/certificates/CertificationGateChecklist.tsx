/**
 * 9 Certification Gates — Visual checklist for mastery dashboard
 */

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, CheckCircle2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface GateStatus {
  label: string;
  passed: boolean;
  detail?: string;
}

interface CertificationGateChecklistProps {
  gates: GateStatus[];
  className?: string;
}

export function CertificationGateChecklist({ gates, className }: CertificationGateChecklistProps) {
  const passedCount = gates.filter(g => g.passed).length;
  const allPassed = passedCount === gates.length;

  return (
    <Card className={cn("bg-gradient-card border-border/50", className)}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Shield className="h-5 w-5 text-primary" />
          Certification Gates
          <span className={cn(
            "ml-auto text-sm font-normal",
            allPassed ? "text-green-500" : "text-muted-foreground"
          )}>
            {passedCount}/{gates.length} passed
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {gates.map((gate, i) => (
          <div
            key={i}
            className={cn(
              "flex items-start gap-3 p-3 rounded-lg border transition-colors",
              gate.passed
                ? "bg-green-500/5 border-green-500/20"
                : "bg-destructive/5 border-destructive/20 cursor-pointer hover:bg-destructive/10"
            )}
          >
            {gate.passed ? (
              <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
            ) : (
              <XCircle className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className={cn(
                "text-sm font-medium",
                gate.passed ? "text-foreground" : "text-destructive"
              )}>
                {gate.label}
              </p>
              {gate.detail && !gate.passed && (
                <p className="text-xs text-muted-foreground mt-0.5">{gate.detail}</p>
              )}
            </div>
          </div>
        ))}

        {allPassed && (
          <div className="text-center py-3 text-sm text-green-500 font-medium">
            ✓ All gates passed — Certification eligible
          </div>
        )}
        {!allPassed && (
          <p className="text-xs text-muted-foreground text-center pt-2">
            Complete all gates to unlock mastery certification.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
