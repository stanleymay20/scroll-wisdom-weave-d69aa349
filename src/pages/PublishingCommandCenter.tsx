/**
 * Publishing Command Center — EPIE foundation shell.
 * Phase 1 surfaces the 10-layer architecture, last audit scorecard, and the
 * "Run Publishing Audit" action. Per-layer drilldowns land next.
 */
import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { EPIE_LAYERS, type CertificationTier } from "@/lib/epie";
import { Loader2, Sparkles, ShieldCheck } from "lucide-react";
import CitationManager from "@/components/citations/CitationManager";
import DesignSystemPanel from "@/components/publish/DesignSystemPanel";

interface Audit {
  id: string;
  certification_tier: CertificationTier | null;
  publish_readiness_score: number;
  human_authenticity_score: number;
  engagement_score: number;
  strategic_depth_score: number;
  commercial_score: number;
  citation_confidence_score: number;
  formatting_score: number;
  created_at: string;
}

const TIER_COLOR: Record<CertificationTier, string> = {
  bronze: "bg-amber-700/20 text-amber-700 border-amber-700/30",
  silver: "bg-slate-400/20 text-slate-600 border-slate-400/30",
  gold: "bg-yellow-500/20 text-yellow-700 border-yellow-500/30",
  platinum: "bg-cyan-500/20 text-cyan-700 border-cyan-500/30",
  sovereign: "bg-primary/20 text-primary border-primary/30",
};

export default function PublishingCommandCenter() {
  const { bookId } = useParams<{ bookId: string }>();
  const { toast } = useToast();
  const [audit, setAudit] = useState<Audit | null>(null);
  const [running, setRunning] = useState(false);

  const loadLatest = async () => {
    if (!bookId) return;
    const { data } = await supabase
      .from("publishing_audits")
      .select("*")
      .eq("book_id", bookId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (data) setAudit(data as Audit);
  };

  useEffect(() => { loadLatest(); }, [bookId]);

  const runAudit = async () => {
    if (!bookId) return;
    setRunning(true);
    try {
      const { data, error } = await supabase.functions.invoke("epie-audit", { body: { bookId } });
      if (error) throw error;
      toast({ title: "Audit complete", description: `Tier: ${data.tier}` });
      await loadLatest();
    } catch (e) {
      toast({ title: "Audit failed", description: e instanceof Error ? e.message : "Unknown", variant: "destructive" });
    } finally {
      setRunning(false);
    }
  };

  const scoreRows = audit ? [
    { label: "Publish Readiness", value: audit.publish_readiness_score },
    { label: "Human Authenticity", value: audit.human_authenticity_score },
    { label: "Engagement", value: audit.engagement_score },
    { label: "Strategic Depth", value: audit.strategic_depth_score },
    { label: "Commercial", value: audit.commercial_score },
    { label: "Citation Confidence", value: audit.citation_confidence_score },
    { label: "Formatting", value: audit.formatting_score },
  ] : [];

  return (
    <div className="container max-w-6xl py-10 space-y-8">
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="flex items-start justify-between gap-4 flex-wrap"
      >
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Sparkles className="h-4 w-4" /> Elite Publishing Intelligence
          </div>
          <h1 className="text-3xl font-semibold mt-1 text-foreground">Publishing Command Center</h1>
          <p className="text-muted-foreground mt-1 max-w-2xl">
            Audit, humanize, validate, and certify your manuscript across 10 publishing intelligence layers.
          </p>
        </div>
        <Button onClick={runAudit} disabled={running} size="lg">
          {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ShieldCheck className="h-4 w-4 mr-2" />}
          Run Publishing Audit
        </Button>
      </motion.div>

      {audit && (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-foreground">Latest Scorecard</h2>
            {audit.certification_tier && (
              <Badge variant="outline" className={TIER_COLOR[audit.certification_tier]}>
                {audit.certification_tier.toUpperCase()} TIER
              </Badge>
            )}
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            {scoreRows.map((r) => (
              <div key={r.label} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{r.label}</span>
                  <span className="text-foreground font-medium">{Math.round(r.value)}</span>
                </div>
                <Progress value={r.value} />
              </div>
            ))}
          </div>
        </Card>
      )}

      {bookId && (
        <div className="grid gap-6 lg:grid-cols-2">
          <DesignSystemPanel bookId={bookId} />
          <CitationManager bookId={bookId} />
        </div>
      )}

      <div>
        <h2 className="text-lg font-semibold mb-3 text-foreground">Intelligence Layers</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {EPIE_LAYERS.map((layer, i) => (
            <motion.div
              key={layer.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
            >
              <Card className="p-4 h-full">
                <div className="text-xs text-muted-foreground mb-1">Layer {i + 1}</div>
                <div className="font-medium text-foreground">{layer.label}</div>
                <div className="text-sm text-muted-foreground mt-1">{layer.description}</div>
              </Card>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}
