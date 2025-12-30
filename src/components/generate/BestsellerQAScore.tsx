import { CheckCircle, XCircle, AlertCircle, Trophy, Target } from "lucide-react";
import { cn } from "@/lib/utils";

export interface QACheckItem {
  id: string;
  label: string;
  passed: boolean | null; // null = pending/not checked
  category: "structure" | "engagement" | "quality" | "format";
}

interface BestsellerQAScoreProps {
  checks: QACheckItem[];
  overallScore?: number; // 0-100
  showDetails?: boolean;
}

const categoryLabels: Record<string, string> = {
  structure: "Structure",
  engagement: "Engagement",
  quality: "Quality",
  format: "Format",
};

const categoryIcons: Record<string, React.ReactNode> = {
  structure: <Target className="h-4 w-4" />,
  engagement: <Trophy className="h-4 w-4" />,
  quality: <CheckCircle className="h-4 w-4" />,
  format: <AlertCircle className="h-4 w-4" />,
};

export function BestsellerQAScore({
  checks,
  overallScore,
  showDetails = true,
}: BestsellerQAScoreProps) {
  const passedCount = checks.filter((c) => c.passed === true).length;
  const failedCount = checks.filter((c) => c.passed === false).length;
  const pendingCount = checks.filter((c) => c.passed === null).length;

  const calculatedScore =
    overallScore ?? Math.round((passedCount / checks.length) * 100);

  const getScoreColor = (score: number) => {
    if (score >= 90) return "text-green-500";
    if (score >= 70) return "text-scroll-gold";
    if (score >= 50) return "text-amber-500";
    return "text-destructive";
  };

  const getScoreLabel = (score: number) => {
    if (score >= 90) return "Bestseller Ready";
    if (score >= 70) return "Good Quality";
    if (score >= 50) return "Needs Improvement";
    return "Below Standard";
  };

  // Group checks by category
  const groupedChecks = checks.reduce((acc, check) => {
    if (!acc[check.category]) {
      acc[check.category] = [];
    }
    acc[check.category].push(check);
    return acc;
  }, {} as Record<string, QACheckItem[]>);

  return (
    <div className="rounded-xl border border-border/50 bg-muted/20 p-4 space-y-4">
      {/* Header with score */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Trophy
            className={cn("h-5 w-5", getScoreColor(calculatedScore))}
          />
          <span className="font-semibold">Bestseller QA Score</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {passedCount}/{checks.length} checks passed
          </span>
          <div
            className={cn(
              "text-2xl font-bold tabular-nums",
              getScoreColor(calculatedScore)
            )}
          >
            {calculatedScore}%
          </div>
        </div>
      </div>

      {/* Score bar */}
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={cn(
            "h-full transition-all duration-500",
            calculatedScore >= 90
              ? "bg-green-500"
              : calculatedScore >= 70
              ? "bg-scroll-gold"
              : calculatedScore >= 50
              ? "bg-amber-500"
              : "bg-destructive"
          )}
          style={{ width: `${calculatedScore}%` }}
        />
      </div>

      {/* Score label */}
      <div className="flex items-center justify-between">
        <span
          className={cn(
            "text-sm font-medium",
            getScoreColor(calculatedScore)
          )}
        >
          {getScoreLabel(calculatedScore)}
        </span>
        {failedCount > 0 && (
          <span className="text-xs text-destructive">
            {failedCount} issue{failedCount > 1 ? "s" : ""} to fix
          </span>
        )}
      </div>

      {/* Detailed checks by category */}
      {showDetails && (
        <div className="space-y-3 pt-2 border-t border-border/50">
          {Object.entries(groupedChecks).map(([category, categoryChecks]) => (
            <div key={category} className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                {categoryIcons[category]}
                {categoryLabels[category]}
              </div>
              <div className="grid gap-1">
                {categoryChecks.map((check) => (
                  <div
                    key={check.id}
                    className={cn(
                      "flex items-center gap-2 text-sm py-1 px-2 rounded",
                      check.passed === true && "bg-green-500/5",
                      check.passed === false && "bg-destructive/5"
                    )}
                  >
                    {check.passed === true ? (
                      <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
                    ) : check.passed === false ? (
                      <XCircle className="h-4 w-4 text-destructive flex-shrink-0" />
                    ) : (
                      <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30 flex-shrink-0" />
                    )}
                    <span
                      className={cn(
                        check.passed === false && "text-destructive"
                      )}
                    >
                      {check.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Default checks for bestseller validation
export const DEFAULT_BESTSELLER_CHECKS: QACheckItem[] = [
  // Structure
  { id: "opening_hook", label: "Opening hook present", passed: null, category: "structure" },
  { id: "central_idea", label: "Single central idea", passed: null, category: "structure" },
  { id: "named_principle", label: "Named principle/concept", passed: null, category: "structure" },
  { id: "actionable_takeaways", label: "Actionable takeaways", passed: null, category: "structure" },
  
  // Engagement
  { id: "reader_addressed", label: "Reader directly addressed", passed: null, category: "engagement" },
  { id: "questions_included", label: "Reflection questions", passed: null, category: "engagement" },
  { id: "story_scenario", label: "Story or scenario included", passed: null, category: "engagement" },
  { id: "quotable_lines", label: "Quotable lines (3+)", passed: null, category: "engagement" },
  
  // Quality
  { id: "no_ai_tone", label: "No AI-sounding phrases", passed: null, category: "quality" },
  { id: "conversational", label: "Conversational authority", passed: null, category: "quality" },
  { id: "no_filler", label: "No filler content", passed: null, category: "quality" },
  { id: "emotionally_compelling", label: "Emotionally compelling", passed: null, category: "quality" },
  
  // Format
  { id: "no_markdown", label: "No markdown artifacts", passed: null, category: "format" },
  { id: "short_paragraphs", label: "Short paragraphs (2-5 lines)", passed: null, category: "format" },
  { id: "clean_formatting", label: "Clean formatting", passed: null, category: "format" },
  { id: "publish_ready", label: "Publish-ready layout", passed: null, category: "format" },
];
