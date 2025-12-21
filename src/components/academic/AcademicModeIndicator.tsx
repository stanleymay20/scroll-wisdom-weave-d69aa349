import { GraduationCap, BookOpen, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface AcademicModeIndicatorProps {
  isAcademicMode: boolean;
  citationStyle?: string;
  className?: string;
}

export function AcademicModeIndicator({ 
  isAcademicMode, 
  citationStyle = 'APA',
  className = '' 
}: AcademicModeIndicatorProps) {
  if (!isAcademicMode) {
    return (
      <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg bg-muted/50 border border-border/50 ${className}`}>
        <BookOpen className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">Learning Mode</span>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/30 ${className}`}>
      <GraduationCap className="h-4 w-4 text-green-500" />
      <span className="text-xs font-medium text-green-400">Academic Research Mode Enabled</span>
      <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-green-500/50 text-green-400">
        {citationStyle}
      </Badge>
    </div>
  );
}

export function AcademicDisclaimer({ className = '' }: { className?: string }) {
  return (
    <div className={`p-4 rounded-lg bg-amber-500/10 border border-amber-500/30 ${className}`}>
      <div className="flex items-start gap-3">
        <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="text-sm font-medium text-amber-400">Academic Content Notice</p>
          <p className="text-xs text-muted-foreground">
            ScrollLibrary is an AI-assisted research and writing platform. All academic content is generated using cited sources. 
            Users are responsible for verifying and properly interpreting references before submission.
          </p>
        </div>
      </div>
    </div>
  );
}
