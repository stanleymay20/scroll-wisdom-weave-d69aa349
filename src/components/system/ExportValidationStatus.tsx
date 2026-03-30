import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  Image as ImageIcon,
  FileText,
  BookOpen,
  RefreshCw,
  ChevronDown,
  ChevronUp
} from "lucide-react";
import { 
  ExportValidation, 
  validateExportReadiness,
  ComicValidationResult 
} from "@/lib/systemDiagnostics";
import { cn } from "@/lib/utils";

interface ExportValidationStatusProps {
  bookType: string;
  chapters: Array<{ content: string | null; is_generated: boolean }>;
  hasCover: boolean;
  totalChapters: number;
  onRefresh?: () => void;
  compact?: boolean;
}

export function ExportValidationStatus({
  bookType,
  chapters,
  hasCover,
  totalChapters,
  onRefresh,
  compact = false,
}: ExportValidationStatusProps) {
  const [validation, setValidation] = useState<ExportValidation | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const result = validateExportReadiness(bookType, chapters, hasCover, totalChapters);
    setValidation(result);
  }, [bookType, chapters, hasCover, totalChapters]);

  if (!validation) return null;

  const { canExport, blockers, warnings, comicValidation } = validation;

  if (compact) {
    return (
      <Badge 
        variant={canExport ? "default" : "destructive"}
        className={cn(
          "gap-1",
          canExport 
            ? "bg-green-500/20 text-green-500 border-green-500/50" 
            : "bg-destructive/20 text-destructive border-destructive/50"
        )}
      >
        {canExport ? (
          <>
            <CheckCircle2 className="h-3 w-3" />
            Export Ready
          </>
        ) : (
          <>
            <XCircle className="h-3 w-3" />
            {blockers.length} Issue{blockers.length !== 1 ? 's' : ''}
          </>
        )}
      </Badge>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      {/* Header */}
      <div 
        className="flex items-center justify-between p-3 cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          {canExport ? (
            <CheckCircle2 className="h-5 w-5 text-green-500" />
          ) : (
            <XCircle className="h-5 w-5 text-destructive" />
          )}
          <span className="font-medium text-sm">
            {canExport ? 'Ready for Export' : 'Export Blocked'}
          </span>
          {!canExport && (
            <Badge variant="destructive" className="text-xs">
              {blockers.length} blocker{blockers.length !== 1 ? 's' : ''}
            </Badge>
          )}
          {warnings.length > 0 && canExport && (
            <Badge variant="outline" className="text-xs border-amber-500/50 text-amber-500">
              {warnings.length} warning{warnings.length !== 1 ? 's' : ''}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onRefresh && (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={(e) => {
              e.stopPropagation();
              onRefresh();
            }}>
              <RefreshCw className="h-4 w-4" />
            </Button>
          )}
          {expanded ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div className="border-t border-border p-3 space-y-3">
          {/* Quick Status */}
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="flex items-center gap-2">
              <ImageIcon className="h-4 w-4 text-muted-foreground" />
              <span>Cover:</span>
              {validation.hasCover ? (
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              ) : (
                <XCircle className="h-4 w-4 text-destructive" />
              )}
            </div>
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground" />
              <span>Chapters:</span>
              {validation.hasAllChapters ? (
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              ) : (
                <AlertTriangle className="h-4 w-4 text-amber-500" />
              )}
            </div>
          </div>

          {/* Comic-specific validation */}
          {comicValidation && (
            <div className="p-2 rounded bg-muted/30">
              <div className="flex items-center gap-2 mb-2">
                <BookOpen className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">Comic Validation</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>Panels: {comicValidation.panelCount}</div>
                <div>Images: {comicValidation.imageCount}</div>
              </div>
              {comicValidation.missingImages.length > 0 && (
                <p className="text-xs text-destructive mt-1">
                  Missing images for panels: {comicValidation.missingImages.join(', ')}
                </p>
              )}
            </div>
          )}

          {/* Blockers */}
          {blockers.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-destructive">Blockers:</p>
              {blockers.map((blocker, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <XCircle className="h-3 w-3 text-destructive mt-0.5 flex-shrink-0" />
                  <span>{blocker}</span>
                </div>
              ))}
            </div>
          )}

          {/* Warnings */}
          {warnings.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-amber-500">Warnings:</p>
              {warnings.map((warning, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <AlertTriangle className="h-3 w-3 text-amber-500 mt-0.5 flex-shrink-0" />
                  <span>{warning}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
