/**
 * Universal Usage / Upgrade Notice modal.
 *
 * One component. One copy system. Used by:
 *  - Generate (book limit)
 *  - Reader / TTS player (audio limit)
 *  - Any AI action that returns a UsageGateResult
 *
 * Calm, premium, accessible. Never traps the user.
 */
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Crown,
  Sparkles,
  Mic,
  BookOpen,
  Hourglass,
  Lock,
  AlertTriangle,
} from "lucide-react";
import {
  UsageGateResult,
  UsageGateReason,
  gateCopy,
  shouldShowUpgrade,
} from "@/lib/usageGate";
import { SUBSCRIPTION_TIERS, SubscriptionTier } from "@/lib/subscription";
import { logGateEvent } from "@/lib/usageGate";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  result: UsageGateResult | null;
  /** Optional: where to send the user on Upgrade. Defaults to /pricing. */
  upgradeHref?: string;
  /** Optional: tag for analytics (e.g. 'generate', 'reader-tts'). */
  source?: string;
}

const REASON_ICON: Record<UsageGateReason, typeof Crown> = {
  PLAN_REQUIRED: Crown,
  BOOK_LIMIT_REACHED: BookOpen,
  AUDIO_LIMIT_REACHED: Mic,
  AI_QUOTA_EXHAUSTED: Sparkles,
  MONTHLY_LIMIT_REACHED: Hourglass,
  FEATURE_NOT_IN_PLAN: Lock,
  TRIAL_EXPIRED: Hourglass,
  RATE_LIMITED: AlertTriangle,
  SERVICE_UNAVAILABLE: AlertTriangle,
  UNKNOWN: AlertTriangle,
};

export function UsageGateModal({
  open,
  onOpenChange,
  result,
  upgradeHref = "/pricing",
  source,
}: Props) {
  const navigate = useNavigate();
  if (!result) return null;

  const Icon = REASON_ICON[result.reason] ?? AlertTriangle;
  const copy = gateCopy(result.reason);
  const showUpgrade = result.upgradeRequired && shouldShowUpgrade(result.reason);

  const recommendedTier = (result.recommendedPlan as SubscriptionTier | undefined) ?? "premium";
  const recommendedName =
    recommendedTier in SUBSCRIPTION_TIERS
      ? SUBSCRIPTION_TIERS[recommendedTier].name
      : "Premium";

  const handleUpgrade = () => {
    logGateEvent({
      feature: source ?? "unknown",
      reason: result.reason,
      allowed: false,
      plan: result.currentPlan,
    });
    onOpenChange(false);
    navigate(upgradeHref);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md bg-gradient-card border-border/50">
        <DialogHeader>
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.25 }}
            className="mx-auto mb-2 rounded-full bg-primary/15 p-3 w-fit text-primary"
          >
            <Icon className="h-7 w-7" aria-hidden />
          </motion.div>
          <DialogTitle className="text-center text-xl">{copy.title}</DialogTitle>
          <DialogDescription className="text-center pt-1 text-base">
            {result.message || copy.body}
          </DialogDescription>
        </DialogHeader>

        {/* Usage details */}
        {result.usage && <UsageBars usage={result.usage} />}

        {/* Reset hint */}
        {result.resetAt && (
          <p className="text-xs text-muted-foreground text-center">
            Resets on {new Date(result.resetAt).toLocaleDateString()}
          </p>
        )}

        {/* Actions */}
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 mt-2">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="sm:w-auto"
          >
            Maybe later
          </Button>
          {showUpgrade && (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  onOpenChange(false);
                  navigate(upgradeHref);
                }}
              >
                View plans
              </Button>
              <Button variant="hero" onClick={handleUpgrade}>
                <Crown className="h-4 w-4 mr-2" />
                Upgrade to {recommendedName}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function UsageBars({ usage }: { usage: NonNullable<UsageGateResult["usage"]> }) {
  const rows: Array<{ label: string; used: number; limit: number | null | undefined }> = [];
  if (usage.booksGenerated !== undefined) {
    rows.push({ label: "Books this period", used: usage.booksGenerated, limit: usage.booksLimit });
  }
  if (usage.audioMinutesUsed !== undefined) {
    rows.push({ label: "Audio minutes", used: usage.audioMinutesUsed, limit: usage.audioMinutesLimit });
  }
  if (usage.aiRequestsUsed !== undefined) {
    rows.push({ label: "AI requests", used: usage.aiRequestsUsed, limit: usage.aiRequestsLimit });
  }
  if (rows.length === 0) return null;

  return (
    <div className="space-y-3 mt-2 mb-1">
      {rows.map((r) => {
        const limit = r.limit ?? 0;
        const pct = limit > 0 ? Math.min(100, Math.round((r.used / limit) * 100)) : 100;
        return (
          <div key={r.label} className="space-y-1">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>{r.label}</span>
              <span>
                {r.used}
                {limit > 0 ? ` / ${limit}` : ""}
              </span>
            </div>
            <Progress value={pct} className="h-2" />
          </div>
        );
      })}
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────── */
/* Tiny reusable hook for any feature that wants to open the modal.       */

import { useCallback, useState } from "react";

export function useUsageGate() {
  const [result, setResult] = useState<UsageGateResult | null>(null);
  const open = result !== null && !result.allowed;

  const trigger = useCallback((r: UsageGateResult) => {
    if (r.allowed) {
      setResult(null);
    } else {
      setResult(r);
    }
  }, []);

  const close = useCallback(() => setResult(null), []);

  return { result, open, trigger, close };
}
