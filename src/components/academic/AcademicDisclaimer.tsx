import { AlertTriangle, Shield, GraduationCap } from "lucide-react";
import { cn } from "@/lib/utils";

interface AcademicDisclaimerProps {
  variant?: 'full' | 'compact' | 'export';
  className?: string;
}

export function AcademicDisclaimer({ variant = 'full', className }: AcademicDisclaimerProps) {
  if (variant === 'export') {
    return (
      <div className={cn("text-center text-xs text-muted-foreground py-4 border-t border-border mt-8", className)}>
        <p className="font-medium mb-1">Academic Content Notice</p>
        <p>
          All references in this document are retrieved from verifiable academic databases
          including OpenAlex, CrossRef, Semantic Scholar, arXiv, and PubMed.
        </p>
        <p className="mt-2">
          ScrollLibrary does not replace academic judgment. Users remain responsible for
          proper academic use and verification of all citations before submission.
        </p>
      </div>
    );
  }

  if (variant === 'compact') {
    return (
      <div className={cn(
        "flex items-center gap-2 px-3 py-2 rounded-lg",
        "bg-amber-500/10 border border-amber-500/30",
        className
      )}>
        <Shield className="h-4 w-4 text-amber-500 flex-shrink-0" />
        <p className="text-xs text-muted-foreground">
          All references are verifiable. Verify citations before academic submission.
        </p>
      </div>
    );
  }

  return (
    <div className={cn(
      "p-4 rounded-lg bg-gradient-to-r from-amber-500/10 to-orange-500/10",
      "border border-amber-500/30",
      className
    )}>
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-amber-500/20">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-amber-400 mb-2">
            Academic Content Disclaimer
          </h3>
          <div className="space-y-2 text-xs text-muted-foreground">
            <p>
              <strong className="text-foreground">ScrollLibrary does not replace academic judgment.</strong>
            </p>
            <p>
              All referenced content in Academic Mode is sourced from verified academic databases
              (OpenAlex, CrossRef, Semantic Scholar, arXiv, PubMed). Every citation includes
              a DOI or permanent URL for verification.
            </p>
            <p>
              Users remain responsible for:
            </p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Verifying the accuracy and relevance of all citations</li>
              <li>Proper interpretation and application of referenced material</li>
              <li>Compliance with institutional academic integrity policies</li>
              <li>Correct citation formatting as per submission requirements</li>
            </ul>
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-amber-500/20">
              <GraduationCap className="h-4 w-4 text-amber-500" />
              <p className="text-amber-400 font-medium">
                This platform is a learning and research aid, not a substitute for academic work.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
