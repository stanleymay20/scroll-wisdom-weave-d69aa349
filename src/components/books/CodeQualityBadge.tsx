/**
 * Code Quality Badge Component
 * Shows whether code blocks meet ChatGPT-level structured format requirements
 */

import { Badge } from "@/components/ui/badge";
import { Code2, CheckCircle2, AlertTriangle, XCircle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface CodeQualityBadgeProps {
  chapters: { content: string | null }[];
  className?: string;
}

interface CodeQualityScore {
  score: number;
  hasStructuredBlocks: boolean;
  hasLanguageLabels: boolean;
  hasOutputExamples: boolean;
  hasExplanations: boolean;
  hasCommonMistakes: boolean;
  structuredBlockCount: number;
  regularBlockCount: number;
  issues: string[];
}

function analyzeCodeQuality(chapters: { content: string | null }[]): CodeQualityScore {
  const allContent = chapters.map(ch => ch.content || '').join('\n\n');
  const issues: string[] = [];
  
  // Check for structured code blocks [CODE_BLOCK]...[/CODE_BLOCK]
  const structuredBlockPattern = /\[CODE_BLOCK\][\s\S]*?\[\/CODE_BLOCK\]/g;
  const structuredMatches = allContent.match(structuredBlockPattern) || [];
  const structuredBlockCount = structuredMatches.length;
  const hasStructuredBlocks = structuredBlockCount > 0;
  
  // Check for regular code blocks ```language...```
  const regularBlockPattern = /```\w+[\s\S]*?```/g;
  const regularMatches = allContent.match(regularBlockPattern) || [];
  const regularBlockCount = regularMatches.length;
  
  // Check for language labels in regular blocks
  const hasLanguageLabels = regularBlockCount > 0 || 
    /\[CODE_BLOCK\][\s\S]*?language:\s*\w+/i.test(allContent);
  
  // Check for output examples
  const hasOutputExamples = /\[CODE_BLOCK\][\s\S]*?output:[\s\S]*?\[\/CODE_BLOCK\]/i.test(allContent) ||
    /(output|result|returns|prints|>>>|console\.log)/i.test(allContent);
  
  // Check for explanations
  const hasExplanations = /\[CODE_BLOCK\][\s\S]*?explanation:[\s\S]*?\[\/CODE_BLOCK\]/i.test(allContent) ||
    /(explanation|this code|this function|here we|note that)/i.test(allContent);
  
  // Check for common mistakes
  const hasCommonMistakes = /\[CODE_BLOCK\][\s\S]*?common_mistake:[\s\S]*?\[\/CODE_BLOCK\]/i.test(allContent) ||
    /(common mistake|error|pitfall|wrong approach|avoid|don't do)/i.test(allContent);

  // Calculate score
  let score = 0;
  const hasAnyCode = structuredBlockCount > 0 || regularBlockCount > 0 || 
    /code|function|class|def |const |let |var /.test(allContent.toLowerCase());
  
  if (!hasAnyCode) {
    // No code in book - return N/A state
    return {
      score: -1, // Special value for "no code"
      hasStructuredBlocks: false,
      hasLanguageLabels: false,
      hasOutputExamples: false,
      hasExplanations: false,
      hasCommonMistakes: false,
      structuredBlockCount: 0,
      regularBlockCount: 0,
      issues: ['No code content detected']
    };
  }

  // Award points based on quality indicators
  if (hasStructuredBlocks) score += 40; // Major bonus for structured blocks
  else if (regularBlockCount > 0) score += 15;
  
  if (hasLanguageLabels) score += 15;
  if (hasOutputExamples) score += 15;
  if (hasExplanations) score += 15;
  if (hasCommonMistakes) score += 15;

  // Identify issues
  if (!hasStructuredBlocks && regularBlockCount > 0) {
    issues.push('Code uses basic format; structured [CODE_BLOCK] format recommended');
  }
  if (!hasLanguageLabels) {
    issues.push('Missing language specifications');
  }
  if (!hasOutputExamples) {
    issues.push('Missing output examples');
  }
  if (!hasExplanations) {
    issues.push('Missing code explanations');
  }
  if (!hasCommonMistakes) {
    issues.push('Missing common mistake examples');
  }

  return {
    score,
    hasStructuredBlocks,
    hasLanguageLabels,
    hasOutputExamples,
    hasExplanations,
    hasCommonMistakes,
    structuredBlockCount,
    regularBlockCount,
    issues
  };
}

export function CodeQualityBadge({ chapters, className }: CodeQualityBadgeProps) {
  const quality = analyzeCodeQuality(chapters);
  
  // No code content - don't show badge
  if (quality.score === -1) {
    return null;
  }

  const getVariant = () => {
    if (quality.score >= 80) return 'default';
    if (quality.score >= 50) return 'secondary';
    return 'destructive';
  };

  const getIcon = () => {
    if (quality.score >= 80) return <CheckCircle2 className="h-3 w-3" />;
    if (quality.score >= 50) return <AlertTriangle className="h-3 w-3" />;
    return <XCircle className="h-3 w-3" />;
  };

  const getLabel = () => {
    if (quality.score >= 80) return 'Excellent';
    if (quality.score >= 50) return 'Good';
    return 'Needs Work';
  };

  const totalBlocks = quality.structuredBlockCount + quality.regularBlockCount;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge 
            variant={getVariant()}
            className={cn("gap-1 cursor-help", className)}
          >
            <Code2 className="h-3 w-3" />
            Code: {getLabel()}
            {getIcon()}
          </Badge>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <div className="space-y-2">
            <div className="font-semibold">Code Quality Score: {quality.score}/100</div>
            <div className="text-xs space-y-1">
              <div className="flex items-center gap-2">
                {quality.hasStructuredBlocks ? <CheckCircle2 className="h-3 w-3 text-green-500" /> : <XCircle className="h-3 w-3 text-muted-foreground" />}
                <span>Structured blocks ({quality.structuredBlockCount})</span>
              </div>
              <div className="flex items-center gap-2">
                {quality.hasLanguageLabels ? <CheckCircle2 className="h-3 w-3 text-green-500" /> : <XCircle className="h-3 w-3 text-muted-foreground" />}
                <span>Language labels</span>
              </div>
              <div className="flex items-center gap-2">
                {quality.hasOutputExamples ? <CheckCircle2 className="h-3 w-3 text-green-500" /> : <XCircle className="h-3 w-3 text-muted-foreground" />}
                <span>Output examples</span>
              </div>
              <div className="flex items-center gap-2">
                {quality.hasExplanations ? <CheckCircle2 className="h-3 w-3 text-green-500" /> : <XCircle className="h-3 w-3 text-muted-foreground" />}
                <span>Explanations</span>
              </div>
              <div className="flex items-center gap-2">
                {quality.hasCommonMistakes ? <CheckCircle2 className="h-3 w-3 text-green-500" /> : <XCircle className="h-3 w-3 text-muted-foreground" />}
                <span>Common mistakes</span>
              </div>
            </div>
            {quality.issues.length > 0 && (
              <div className="text-xs text-muted-foreground border-t pt-2">
                <strong>Suggestions:</strong>
                <ul className="list-disc list-inside mt-1">
                  {quality.issues.slice(0, 3).map((issue, i) => (
                    <li key={i}>{issue}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
