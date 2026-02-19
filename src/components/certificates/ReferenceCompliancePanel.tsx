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
  Brain,
  Scale,
  GitCompareArrows,
  Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  ComplianceTier,
  ReferenceTransparencyReport,
} from "@/lib/referenceVerification";
import { getTierColor, getTierIcon, getVerdictColor, getCoherenceVerdictColor } from "@/lib/referenceVerification";

interface ReferenceCompliancePanelProps {
  report: ReferenceTransparencyReport | null;
  className?: string;
}

const tierOrder: ComplianceTier[] = ['non-compliant', 'bronze', 'silver', 'gold', 'platinum'];

export function ReferenceCompliancePanel({ report, className }: ReferenceCompliancePanelProps) {
  const [expanded, setExpanded] = useState(false);

  if (!report) return null;

  const currentTierIdx = tierOrder.indexOf(report.tier.tier);
  const sr = report.semanticReport;
  const cr = report.claimReport;
  const er = report.epistemicReport;

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
              DOI: {report.doiValidatedPct}% · Tier: {report.tier.label}
              {cr?.analysisComplete ? ` · Claim: ${cr.avgSupportScore}/100` : sr ? ` · Semantic: ${sr.averageScore}/100` : ''}
              {er?.analysisComplete ? ` · Coherence: ${er.coherenceScore}/100` : ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {er?.analysisComplete && (
            <Badge variant="outline" className={cn("text-[10px] border", getCoherenceVerdictColor(er.coherenceVerdict))}>
              {er.coherenceVerdict === 'Epistemically Coherent' ? '🧠 Coherent' : er.coherenceVerdict === 'Minor Tensions' ? '🧠 Tensions' : er.coherenceVerdict}
            </Badge>
          )}
          {cr?.analysisComplete && (
            <Badge variant="outline" className={cn("text-[10px] border", getVerdictColor(cr.verdictLabel))}>
              {cr.verdictLabel}
            </Badge>
          )}
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

              {/* Epistemic Coherence Section */}
              {er && (
                <div className="p-3 rounded-lg bg-muted/30 border border-border/50 space-y-3">
                  <div className="flex items-center gap-2">
                    <GitCompareArrows className="h-4 w-4 text-scroll-gold" />
                    <span className="text-sm font-medium">Epistemic Coherence</span>
                    <Badge variant="outline" className={cn("text-[10px] border ml-auto", getCoherenceVerdictColor(er.coherenceVerdict))}>
                      {er.coherenceVerdict}
                    </Badge>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Coherence Score</span>
                    <span className={cn("text-lg font-bold",
                      er.coherenceScore >= 80 ? "text-green-500" :
                      er.coherenceScore >= 60 ? "text-amber-500" : "text-destructive"
                    )}>
                      {er.coherenceScore}/100
                    </span>
                  </div>
                  <Progress value={er.coherenceScore} className="h-2" />

                  {er.conflictCount > 0 && (
                    <div className="space-y-2">
                      <span className="text-[10px] text-muted-foreground">
                        {er.conflictCount} internal conflict(s) detected ({er.criticalConflicts} critical)
                      </span>
                      {er.conflicts.slice(0, 3).map((conflict, i) => (
                        <div key={i} className={cn(
                          "p-2 rounded text-xs space-y-1",
                          conflict.severity === 'critical' ? "bg-destructive/10 border border-destructive/30" :
                          conflict.severity === 'moderate' ? "bg-amber-500/10 border border-amber-500/30" :
                          "bg-muted/40 border border-border/50"
                        )}>
                          <div className="flex items-center gap-1">
                            <Badge variant="outline" className={cn("text-[9px]",
                              conflict.severity === 'critical' ? "text-destructive border-destructive/30" :
                              conflict.severity === 'moderate' ? "text-amber-600 border-amber-500/30" :
                              "text-muted-foreground border-border/50"
                            )}>
                              {conflict.severity} · {conflict.conflictType.replace(/_/g, ' ')}
                            </Badge>
                          </div>
                          <p className="text-muted-foreground italic">"{conflict.claimA.text.slice(0, 80)}..."</p>
                          <p className="text-muted-foreground italic">vs "{conflict.claimB.text.slice(0, 80)}..."</p>
                          <p className="text-foreground/80">{conflict.explanation}</p>
                        </div>
                      ))}
                      {er.conflictCount > 3 && (
                        <p className="text-[10px] text-muted-foreground">+{er.conflictCount - 3} more conflict(s)</p>
                      )}
                    </div>
                  )}

                  {er.conflictCount === 0 && er.analysisComplete && (
                    <div className="flex items-center gap-2 p-2 rounded bg-green-500/10 text-xs text-green-600 dark:text-green-400">
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                      <span>No internal contradictions detected — epistemically consistent</span>
                    </div>
                  )}

                  {!er.analysisComplete && (
                    <p className="text-[10px] text-muted-foreground italic">Epistemic analysis incomplete</p>
                  )}
                </div>
              )}

              {/* Claim-Level Justification Section */}
              {cr && (
                <div className="p-3 rounded-lg bg-muted/30 border border-border/50 space-y-3">
                  <div className="flex items-center gap-2">
                    <Scale className="h-4 w-4 text-scroll-gold" />
                    <span className="text-sm font-medium">Claim-Level Justification</span>
                    <Badge variant="outline" className={cn("text-[10px] border ml-auto", getVerdictColor(cr.verdictLabel))}>
                      {cr.verdictLabel}
                    </Badge>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Avg Claim Support Score</span>
                    <span className={cn("text-lg font-bold",
                      cr.avgSupportScore >= 75 ? "text-green-500" :
                      cr.avgSupportScore >= 60 ? "text-amber-500" : "text-destructive"
                    )}>
                      {cr.avgSupportScore}/100
                    </span>
                  </div>
                  <Progress value={cr.avgSupportScore} className="h-2" />

                  {/* Verdict distribution */}
                  {cr.analyzedClaims > 0 && (
                    <div className="space-y-1">
                      <span className="text-[10px] text-muted-foreground">Claim Support Verdicts ({cr.analyzedClaims} analyzed / {cr.totalClaims} total)</span>
                      <div className="flex h-3 rounded-full overflow-hidden">
                        {cr.strong > 0 && <div className="bg-green-500" style={{ width: `${(cr.strong / cr.analyzedClaims) * 100}%` }} title={`Strong: ${cr.strong}`} />}
                        {cr.partial > 0 && <div className="bg-amber-400" style={{ width: `${(cr.partial / cr.analyzedClaims) * 100}%` }} title={`Partial: ${cr.partial}`} />}
                        {cr.weak > 0 && <div className="bg-orange-400" style={{ width: `${(cr.weak / cr.analyzedClaims) * 100}%` }} title={`Weak: ${cr.weak}`} />}
                        {cr.contradiction > 0 && <div className="bg-destructive" style={{ width: `${(cr.contradiction / cr.analyzedClaims) * 100}%` }} title={`Contradiction: ${cr.contradiction}`} />}
                      </div>
                      <div className="flex gap-3 text-[9px] text-muted-foreground flex-wrap">
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />Strong ({cr.strong})</span>
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />Partial ({cr.partial})</span>
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-400 inline-block" />Weak ({cr.weak})</span>
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-destructive inline-block" />Contradiction ({cr.contradiction})</span>
                      </div>
                    </div>
                  )}

                  {/* Alerts */}
                  {cr.contradiction > 0 && (
                    <div className="flex items-center gap-2 p-2 rounded bg-destructive/10 text-xs text-destructive">
                      <XCircle className="h-3.5 w-3.5 shrink-0" />
                      <span>{cr.contradiction} citation contradiction(s) — revalidated and confirmed</span>
                    </div>
                  )}
                  {cr.manualReviewRequired && cr.manualReviewRequired > 0 && (
                    <div className="flex items-center gap-2 p-2 rounded bg-amber-500/10 text-xs text-amber-600 dark:text-amber-400">
                      <Eye className="h-3.5 w-3.5 shrink-0" />
                      <span>{cr.manualReviewRequired} verdict(s) require manual review (revalidation changed initial result)</span>
                    </div>
                  )}
                  {cr.unsupportedEmpiricalClaims > 0 && (
                    <div className="flex items-center gap-2 p-2 rounded bg-destructive/10 text-xs text-destructive">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      <span>{cr.unsupportedEmpiricalClaims} empirical claim(s) without adequate justification</span>
                    </div>
                  )}
                  {cr.uncitedClaimsPct > 0 && (
                    <div className="flex items-center gap-2 p-2 rounded bg-amber-500/10 text-xs text-amber-600 dark:text-amber-400">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      <span>{cr.uncitedClaimsPct}% substantive claims without citations</span>
                    </div>
                  )}

                  {!cr.analysisComplete && (
                    <p className="text-[10px] text-muted-foreground italic">Claim analysis incomplete — requires manual review</p>
                  )}
                </div>
              )}

              {/* Semantic Integrity Section */}
              {sr && (
                <div className="p-3 rounded-lg bg-muted/30 border border-border/50 space-y-3">
                  <div className="flex items-center gap-2">
                    <Brain className="h-4 w-4 text-scroll-gold" />
                    <span className="text-sm font-medium">Semantic Citation Integrity</span>
                    {sr.ornamentalPct > 5 && (
                      <Badge variant="outline" className="text-[10px] text-amber-500 border-amber-500/30">
                        <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />
                        {sr.ornamentalPct}% ornamental
                      </Badge>
                    )}
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Average Support Score</span>
                    <span className={cn("text-lg font-bold",
                      sr.averageScore >= 75 ? "text-green-500" :
                      sr.averageScore >= 60 ? "text-amber-500" : "text-destructive"
                    )}>
                      {sr.averageScore}/100
                    </span>
                  </div>
                  <Progress value={sr.averageScore} className="h-2" />

                  <div className="space-y-1">
                    <span className="text-[10px] text-muted-foreground">Citation Support Distribution</span>
                    <div className="flex h-3 rounded-full overflow-hidden">
                      {sr.strong > 0 && <div className="bg-green-500" style={{ width: `${(sr.strong / sr.totalCitations) * 100}%` }} title={`Strong: ${sr.strong}`} />}
                      {sr.moderate > 0 && <div className="bg-amber-400" style={{ width: `${(sr.moderate / sr.totalCitations) * 100}%` }} title={`Moderate: ${sr.moderate}`} />}
                      {sr.weak > 0 && <div className="bg-orange-400" style={{ width: `${(sr.weak / sr.totalCitations) * 100}%` }} title={`Weak: ${sr.weak}`} />}
                      {sr.ornamental > 0 && <div className="bg-destructive" style={{ width: `${(sr.ornamental / sr.totalCitations) * 100}%` }} title={`Ornamental: ${sr.ornamental}`} />}
                    </div>
                    <div className="flex gap-3 text-[9px] text-muted-foreground flex-wrap">
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />Strong ({sr.strong})</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />Moderate ({sr.moderate})</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-400 inline-block" />Weak ({sr.weak})</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-destructive inline-block" />Ornamental ({sr.ornamental})</span>
                    </div>
                  </div>

                  {sr.empiricalClaimsUnsupported > 0 && (
                    <div className="flex items-center gap-2 p-2 rounded bg-destructive/10 text-xs text-destructive">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      <span>{sr.empiricalClaimsUnsupported} empirical claim(s) without adequate citation support</span>
                    </div>
                  )}
                </div>
              )}

              {/* Compliance Tier Visual */}
              <div className="p-3 rounded-lg bg-muted/30 border border-border/50">
                <span className="text-sm font-medium block mb-2">Compliance Tier</span>
                <div className="flex gap-1">
                  {tierOrder.map((t, i) => (
                    <div key={t} className={cn("flex-1 h-2 rounded-full transition-colors", i <= currentTierIdx ? getTierColor(report.tier.tier) : "bg-muted")} />
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
                {report.citationStyle && (
                  <MetricRow icon={CheckCircle2} label="Citation Style" value={report.citationStyle} ok />
                )}
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
              <p className="text-[10px] text-muted-foreground">
                ScrollVerified™ 2026 — Institutional Epistemic Integrity Certified
                {report.auditModel && ` · Model: ${report.auditModel}`}
                {report.promptVersion && ` · Prompt: ${report.promptVersion}`}
              </p>
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
