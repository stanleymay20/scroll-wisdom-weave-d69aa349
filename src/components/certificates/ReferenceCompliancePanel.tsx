import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  ChevronDown,
  ChevronUp,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  FileCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  ComplianceTier,
  ReferenceTransparencyReport,
} from "@/lib/referenceVerification";
import { getTierColor, getTierIcon } from "@/lib/referenceVerification";

interface ReferenceCompliancePanelProps {
  report: ReferenceTransparencyReport | null;
  className?: string;
}

const tierOrder: ComplianceTier[] = ['non-compliant', 'bronze', 'silver', 'gold', 'platinum'];

export function ReferenceCompliancePanel({ report, className }: ReferenceCompliancePanelProps) {
  const [expanded, setExpanded] = useState(false);

  if (!report) return null;

  const currentTierIdx = tierOrder.indexOf(report.tier.tier);

  return (
    <div className={cn("rounded-xl border border-border/50 bg-gradient-card overflow-hidden", className)}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <FileCheck className="h-5 w-5 text-scroll-gold" />
          <div className="text-left">
            <h3 className="font-medium text-foreground">ScrollVerified™ Reference Compliance</h3>
            <p className="text-xs text-muted-foreground">
              DOI Validated: {report.doiValidatedPct}% · Tier: {report.tier.label}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={cn("text-xs", getTierColor(report.tier.tier))}>
            {getTierIcon(report.tier.tier)} {report.tier.label}
          </Badge>
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-4">
              {/* DOI Validation Score */}
              <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium">DOI Validation</span>
                  <span className={cn("text-lg font-bold", report.doiValidatedPct >= 80 ? "text-green-500" : report.doiValidatedPct >= 50 ? "text-amber-500" : "text-destructive")}>
                    {report.doiValidatedPct}%
                  </span>
                </div>
                <Progress value={report.doiValidatedPct} className="h-2" />
              </div>

              {/* Compliance Tier Visual */}
              <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
                <span className="text-sm font-medium block mb-2">Compliance Tier</span>
                <div className="flex gap-1">
                  {tierOrder.map((t, i) => (
                    <div
                      key={t}
                      className={cn(
                        "flex-1 h-2 rounded-full transition-colors",
                        i <= currentTierIdx ? getTierColor(report.tier.tier) : "bg-muted"
                      )}
                    />
                  ))}
                </div>
                <div className="flex justify-between mt-1">
                  {tierOrder.map(t => (
                    <span key={t} className={cn("text-[9px]", t === report.tier.tier ? "text-foreground font-medium" : "text-muted-foreground")}>
                      {t === 'non-compliant' ? 'N/C' : t.charAt(0).toUpperCase() + t.slice(1)}
                    </span>
                  ))}
                </div>
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-2 gap-2 text-xs">
                <MetricRow icon={report.canonicalAnchorsPresent ? CheckCircle2 : XCircle} label="Canonical Anchors" value={report.canonicalAnchorsPresent ? "Present" : "Missing"} ok={report.canonicalAnchorsPresent} />
                <MetricRow icon={report.orphanReferences === 0 ? CheckCircle2 : AlertTriangle} label="Orphan References" value={String(report.orphanReferences)} ok={report.orphanReferences === 0} />
                <MetricRow icon={report.missingCitations === 0 ? CheckCircle2 : AlertTriangle} label="Missing Citations" value={String(report.missingCitations)} ok={report.missingCitations === 0} />
                <MetricRow icon={CheckCircle2} label="Duplicates Removed" value={String(report.duplicatesRemoved)} ok />
                <MetricRow icon={report.post2010Compliance >= 30 ? CheckCircle2 : XCircle} label="Post-2010" value={`${report.post2010Compliance}%`} ok={report.post2010Compliance >= 30} />
                <MetricRow icon={report.post2018Compliance >= 15 ? CheckCircle2 : XCircle} label="Post-2018" value={`${report.post2018Compliance}%`} ok={report.post2018Compliance >= 15} />
                <MetricRow icon={ShieldCheck} label="Semantic Integrity" value={report.semanticIntegrity} ok={report.semanticIntegrity === 'Strong'} />
                <MetricRow icon={report.fabricationRisk === 'None Detected' ? CheckCircle2 : AlertTriangle} label="Fabrication Risk" value={report.fabricationRisk} ok={report.fabricationRisk === 'None Detected'} />
              </div>

              {/* Hard Failures */}
              {report.hardFailures.length > 0 && (
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/30 space-y-1">
                  <span className="text-xs font-medium text-destructive flex items-center gap-1">
                    <XCircle className="h-3.5 w-3.5" /> Hard Failure Conditions ({report.hardFailures.length})
                  </span>
                  {report.hardFailures.map((f, i) => (
                    <p key={i} className="text-xs text-destructive/80 ml-5">• {f}</p>
                  ))}
                </div>
              )}

              {/* Certification Status */}
              <div className={cn(
                "p-3 rounded-lg border text-xs",
                report.certificationBlocked
                  ? "bg-destructive/10 border-destructive/30"
                  : "bg-green-500/10 border-green-500/30"
              )}>
                {report.certificationBlocked ? (
                  <span className="text-destructive font-medium">🔒 Certification Blocked — Resolve hard failures</span>
                ) : (
                  <span className="text-green-600 dark:text-green-400 font-medium">✅ Reference compliance achieved — Eligible for certification</span>
                )}
              </div>

              {/* Provenance */}
              {(report.auditModel || report.promptVersion) && (
                <p className="text-[10px] text-muted-foreground">
                  Verified by ScrollLibrary Research Integrity Engine
                  {report.auditModel && ` · Model: ${report.auditModel}`}
                  {report.promptVersion && ` · Prompt: ${report.promptVersion}`}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MetricRow({ icon: Icon, label, value, ok }: { icon: any; label: string; value: string; ok: boolean }) {
  return (
    <div className="flex items-center gap-2 p-2 rounded bg-muted/20">
      <Icon className={cn("h-3.5 w-3.5 shrink-0", ok ? "text-green-500" : "text-amber-500")} />
      <span className="text-muted-foreground">{label}:</span>
      <span className={cn("font-medium ml-auto", ok ? "text-foreground" : "text-amber-500")}>{value}</span>
    </div>
  );
}
